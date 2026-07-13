import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import type { CertificateStatus } from "../generated/prisma/client";

export type RedeemResult =
  | { ok: true; balanceKzt: number; status: CertificateStatus }
  | { ok: false; error: string };

/**
 * Ручное погашение сертификата менеджером (PRD §6.5): полное или частичное.
 * Наша БД — источник истины по погашениям до интеграции Altegio (Фаза 3).
 * Атомарно: списание баланса + запись Redemption с ключом идемпотентности.
 */
export async function redeemCertificate(params: {
  certificateId: string;
  amountKzt: number;
  salonId: number | null;
  actor: string;
  comment?: string;
}): Promise<RedeemResult> {
  if (!Number.isInteger(params.amountKzt) || params.amountKzt <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  return prisma.$transaction(async (tx) => {
    const cert = await tx.certificate.findUnique({
      where: { id: params.certificateId },
    });
    if (!cert) return { ok: false, error: "not_found" };
    if (cert.status !== "active" && cert.status !== "partially_used") {
      return { ok: false, error: "not_redeemable" };
    }
    if (params.amountKzt > cert.balanceKzt) {
      return { ok: false, error: "amount_exceeds_balance" };
    }

    const newBalance = cert.balanceKzt - params.amountKzt;
    // Программный сертификат гасится целиком → used; номинальный может
    // погашаться частями → partially_used, при нуле → used.
    const status: CertificateStatus = newBalance === 0 ? "used" : "partially_used";

    await tx.redemption.create({
      data: {
        certificateId: cert.id,
        amountKzt: params.amountKzt,
        salonId: params.salonId,
        source: "admin",
        actor: params.actor,
        idemKey: randomUUID(),
        comment: params.comment ?? null,
      },
    });
    const updated = await tx.certificate.update({
      where: { id: cert.id },
      data: { balanceKzt: newBalance, status },
    });

    return { ok: true, balanceKzt: updated.balanceKzt, status: updated.status };
  });
}
