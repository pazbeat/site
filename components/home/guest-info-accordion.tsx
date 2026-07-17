"use client";

import { useState } from "react";
import type { GuestSection } from "@/lib/guest-info";

/** Аккордеон «Информация для гостей» (классы макета .acc/.acc-item/.acc-sum). */
export function GuestInfoAccordion({ sections }: { sections: GuestSection[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="acc">
      {sections.map((section, i) => {
        const isOpen = i === open;
        return (
          <div key={section.title} className={`acc-item${isOpen ? " open" : ""}`}>
            <button
              type="button"
              className="acc-sum"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
            >
              {section.title}
              <span className="mark" aria-hidden>
                +
              </span>
            </button>
            <div
              className="acc-collapse"
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 0.3s ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
                <div className="acc-body">
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
