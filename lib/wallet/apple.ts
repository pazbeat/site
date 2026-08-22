import "server-only";
import { loadPassImages } from "./images";
import { packagePass } from "./package";
import type { PassFields } from "./pass";
import { createManifestSigner, readSigningKeys } from "./sign";
import type { IssueContext, IssuedPass, WalletPassProvider } from "./types";

/**
 * Настоящий Apple Wallet: собирает и подписывает `.pkpass`.
 *
 * Включается, только когда в окружении есть все три файла подписи. Сегодня их
 * нет: сертификат из исходников заказчика истёк 23.02.2026 и выписан на
 * подрядчика, промежуточного WWDR у нас тоже нет. До перевыпуска работает мок.
 */

const PASS_TYPE_ID = process.env.APPLE_WALLET_PASS_TYPE_ID ?? "pass.kz.imbir.sert";
const TEAM_ID = process.env.APPLE_WALLET_TEAM_ID ?? "8P2AARWSYR";

export class ApplePassProvider implements WalletPassProvider {
  readonly id = "apple";

  isConfigured(): boolean {
    return readSigningKeys() !== null;
  }

  async issue(fields: PassFields, ctx: IssueContext): Promise<IssuedPass> {
    const keys = readSigningKeys();
    if (!keys) throw new Error("wallet: нет ключей подписи Apple");

    const webServiceUrl = process.env.APPLE_WALLET_WEB_SERVICE;
    const body = await packagePass({
      fields,
      config: {
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier: TEAM_ID,
        organizationName: "Imbir Thai Spa",
        serialNumber: ctx.serialNumber,
        // Пара «адрес + токен» ставится только целиком: адрес без токена
        // Apple игнорирует, а токен без адреса просто некуда слать.
        ...(webServiceUrl && ctx.authToken
          ? { webServiceUrl, authenticationToken: ctx.authToken }
          : {}),
      },
      images: await loadPassImages(),
      sign: createManifestSigner(keys),
    });

    return {
      filename: `${fields.code}.pkpass`,
      contentType: "application/vnd.apple.pkpass",
      body,
      signed: true,
    };
  }
}
