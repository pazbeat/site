# 002 — Входы модалок, бургера и шагов конструктора (коммит-база 3536225)

Статус: DONE (применён вместе с аудитом).

## Цель
Убрать «телепорты» в критическом флоу заказа: модалки согласия/черновика,
мобильное меню, смена шага конструктора.

## Изменения

1. `app/globals.css` — общий класс входа модалки (использует @starting-style,
   работает в актуальных браузерах; в старых просто нет анимации — деградация
   допустима):
   ```css
   .modal-overlay {
     transition: opacity 0.2s var(--ease-out);
     @starting-style { opacity: 0; }
   }
   .modal-panel {
     transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out);
     @starting-style { opacity: 0; transform: scale(0.97); }
   }
   .step-enter {
     animation: step-fade 0.18s var(--ease-out);
   }
   @keyframes step-fade {
     from { opacity: 0; transform: translateY(6px); }
   }
   .menu-enter {
     transition: opacity 0.25s var(--ease-out), transform 0.25s var(--ease-out);
     @starting-style { opacity: 0; transform: translateY(-8px); }
   }
   ```
2. `components/consent-modal.tsx`: оверлею добавить `modal-overlay`, панели —
   `modal-panel`.
3. `components/builder-client.tsx`: resume-модалка — те же классы; контейнер
   активного шага — `key={step}` + `className="step-enter"` (перемонтаж даёт
   анимацию входа; 180ms, не мешает работе).
4. `components/site-header.tsx`: контейнеру мобильного меню — `menu-enter`.

## Проверка
Открыть /create: модалка согласия мягко проявляется (бекдроп fade, панель
scale 0.97→1). «Далее» по шагам: контент шага коротко всплывает. Мобильная
ширина: бургер-меню выпадает, а не врезается. reduced-motion: глобальный
глушитель сводит всё к мгновенному (приемлемо).
