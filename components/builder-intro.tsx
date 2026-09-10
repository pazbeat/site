"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * Первый экран конструктора: что дарим — сумму или услугу.
 *
 * Почему это отдельный экран, а не два переключателя в форме. Это
 * единственное решение покупателя, которое меняет ВСЁ дальнейшее: на сумму
 * получатель выбирает сам, на услугу — выбираете вы. Раньше выбор стоял
 * рядом с городом и филиалом мелкой парой кнопок, и его проскакивали не
 * читая, а потом на шаге оплаты выяснялось, что дарят не то.
 *
 * Отсюда и вид: две половины во весь экран, между ними золотая волосяная
 * линия — тот же приём, что на карточках сертификатов в брендбуке. Левая
 * половина фиолетовая, правая белая: выбор читается как выбор, а не как
 * две одинаковые плитки.
 *
 * Кнопка на каждой половине показана ВСЕГДА, а не по наведению: на телефоне
 * наведения нет, и «покажем по hover» означало бы, что половина покупателей
 * не понимает, куда нажимать.
 */

type Props = Readonly<{
  onPick: (type: "nominal" | "program") => void;
  /** Картинки-открытки для превью. Берём настоящие, а не заглушки. */
  nominalImage?: string;
  programImage?: string;
}>;

export function BuilderIntro({ onPick, nominalImage, programImage }: Props) {
  const t = useTranslations("Builder.intro");

  return (
    <section className="builder-intro" aria-labelledby="intro-title">
      <h2 id="intro-title" className="sr-only">
        {t("title")}
      </h2>

      {/* На сумму — фиолетовая половина */}
      <button
        type="button"
        onClick={() => onPick("nominal")}
        className="intro-half intro-half--dark group"
      >
        <span className="intro-card">
          {nominalImage ? (
            <Image
              src={nominalImage}
              alt=""
              width={420}
              height={264}
              className="intro-card__img"
              priority
            />
          ) : null}
          <span className="intro-card__sum">15 000 ₸</span>
        </span>

        <span className="intro-body">
          <span className="intro-name">{t("nominalName")}</span>
          <span className="intro-text">{t("nominalText")}</span>
          <span className="intro-go intro-go--gold">{t("choose")}</span>
        </span>
      </button>

      {/* На услугу — белая половина */}
      <button
        type="button"
        onClick={() => onPick("program")}
        className="intro-half intro-half--light group"
      >
        <span className="intro-card">
          {programImage ? (
            <Image
              src={programImage}
              alt=""
              width={420}
              height={264}
              className="intro-card__img"
              priority
            />
          ) : null}
          <span className="intro-card__label">{t("programExample")}</span>
        </span>

        <span className="intro-body">
          <span className="intro-name">{t("programName")}</span>
          <span className="intro-text">{t("programText")}</span>
          <span className="intro-go intro-go--purple">{t("choose")}</span>
        </span>
      </button>
    </section>
  );
}
