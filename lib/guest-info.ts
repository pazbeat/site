import type { Locale } from "@/i18n/routing";

export type GuestSection = { title: string; body: string[] };

/**
 * «Информация для наших гостей» — блок с imbir.kz. RU дословно с сайта,
 * KK/EN — перевод (информационный текст, не правовой). Статичный контент,
 * поэтому держим модулем, а не в БД/ICU-сообщениях.
 */
const DATA: Record<Locale, { heading: string; sub: string; sections: GuestSection[] }> = {
  ru: {
    heading: "Информация для наших гостей",
    sub: "Несколько простых правил — чтобы отдых прошёл идеально с первой минуты.",
    sections: [
      {
        title: "Бронирование времени",
        body: [
          "Позаботьтесь о себе и запишитесь заранее, чтобы выбрать для себя удобное время и любимого мастера. Накануне администратор вам позвонит и напомнит о записи. Чтобы настроиться на отдых и впитать в себя спокойную атмосферу салона, приходите за 10–15 минут до начала программы.",
        ],
      },
      {
        title: "Что взять с собой",
        body: [
          "Всё необходимое мы предоставляем, чтобы ваша процедура прошла максимально комфортно: халат, полотенце, тапочки, одноразовое бельё, фен. Свою одежду можете оставить на время пребывания в салоне в индивидуальном шкафчике с персональным ключом.",
          "Разговаривайте тихо и выключайте звук у мобильных телефонов.",
          "Советуем приходить за 10–15 минут до начала процедур, чтобы вы успели заполнить анкету, ознакомиться с нашими правилами и переодеться.",
        ],
      },
      {
        title: "Важно помнить о себе",
        body: [
          "Хаммам не рекомендуется людям с тяжёлой формой бронхиальной астмы, онкологическими заболеваниями, воспалительными процессами, а также тем, кто страдает эпилепсией, гипертонией и сердечными заболеваниями.",
          "Также опасно для здоровья посещать сауну в алкогольном опьянении.",
          "Существуют противопоказания к тайским техникам — предварительно обратитесь к вашему лечащему врачу для выявления возможных противопоказаний. В салоне тайского массажа и СПА «Имбирь» не оказываются медицинские услуги.",
        ],
      },
      {
        title: "Сокращение, опоздание и отмена программы",
        body: [
          "Если вы желаете сократить время программы или прервать её, стоимость остаётся неизменной согласно прейскуранту, так как мы не записывали других гостей на забронированное вами время.",
          "При опоздании более чем на 15 минут мы не сможем предоставить процедуру в полном объёме при наличии дальнейшей записи к мастеру, и ваша запись по усмотрению салона может быть аннулирована.",
          "Отмена программы менее чем за 3 часа до её начала ведёт к списанию услуги с абонемента или подарочного сертификата.",
          "Если техника мастера не подошла, вы можете поменять мастера в течение первых 15 минут после начала программы.",
        ],
      },
      {
        title: "Оплата",
        body: [
          "Мы принимаем к оплате только казахстанские тенге, а также пластиковые карты платёжных систем Visa, MasterCard, Maestro. Пожалуйста, не забывайте ваши абонементы и подарочные сертификаты. Для удобства можете оставить их в картотеке постоянных клиентов в салоне.",
        ],
      },
    ],
  },
  kk: {
    heading: "Қонақтарымызға арналған ақпарат",
    sub: "Бірнеше қарапайым ереже — демалысыңыз алғашқы минуттан бастап тамаша өтуі үшін.",
    sections: [
      {
        title: "Уақытты брондау",
        body: [
          "Өзіңізге ыңғайлы уақыт пен ұнататын шеберді таңдау үшін алдын ала жазылыңыз. Алдыңғы күні әкімші сізге қоңырау шалып, жазылу туралы еске салады. Демалысқа бейімделіп, салонның тыныш атмосферасын сезіну үшін бағдарлама басталардан 10–15 минут бұрын келіңіз.",
        ],
      },
      {
        title: "Не алып келу керек",
        body: [
          "Процедураңыз барынша жайлы өтуі үшін қажеттінің бәрін біз береміз: халат, сүлгі, тәпішке, бір реттік іш киім, фен. Өз киіміңізді салонда болу уақытында жеке кілті бар шкафта қалдыра аласыз.",
          "Ақырын сөйлесіп, ұялы телефондардың дыбысын өшіріңіз.",
          "Анкетаны толтырып, ережелерімізбен танысып, киім ауыстыруға үлгеру үшін процедура басталардан 10–15 минут бұрын келуге кеңес береміз.",
        ],
      },
      {
        title: "Өзіңіз туралы есте сақтаңыз",
        body: [
          "Хаммам бронх демікпесінің ауыр түрі, онкологиялық аурулары, қабыну процестері бар адамдарға, сондай-ақ эпилепсиямен, гипертониямен және жүрек ауруларымен ауыратындарға ұсынылмайды.",
          "Сондай-ақ маскүнемдік күйде саунаға бару денсаулыққа қауіпті.",
          "Тай техникаларына қарсы көрсетілімдер бар — ықтимал қарсы көрсетілімдерді анықтау үшін алдын ала емдеуші дәрігеріңізге хабарласыңыз. «Имбирь» тай массажы мен СПА салонында медициналық қызметтер көрсетілмейді.",
        ],
      },
      {
        title: "Бағдарламаны қысқарту, кешігу және болдырмау",
        body: [
          "Бағдарлама уақытын қысқартқыңыз немесе үзгіңіз келсе, құны прейскурантқа сәйкес өзгеріссіз қалады, себебі сіз брондаған уақытқа басқа қонақтарды жазбадық.",
          "15 минуттан астам кешіккенде, шеберге келесі жазылу болса, процедураны толық көлемде ұсына алмаймыз, ал жазылуыңыз салонның қалауы бойынша жойылуы мүмкін.",
          "Бағдарламаны басталардан 3 сағаттан аз уақыт бұрын болдырмау абонементтен немесе сыйлық сертификатынан қызметтің есептен шығарылуына әкеледі.",
          "Шебердің техникасы ұнамаса, бағдарлама басталғаннан кейінгі алғашқы 15 минут ішінде шеберді ауыстыра аласыз.",
        ],
      },
      {
        title: "Төлем",
        body: [
          "Біз тек қазақстандық теңгемен, сондай-ақ Visa, MasterCard, Maestro төлем жүйелерінің пластик карталарымен төлемді қабылдаймыз. Абонементтеріңіз бен сыйлық сертификаттарыңызды ұмытпаңыз. Ыңғайлы болу үшін оларды салондағы тұрақты клиенттер картотекасында қалдыра аласыз.",
        ],
      },
    ],
  },
  en: {
    heading: "Information for our guests",
    sub: "A few simple rules — so your visit is perfect from the very first minute.",
    sections: [
      {
        title: "Booking your time",
        body: [
          "Take care of yourself and book in advance to choose a convenient time and your favourite therapist. The day before, our administrator will call to remind you of the appointment. To relax and take in the calm atmosphere of the salon, please arrive 10–15 minutes before your program begins.",
        ],
      },
      {
        title: "What to bring",
        body: [
          "We provide everything you need for a fully comfortable treatment: robe, towel, slippers, disposable underwear and a hairdryer. You may leave your own clothes in a personal locker with a key for the duration of your visit.",
          "Please speak quietly and switch your mobile phones to silent.",
          "We recommend arriving 10–15 minutes early so you have time to fill in a short form, read our rules and change.",
        ],
      },
      {
        title: "Please keep in mind",
        body: [
          "The hammam is not recommended for people with severe bronchial asthma, oncological conditions or inflammatory processes, nor for those who suffer from epilepsy, hypertension or heart conditions.",
          "Visiting the sauna while intoxicated is also dangerous to your health.",
          "There are contraindications to Thai techniques — please consult your doctor beforehand to identify any possible ones. The Imbir Thai massage and SPA salon does not provide medical services.",
        ],
      },
      {
        title: "Shortening, lateness and cancellation",
        body: [
          "If you wish to shorten or interrupt a program, the price remains unchanged according to the price list, as we did not book other guests for your reserved time.",
          "If you are more than 15 minutes late and the therapist has a following appointment, we may not be able to provide the treatment in full, and your booking may be cancelled at the salon's discretion.",
          "Cancelling a program less than 3 hours before it begins results in the service being deducted from the season pass or gift certificate.",
          "If the therapist's technique does not suit you, you may change therapist within the first 15 minutes of the program.",
        ],
      },
      {
        title: "Payment",
        body: [
          "We accept payment only in Kazakhstani tenge, as well as Visa, MasterCard and Maestro cards. Please remember your season passes and gift certificates. For convenience you may leave them in the regular-client file at the salon.",
        ],
      },
    ],
  },
};

export function getGuestInfo(locale: Locale) {
  return DATA[locale] ?? DATA.ru;
}
