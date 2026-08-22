import { createHash } from "node:crypto";
import { buildApplePassJson, buildPassStrings, PASS_LOCALES, type ApplePassConfig } from "./apple-pass";
import type { PassFields } from "./pass";
import { buildZip, type ZipEntry } from "./zip";

/**
 * Сборка `.pkpass` — ZIP с `pass.json`, картинками, манифестом и подписью.
 *
 * Манифест — SHA-1 каждого файла архива. Сам манифест и подпись в него не
 * входят: подпись считается ПО манифесту, а манифест по остальным файлам.
 * Меняется хоть один байт картинки — хэш расходится, и телефон отвергает
 * пропуск целиком.
 *
 * SHA-1 здесь не выбор, а требование формата Apple: другой алгоритм пропуск
 * не примет. Криптостойкость манифеста обеспечивает подпись, а не хэш.
 */

export type PassImage = { name: string; data: Buffer };

/** Подписывает манифест: detached PKCS#7 в DER. */
export type ManifestSigner = (manifest: Buffer) => Promise<Buffer>;

export type PackagePassInput = {
  fields: PassFields;
  config: ApplePassConfig;
  /** icon.png, icon@2x.png, logo.png… — как их называет Apple */
  images: PassImage[];
  /** Без подписи архив структурно верный, но телефон его не примет */
  sign?: ManifestSigner;
};

export function buildManifest(entries: ZipEntry[]): Buffer {
  const manifest: Record<string, string> = {};
  for (const entry of entries) {
    manifest[entry.name] = createHash("sha1").update(entry.data).digest("hex");
  }
  return Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
}

/** Файлы пропуска без манифеста и подписи — то, что манифест и описывает. */
export function buildPassContents(input: PackagePassInput): ZipEntry[] {
  const passJson = buildApplePassJson(input.fields, input.config);
  const entries: ZipEntry[] = [
    { name: "pass.json", data: Buffer.from(JSON.stringify(passJson, null, 2), "utf8") },
  ];
  for (const locale of PASS_LOCALES) {
    entries.push({
      name: `${locale}.lproj/pass.strings`,
      data: Buffer.from(buildPassStrings(locale), "utf8"),
    });
  }
  for (const image of input.images) {
    entries.push({ name: image.name, data: image.data });
  }
  return entries;
}

export async function packagePass(input: PackagePassInput): Promise<Buffer> {
  const contents = buildPassContents(input);
  const manifest = buildManifest(contents);
  const entries: ZipEntry[] = [...contents, { name: "manifest.json", data: manifest }];
  if (input.sign) {
    entries.push({ name: "signature", data: await input.sign(manifest) });
  }
  return buildZip(entries);
}
