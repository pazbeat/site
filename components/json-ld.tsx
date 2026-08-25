import { scriptNonce } from "@/lib/nonce";

/**
 * Микроразметка для поисковиков (schema.org, JSON-LD).
 *
 * Это то, из-за чего в выдаче появляются цены, карточки филиалов и ответы на
 * вопросы, а не просто синяя ссылка. Для сети из восьми салонов разметка
 * адресов — сильный сигнал в локальном поиске.
 *
 * Обязательно с nonce: политика безопасности сайта распространяется и на
 * `application/ld+json`, и без ключа браузер выбросит разметку в проде, где
 * это никак не проявится внешне — просто поисковик её не увидит.
 */
export async function JsonLd({ data }: Readonly<{ data: object }>) {
  const nonce = await scriptNonce();
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Данные собираем сами из своей же базы, пользовательского ввода здесь нет
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
