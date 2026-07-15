"use client";

import { useEffect, useState } from "react";

/**
 * Тосты админки. Хранилище — модульное, чтобы `toast()` можно было звать из
 * любого клиентского компонента без проброса контекста через серверные
 * страницы (весь /admin рендерится на сервере, общего провайдера там нет).
 */

export type ToastKind = "ok" | "error";
type Toast = { id: number; text: string; kind: ToastKind };

const LIFETIME_MS = 5000;

let items: Toast[] = [];
let seq = 0;
const listeners = new Set<(next: Toast[]) => void>();

function emit() {
  for (const l of listeners) l(items);
}

export function toast(text: string, kind: ToastKind = "ok") {
  const id = ++seq;
  items = [...items, { id, text, kind }];
  emit();
  setTimeout(() => dismiss(id), LIFETIME_MS);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Результат серверного действия → тост. Возвращает true, если успех. */
export function toastResult(
  result: { ok?: boolean; error?: string; message?: string } | undefined,
  fallback = "Готово.",
): boolean {
  if (result?.error) {
    toast(result.error, "error");
    return false;
  }
  toast(result?.message ?? fallback);
  return true;
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:right-6 sm:bottom-6 sm:left-auto sm:items-end">
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            t.kind === "error"
              ? "border-red-200 bg-red-50 text-brand-red"
              : "border-brand-purple-100 bg-white text-brand-purple-950"
          }`}
        >
          <span className="font-medium">{t.text}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Закрыть"
            className="ml-auto shrink-0 text-brand-purple-950/40 hover:text-brand-purple-950"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
