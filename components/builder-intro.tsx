"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * Первый экран конструктора: сумму или услугу.
 *
 * Почему отдельный экран, а не пара переключателей в форме. Это единственное
 * решение покупателя, которое меняет всё дальнейшее: на сумму получатель
 * выбирает сам, на услугу — выбираете вы. Раньше выбор стоял рядом с городом
 * и филиалом мелкой парой кнопок, и его проскакивали не читая.
 *
 * Смысл несёт сам предмет, а не подпись: слева веер из трёх открыток —
 * получатель будет выбирать; справа одна карта, повёрнутая к зрителю, — выбор
 * уже сделан за него. Рамок нет ни одной, объём даёт наклон, тень и сияние.
 *
 * Нажимается сама открытка — вся карточка вместе с подписью это одна
 * кнопка. Отдельная «Выбрать» под ней была лишней (решение заказчика
 * 2026-09-11): человек и так тянется к сертификату, который хочет. Подписи
 * видны всегда, а не по наведению: на телефоне наведения нет.
 */

type Props = Readonly<{
  onPick: (type: "nominal" | "program") => void;
  /**
   * Картинки-открытки для сцены. Первые три уходят в веер «на сумму»,
   * четвёртая — на карту «на услугу». Берём настоящие, не заглушки.
   */
  images: string[];
  /** Пример суммы на плашке — из реального списка номиналов. */
  sampleAmount: string;
  /** Пример программы на плашке — из реального каталога. */
  sampleProgram: string;
}>;

export function BuilderIntro({
  onPick,
  images,
  sampleAmount,
  sampleProgram,
}: Props) {
  const t = useTranslations("Builder.intro");
  const [a, b, c, d] = images;

  return (
    <section className="pick">
      <div className="pick__inner">
        <div className="pick__head">
          <p className="pick__step">{t("step")}</p>
          <h1 className="pick__title">{t("title")}</h1>
          <p className="pick__lede">{t("lede")}</p>
        </div>

        <div className="pick__scene">
          {/* На сумму — веер: получатель будет выбирать сам */}
          <button
            type="button"
            onClick={() => onPick("nominal")}
            className="pick__opt pick__opt--sum"
          >
            <span className="pick__stage">
              <span className="pick__glow" aria-hidden="true" />
              <span className="pick__deck">
                {c ? (
                  <span className="pick__card pick__card--3">
                    <Image src={c} alt="" width={400} height={240} />
                  </span>
                ) : null}
                {b ? (
                  <span className="pick__card pick__card--2">
                    <Image src={b} alt="" width={400} height={240} />
                  </span>
                ) : null}
                <span className="pick__card pick__card--1">
                  {a ? (
                    <Image src={a} alt="" width={400} height={240} priority />
                  ) : null}
                  <span className="pick__edge" aria-hidden="true" />
                  <span className="pick__plate" aria-hidden="true">
                    {sampleAmount}
                  </span>
                </span>
              </span>
            </span>
            <span className="pick__cap">
              <span className="pick__name">{t("nominalName")}</span>
              <span className="pick__note">{t("nominalText")}</span>
            </span>
          </button>

          {/* На услугу — одна карта, повёрнутая к зрителю */}
          <button
            type="button"
            onClick={() => onPick("program")}
            className="pick__opt pick__opt--prog"
          >
            <span className="pick__stage">
              <span className="pick__glow" aria-hidden="true" />
              <span className="pick__deck">
                <span className="pick__card pick__card--1">
                  {d ? (
                    <Image src={d} alt="" width={400} height={240} priority />
                  ) : null}
                  <span className="pick__edge" aria-hidden="true" />
                  <span className="pick__plate pick__plate--small" aria-hidden="true">
                    {sampleProgram}
                  </span>
                </span>
              </span>
            </span>
            <span className="pick__cap">
              <span className="pick__name">{t("programName")}</span>
              <span className="pick__note">{t("programText")}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
