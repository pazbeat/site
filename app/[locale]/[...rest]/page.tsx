import { notFound } from "next/navigation";

/**
 * Ловушка несуществующих путей под /[locale]/*. Без неё Next рендерит
 * глобальный дефолтный 404 без контекста локали; здесь же вызываем
 * notFound() → показывается локализованный [locale]/not-found.tsx.
 */
export default function CatchAllNotFound() {
  notFound();
}
