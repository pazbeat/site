"use client";

import { useEffect, useState } from "react";

/**
 * Оболочка админки с выдвижным меню на мобиле. Клиентский только каркас —
 * содержимое сайдбара приходит слотом с сервера (там server action выхода),
 * поэтому страницы остаются серверными.
 */
export function NavShell({
  sidebar,
  title,
  children,
}: Readonly<{
  sidebar: React.ReactNode;
  title: string;
  children: React.ReactNode;
}>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {open && (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-brand-purple-950/40 sm:hidden"
        />
      )}

      {/* Ссылки приходят слотом с сервера — вешать onClick на каждую нельзя,
          поэтому закрываем меню по всплывшему клику на любую из них */}
      <aside
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 flex-col overflow-y-auto bg-brand-purple px-4 py-6 text-white sm:static sm:flex ${
          open ? "flex" : "hidden"
        }`}
      >
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="rounded-lg border border-brand-purple-100 px-3 py-2 text-brand-purple sm:hidden"
          >
            ☰
          </button>
          <h1 className="font-display text-2xl font-semibold text-brand-purple">
            {title}
          </h1>
        </div>
        {children}
      </main>
    </div>
  );
}
