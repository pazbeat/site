-- Цвет коробки на экране «Вам подарок» (2026-09-15).
--
-- Решение заказчика: цвет выпадает случайно при покупке и закрепляется за
-- сертификатом — получатель, открывший страницу второй раз, видит ту же
-- коробку. Ключи и ротация — lib/gift-palettes.ts, палитры — app/globals.css.

ALTER TABLE "certificates" ADD COLUMN "gift_palette" TEXT;

-- Уже выданным — случайный цвет из той же ротации, что и при выпуске
-- (brand, champagne, mint, sky, pearl). random() вызывается для каждой строки
-- заново. Без этого заполнения они бы тоже не остались без цвета —
-- resolveGiftPalette подставляет стабильный по id, — но тогда распределение
-- цветов у старых и новых сертификатов было бы устроено по-разному.
UPDATE "certificates"
   SET "gift_palette" = (ARRAY['brand', 'champagne', 'mint', 'sky', 'pearl'])[1 + floor(random() * 5)::int]
 WHERE "gift_palette" IS NULL;
