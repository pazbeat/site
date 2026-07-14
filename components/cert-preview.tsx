import type { DesignBgStyle } from "@/lib/types";

type CertPreviewProps = Readonly<{
  bgStyle: DesignBgStyle;
  textColor: string;
  giftLabel: string;
  title: string;
  subtitle?: string;
  forLabel?: string;
  message?: string;
  code?: string;
  /** Картинка-открытка. Если задана — арт сверху + фирменная панель снизу. */
  imageUrl?: string | null;
}>;

/**
 * Превью сертификата. Два режима:
 *  1) imageUrl задан — художественная открытка бренда сверху + фиолетовая
 *     панель с персонализацией/кодом снизу (панель = bgStyle/textColor).
 *  2) без картинки — старый CSS-фон с тонкой золотой рамкой (фолбэк, hero).
 */
export function CertPreview(props: CertPreviewProps) {
  if (props.imageUrl) return <ImageCertPreview {...props} />;
  return <LegacyCertPreview {...props} />;
}

function ImageCertPreview({
  bgStyle,
  textColor,
  giftLabel,
  title,
  subtitle,
  forLabel,
  message,
  code = "IMB-••••-••••",
  imageUrl,
}: CertPreviewProps) {
  const panelBg =
    bgStyle.kind === "gradient"
      ? `linear-gradient(${bgStyle.angle ?? 135}deg, ${bgStyle.from}, ${bgStyle.to})`
      : (bgStyle.color ?? "#4D295D");

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-gold/40 bg-white shadow-2xl">
      {/* Художественная открытка — показываем целиком, без обрезки заголовка */}
      {/* eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна */}
      <img
        src={imageUrl ?? ""}
        alt={title}
        className="block w-full"
      />
      {/* Фирменная панель с персонализацией и кодом */}
      <div
        className="flex flex-col gap-2 p-5"
        style={{ background: panelBg, color: textColor }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-display text-lg leading-tight sm:text-xl">
            {title}
          </div>
          <div className="text-[9px] font-semibold tracking-[0.28em] whitespace-nowrap uppercase opacity-75">
            {giftLabel}
          </div>
        </div>
        {subtitle && <div className="text-xs opacity-80">{subtitle}</div>}
        {(forLabel || message) && (
          <div className="border-t border-white/15 pt-2">
            {forLabel && <div className="text-xs opacity-90">{forLabel}</div>}
            {message && (
              <div className="mt-1 line-clamp-2 font-display text-sm italic opacity-90">
                «{message}»
              </div>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-2 text-[11px] opacity-90">
          <span className="font-display tracking-[0.12em]">IMBIR THAI SPA</span>
          <span className="font-bold tracking-[0.15em]">{code}</span>
        </div>
      </div>
    </div>
  );
}

function LegacyCertPreview({
  bgStyle,
  textColor,
  giftLabel,
  title,
  subtitle,
  forLabel,
  message,
  code = "IMB-••••-••••",
}: CertPreviewProps) {
  const background =
    bgStyle.kind === "gradient"
      ? `linear-gradient(${bgStyle.angle ?? 135}deg, ${bgStyle.from}, ${bgStyle.to})`
      : bgStyle.color;
  const frameColor =
    bgStyle.border ?? (textColor === "#FFFFFF" ? "rgba(255,255,255,.45)" : "#B69244");

  return (
    <div
      className="relative flex aspect-[16/9.6] w-full flex-col justify-between overflow-hidden rounded-2xl p-6 shadow-2xl sm:p-7"
      style={{ background, color: textColor }}
    >
      {/* тонкая золотая рамка 1px */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2.5 rounded-xl border"
        style={{ borderColor: frameColor }}
      />
      {/* line-art имбирь (SVG-заглушка до получения исходников) */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute -right-4 -bottom-4 h-36 w-36 opacity-15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M30 70c-8-6-10-18-3-26 5-6 13-7 19-3 2-8 12-12 19-8 8 4 10 14 5 21 7 1 12 8 10 15-2 8-11 11-18 8-3 6-11 9-18 6-6-2-11-7-14-13Z" />
        <path d="M52 38c3-7 9-11 16-12M40 45c-4-4-5-11-2-16" />
      </svg>

      <div className="relative">
        <div className="font-display text-base tracking-[0.12em]">
          IMBIR THAI SPA
        </div>
        <div className="mt-0.5 text-[9px] font-semibold tracking-[0.3em] uppercase opacity-75">
          {giftLabel}
        </div>
      </div>

      <div className="relative">
        <div className="font-display text-lg leading-snug sm:text-2xl">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-xs opacity-80">{subtitle}</div>
        )}
        {message && (
          <div className="mt-1.5 line-clamp-2 font-display text-xs italic opacity-90">
            «{message}»
          </div>
        )}
      </div>

      <div className="relative flex items-end justify-between text-[11px] opacity-90">
        <span>{forLabel}</span>
        <span className="font-bold tracking-[0.15em]">{code}</span>
      </div>
    </div>
  );
}
