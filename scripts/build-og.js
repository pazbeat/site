/**
 * Картинка предпросмотра ссылки (Open Graph) — public/og.jpg.
 *
 * Её показывают Telegram, WhatsApp и соцсети, когда кто-то делится ссылкой на
 * сайт. Раньше здесь лежал обрезанный кусок открытки с сертификата: смайл и
 * половина слова «УЛЫБОК» — узнать бренд по такому нельзя.
 *
 * Логотип держим в центральном квадрате: широкую картинку мессенджеры
 * показывают целиком не всегда, WhatsApp в списке чатов режет её до квадрата.
 * Всё, что важно, обязано пережить такую обрезку.
 *
 *   node scripts/build-og.js
 */
const path = require("node:path");
const sharp = require("sharp");

const W = 1200;
const H = 630;
const PURPLE = "#4D295D";
const GOLD = "#B69244";
/** Ширина логотипа: помещается в центральный квадрат 630×630 с полями. */
const LOGO_W = 520;

const root = path.join(__dirname, "..");
const logoPath = path.join(root, "public", "brand", "logo-white.png");
const outPath = path.join(root, "public", "og.jpg");

async function main() {
  const logo = await sharp(logoPath)
    .resize({ width: LOGO_W, withoutEnlargement: true })
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();

  // Подсветка за логотипом и тонкая золотая рамка — приём брендбука.
  const overlay = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="48%" r="52%">
          <stop offset="0%" stop-color="#6B3B80" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${PURPLE}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect x="28" y="28" width="${W - 56}" height="${H - 56}"
            fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.55"/>
    </svg>
  `);

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: PURPLE,
    },
  })
    .composite([
      { input: overlay, top: 0, left: 0 },
      {
        input: logo,
        top: Math.round((H - (logoMeta.height ?? 0)) / 2),
        left: Math.round((W - (logoMeta.width ?? 0)) / 2),
      },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(outPath);

  const out = await sharp(outPath).metadata();
  console.log(`og.jpg: ${out.width}×${out.height}, логотип ${logoMeta.width}px`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
