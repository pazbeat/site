"use client";

import { useState } from "react";
import type { GuestSection } from "@/lib/guest-info";

/** Аккордеон «Информация для гостей»: открыта всегда только одна секция. */
export function GuestInfoAccordion({ sections }: { sections: GuestSection[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="border-t border-brand-purple-100">
      {sections.map((section, i) => {
        const isOpen = i === open;
        return (
          <div key={section.title} className="border-b border-brand-purple-100">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-5 py-6 text-left"
            >
              <span
                className={`font-display text-2xl transition-colors ${
                  isOpen ? "text-brand-gold-700" : "text-brand-purple"
                }`}
              >
                {section.title}
              </span>
              <span
                aria-hidden
                className={`shrink-0 text-xl text-brand-gold-700 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            <div
              className={`grid transition-all duration-300 ${
                isOpen ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 pr-6 text-sm text-brand-purple-950/70">
                  {section.body.map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
