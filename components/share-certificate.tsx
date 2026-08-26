"use client";

import { useEffect, useRef, useState } from "react";

type Props = Readonly<{
  /** Ссылка на PDF сертификата (с токеном заказа). */
  pdfUrl: string;
  /** Страница сертификата — уходит в текст, если файл отправить нельзя. */
  pageUrl: string;
  /** Текст сообщения без кода. */
  text: string;
  /** Номер сертификата. */
  code: string;
  /** Подпись кнопки. */
  label: string;
  fileName: string;
}>;

/**
 * Отправка сертификата в WhatsApp.
 *
 * Ссылка `wa.me?text=` умеет только текст — файл к ней не прикрепить, поэтому
 * раньше получателю уходила одна строка с номером, без самого сертификата.
 * Настоящий файл отдаёт системное «Поделиться» (Web Share API с `files`): на
 * телефоне оно открывает тот же список приложений, и PDF уходит вложением.
 *
 * Где файлами делиться нельзя (десктопные браузеры, старый Safari) — уходим на
 * wa.me со ссылкой на страницу сертификата: по ней получатель скачает PDF сам.
 */
export function ShareCertificate({
  pdfUrl,
  pageUrl,
  text,
  code,
  label,
  fileName,
}: Props) {
  const fileRef = useRef<File | null>(null);
  const [ready, setReady] = useState(false);

  // Файл готовим заранее: Safari отдаёт «Поделиться» только в том же кадре,
  // где случилось нажатие, и ожидание загрузки внутри обработчика его теряет.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(pdfUrl);
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled) return;
        fileRef.current = new File([blob], fileName, {
          type: "application/pdf",
        });
        setReady(true);
      } catch {
        // Не скачалось — останется запасной путь со ссылкой.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, fileName]);

  const message = `${text} ${code}`;

  const openWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${message}\n${pageUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const share = () => {
    const file = fileRef.current;
    const canShareFile =
      ready &&
      file !== null &&
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (!canShareFile) {
      openWhatsApp();
      return;
    }

    navigator
      .share({ files: [file!], text: message })
      .catch((error: unknown) => {
        // Пользователь закрыл окно выбора — это не ошибка, второй раз не лезем.
        if (error instanceof DOMException && error.name === "AbortError") return;
        openWhatsApp();
      });
  };

  return (
    <button
      type="button"
      onClick={share}
      className="bg-gold-gradient rounded-full px-7 py-3 text-center text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
    >
      {label}
    </button>
  );
}
