"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type HeroSlide = {
  src: string;
  poster: string;
  label: string;
  /** только у приветственного ролика — со звуком */
  sound?: boolean;
  /** кадрирование object-position, если персонаж вылезает за рамку */
  objectPosition?: string;
};

/**
 * Hero главной: слева типографика (children), справа видеокарусель.
 * Каждый слайд — короткий ролик; играет до конца и передаёт эстафету
 * следующему по кругу. Приветственный ролик — со звуком (если браузер
 * позволит; иначе включается по первому касанию). Живой аналог
 * слайд-шоу из утверждённого макета.
 */
export function HeroShowcase({
  slides,
  soundOnLabel,
  soundOffLabel,
  children,
}: {
  slides: HeroSlide[];
  soundOnLabel: string;
  soundOffLabel: string;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const userMutedRef = useRef(false);

  const hasSound = slides[current]?.sound ?? false;

  // Воспроизведение активного слайда + переход к следующему
  useEffect(() => {
    const v = videoRefs.current[current];
    if (!v) return;
    const slide = slides[current];
    const withSound = !!slide.sound;

    v.currentTime = 0;
    v.muted = withSound ? userMutedRef.current : true;
    setMuted(v.muted);
    const attempt = v.play();
    if (attempt) {
      attempt.catch(() => {
        // автозапуск со звуком заблокирован — играем без звука
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
    }

    const advance = () => setCurrent((c) => (c + 1) % slides.length);
    let timer: number | undefined;
    const arm = () => {
      // страховка: если событие ended не придёт — едем дальше по таймеру
      timer = window.setTimeout(advance, ((v.duration || 6) + 2) * 1000);
    };
    v.addEventListener("ended", advance);
    if (v.readyState >= 1) arm();
    else v.addEventListener("loadedmetadata", arm, { once: true });

    return () => {
      v.removeEventListener("ended", advance);
      if (timer) clearTimeout(timer);
      v.pause();
    };
  }, [current, slides]);

  // Первое касание где угодно включает звук приветственного ролика
  useEffect(() => {
    const enable = () => {
      const v = videoRefs.current[current];
      if (v && slides[current]?.sound && !userMutedRef.current && v.muted) {
        v.muted = false;
        setMuted(false);
      }
      document.removeEventListener("pointerdown", enable);
    };
    document.addEventListener("pointerdown", enable);
    return () => document.removeEventListener("pointerdown", enable);
  }, [current, slides]);

  function toggleSound() {
    const v = videoRefs.current[current];
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    userMutedRef.current = next;
    setMuted(next);
  }

  return (
    <section className="bg-hero-plum grid min-h-[100svh] text-white lg:grid-cols-[46%_54%]">
      {/* Левая панель — типографика */}
      <div className="relative z-10 flex flex-col justify-center px-6 pt-28 pb-14 sm:px-10 lg:pt-24">
        {children}
      </div>

      {/* Правая панель — живая видеокарусель */}
      <div className="relative min-h-[52svh] overflow-hidden lg:min-h-full">
        {slides.map((slide, i) => (
          <div
            key={slide.src}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          >
            <video
              ref={(el) => {
                videoRefs.current[i] = el;
              }}
              src={slide.src}
              poster={slide.poster}
              playsInline
              muted={i !== current || muted}
              preload={i === 0 ? "auto" : "none"}
              className="absolute inset-0 h-full w-full object-cover"
              style={slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined}
            />
          </div>
        ))}

        {/* затемнение снизу для читаемости подписи */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a0d20]/70 via-transparent to-transparent" />

        {hasSound && (
          <button
            type="button"
            onClick={toggleSound}
            className="absolute top-24 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/25 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:border-brand-gold-300 sm:right-8"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
              {!muted && <path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" />}
            </svg>
            {muted ? soundOnLabel : soundOffLabel}
          </button>
        )}

        {/* точки-переключатели */}
        <div className="absolute bottom-8 left-6 z-20 flex gap-2.5 sm:left-10">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              aria-label={slide.label}
              onClick={() => setCurrent(i)}
              className={`h-1 rounded-full transition-all ${
                i === current ? "w-8 bg-brand-gold-300" : "w-4 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>

        {/* подпись + счётчик */}
        <div className="absolute right-6 bottom-14 z-20 text-right sm:right-10 sm:bottom-8">
          <p className="font-display text-lg italic sm:text-2xl">{slides[current]?.label}</p>
          <p className="mt-1 text-xs tracking-[0.28em] text-brand-gold-300 tabular-nums">
            {String(current + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </p>
        </div>
      </div>
    </section>
  );
}
