"use client";

import { useEffect } from "react";

/**
 * Плавное появление секций при прокрутке: вешает .in на все .reveal,
 * попавшие в кадр. Один наблюдатель на страницу — контент остаётся
 * server-rendered (виден краулерам), анимация только косметическая.
 */
export function RevealInit() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.in)");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
