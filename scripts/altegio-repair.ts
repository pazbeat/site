/**
 * Починка сертификатов, которые не доехали до Altegio как надо.
 *
 * Два случая, оба пойманы живьём 2026-08-26:
 *  1) продажи в CRM нет вовсе — номер оказался занят чужим сертификатом, а
 *     прежний код принимал отказ Altegio за идемпотентный повтор. Такой
 *     сертификат просто пере-синхронизируем: подбор свободного номера теперь
 *     встроен в syncCertificateToAltegio;
 *  2) продажа есть, но не проведена — сертификат выпускался в тест-режиме,
 *     где markAsPaid намеренно не вызывается. В кассу такая продажа не
 *     попадает, в карточке стоит «не оплачено». Проводим.
 *
 * Запуск (условие react-server обязательно — модули помечены `server-only`):
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/altegio-repair.ts WM0006 WM0005
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/altegio-repair.ts --all
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { altegioRequest } from "../lib/altegio/client";
import { branchParams } from "../lib/altegio/catalog";
import { markSaleAsPaid } from "../lib/altegio/operations";
import { syncCertificateToAltegio } from "../lib/altegio/sync";

type SaleState = {
  paid?: boolean;
  document?: { comment?: string };
};

async function saleIsPaid(companyId: number, documentId: string) {
  const data = await altegioRequest<SaleState>(
    `storage_operations/operation/${companyId}/${documentId}`,
  );
  return { paid: data.paid === true, comment: data.document?.comment ?? "" };
}

async function repair(serial: string) {
  const cert = await prisma.certificate.findFirst({
    where: { serial },
    include: { order: true },
  });
  if (!cert) {
    console.log(`${serial}: такого сертификата нет`);
    return;
  }
  if (cert.order.status !== "paid") {
    console.log(`${serial}: заказ не оплачен (${cert.order.status}) — пропуск`);
    return;
  }

  if (!cert.altegioCertId) {
    console.log(`${serial}: продажи в Altegio нет — выпускаем заново`);
    await syncCertificateToAltegio(cert.id);
    const fresh = await prisma.certificate.findUniqueOrThrow({
      where: { id: cert.id },
      select: { serial: true, altegioCertId: true },
    });
    console.log(
      `${serial}: → номер ${fresh.serial}, документ ${fresh.altegioCertId ?? "—"}`,
    );
    return;
  }

  const companyId = cert.altegioCompanyId;
  if (!companyId) {
    console.log(`${serial}: не записан филиал Altegio — пропуск`);
    return;
  }
  const state = await saleIsPaid(companyId, cert.altegioCertId);
  if (state.paid) {
    console.log(`${serial}: продажа ${cert.altegioCertId} уже проведена`);
    return;
  }
  const branch = branchParams(companyId);
  if (!branch) {
    console.log(`${serial}: филиал ${companyId} не смапплен — пропуск`);
    return;
  }
  await markSaleAsPaid(
    companyId,
    Number(cert.altegioCertId),
    cert.amountKzt ?? cert.balanceKzt,
    branch.accountId,
  );
  console.log(
    `${serial}: продажа ${cert.altegioCertId} проведена как оплаченная`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  let serials = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--all")) {
    const all = await prisma.certificate.findMany({
      where: { serial: { not: null }, order: { status: "paid" } },
      select: { serial: true },
      orderBy: { createdAt: "asc" },
    });
    serials = all.map((c) => c.serial!);
  }
  if (serials.length === 0) {
    console.log("укажите номера сертификатов или --all");
    return;
  }
  for (const serial of serials) {
    try {
      await repair(serial);
    } catch (error) {
      console.error(`${serial}: ошибка —`, error);
    }
  }
}

void main().finally(() => prisma.$disconnect());
