import { describe, expect, it } from "vitest";
import {
  activeOccasion,
  getOccasion,
  pickOccasionPrograms,
} from "@/lib/occasions";
import type { ProgramDto } from "@/lib/types";

const at = (iso: string) => new Date(`${iso}T12:00:00+05:00`);

describe("activeOccasion (окна в Asia/Almaty)", () => {
  it("8 марта — активен march-8", () => {
    expect(activeOccasion(at("2026-03-08"))?.slug).toBe("march-8");
  });

  it("10 февраля — активен valentine", () => {
    expect(activeOccasion(at("2026-02-10"))?.slug).toBe("valentine");
  });

  it("Новый год переходит через год: 25 декабря", () => {
    expect(activeOccasion(at("2026-12-25"))?.slug).toBe("new-year");
  });

  it("Новый год: 5 января", () => {
    expect(activeOccasion(at("2027-01-05"))?.slug).toBe("new-year");
  });

  it("обычный июльский день — нет активного повода", () => {
    expect(activeOccasion(at("2026-07-21"))).toBeNull();
  });
});

describe("pickOccasionPrograms", () => {
  const prog = (id: number, over: Partial<ProgramDto> = {}): ProgramDto => ({
    id,
    category: "massage",
    highlight: null,
    name: `P${id}`,
    description: "",
    photoUrl: null,
    cities: [],
    options: [{ id: id * 10, durationMin: 60, persons: null, priceKzt: 20000 }],
    ...over,
  });

  it("отбирает по фильтру повода", () => {
    const hit = getOccasion("thank-you")!; // filter: highlight === "hit"
    const list = [prog(1, { highlight: "hit" }), prog(2), prog(3, { highlight: "hit" })];
    const picks = pickOccasionPrograms(hit, list);
    expect(picks.map((p) => p.id).sort()).toEqual([1, 3]);
  });

  it("фолбэк на непустой список, если под фильтр ничего не подошло", () => {
    const nauryz = getOccasion("nauryz")!;
    const list = [prog(1), prog(2)]; // ни хитов, ни spa
    expect(pickOccasionPrograms(nauryz, list).length).toBe(2);
  });

  it("ограничивает количество", () => {
    const ty = getOccasion("thank-you")!;
    const list = Array.from({ length: 10 }, (_, i) =>
      prog(i + 1, { highlight: "hit" }),
    );
    expect(pickOccasionPrograms(ty, list, 4).length).toBe(4);
  });
});
