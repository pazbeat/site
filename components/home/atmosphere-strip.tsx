"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type AtmoClip = { src: string; poster: string; caption: string };

/**
 * Горизонтальная лента живых мини-роликов «Атмосфера». Ролики без звука,
 * зациклены; играют только пока видны на экране (экономим ресурсы —
 * сайт не тормозит). Листается пальцем и стрелками.
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
    stripRef.current?.scrollBy({ left: dir * 264, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.28em] text-brand-gold uppercase">
            <span className="mr-3 inline-block h-px w-10 -translate-y-1 bg-brand-gold align-middle" />
            {eyebrow}
          </p>
          <h2 className="font-display text-3xl font-medium text-brand-purple sm:text-4xl">
            {title}
          </h2>
        </div>
        <div className="hidden gap-3 sm:flex">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => scrollBy(dir)}
              aria-label={dir === -1 ? "Назад" : "Вперёд"}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-purple-100 text-brand-gold-700 transition-all hover:-translate-y-0.5 hover:border-brand-gold"
            >
              {dir === -1 ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={stripRef}
        className="no-scrollbar grid snap-x snap-mandatory auto-cols-[minmax(168px,244px)] grid-flow-col gap-4 overflow-x-auto pb-2 sm:gap-5"
      >
        {clips.map((clip) => (
          <figure
            key={clip.src}
            className="relative m-0 aspect-[9/16] snap-start overflow-hidden rounded border border-brand-purple-100 transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-xl"
          >
            <video
              src={clip.src}
              poster={clip.poster}
              muted
              loop
              playsInline
              preload="none"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a0d20]/72 via-transparent to-transparent" />
            <figcaption className="absolute bottom-3.5 left-4 z-10 text-xs font-semibold tracking-[0.12em] text-white uppercase">
              {clip.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
