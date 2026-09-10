"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { designThumb, groupDesigns, locateDesign } from "@/lib/designs";
import type { DesignDto } from "@/lib/types";

/**
 * Выбор открытки: дуга поводов и карусель внутри повода.
 *
 * Почему дуга несёт ПОВОДЫ, а не цвета. В референсе по дуге идут цвета одной
 * и той же карты — у нас тридцать одна разная картинка, красить их
 * бессмысленно. Зато они естественно делятся на шесть поводов, и это ровно
 * то, с чем покупатель приходит: он ищет не «фиолетовую», а «на день
 * рождения».
 *
 * Сама дуга сделана не кольцом точек, а ниткой слов, провисающей под
 * собственным весом. Кривая задана сдвигом каждого слова по вертикали —
 * SVG не нужен, а на узком экране нитка просто прокручивается вбок.
 *
 * Сетка из тридцати одной картинки, которая была здесь раньше, показывала
 * всё сразу и не показывала ничего: одиннадцать рядов мелких превью, среди
 * которых выбирают наугад.
 */

type Props = Readonly<{
  designs: DesignDto[];
  /** Выбранная открытка — по идентификатору, а не по месту в списке. */
  value: number | null;
  onChange: (designId: number) => void;
}>;

export function BuilderDesigns({ designs, value, onChange }: Props) {
  const t = useTranslations("Builder.designs");
  const groups = useMemo(() => groupDesigns(designs), [designs]);

  // Начальное положение карусели восстанавливается по выбранной открытке:
  // вернувшись назад с третьего шага, покупатель должен увидеть свою, а не
  // первую попавшуюся.
  const start = useMemo(
    () => (value ? locateDesign(groups, value) : { groupIndex: 0, cardIndex: 0 }),
    [groups, value],
  );
  const [groupIndex, setGroupIndex] = useState(start.groupIndex);
  const [cardIndex, setCardIndex] = useState(start.cardIndex);

  const group = groups[groupIndex];
  if (!group) return null;
  const cards = group.designs;
  const total = cards.length;
  const current = cards[Math.min(cardIndex, total - 1)];

  const move = (delta: number) => {
    const next = (cardIndex + delta + total) % total;
    setCardIndex(next);
    onChange(cards[next].id);
  };

  const pickGroup = (index: number) => {
    setGroupIndex(index);
    setCardIndex(0);
    onChange(groups[index].designs[0].id);
  };

  const side = (offset: number) => cards[(cardIndex + offset + total) % total];

  return (
    <div className="dsn">
      <div className="dsn__arc" role="tablist" aria-label={t("occasion")}>
        {groups.map((g, index) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={index === groupIndex}
            onClick={() => pickGroup(index)}
            className="dsn__occ"
          >
            {t(`occ.${g.key}`)}
          </button>
        ))}
      </div>

      <div className="dsn__stage">
        <span className="dsn__glow" aria-hidden="true" />
        <div className="dsn__rail">
          {total > 1 && (
            <button
              type="button"
              className="dsn__nav dsn__nav--prev"
              onClick={() => move(-1)}
              aria-label={t("prev")}
            >
              ‹
            </button>
          )}

          {total > 1 && (
            <span className="dsn__slot dsn__slot--side" aria-hidden="true">
              {side(-1).imageUrl && (
                <Image
                  src={designThumb(side(-1).imageUrl!)}
                  alt=""
                  width={160}
                  height={96}
                />
              )}
            </span>
          )}

          <span className="dsn__slot dsn__slot--main">
            {current.imageUrl && (
              <Image
                src={current.imageUrl}
                alt={current.name}
                width={520}
                height={312}
                priority
              />
            )}
          </span>

          {total > 1 && (
            <span className="dsn__slot dsn__slot--side" aria-hidden="true">
              {side(1).imageUrl && (
                <Image
                  src={designThumb(side(1).imageUrl!)}
                  alt=""
                  width={160}
                  height={96}
                />
              )}
            </span>
          )}

          {total > 1 && (
            <button
              type="button"
              className="dsn__nav dsn__nav--next"
              onClick={() => move(1)}
              aria-label={t("next")}
            >
              ›
            </button>
          )}
        </div>
      </div>

      <p className="dsn__meta">
        <span className="dsn__cardname">{current.name}</span>
        {total > 1 && (
          <span className="dsn__count">
            {t("counter", { n: cardIndex + 1, total })}
          </span>
        )}
      </p>

      {total > 1 && (
        <div className="dsn__dots" aria-hidden="true">
          {cards.map((c, i) => (
            <span
              key={c.id}
              className="dsn__dot"
              data-on={i === cardIndex ? "1" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
