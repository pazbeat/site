"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Кнопка с подтверждением в модалке вместо системного confirm(): его нельзя
 * оформить, он блокирует поток и в некоторых браузерах молча подавляется.
 */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel = "Подтвердить",
  danger = false,
  disabled = false,
  className,
  onConfirm,
}: Readonly<{
  label: string;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  onConfirm: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-purple-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="confirm-title"
              className="mb-2 font-display text-xl font-semibold text-brand-purple"
            >
              {title}
            </h2>
            <p className="mb-5 text-sm text-brand-purple-950/70">{body}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-brand-purple-100 px-5 py-2 text-sm font-semibold text-brand-purple-950/70 hover:bg-brand-purple-50"
              >
                Отмена
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
                className={`rounded-full px-5 py-2 text-sm font-bold text-white ${
                  danger
                    ? "bg-brand-red hover:bg-brand-red/90"
                    : "bg-brand-purple hover:bg-brand-purple-600"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
