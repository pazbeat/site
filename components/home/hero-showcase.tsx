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
 * Hero главной: слева типографика (children в .hero-panel), справа живая
 * видеокарусель. Каждый слайд играет до конца и передаёт эстафету
 * следующему по кругу. Приветственный ролик — со звуком (если браузер
 * позволит; иначе включается по первому касанию). Разметка/классы —
 * один-в-один с утверждённым макетом (.hero, .hero-show, слева переход
 * видео в плюм через .hero-show::after).
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

  useEffect(() => {
    const v = videoRefs.current[current];
    if (!v) return;
    const withSound = !!slides[current].sound;

    v.currentTime = 0;
    v.muted = withSound ? userMutedRef.current : true;
    setMuted(v.muted);
    const attempt = v.play();
    if (attempt) {
      attempt.catch(() => {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
    }

    const advance = () => setCurrent((c) => (c + 1) % slides.length);
    let timer: number | undefined;
    const arm = () => {
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
    <section className="hero">
      <div className="hero-panel">{children}</div>

      <div className="hero-show">
        {slides.map((slide, i) => (
          <div key={slide.src} className={`slide${i === current ? " on" : ""}`}>
            <video
              ref={(el) => {
                videoRefs.current[i] = el;
              }}
              src={slide.src}
              poster={slide.poster}
              playsInline
              muted={i !== current || muted}
              preload={i === 0 ? "auto" : "none"}
              style={slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined}
            />
          </div>
        ))}

        {hasSound && (
          <button type="button" className="sound-btn" onClick={toggleSound}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {!muted && (
                <path
                  className="snd-waves"
                  d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              )}
            </svg>
            {muted ? soundOnLabel : soundOffLabel}
          </button>
        )}

        <div className="show-dots" role="tablist" aria-label="Слайды">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              className={i === current ? "on" : ""}
              aria-label={slide.label}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>

        {/* key={current}: перемонтаж при смене слайда даёт микро-fade подписи */}
        <div className="show-cap cap-fade" key={current}>
          <span className="show-cap-label">{slides[current]?.label}</span>
          <span className="show-cap-num">
            {String(current + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </section>
  );
}
