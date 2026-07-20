"use client";

import { useEffect } from "react";

/**
 * Плавное появление секций при прокрутке — fail-safe вариант (аудит №2 §9).
 *
 * В разметке секции носят маркер `.reveal`, но по умолчанию ПОЛНОСТЬЮ видимы
 * (SEO, no-JS, сбои IO — страница никогда не остаётся пустой). Этот компонент:
 *  1) пропускает секции, уже попавшие в первый экран (им анимация не нужна —
 *     контент не должен «догонять» пользователя);
 *  2) остальным добавляет `.will-reveal` (скрытие) и наблюдает за ними;
 *  3) наблюдатель срабатывает ЗАРАНЕЕ (за 20% вьюпорта до входа в кадр),
 *     поэтому к моменту, когда секция видна, она уже проявилась.
 */
export function RevealInit() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".reveal:not(.in)")];
    if (!els.length) return;

    const toObserve = els.filter(
      // Уже в кадре (или выше) — оставляем видимой, без анимации
      (el) => el.getBoundingClientRect().top > window.innerHeight,
    );
    if (!toObserve.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px 20% 0px", threshold: 0 },
    );
    toObserve.forEach((el) => {
      el.classList.add("will-reveal");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return null;
}
