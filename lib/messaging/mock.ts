import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeWhatsAppChatId,
  type MessagingProvider,
  type MessengerFile,
} from "./types";

/**
 * Файловый мок мессенджера для dev/e2e: пишет сообщения и файлы в
 * .wa-outbox/ (в .gitignore). Используется, если ChatApp не сконфигурирован
 * или явно включён WHATSAPP_MOCK=1 — чтобы не слать реальные сообщения.
 */
export class MockMessagingProvider implements MessagingProvider {
  readonly id = "mock";

  isConfigured(): boolean {
    return true;
  }

  private async write(
    toPhone: string,
    payload: Record<string, unknown>,
    file?: MessengerFile,
  ): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = toPhone.replace(/[^0-9]/g, "");
    const dir = path.join(process.cwd(), ".wa-outbox", `${stamp}-${slug}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "message.json"),
      JSON.stringify(
        { chatId: normalizeWhatsAppChatId(toPhone), ...payload },
        null,
        2,
      ),
      "utf8",
    );
    if (file) await writeFile(path.join(dir, file.filename), file.content);
    console.log(`wa-outbox: сообщение для ${toPhone} → ${dir}`);
  }

  async sendText(toPhone: string, text: string): Promise<void> {
    await this.write(toPhone, { type: "text", text });
  }

  async sendFile(
    toPhone: string,
    file: MessengerFile,
    caption?: string,
  ): Promise<void> {
    await this.write(
      toPhone,
      { type: "file", filename: file.filename, caption },
      file,
    );
  }
}
