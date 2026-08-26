import "server-only";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import {
  getSaleDocument,
  getVisit,
  isAltegioConfigured,
  listClientCertificates,
  listLoyaltyTransactions,
  readAltegioConfig,
  type LoyaltyTransaction,
} from "./client";
import { hashCode } from "../certificate-code";
import { isAltegioTest } from "./sync";
import { refreshPassesForCertificate } from "../wallet/notify";
import type { CertificateStatus } from "../generated/prisma/client";

/**
 * Обратная синхронизация с Altegio (PRD §10, Фаза 3): наша БД — источник истины
 * по ВЫПУСКУ, Altegio — по ПОГАШЕНИЯМ. Без этого сертификат, погашенный
 * кассиром в салоне, навсегда оставался бы у нас «активным».
 *
 * Читать состояние можно только списком по (филиал + телефон клиента) —
 * см. listClientCertificates. Поэтому филиал и телефон запоминаются при выпуске,
 * а сверка группирует сертификаты по клиенту: один запрос на клиента, а не на
 * сертификат (лимит Altegio — 200 запросов/мин).
 *
 * Источник истины по остатку — поле balance в CRM: погашение там уменьшает его.
 * Истории операций у API нет, поэтому дельту баланса мы записываем одним
 * Redemption с source=altegio.
 *
 * ВАЖНО: в тест-режиме (ALTEGIO_TEST!=0) сверка работает в режиме «только
 * смотреть». Тестовый выпуск продаёт фолбэк-товар «Энергия Сиама Сайт 35000»,
 * и баланс в CRM берётся из ТИПА товара — то есть у любого тестового
 * сертификата там 35000 независимо от нашего номинала. Применять такую сверку
 * значило бы затереть верные балансы и нарисовать несуществующие погашения.
 * Боевая сверка включается вместе с ALTEGIO_TEST=0.
 */

const MAX_CLIENTS_PER_RUN = 100;

export type LocalCert = {
  status: CertificateStatus;
  balanceKzt: number;
  /** Номинал; null → считаем номиналом текущий остаток */
  amountKzt: number | null;
};

export type RemoteCert = {
  id: number;
  balance: number;
  statusSlug: string;
};

export type ReconcileAction =
  | { kind: "noop" }
  /** Сертификат числится у нас, но пропал из Altegio — решает менеджер */
  | { kind: "missing" }
  /** Наше ручное решение (блокировка/возврат/сгорание) важнее данных CRM */
  | { kind: "skip"; reason: string }
  | {
      kind: "sync";
      balanceKzt: number;
      status: CertificateStatus;
      /** >0 — погашено в салоне, <0 — остаток вернули в CRM */
      redeemedKzt: number;
    };

/**
 * Что сделать с нашим сертификатом по данным Altegio. Чистая — вся политика
 * сверки здесь.
 */
export function reconcileCertificate(
  local: LocalCert,
  remote: RemoteCert | null,
): ReconcileAction {
  // blocked/refunded/expired/used ставили мы осознанно — CRM их не перебивает
  if (local.status !== "active" && local.status !== "partially_used") {
    return { kind: "skip", reason: local.status };
  }
  if (!remote) return { kind: "missing" };
  if (remote.balance === local.balanceKzt) return { kind: "noop" };

  const full = local.amountKzt ?? local.balanceKzt;
  const status: CertificateStatus =
    remote.balance <= 0 ? "used" : remote.balance >= full ? "active" : "partially_used";

  return {
    kind: "sync",
    balanceKzt: Math.max(0, remote.balance),
    status,
    redeemedKzt: local.balanceKzt - remote.balance,
  };
}

/** Ключ группировки: один запрос в Altegio на пару «филиал + клиент». */
function clientKey(companyId: number, phone: string): string {
  return `${companyId}|${phone}`;
}

type SyncStats = {
  clients: number;
  checked: number;
  updated: number;
  redeemedKzt: number;
  missing: number;
  failed: number;
  /** Расхождения, которые не применили из-за тест-режима */
  dryRun: number;
};

/**
 * Сверяет с Altegio все сертификаты, которые ещё могут быть погашены.
 * Best-effort: ошибка по одному клиенту не роняет прогон.
 */
export async function syncRedemptionsFromAltegio(): Promise<SyncStats> {
  const stats: SyncStats = {
    clients: 0,
    checked: 0,
    updated: 0,
    redeemedKzt: 0,
    missing: 0,
    failed: 0,
    dryRun: 0,
  };
  if (!isAltegioConfigured()) {
    console.log("[altegio] сверка погашений: не сконфигурирован — пропуск");
    return stats;
  }
  const dryRun = isAltegioTest();

  const certs = await prisma.certificate.findMany({
    where: {
      status: { in: ["active", "partially_used"] },
      altegioCompanyId: { not: null },
      altegioClientPhone: { not: null },
    },
    orderBy: { altegioCheckedAt: { sort: "asc", nulls: "first" } },
  });

  const groups = new Map<string, typeof certs>();
  for (const cert of certs) {
    const key = clientKey(cert.altegioCompanyId!, cert.altegioClientPhone!);
    const list = groups.get(key);
    if (list) list.push(cert);
    else if (groups.size < MAX_CLIENTS_PER_RUN) groups.set(key, [cert]);
  }

  for (const [key, list] of groups) {
    const [companyIdRaw, phone] = key.split("|");
    const companyId = Number(companyIdRaw);
    let remoteList;
    try {
      remoteList = await listClientCertificates(companyId, phone);
    } catch (error) {
      stats.failed += list.length;
      console.error(`[altegio] сверка: клиент ${phone} @ ${companyId}`, error);
      continue;
    }
    stats.clients++;

    const byNumber = new Map(remoteList.map((r) => [r.number, r]));
    for (const cert of list) {
      stats.checked++;
      const code = cert.codeEncrypted ? decryptSecret(cert.codeEncrypted) : null;
      if (!code) continue;
      const found = byNumber.get(code);
      const remote: RemoteCert | null = found
        ? { id: found.id, balance: found.balance, statusSlug: found.status.slug }
        : null;

      const action = reconcileCertificate(cert, remote);
      try {
        const applied = await applyAction(
          cert.id,
          cert.salonId,
          action,
          remote,
          dryRun,
        );
        if (applied === "updated") {
          stats.updated++;
          if (action.kind === "sync") stats.redeemedKzt += action.redeemedKzt;
          // Остаток изменился — карта в кошельке обязана это показать.
          // Внутри всё гасится: сверка не должна падать из-за Apple.
          await refreshPassesForCertificate(cert.id);
        }
        if (applied === "missing") stats.missing++;
        if (applied === "dry") stats.dryRun++;
      } catch (error) {
        stats.failed++;
        console.error(`[altegio] сверка ${cert.codeDisplay}`, error);
      }
    }
  }

  if (stats.updated || stats.missing || stats.failed || stats.dryRun) {
    console.log(
      `[altegio] сверка погашений${dryRun ? " (ТЕСТ: только смотрим)" : ""}: ` +
        `клиентов ${stats.clients}, проверено ${stats.checked}, ` +
        `обновлено ${stats.updated} (${stats.redeemedKzt}₸), расхождений без применения ${stats.dryRun}, ` +
        `пропало ${stats.missing}, ошибок ${stats.failed}`,
    );
  }
  return stats;
}

async function applyAction(
  certificateId: string,
  salonId: number,
  action: ReconcileAction,
  remote: RemoteCert | null,
  dryRun: boolean,
): Promise<"updated" | "missing" | "noop" | "dry"> {
  const now = new Date();

  if (action.kind === "skip") return "noop";

  if (action.kind === "missing") {
    // В тест-режиме «пропал» ничего не значит: боевые сертификаты в CRM не
    // ищутся по тест-клиенту.
    if (dryRun) return "dry";
    await prisma.certificate.update({
      where: { id: certificateId },
      data: { altegioSyncStatus: "missing", altegioCheckedAt: now },
    });
    return "missing";
  }

  if (action.kind === "sync" && dryRun) {
    // Запоминаем, что видит CRM (для админки), но балансы и статусы не трогаем
    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        altegioCheckedAt: now,
        altegioBalanceKzt: remote?.balance,
        altegioNumberId: remote?.id,
      },
    });
    console.log(
      `[altegio] ТЕСТ, не применяю: ${certificateId} наш баланс ${action.balanceKzt + action.redeemedKzt}₸ ` +
        `vs CRM ${remote?.balance}₸ (в тест-режиме баланс берётся из фолбэк-товара)`,
    );
    return "dry";
  }

  if (action.kind === "noop") {
    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        altegioCheckedAt: now,
        altegioSyncStatus: "synced",
        altegioBalanceKzt: remote?.balance,
        altegioNumberId: remote?.id,
      },
    });
    return "noop";
  }

  await prisma.$transaction(async (tx) => {
    if (action.redeemedKzt > 0 && remote) {
      // Истории операций в API нет — фиксируем дельту одним погашением.
      // Ключ идемпотентности переживает параллельные прогоны крона.
      await tx.redemption.create({
        data: {
          certificateId,
          amountKzt: action.redeemedKzt,
          salonId,
          source: "altegio",
          actor: `altegio:${remote.id}`,
          idemKey: `altegio:${remote.id}:${action.balanceKzt}`,
          comment: `Погашение в салоне по данным Altegio (остаток ${action.balanceKzt} ₸)`,
        },
      });
    }
    await tx.certificate.update({
      where: { id: certificateId },
      data: {
        balanceKzt: action.balanceKzt,
        status: action.status,
        altegioBalanceKzt: remote?.balance,
        altegioNumberId: remote?.id,
        altegioCheckedAt: now,
        altegioSyncStatus: "synced",
      },
    });
  });
  return "updated";
}

/**
 * Сверка одного сертификата — кнопка «Сверить с Altegio» в админке.
 * `applied: false` — расхождение показано, но не применено (тест-режим).
 */
export async function syncOneCertificate(
  certificateId: string,
): Promise<
  | { ok: true; action: ReconcileAction; applied: boolean }
  | { ok: false; error: string }
> {
  if (!isAltegioConfigured()) return { ok: false, error: "altegio_not_configured" };

  const cert = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!cert) return { ok: false, error: "not_found" };
  if (!cert.altegioCompanyId || !cert.altegioClientPhone) {
    return { ok: false, error: "not_issued_in_altegio" };
  }
  const code = cert.codeEncrypted ? decryptSecret(cert.codeEncrypted) : null;
  if (!code) return { ok: false, error: "code_unavailable" };

  let remoteList;
  try {
    remoteList = await listClientCertificates(cert.altegioCompanyId, cert.altegioClientPhone);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const found = remoteList.find((r) => r.number === code);
  const remote: RemoteCert | null = found
    ? { id: found.id, balance: found.balance, statusSlug: found.status.slug }
    : null;
  const dryRun = isAltegioTest();
  const action = reconcileCertificate(cert, remote);
  const applied = await applyAction(cert.id, cert.salonId, action, remote, dryRun);
  return { ok: true, action, applied: applied !== "dry" };
}

// ── Сверка через журнал лояльности сети ──────────────────────────────────

/**
 * Погашения приходят из журнала лояльности всей сети, а не из карточки
 * клиента: наши сертификаты продаются без клиента (покупатель телефона не
 * оставляет — он дарит, и гасить придёт другой человек), а прочитать
 * сертификат по номеру Altegio не даёт.
 *
 * Путь, выверенный живьём 2026-08-26 на погашении WM9001:
 *   chain/{chain}/loyalty/transactions  → строка type_id=8 с certificate_id
 *   visits/{visit_id}                   → филиал и номер документа визита
 *   company/{c}/sale/{document_id}      → номер сертификата и его ОСТАТОК
 *
 * Позиция в журнале запоминается (`altegio_loyalty_cursor`), поэтому одна и
 * та же строка не разбирается дважды: за сутки по сети ~60 погашений, из них
 * наши — меньшинство, и лишние запросы к чужим сертификатам стоит экономить.
 */
const CURSOR_KEY = "altegio_loyalty_cursor";
/** Погашение сертификата в журнале лояльности. */
const TX_GIFT_CARD = 8;
/** Сколько страниц журнала листаем за прогон (≈6 дней сети на страницу). */
const MAX_FEED_PAGES = 6;

export type FeedStats = {
  rows: number;
  gift: number;
  fresh: number;
  ours: number;
  updated: number;
  redeemedKzt: number;
  failed: number;
  dryRun: number;
};

/** Дата в Asia/Almaty как YYYY-MM-DD: журнал понимает только такой формат. */
function almatyDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Строки журнала, которые нам интересны: погашения сертификатов новее
 * закладки, от старых к новым. Чистая — её же проверяют тесты.
 */
export function selectFreshRedemptions(
  rows: LoyaltyTransaction[],
  cursor: number,
): LoyaltyTransaction[] {
  return rows
    .filter(
      (r) => r.type_id === TX_GIFT_CARD && !!r.certificate_id && r.id > cursor,
    )
    .sort((a, b) => a.id - b.id);
}

type Resolved = { companyId: number; number: string; balance: number; statusSlug: string };

/**
 * Строка журнала → номер сертификата и остаток. Визиты кэшируются: одно
 * посещение нередко гасит сертификат несколькими строками.
 */
async function resolveTransaction(
  tx: LoyaltyTransaction,
  visitCache: Map<number, { companyId: number; documentId: number } | null>,
): Promise<Resolved | null> {
  let visit = visitCache.get(tx.visit_id);
  if (visit === undefined) {
    const data = await getVisit(tx.visit_id);
    const record = data.records?.[0];
    const documentId = record?.documents?.[0]?.id;
    visit =
      record && documentId
        ? { companyId: record.company_id, documentId }
        : null;
    visitCache.set(tx.visit_id, visit);
  }
  if (!visit) return null;

  const doc = await getSaleDocument(visit.companyId, visit.documentId);
  const entry = doc.state?.loyalty_transactions?.find(
    (t) =>
      t.loyalty_certificate?.id === tx.certificate_id ||
      t.loyalty_certificate_id === tx.certificate_id,
  );
  const cert = entry?.loyalty_certificate;
  if (!cert?.number) return null;
  return {
    companyId: visit.companyId,
    number: cert.number,
    balance: cert.balance,
    statusSlug: cert.status_slug,
  };
}

/**
 * Разбирает журнал погашений и подтягивает наши сертификаты.
 * `days` — глубина окна в сутках, `fromScratch` — не смотреть на закладку
 * (для ручной глубокой сверки из админки).
 */
export async function syncRedemptionsFromFeed(
  options: { days?: number; fromScratch?: boolean } = {},
): Promise<FeedStats> {
  const stats: FeedStats = {
    rows: 0,
    gift: 0,
    fresh: 0,
    ours: 0,
    updated: 0,
    redeemedKzt: 0,
    failed: 0,
    dryRun: 0,
  };
  const cfg = readAltegioConfig();
  if (!cfg) return stats;

  // Закладку читаем напрямую, минуя getSetting: тот кэширует значение на
  // время запроса, а прогон крона обязан видеть свежую.
  const cursorRow = options.fromScratch
    ? null
    : await prisma.setting.findUnique({ where: { key: CURSOR_KEY } });
  const cursor = typeof cursorRow?.value === "number" ? cursorRow.value : 0;
  const days = options.days ?? 2;
  const from = almatyDay(-(days - 1));
  const to = almatyDay(0);

  // Журнал отдаёт от новых к старым — листаем, пока не упрёмся в закладку.
  const gift: LoyaltyTransaction[] = [];
  for (let page = 1; page <= MAX_FEED_PAGES; page++) {
    let rows: LoyaltyTransaction[];
    try {
      rows = await listLoyaltyTransactions(cfg.chainId, { from, to, page });
    } catch (error) {
      stats.failed++;
      console.error("[altegio] журнал лояльности недоступен", error);
      break;
    }
    stats.rows += rows.length;
    stats.gift += rows.filter(
      (r) => r.type_id === TX_GIFT_CARD && !!r.certificate_id,
    ).length;
    gift.push(...selectFreshRedemptions(rows, cursor));
    // Страница целиком старше закладки или журнал кончился — дальше не идём.
    if (rows.length === 0 || rows.every((r) => r.id <= cursor)) break;
  }

  stats.fresh = gift.length;
  if (gift.length === 0) return stats;

  // От старых к новым: закладку двигаем только по разобранным строкам.
  gift.sort((a, b) => a.id - b.id);
  const dryRun = isAltegioTest();
  const visitCache = new Map<number, { companyId: number; documentId: number } | null>();
  let lastDone = cursor;

  for (const tx of gift) {
    try {
      const resolved = await resolveTransaction(tx, visitCache);
      if (resolved) {
        const cert = await prisma.certificate.findFirst({
          where: {
            OR: [
              { serial: resolved.number },
              { codeHash: hashCode(resolved.number) },
            ],
          },
        });
        if (cert) {
          stats.ours++;
          // Запоминаем id сертификата в CRM и филиал: пригодится и для
          // ручной сверки, и чтобы отличать своё от чужого без запросов.
          await prisma.certificate.update({
            where: { id: cert.id },
            data: {
              altegioNumberId: tx.certificate_id,
              altegioCompanyId: cert.altegioCompanyId ?? resolved.companyId,
            },
          });
          const remote: RemoteCert = {
            id: tx.certificate_id,
            balance: resolved.balance,
            statusSlug: resolved.statusSlug,
          };
          const action = reconcileCertificate(cert, remote);
          const applied = await applyAction(
            cert.id,
            cert.salonId,
            action,
            remote,
            dryRun,
          );
          if (applied === "updated") {
            stats.updated++;
            if (action.kind === "sync") stats.redeemedKzt += action.redeemedKzt;
            await refreshPassesForCertificate(cert.id);
          }
          if (applied === "dry") stats.dryRun++;
        }
      }
      lastDone = Math.max(lastDone, tx.id);
    } catch (error) {
      stats.failed++;
      console.error(`[altegio] журнал: строка ${tx.id}`, error);
      // Дальше не двигаемся: закладка за сбойной строкой потеряла бы её.
      break;
    }
  }

  if (lastDone > cursor) {
    await prisma.setting.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value: lastDone },
      update: { value: lastDone },
    });
  }

  if (stats.ours || stats.failed) {
    console.log(
      `[altegio] журнал погашений${dryRun ? " (ТЕСТ: только смотрим)" : ""}: ` +
        `строк ${stats.rows}, погашений ${stats.gift}, новых ${stats.fresh}, ` +
        `наших ${stats.ours}, обновлено ${stats.updated} (${stats.redeemedKzt}₸), ` +
        `ошибок ${stats.failed}`,
    );
  }
  return stats;
}
