"use client";

import { useEffect, useRef, useState } from "react";

type Props = Readonly<{
  /** Ссылка на PDF сертификата (с токеном заказа). */
  pdfUrl: string;
  /** Страница сертификата — уходит в текст, если файл отправить нельзя. */
  pageUrl: string;
  /** Готовое поздравление на языке покупателя. */
  message: string;
  /** Подпись кнопки. */
  label: string;
  /** Подпись запасной ссылки «отправить текстом». */
  textLabel: string;
  fileName: string;
}>;

/**
 * Умеет ли браузер делиться файлами. Проверяем пустышкой в один байт: сам
 * сертификат для этого качать незачем, а ответ нужен ещё до нажатия.
 */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File(["1"], "probe.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

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
 * Там поздравление уходит текстом полностью.
 *
 * Подпись к документу WhatsApp не показывает — это его поведение, не наше:
 * для картинок подпись принимается, для файлов отбрасывается. Поэтому
 * поздравление продублировано в ИМЕНИ файла («Подарок от Imbir Thai Spa
 * WM9001.pdf») — оно видно в переписке всегда.
 */
export function ShareCertificate({
  pdfUrl,
  pageUrl,
  message,
  label,
  textLabel,
  fileName,
}: Props) {
  const fileRef = useRef<File | null>(null);
  const [ready, setReady] = useState(false);

  // Файл готовим заранее: Safari отдаёт «Поделиться» только в том же кадре,
  // где случилось нажатие, и ожидание загрузки внутри обработчика его теряет.
  //
  // Но только там, где файлами вообще можно поделиться. Иначе каждое открытие
  // страницы успеха дёргало бы отрисовку PDF на сервере впустую — а она не
  // из дешёвых. Поддержку проверяем пустышкой, ничего не скачивая.
  useEffect(() => {
    if (!canShareFiles()) return;
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

  const openWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${message}\n${pageUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const share = () => {
    const file = fileRef.current;
    if (!ready || file === null || !canShareFiles()) {
      openWhatsApp();
      return;
    }

    navigator
      // title передаём вместе с text: часть приложений читает одно, часть
      // другое. WhatsApp для документов подпись игнорирует вовсе — там
      // поздравление доносит имя файла.
      .share({ files: [file], text: message, title: message })
      .catch((error: unknown) => {
        // Пользователь закрыл окно выбора — это не ошибка, второй раз не лезем.
        if (error instanceof DOMException && error.name === "AbortError") return;
        openWhatsApp();
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={share}
        className="bg-gold-gradient rounded-full px-7 py-3 text-center text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
      >
        {label}
      </button>
      {/* Второй путь — на случай, когда нужно именно сообщение: WhatsApp
          подпись к документу не показывает, а текстом поздравление уходит
          целиком, со ссылкой на сертификат. На десктопе кнопка выше делает
          ровно то же, поэтому там ссылку не показываем. */}
      {ready && (
        <button
          type="button"
          onClick={openWhatsApp}
          className="-mt-1 text-center text-sm font-semibold text-brand-purple/70 underline decoration-brand-gold/40 underline-offset-4 transition-colors hover:text-brand-purple"
        >
          {textLabel}
        </button>
      )}
    </>
  );
}
