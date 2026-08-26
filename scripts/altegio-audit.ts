/**
 * Сверка каталога с Altegio: каждая продаваемая позиция должна попадать в
 * реальный товар-сертификат, а баланс этого товара — совпадать с ценой.
 *
 * Зачем: баланс сертификата в Altegio берётся из ТИПА товара
 * (`loyalty_certificate_type.balance`), а не из суммы, которую мы передаём.
 * Промах в маппинге не виден по ответу API — сертификат выпустится, только
 * на другую сумму. Поэтому сверяем не «нашлось ли что-то», а конкретно:
 * товар существует, это товар-сертификат, и баланс его типа равен нашей цене.
 *
 * Запуск (условие react-server обязательно — модули помечены `server-only`):
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/altegio-audit.ts
 *   … --csv > audit.csv     # машиночитаемо
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { altegioRequest } from "../lib/altegio/client";
import { resolveGoodId, resolveProgramTitle } from "../lib/altegio/catalog";

type Good = {
  good_id?: number;
  id?: number;
  title?: string;
  loyalty_certificate_type_id?: number | null;
};

type CertType = {
  id: number;
  title: string;
  balance: number;
  is_multi?: boolean;
  item_type_id?: number;
  item_type?: { id: number; title: string };
  is_archived?: boolean;
};

/** Типы сертификатов сети целиком (585 штук — строго постранично). */
async function fetchTypes(chainId: number): Promise<CertType[]> {
  const all: CertType[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await altegioRequest<CertType[]>(
      `chain/${chainId}/loyalty/certificate_types?page=${page}&count=100`,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

type Row = {
  branch: string;
  companyId: number;
  kind: "номинал" | "программа";
  what: string;
  priceKzt: number;
  goodId: number | null;
  goodTitle: string;
  typeBalance: number | null;
  typeTitle: string;
  itemType: string;
  isMulti: boolean | null;
  verdict: string;
};

/** Товары филиала строго постранично: count>100 молча откатывается к 25. */
async function fetchGoods(companyId: number): Promise<Map<number, Good>> {
  const map = new Map<number, Good>();
  for (let page = 1; page <= 60; page++) {
    const batch = await altegioRequest<Good[]>(
      `goods/${companyId}?page=${page}&count=100`,
    );
    for (const g of batch) {
      const id = g.good_id ?? g.id;
      if (id != null) map.set(id, g);
    }
    if (batch.length < 100) break;
  }
  return map;
}

function judge(
  goodId: number | null,
  good: Good | undefined,
  type: CertType | undefined,
  priceKzt: number,
  kind: "номинал" | "программа",
): string {
  if (goodId === null) return "НЕТ МАППИНГА";
  if (!good) return "ТОВАРА НЕТ В ФИЛИАЛЕ";
  if (!good.loyalty_certificate_type_id) return "НЕ СЕРТИФИКАТ";
  if (!type) return "ТИП НЕ НАЙДЕН";
  if (type.balance !== priceKzt) return `БАЛАНС ${type.balance} ≠ ЦЕНА ${priceKzt}`;
  if (type.is_archived) return "ТИП В АРХИВЕ";
  // Номинал обязан тратиться на что угодно и делиться на части: покупатель
  // дарит сумму, а не конкретную процедуру. Тип, привязанный к услуге,
  // молча превратит подарок в талон на одну процедуру.
  if (kind === "номинал" && type.item_type_id !== 0) {
    return `НОМИНАЛ ОГРАНИЧЕН: ${type.item_type?.title ?? type.item_type_id}`;
  }
  if (kind === "номинал" && type.is_multi === false) {
    return "НОМИНАЛ НЕДЕЛИМ (нельзя тратить частями)";
  }
  return "ок";
}

async function main() {
  const csv = process.argv.includes("--csv");
  const asJson = process.argv.includes("--json");

  const salons = await prisma.salon.findMany({
    where: { orderable: true, active: true, altegioLocationId: { not: null } },
    orderBy: { id: "asc" },
  });
  const nominals = await prisma.nominal.findMany({
    where: { active: true },
    orderBy: { amountKzt: "asc" },
  });
  const programs = await prisma.program.findMany({
    where: { active: true },
    include: { options: { orderBy: { priceKzt: "asc" } } },
    orderBy: { id: "asc" },
  });

  const chainId = Number(process.env.ALTEGIO_CHAIN_ID);
  const types = await fetchTypes(chainId);
  const typeById = new Map(types.map((t) => [t.id, t]));

  const rows: Row[] = [];

  for (const salon of salons) {
    const companyId = salon.altegioLocationId!;
    const branch = `${salon.codePrefix ?? "??"} ${salon.city} ${salon.name}`;
    const goods = await fetchGoods(companyId);

    for (const nominal of nominals) {
      const goodId = resolveGoodId(companyId, { nominalKzt: nominal.amountKzt });
      const good = goodId ? goods.get(goodId) : undefined;
      const type = good?.loyalty_certificate_type_id
        ? typeById.get(good.loyalty_certificate_type_id)
        : undefined;
      rows.push({
        branch,
        companyId,
        kind: "номинал",
        what: `${nominal.amountKzt} ₸`,
        priceKzt: nominal.amountKzt,
        goodId,
        goodTitle: good?.title ?? "",
        typeBalance: type?.balance ?? null,
        typeTitle: type?.title ?? "",
        itemType: type?.item_type?.title ?? "",
        isMulti: type?.is_multi ?? null,
        verdict: judge(goodId, good, type, nominal.amountKzt, "номинал"),
      });
    }

    for (const program of programs) {
      const nameRu = (program.names as { ru?: string }).ru ?? `#${program.id}`;
      // Программа продаётся не везде: пустой список городов = вся сеть.
      if (program.cities.length > 0 && !program.cities.includes(salon.city)) {
        continue;
      }
      for (const option of program.options) {
        const title = resolveProgramTitle(nameRu, option.priceKzt);
        const goodId = resolveGoodId(companyId, {
          nominalKzt: option.priceKzt,
          programTitle: title,
        });
        const good = goodId ? goods.get(goodId) : undefined;
        const type = good?.loyalty_certificate_type_id
          ? typeById.get(good.loyalty_certificate_type_id)
          : undefined;
        const verdict = judge(goodId, good, type, option.priceKzt, "программа");
        rows.push({
          branch,
          companyId,
          kind: "программа",
          what: `${nameRu}${option.persons ? ` · ${option.persons} чел` : ""}${
            option.durationMin ? ` · ${option.durationMin} мин` : ""
          }${title ? "" : " [по номиналу]"}`,
          priceKzt: option.priceKzt,
          goodId,
          goodTitle: good?.title ?? "",
          typeBalance: type?.balance ?? null,
          typeTitle: type?.title ?? "",
          itemType: type?.item_type?.title ?? "",
          isMulti: type?.is_multi ?? null,
          verdict,
        });
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify(rows, null, 1));
    return;
  }

  if (csv) {
    console.log(
      "филиал;company;тип;позиция;цена;good_id;товар;баланс;тип_серта;чем_платить;делимый;вердикт",
    );
    for (const r of rows) {
      console.log(
        [
          r.branch,
          r.companyId,
          r.kind,
          r.what,
          r.priceKzt,
          r.goodId ?? "",
          r.goodTitle,
          r.typeBalance ?? "",
          r.typeTitle,
          r.itemType,
          r.isMulti ?? "",
          r.verdict,
        ]
          .map((v) => String(v).replace(/;/g, ","))
          .join(";"),
      );
    }
    return;
  }

  const bad = rows.filter((r) => r.verdict !== "ок");
  console.log(`\nПроверено позиций: ${rows.length}, расхождений: ${bad.length}\n`);

  const byBranch = new Map<string, Row[]>();
  for (const r of bad) {
    const list = byBranch.get(r.branch) ?? [];
    list.push(r);
    byBranch.set(r.branch, list);
  }
  for (const [branch, list] of byBranch) {
    console.log(`── ${branch} (${list.length})`);
    for (const r of list) {
      console.log(
        `   ${r.kind} ${r.what} — ${r.priceKzt} ₸ → ` +
          `${r.goodId ?? "—"} «${r.goodTitle}» :: ${r.verdict}`,
      );
    }
    console.log();
  }

  const counts = new Map<string, number>();
  for (const r of bad) {
    const key = r.verdict.replace(/\d+/g, "N");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log("Сводка по видам расхождений:");
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${v.toString().padStart(4)}  ${k}`);
  }
}

void main().finally(() => prisma.$disconnect());
