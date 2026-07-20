import type { Locale } from "@/i18n/routing";

export type Tip = { title: string; body: string };

/**
 * «Советы» на главной (запрос заказчика: «чтобы советы выходили какие-то»).
 * Только проверяемые факты: срок 3 месяца, запись через WhatsApp, программы
 * на 2 гостей, рекомендации из «Информации для гостей» (imbir.kz).
 * Статичный контент — модулем, как guest-info.
 */
const DATA: Record<Locale, { heading: string; sub: string; tips: Tip[] }> = {
  ru: {
    heading: "Пять советов для идеального подарка",
    sub: "Короткие подсказки — как дарить и получать максимум удовольствия.",
    tips: [
      {
        title: "Сомневаетесь — дарите номинал",
        body: "Не знаете, что выберет получатель? Подарите сертификат на сумму — программу он подберёт сам, уже в салоне.",
      },
      {
        title: "Для двоих — SPA-программы",
        body: "Хотите подарить отдых паре — выбирайте программы на двух гостей: процедуры проходят вместе.",
      },
      {
        title: "Планируйте визит заранее",
        body: "Сертификат действует 3 месяца с даты покупки. Запишитесь заранее через WhatsApp салона — так проще выбрать удобное время и любимого мастера.",
      },
      {
        title: "Приходите чуть раньше",
        body: "За 10–15 минут до начала: успеете переодеться и настроиться на отдых. Плотно есть лучше не позднее чем за пару часов до массажа.",
      },
      {
        title: "Слушайте своё тело",
        body: "У тайских техник и хаммама есть противопоказания. Если сомневаетесь — проконсультируйтесь с врачом до визита.",
      },
    ],
  },
  kk: {
    heading: "Тамаша сыйлыққа арналған бес кеңес",
    sub: "Қысқа кеңестер — қалай сыйлау және рақатты толық алу.",
    tips: [
      {
        title: "Күмәндансаңыз — номинал сыйлаңыз",
        body: "Алушы нені таңдарын білмейсіз бе? Сомаға сертификат сыйлаңыз — бағдарламаны ол салонда өзі таңдайды.",
      },
      {
        title: "Екеуге — SPA-бағдарламалар",
        body: "Жұпқа демалыс сыйлағыңыз келсе — екі қонаққа арналған бағдарламаларды таңдаңыз: рәсімдер бірге өтеді.",
      },
      {
        title: "Сапарды алдын ала жоспарлаңыз",
        body: "Сертификат сатып алған күннен бастап 3 ай жарамды. Салонның WhatsApp арқылы алдын ала жазылыңыз — ыңғайлы уақыт пен шеберді таңдау оңай.",
      },
      {
        title: "Сәл ертерек келіңіз",
        body: "Басталуына 10–15 минут қалғанда: киім ауыстырып, демалысқа бейімделіп үлгересіз. Массаждан бір-екі сағат бұрын тойып тамақтанбаған жөн.",
      },
      {
        title: "Денеңізге құлақ асыңыз",
        body: "Тай техникалары мен хаммамның қарсы көрсетілімдері бар. Күмәніңіз болса — сапар алдында дәрігермен кеңесіңіз.",
      },
    ],
  },
  en: {
    heading: "Five tips for a perfect gift",
    sub: "Quick pointers on gifting — and enjoying it to the fullest.",
    tips: [
      {
        title: "Not sure? Gift an amount",
        body: "Don't know what they'd pick? Gift a certificate for an amount — they'll choose the programme themselves at the salon.",
      },
      {
        title: "For two — SPA programmes",
        body: "Gifting a couple's escape? Choose programmes for two guests: the treatments run together.",
      },
      {
        title: "Plan the visit ahead",
        body: "The certificate is valid for 3 months from purchase. Book in advance via the salon's WhatsApp — it's easier to pick a time and a favourite therapist.",
      },
      {
        title: "Arrive a little early",
        body: "Come 10–15 minutes before the start: time to change and settle into relaxation. Avoid a heavy meal within a couple of hours before the massage.",
      },
      {
        title: "Listen to your body",
        body: "Thai techniques and the hammam have contraindications. If in doubt, consult your doctor before the visit.",
      },
    ],
  },
};

export function getTips(locale: string) {
  return DATA[(locale in DATA ? locale : "ru") as Locale];
}
