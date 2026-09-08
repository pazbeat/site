/**
 * Состояние Google Wallet: опубликован эмитент или карты всё ещё
 * демонстрационные.
 *
 * Вопрос «проверка вроде прошла» на глаз не решается: письмо об одобрении и
 * реальное состояние карт — разные вещи, а демонстрационная карта отличается
 * от боевой только пометкой, которую видит покупатель, но не мы. Поэтому
 * спрашиваем у самого Google.
 *
 * ВАЖНО про то, что этот скрипт может и чего не может. У Google две разные
 * вещи, и их легко перепутать:
 *
 *   1. Класс (оформление карт) — у него есть `reviewStatus`:
 *        DRAFT        — черновик, на проверку не отправляли;
 *        UNDER_REVIEW — отправлен, ответа ещё нет;
 *        APPROVED     — оформление одобрено;
 *        REJECTED     — отклонено, причина в поле `review`.
 *
 *   2. Аккаунт эмитента — демонстрационный он или опубликованный. Именно от
 *      этого зависит, сохранит ли карту посторонний человек.
 *
 * Первое НЕ доказывает второго: наш класс был `approved` уже 2026-08-24,
 * когда кабинет заведомо оставался в демонстрационном режиме. Поэтому
 * «approved» здесь читается как «оформление в порядке», а не как
 * «опубликовано». Состояние эмитента API наружу не отдаёт — его смотрят в
 * кабинете и проверяют живым сохранением с постороннего аккаунта.
 *
 * Запуск (нужны GOOGLE_WALLET_* в окружении):
 *   npx tsx scripts/google-wallet-status.ts
 */
import "dotenv/config";
import { createSign } from "node:crypto";
import { normalizePrivateKey } from "../lib/wallet/google-jwt";
import { giftCardClassId } from "../lib/wallet/google-pass";

const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim() ?? "";
const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL?.trim() ?? "";
const privateKey = normalizePrivateKey(process.env.GOOGLE_WALLET_PRIVATE_KEY ?? "");
const classSuffix = process.env.GOOGLE_WALLET_CLASS_SUFFIX?.trim() || "imbir-gift";

if (!issuerId || !clientEmail || !privateKey) {
  console.error("Не заданы GOOGLE_WALLET_* — проверять нечего.");
  process.exit(1);
}

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function token(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).end().sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${b64(sig)}`,
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!data?.access_token) {
    throw new Error(`токен не выдан: ${data?.error_description ?? "неизвестно"}`);
  }
  return data.access_token;
}

async function get(path: string, access: string) {
  const response = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* оставим как текст */
  }
  return { status: response.status, ok: response.ok, json, text };
}

/** Понятное объяснение вместо голого значения из API. */
function explain(status: string | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return (
        "ОФОРМЛЕНИЕ ОДОБРЕНО. Это про класс, а не про публикацию кабинета: " +
        "у нас он был одобрен ещё 2026-08-24, в демонстрационном режиме. " +
        "Вывод «карту сохранит любой» отсюда НЕ следует."
      );
    case "UNDER_REVIEW":
      return "НА ПРОВЕРКЕ. Отправлен, но ответа Google ещё не дал — карты пока демонстрационные.";
    case "DRAFT":
      return "ЧЕРНОВИК. На проверку НЕ отправлялся. Карты демонстрационные, и сами они боевыми не станут.";
    case "REJECTED":
      return "ОТКЛОНЁН. Причина должна быть ниже, в поле review.";
    default:
      return `Значение «${status ?? "не задано"}» неизвестно — смотрите ответ целиком ниже.`;
  }
}

async function main() {
  const access = await token();
  const id = giftCardClassId({ issuerId, classSuffix });

  console.log(`Эмитент: ${issuerId}`);
  console.log(`Сервисный аккаунт: ${clientEmail}`);
  console.log(`Класс (оформление карт): ${id}`);
  console.log("");

  const one = await get(`giftCardClass/${encodeURIComponent(id)}`, access);
  if (one.status === 404) {
    console.log("Класса с таким идентификатором в Google НЕТ.");
    console.log(
      "Значит оформление ни разу не отправляли: `npx tsx scripts/google-wallet-class.ts --apply`.",
    );
  } else if (!one.ok) {
    console.log(`Google ответил ${one.status}: ${one.text.slice(0, 300)}`);
  } else {
    const data = one.json as {
      reviewStatus?: string;
      review?: unknown;
      issuerName?: string;
      programName?: string;
      enableSmartTap?: boolean;
    };
    console.log("СОСТОЯНИЕ ОФОРМЛЕНИЯ");
    console.log(`  reviewStatus: ${data.reviewStatus ?? "(нет поля)"}`);
    console.log(`  ${explain(data.reviewStatus)}`);
    if (data.review) {
      console.log(`  отзыв Google: ${JSON.stringify(data.review)}`);
    }
    console.log(`  издатель: ${data.issuerName ?? "—"} / программа: ${data.programName ?? "—"}`);
  }

  // Все классы эмитента: одобрение могло коснуться другого типа карт или
  // другого суффикса, и тогда наш остался бы демонстрационным.
  console.log("");
  const all = await get(`giftCardClass?issuerId=${encodeURIComponent(issuerId)}`, access);
  if (all.ok) {
    const list = (all.json as { resources?: { id?: string; reviewStatus?: string }[] })
      .resources;
    console.log(`ВСЕ КЛАССЫ ЭМИТЕНТА (giftCard): ${list?.length ?? 0}`);
    for (const item of list ?? []) {
      console.log(`  ${item.id} → ${item.reviewStatus ?? "—"}`);
    }
  } else {
    console.log(`Список классов не получен (${all.status}): ${all.text.slice(0, 200)}`);
  }

  // Сколько карт реально сохранено. Косвенно, но полезно: если карт нет
  // вовсе, проверять «снялась ли пометка» просто не на чем.
  console.log("");
  const objects = await get(
    `giftCardObject?classId=${encodeURIComponent(id)}&maxResults=20`,
    access,
  );
  if (objects.ok) {
    const list = (objects.json as { resources?: { id?: string; state?: string }[] })
      .resources;
    console.log(`СОХРАНЁННЫХ КАРТ по этому оформлению: ${list?.length ?? 0}`);
    for (const item of (list ?? []).slice(0, 10)) {
      console.log(`  ${item.id} → ${item.state ?? "—"}`);
    }
  } else {
    console.log(`Список карт не получен (${objects.status}): ${objects.text.slice(0, 200)}`);
  }

  console.log("");
  const issuer = await get(`issuer/${encodeURIComponent(issuerId)}`, access);
  if (issuer.ok) {
    console.log("ЭМИТЕНТ:", JSON.stringify(issuer.json).slice(0, 600));
  } else {
    console.log(`Карточка эмитента недоступна (${issuer.status}).`);
  }

  console.log("");
  console.log("ЧЕГО ЭТОТ СКРИПТ НЕ ЗНАЕТ");
  console.log(
    "  Демонстрационный режим — свойство АККАУНТА эмитента, и в API его нет:\n" +
      "  ресурс issuer отдаёт только id, имя и контакты (видно выше). Проверять так:\n" +
      "    1) Google Pay & Wallet Console → карточка «Google Wallet API» и вкладка\n" +
      "       Manage: метка «Demo mode» / баннер «You're in demo mode». Убедиться,\n" +
      "       что вверху выбран эмитент " +
      issuerId +
      ", а не другой;\n" +
      "    2) выпустить свежую карту и посмотреть её заголовок в приложении:\n" +
      "       «[TEST ONLY]» — ещё демо. У ранее сохранённых карт метка снимается\n" +
      "       только после перезапуска приложения Wallet;\n" +
      "    3) дать ссылку постороннему: его почты не должно быть в Manage →\n" +
      "       Set up test accounts, и роли на эмитенте у него быть не должно.\n" +
      "  Осторожно: письмо «доступ одобрен» бывает про доступ к API — это другой\n" +
      "  шлюз, из демонстрационного режима он не выводит.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
