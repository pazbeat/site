# 003 — Тач-гейтинг хверов, пресс-фидбек, salon-row без рефлоу (база 3536225)

Статус: DONE (применён вместе с аудитом).

## Цель
Сайт смотрят с телефонов: убрать «залипающие» hover-трансформы на тач,
дать кнопкам ощущение нажатия, убрать layout-анимацию строк салонов.

## Изменения (`app/globals.css`, зона `.rd`)

1. Обернуть в `@media (hover: hover) and (pointer: fine)` motion-части хверов:
   `.btn-gold:hover` (translateY/box-shadow), `.strip-nav button:hover`
   (transform), `.pcard:hover img` (scale 1.06), `.pcard:hover .desc`
   (раскрытие), `.gis-btn:hover` (translateY), `.salon-row:hover`.
   Цветовые hover-изменения можно не гейтить.
2. Пресс-фидбек: 
   ```css
   .rd .btn:active,
   .rd .strip-nav button:active,
   .rd .show-dots button:active { transform: scale(0.97); }
   ```
   (у `.btn` transform уже в транзишене 0.25s var(--ease-out) — отклик
   достаточный; строго 160ms необязательно.)
   Плюс Tailwind-кнопки шапки/конструктора: `active:scale-[0.97]`.
3. `.salon-row:hover { padding-left: 20px }` → убрать; вместо этого
   `.salon-row > * { transition: transform 0.25s var(--ease-out) }` и
   `.salon-row:hover > * { transform: translateX(12px) }` (composite-only,
   фон остаётся на строке).

## Проверка
Телефон (или девтулз-эмуляция тача): тап по карточке программы не оставляет
её «увеличенной». Десктоп: строка салона сдвигает содержимое, фон не дёргает
сетку; кнопки едва заметно поджимаются при нажатии.
