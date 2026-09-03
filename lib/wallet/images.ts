import "server-only";
import path from "node:path";
import sharp from "sharp";
import type { PassImage } from "./package";

/**
 * Картинки пропуска нужного Apple размера, собранные из брендовых исходников.
 *
 * Держать в репозитории ещё шесть подрезанных PNG незачем — sharp уже стоит
 * ради обработки загрузок, а размеры Apple фиксированы. Берём то, что попадает
 * в образ (`public/brand`), а не папку `brand/`: её Dockerfile не копирует.
 *
 * Иконка золотая, логотип белый — фон карты фиолетовый по брендбуку.
 */

const ICON = "public/brand/icon-gold.png";
const LOGO = "public/brand/logo-white.png";
/**
 * Полоса вверху карты — единая для всех сертификатов и для обоих кошельков
 * (у Google это же изображение уходит heroImage по ссылке). Лежит готовым
 * PNG, а не собирается на лету: рисунок один на всех, пересобирать его на
 * каждую карту незачем.
 *
 * ВАЖНО про композицию: телефон печатает остаток и подписи ПОВЕРХ полосы,
 * слева. Поэтому левая половина оставлена пустой, знак имбиря уведён вправо
 * и приглушён. Любая правка картинки обязана это сохранять.
 */
const STRIP = "public/brand/wallet-strip.png";

let cache: PassImage[] | null = null;

async function icon(size: number): Promise<Buffer> {
  return sharp(path.join(process.cwd(), ICON))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function strip(width: number, height: number): Promise<Buffer> {
  return sharp(path.join(process.cwd(), STRIP)).resize(width, height).png().toBuffer();
}

async function logo(width: number, height: number): Promise<Buffer> {
  return sharp(path.join(process.cwd(), LOGO))
    .resize(width, height, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** icon обязателен — без него телефон отвергает пропуск. */
export async function loadPassImages(): Promise<PassImage[]> {
  if (cache) return cache;
  cache = [
    { name: "icon.png", data: await icon(29) },
    { name: "icon@2x.png", data: await icon(58) },
    { name: "icon@3x.png", data: await icon(87) },
    { name: "logo.png", data: await logo(160, 50) },
    { name: "logo@2x.png", data: await logo(320, 100) },
    // Размеры полосы для storeCard: 375×123 пункта, дальше двойной и тройной
    { name: "strip.png", data: await strip(375, 123) },
    { name: "strip@2x.png", data: await strip(750, 246) },
    { name: "strip@3x.png", data: await strip(1125, 369) },
  ];
  return cache;
}
