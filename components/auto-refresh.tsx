"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Обновляет серверные данные страницы каждые `seconds` секунд (ожидание оплаты). */
export function AutoRefresh({ seconds = 3 }: Readonly<{ seconds?: number }>) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
