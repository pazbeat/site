/**
 * Разовая живая проверка выпуска сертификата в Altegio через боевой модуль.
 * Запуск: npx tsx --env-file=.env scripts/altegio-test-issue.ts
 */
import { issueCertificateOperation } from "../lib/altegio/operations";

async function main() {
  const rnd = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const code = `IMB-T${rnd()}-${rnd()}`;
  const result = await issueCertificateOperation({
    code,
    amountKzt: 20000,
    buyerName: "Тест Имбирь",
    buyerEmail: "izecreamchik@gmail.com",
    buyerPhone: "77082761255",
    orderId: "test-order-live",
  });
  console.log("code:", code);
  console.log("result:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
