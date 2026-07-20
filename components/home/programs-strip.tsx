"use client";

import { useRef, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export type StripProgram = {
  id: number;
  href: string;
  name: string;
  desc: string;
  dur: string;
  price: string;
  photoUrl: string | null;
  /** Локализованная метка подборки («Хит»/«В тренде»/«Сезонное») */
  badge: string | null;
};

/**
 * Лента «Популярные программы» с горизонтальным скроллом и стрелками —
 * классы макета .section-head/.strip-nav/.programs-strip/.pcard.
 */
export function ProgramsStrip({
  eyebrow,
  title,
  allLabel,
  programs,
}: {
  eyebrow: string;
  title: ReactNode;
  allLabel: string;
  programs: StripProgram[];
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: 1 | -1) {
    stripRef.current?.scrollBy({ left: dir * 386, behavior: "smooth" });
  }

  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="strip-nav">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Назад">
            ←
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Вперёд">
            →
          </button>
        </div>
      </div>

      <div ref={stripRef} className="programs-strip">
        {programs.map((p) => (
          <Link key={p.id} className="pcard" href={p.href}>
            {p.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- фото программ могут быть внешними
              <img src={p.photoUrl} alt={p.name} loading="lazy" />
            )}
            {p.badge && <span className="pcard-badge">{p.badge}</span>}
            <span className="pcard-dur">{p.dur}</span>
            <div className="pcard-cap">
              <h3>{p.name}</h3>
              <p className="desc">{p.desc}</p>
              <span>{p.price}</span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: "40px", textAlign: "center" }}>
        <Link className="link-more" href="/programs">
          {allLabel}
        </Link>
      </div>
    </>
  );
}
