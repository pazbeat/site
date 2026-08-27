import { NextResponse } from "next/server";
import { buildInfo } from "@/lib/version";

/**
 * Версия развёрнутой сборки машиночитаемо — чтобы проверить, доехал ли деплой,
 * не открывая сайт и не листая подвал. Секретов не содержит: тот же коммит и
 * время, что видны в подвале каждому посетителю.
 */
export async function GET() {
  const info = buildInfo();
  return NextResponse.json(
    {
      number: info.number,
      sha: info.sha,
      builtAt: info.builtAt,
      label: info.label,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
