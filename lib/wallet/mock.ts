import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPassImages } from "./images";
import { buildPassContents, packagePass } from "./package";
import type { PassFields } from "./pass";
import type { IssueContext, IssuedPass, WalletPassProvider } from "./types";

/**
 * Файловый мок — как `.mail-outbox` у почты. Собирает НАСТОЯЩИЙ `.pkpass`
 * со всем содержимым и манифестом, только без подписи: подписать нечем, пока
 * не перевыпущен сертификат Apple.
 *
 * Такой архив на телефон не встанет, зато его можно распаковать и глазами
 * проверить, что на карте написано и правильно ли посчитан остаток. Когда
 * сертификат появится, к тем же файлам добавится один — `signature`.
 */

const OUTBOX = ".wallet-outbox";

export class MockPassProvider implements WalletPassProvider {
  readonly id = "mock";

  isConfigured(): boolean {
    return true;
  }

  async issue(fields: PassFields, ctx: IssueContext): Promise<IssuedPass> {
    const config = {
      passTypeIdentifier: "pass.kz.imbir.sert",
      teamIdentifier: "8P2AARWSYR",
      organizationName: "Imbir Thai Spa",
      serialNumber: ctx.serialNumber,
    };
    const images = await loadPassImages();
    const body = await packagePass({ fields, config, images });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(process.cwd(), OUTBOX, `${stamp}-${fields.code}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${fields.code}.pkpass`), body);
    // Рядом кладём распакованный pass.json — чтобы читать глазами, не распаковывая
    for (const entry of buildPassContents({ fields, config, images })) {
      if (entry.name.endsWith(".png")) continue;
      const file = path.join(dir, entry.name.replace("/", "-"));
      await writeFile(file, entry.data);
    }
    console.log(`wallet-outbox: пропуск ${fields.code} → ${dir}`);

    return {
      filename: `${fields.code}.pkpass`,
      contentType: "application/vnd.apple.pkpass",
      body,
      signed: false,
    };
  }
}
