"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RichText } from "./rich-text";
import { toastResult } from "./toast";
import { saveLegalAction } from "@/app/admin/legal/actions";

type Version = {
  id: number;
  lang: string;
  createdAt: string;
  isCurrent: boolean;
};

type Lang = "ru" | "kk" | "en";
const LANGS: Lang[] = ["ru", "kk", "en"];

export function LegalEditor({
  type,
  label,
  byLang,
  history,
}: Readonly<{
  type: string;
  label: string;
  byLang: Record<Lang, string>;
  history: Version[];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lang, setLang] = useState<Lang>("ru");
  const [content, setContent] = useState(byLang.ru);

  /**
   * Смена языка подменяет и текст в поле.
   *
   * Раньше переключатель менял только метку, с которой уйдёт форма, а текст
   * оставался прежним: выбрав KK, редактор показывал русский документ, и
   * сохранение записывало русское содержимое как казахскую редакцию — ту, на
   * которую ссылаются согласия казахских покупателей.
   */
  const switchLang = (next: Lang) => {
    if (next === lang) return;
    const edited = content !== byLang[lang];
    if (edited && !confirm("Несохранённые правки текущего языка пропадут. Продолжить?")) {
      return;
    }
    setLang(next);
    setContent(byLang[next]);
  };

  return (
    <details className="rounded-2xl border border-brand-purple-100 bg-white p-5">
      <summary className="cursor-pointer font-display text-lg text-brand-purple">
        {label}
        {history[0] && (
          <span className="ml-2 text-xs text-brand-purple-950/50">
            (посл. версия: {history[0].createdAt})
          </span>
        )}
      </summary>

      <form
        action={(fd) => {
          startTransition(async () => {
            if (toastResult(await saveLegalAction(fd), "Создана новая версия.")) {
              router.refresh();
            }
          });
        }}
        className="mt-4"
      >
        <input type="hidden" name="type" value={type} />
        <div className="mb-2 flex items-center gap-2">
          <label className="text-xs font-bold" htmlFor={`lang-${type}`}>
            Язык
          </label>
          <select
            id={`lang-${type}`}
            name="lang"
            value={lang}
            onChange={(e) => switchLang(e.target.value as Lang)}
            className="rounded-lg border-[1.5px] border-brand-purple-100 px-2 py-1 text-sm outline-none focus:border-brand-gold"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          {byLang[lang] === "" && (
            <span className="text-xs font-bold text-brand-red">
              на этом языке редакции ещё нет — сохранение создаст первую
            </span>
          )}
          {lang !== "ru" && (
            <span className="text-xs text-brand-purple-950/50">
              перевод; действующей редакцией управляет русский текст
            </span>
          )}
        </div>
        <input type="hidden" name="content" value={content} />
        {/* key: редактор берёт текст только при монтировании, без этого
            смена языка не перерисовала бы содержимое поля. */}
        <RichText key={lang} value={content} onChange={setContent} />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
          >
            Сохранить как новую версию
          </button>
          <span className="text-xs text-brand-purple-950/50">
            Прежняя версия остаётся в истории — согласия покупателей ссылаются
            именно на неё.
          </span>
        </div>
      </form>

      {history.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-bold text-brand-purple-950/60">
            История версий
          </div>
          <ul className="text-sm">
            {history.map((v) => (
              <li key={v.id} className="py-1 text-brand-purple-950/70">
                {/* Ссылка обязательна: по номеру редакции из записи согласия
                    нужно уметь открыть тот самый текст. */}
                <Link
                  href={`/admin/legal/version/${v.id}`}
                  className="text-brand-purple underline"
                >
                  #{v.id}
                </Link>{" "}
                · {v.lang.toUpperCase()} · {v.createdAt}
                {v.isCurrent && (
                  <span className="ml-2 text-xs font-bold text-brand-gold-700">
                    опубликована
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
