import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadActiveAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";
import { periodFilter, resolvePeriod } from "@/lib/admin/period";

/**
 * Выгрузка платежей для сверки с банковской выпиской.
 *
 * До неё сверить наши продажи с выпиской было нечем: отчёт «Продажи» показывает
 * суммы, но не номера операций, а именно по ним платёж ищется в кабинете банка
 * и в Kaspi. Ровно этого не хватало, чтобы поймать «оплатил — сертификата нет»
 * и «сертификат есть — денег нет» до жалобы покупателя.
 *
 * Период — по дате ОПЛАТЫ (`paidAt`), а не создания заказа: в выписке платёж
 * стоит днём списания, и по дате создания месяцы не сойдутся у любого заказа,
 * оплаченного назавтра.
 */

/**
 * CSV-экранирование: точка с запятой — разделитель, дружелюбный к Excel.
 *
 * Ячейку, начинающуюся с `=`, `+`, `-` или `@`, Excel и Google Таблицы
 * исполняют как формулу. В выгрузку попадают поля, которые заполняет
 * покупатель, — почта и промокод, — поэтому такие значения предваряем
 * апострофом: в таблице он не виден, но формула снова становится текстом.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Момент → «ДД.ММ.ГГГГ ЧЧ:ММ» по времени салона. */
function almaty(date: Date | null): string {
  if (!date) return "";
  const iso = new Date(date.getTime() + 5 * 3_600_000).toISOString();
  const [day, time] = [iso.slice(0, 10), iso.slice(11, 16)];
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y} ${time}`;
}

const HEADERS = [
  "Оплачен",
  "Заказ",
  "Номер для Kaspi",
  "Способ",
  "Номер операции",
  "Оплачено, ₸",
  "Номинал, ₸",
  "Промокод",
  "Сертификат",
  "Филиал",
  "Почта покупателя",
  "Выпущен вручную",
];

export async function GET(request: Request) {
  const session = await auth();
  const admin = await loadActiveAdmin(session?.user?.id);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = resolvePeriod({
    month: url.searchParams.get("month") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const paidAt = periodFilter(period);

  const orders = await prisma.order.findMany({
    where: { status: "paid", ...(paidAt ? { paidAt } : {}) },
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      paidAt: true,
      kaspiRef: true,
      paymentProvider: true,
      paymentId: true,
      amountKzt: true,
      buyerEmail: true,
      promo: { select: { code: true } },
      salon: { select: { city: true, name: true } },
      certificates: { select: { serial: true, amountKzt: true } },
    },
  });

  const rows = orders.map((order) => {
    const cert = order.certificates[0];
    // Номинал сертификата и сумма оплаты расходятся при промокоде: скидка
    // уменьшает оплату, номинал остаётся полным. Бухгалтеру нужны обе.
    const manual = order.paymentId?.startsWith("manual:") ?? false;
    return [
      almaty(order.paidAt),
      order.id,
      order.kaspiRef,
      order.paymentProvider ?? "",
      manual ? order.paymentId?.slice("manual:".length) : order.paymentId,
      order.amountKzt,
      cert?.amountKzt ?? "",
      order.promo?.code ?? "",
      // Сертификата может не быть вовсе — это и есть расхождение, и в выгрузке
      // оно должно быть видно, а не выпадать из строки.
      cert ? (cert.serial ?? "без номера") : "НЕТ СЕРТИФИКАТА",
      `${order.salon.city}, ${order.salon.name}`,
      order.buyerEmail,
      manual ? "да" : "",
    ].map(cell);
  });

  // BOM — иначе Excel в Windows открывает кириллицу как «РџСЂРѕРґР°Р¶Рё».
  const csv =
    "﻿" +
    [HEADERS.map(cell).join(";"), ...rows.map((row) => row.join(";"))].join(
      "\r\n",
    );

  const name = `imbir-payments-${period.key}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(Buffer.byteLength(csv, "utf8")),
      "Cache-Control": "no-store",
    },
  });
}
