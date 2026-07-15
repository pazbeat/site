import "server-only";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { isAltegioConfigured, listClientCertificates } from "./client";
import { isAltegioTest } from "./sync";
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
