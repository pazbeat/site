import { SALON_SEED } from "@/prisma/salons-data";
import { gisLink, salonWhatsAppDisplay } from "./salon-contacts";

/**
 * Данные для микроразметки поисковиков (schema.org).
 *
 * Чистые функции: собирают объекты из того, что уже есть в проекте, и не
 * ходят в сеть. Абсолютные адреса берём параметром, а не из константы модуля:
 * на этапе сборки образа переменной SITE_URL ещё нет, и в разметку попал бы
 * localhost — та же ловушка, что уже описана в app/sitemap.ts.
 */

const LEGAL_NAME = "ТОО «Imbir Group»";
const BRAND = "Imbir Thai Spa";

/** Организация: кто мы. Основа для всей остальной разметки. */
export function organizationSchema(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: BRAND,
    legalName: LEGAL_NAME,
    url: origin,
    logo: `${origin}/brand/logo-white.png`,
    telephone: "+7 708 111 8098",
    email: "spa@imbir.kz",
    address: {
      "@type": "PostalAddress",
      addressCountry: "KZ",
      addressLocality: "Астана",
      streetAddress: "проспект Тәуелсіздік 40/5",
    },
    sameAs: ["https://imbir.kz"],
  };
}

/** Сайт: даёт поисковику понять структуру и язык. */
export function webSiteSchema(origin: string, locale: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    url: `${origin}/${locale}`,
    name: BRAND,
    inLanguage: locale,
    publisher: { "@id": `${origin}/#organization` },
  };
}

/**
 * Филиалы сети как отдельные заведения.
 *
 * Для локального поиска («тайский массаж Астана») это самый сильный сигнал:
 * поисковик видит восемь реальных точек с адресами и телефонами, а не один
 * сайт. Координат и часов работы в базе нет — сознательно опускаем их, а не
 * выдумываем: неверные данные в разметке хуже отсутствующих.
 */
export function salonsSchema(origin: string, locale: "ru" | "kk" | "en") {
  return SALON_SEED.map((s) => ({
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "@id": `${origin}/#salon-${s.codePrefix}`,
    name: `${BRAND} — ${s.cityNames[locale]}`,
    parentOrganization: { "@id": `${origin}/#organization` },
    address: {
      "@type": "PostalAddress",
      addressCountry: "KZ",
      addressLocality: s.cityNames[locale],
      streetAddress: s.addressNames[locale],
    },
    telephone: salonWhatsAppDisplay(s.codePrefix),
    url: `${origin}/${locale}`,
    sameAs: [gisLink(s.city, s.address)],
  }));
}

export type ProgramForSchema = {
  name: string;
  description: string;
  photoUrl?: string | null;
  options: Array<{ priceKzt: number }>;
};

/**
 * Каталог программ с ценами. Именно из этой разметки в выдаче берутся цифры
 * «от 18 000 ₸» рядом со ссылкой.
 */
export function programsSchema(origin: string, programs: ProgramForSchema[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: programs.map((p, i) => {
      const prices = p.options.map((o) => o.priceKzt).filter((n) => n > 0);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Service",
          name: p.name,
          description: p.description,
          ...(p.photoUrl ? { image: `${origin}${p.photoUrl}` } : {}),
          provider: { "@id": `${origin}/#organization` },
          areaServed: "KZ",
          ...(prices.length > 0
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: "KZT",
                  lowPrice: Math.min(...prices),
                  highPrice: Math.max(...prices),
                  offerCount: prices.length,
                },
              }
            : {}),
        },
      };
    }),
  };
}

/** Вопросы и ответы — из готовых текстов памятки гостю. */
export function faqSchema(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}
