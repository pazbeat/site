/**
 * Одноразовая подготовка логотипа: из brand/Imbir Logo.png (чёрный на белом)
 * делает прозрачные PNG: чёрный, белый, золотой + отдельную иконку имбиря.
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const SRC = path.join("brand", "Imbir Logo.png");
const OUT = "brand";

// альфа = насколько пиксель тёмный (белый фон → прозрачность)
async function alphaFromInk(input) {
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) alpha[i] = 255 - data[i];
  return { alpha, width: info.width, height: info.height };
}

async function tinted(input, hex, outFile) {
  const { alpha, width, height } = await alphaFromInk(input);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = alpha[i];
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim()
    .png()
    .toFile(path.join(OUT, outFile));
  console.log(outFile, "готов");
}

(async () => {
  const buf = fs.readFileSync(SRC);
  await tinted(buf, "#000000", "logo-black.png");
  await tinted(buf, "#ffffff", "logo-white.png");
  // иконка имбиря: левая часть исходника (бутон с листьями)
  const icon = await sharp(buf)
    .flatten({ background: "#ffffff" })
    .extract({ left: 0, top: 260, width: 400, height: 560 })
    .toBuffer();
  await tinted(icon, "#d9bc79", "icon-gold.png");
  await tinted(icon, "#ffffff", "icon-white.png");
  await tinted(icon, "#4d295d", "icon-purple.png");
})();
