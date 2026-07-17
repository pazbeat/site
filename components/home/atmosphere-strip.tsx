"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type AtmoClip = { src: string; poster: string; caption: string };

/**
 * Горизонтальная лента живых мини-роликов «Атмосфера» (классы макета:
 * .section-head, .strip-nav, .atmo-strip, .acard). Ролики без звука,
 * зациклены; играют только пока видны на экране. Листается пальцем и
 * стрелками.
 */
export function AtmosphereStrip({
  eyebrow,
  title,
  clips,
}: {
  eyebrow: string;
  title: ReactNode;
  clips: AtmoClip[];
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        });
      },
      { threshold: 0.25 },
    );
    strip.querySelectorAll("video").forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [clips]);

  function scrollBy(dir: 1 | -1) {
    stripRef.current?.scrollBy({ left: dir * 322, behavior: "smooth" });
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

      <div ref={stripRef} className="atmo-strip">
        {clips.map((clip) => (
          <figure key={clip.src} className="acard">
            <video src={clip.src} poster={clip.poster} muted loop playsInline preload="none" />
            <figcaption>{clip.caption}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
