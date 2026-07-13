import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type MailAttachment = { filename: string; content: Buffer };

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Resend (PRD §2): транзакционные письма через HTTP API. */
class ResendMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "Imbir Thai Spa <noreply@imbir.kz>",
        to: [message.to],
        subject: message.subject,
        html: message.html,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`resend_failed ${response.status}: ${text.slice(0, 300)}`);
    }
  }
}

/**
 * Файловый мок для dev/e2e: пишет письмо и вложения в .mail-outbox/
 * (в .gitignore). Включается автоматически, если нет RESEND_API_KEY.
 */
class FileMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = message.to.replace(/[^a-z0-9@.-]/gi, "_");
    const dir = path.join(process.cwd(), ".mail-outbox", `${stamp}-${slug}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "message.json"),
      JSON.stringify(
        {
          to: message.to,
          subject: message.subject,
          html: message.html,
          attachments: message.attachments?.map((a) => a.filename) ?? [],
        },
        null,
        2,
      ),
      "utf8",
    );
    for (const attachment of message.attachments ?? []) {
      await writeFile(path.join(dir, attachment.filename), attachment.content);
    }
    console.log(`mail-outbox: письмо для ${message.to} → ${dir}`);
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (!mailer) {
    mailer = process.env.RESEND_API_KEY ? new ResendMailer() : new FileMailer();
  }
  return mailer;
}
