"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLegalAction } from "@/app/admin/legal/actions";

type Version = {
  id: number;
  lang: string;
  createdAt: string;
  isCurrent: boolean;
};

export function LegalEditor({
  type,
  label,
  currentHtml,
  currentLang,
  history,
}: Readonly<{
  type: string;
  label: string;
  currentHtml: string;
  currentLang: string;
  history: Version[];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState(currentHtml);
  const [message, setMessage] = useState("");

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
          setMessage("");
          startTransition(async () => {
            const result = await saveLegalAction(fd);
            if (result?.error) setMessage(result.error);
            else {
              setMessage("Создана новая версия.");
              router.refresh();
            }
          });
        }}
        className="mt-4"
      >
        <input type="hidden" name="type" value={type} />
        <div className="mb-2 flex items-center gap-2">
          <label className="text-xs font-bold">Язык</label>
          <select
            name="lang"
            defaultValue={currentLang}
            className="rounded-lg border-[1.5px] border-brand-purple-100 px-2 py-1 text-sm outline-none focus:border-brand-gold"
          >
            <option value="ru">RU</option>
            <option value="kk">KK</option>
            <option value="en">EN</option>
          </select>
        </div>
        <textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder="<p>Текст документа (разрешён базовый HTML)…</p>"
          className="w-full rounded-xl border-[1.5px] border-brand-purple-100 px-3 py-2 font-mono text-sm outline-none focus:border-brand-gold"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
          >
            Сохранить как новую версию
          </button>
          {message && (
            <span className="text-sm font-semibold text-brand-purple">
              {message}
            </span>
          )}
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
                #{v.id} · {v.lang.toUpperCase()} · {v.createdAt}
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
