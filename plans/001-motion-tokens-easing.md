# 001 — Токены движения и сильные кривые (коммит-база 3536225)

Статус: DONE (применён вместе с аудитом).

## Цель
Заменить встроенный вялый `ease` на сильные кривые через токены; убрать мёртвый
motion-код.

## Изменения (все в `app/globals.css`)

1. В `:root` (рядом с цветами макета, ~строка 60) добавить:
   ```css
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
   --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
   ```
2. `.reveal` (строка ~135): `transition: opacity 0.7s ease, transform 0.7s ease`
   → `opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out)`.
3. `.rd .btn` (строка ~343): добавить `var(--ease-out)` к transform/box-shadow
   частям транзишена (цветовые оставить как есть).
4. Аккордеон `guest-info-accordion.tsx` (инлайн-стиль):
   `grid-template-rows 0.3s ease` → `0.35s cubic-bezier(0.77, 0, 0.175, 1)`
   (морф на экране → ease-in-out). `.acc-sum .mark` (globals ~1097):
   `transform 0.3s` → `transform 0.3s var(--ease-out)`.
5. Удалить мёртвый `@keyframes kenburns` (строки 159–167). Удалить нескоуп
   `.ticker-track/.ticker-mask` правила (119–129), оставив только
   `.rd .ticker .ticker-track` (и перенести туда `@keyframes ticker`).

## Проверка
Главная: секции всплывают с быстрым стартом и мягким доездом (не «кисель»);
тикер бежит; аккордеон открывается упруго. `grep kenburns` — пусто.
