"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CertPreview } from "./cert-preview";
import { Link } from "@/i18n/navigation";
import { ConsentModal } from "./consent-modal";
import { optionLabel } from "./program-card";
import { formatKzt } from "@/lib/format";
import { priceHref } from "@/lib/price-list";
import type {
  BuilderResume,
  DesignDto,
  NominalDto,
  ProgramDto,
  SalonDto,
} from "@/lib/types";

type Props = Readonly<{
  salons: SalonDto[];
  programs: ProgramDto[];
  nominals: NominalDto[];
  designs: DesignDto[];
  bounds: { min: number; max: number };
  /**
   * Филиал → суммы, под которые в Altegio есть товар-сертификат. Свободного
   * ввода суммы там нет: баланс задаёт тип товара. Предлагать покупателю
   * сумму, которой нет в списке, значит продать сертификат, который кассир
   * не найдёт в CRM.
   */
  amountsBySalon: Record<number, number[]>;
  consentHtml: string;
  /** Предвыбор из query: ?option= / ?nominal= / ?type=nominal */
  initialOptionId?: number;
  initialNominalId?: number;
  initialType?: "program" | "nominal";
  /** Предзаполнение из брошенного заказа (дожим ?resume=token) */
  resume?: BuilderResume | null;
  /**
   * Настроена ли оплата картой (ForteBank). Пока банк не выдал креды,
   * кнопку не показываем: иначе покупатель доходит до последнего шага и
   * упирается в ошибку вместо оплаты.
   */
  cardEnabled: boolean;
  /** Показать демо-оплату — только администратору */
  demoEnabled?: boolean;
}>;

type Step = 0 | 1 | 2 | 3 | 4;
const DRAFT_KEY = "imbir-builder-draft";

/** Снимок конструктора для сохранения черновика в localStorage. */
type Draft = {
  step: Step;
  salonId: number | null;
  type: "program" | "nominal";
  programId: number | null;
  optionId: number | null;
  nominalId: number | null;
  customAmount: string;
  designIdx: number;
  toName: string;
  fromName: string;
  message: string;
  method: "email";
  contact: string;
  when: "now" | "scheduled";
  scheduledAt: string;
  buyerEmail: string;
  provider: "kaspi" | "forte";
};

/** Есть ли в черновике осмысленный прогресс (иначе продолжать нечего). */
function isResumable(d: Draft): boolean {
  return (
    d.step > 0 ||
    d.salonId != null ||
    d.programId != null ||
    d.optionId != null ||
    d.customAmount.trim().length > 0 ||
    d.toName.trim().length > 0 ||
    d.fromName.trim().length > 0 ||
    d.message.trim().length > 0 ||
    d.contact.trim().length > 0 ||
    d.buyerEmail.trim().length > 0
  );
}

/** Превью дизайна для сетки выбора (public/designs/thumbs, 360px). */
function designThumb(url: string): string {
  return url.startsWith("/designs/")
    ? url.replace("/designs/", "/designs/thumbs/")
    : url;
}

// 16px на телефоне (text-base) — не «покрупнее для красоты», а обязательное:
// при шрифте меньше 16px iOS Safari сам увеличивает страницу на фокусе поля
// и обратно не отъезжает, дальше вся форма заполняется на съехавшем экране.
// С 640px возвращаем прежние 14px.
const inputCls =
  "w-full rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-3 text-base outline-none transition-colors focus:border-brand-gold sm:text-sm";
const labelCls = "mb-1.5 block text-[13px] font-bold";
const segBtn = (active: boolean) =>
  `flex min-w-[120px] flex-1 flex-col items-center gap-0.5 rounded-2xl border-[1.5px] px-4 py-3.5 text-sm font-bold transition-colors ${
    active
      ? "border-brand-purple bg-brand-purple-50 text-brand-purple"
      : "border-brand-purple-100 bg-white hover:border-brand-gold"
  }`;

export function BuilderClient({
  salons,
  programs,
  nominals,
  designs,
  bounds,
  amountsBySalon,
  consentHtml,
  initialOptionId,
  initialNominalId,
  initialType,
  resume,
  cardEnabled,
  demoEnabled = false,
}: Props) {
  const t = useTranslations("Builder");
  const tCommon = useTranslations("Common");
  const locale = useLocale();

  // --- согласие (PRD §5.2): модалка показывается КАЖДЫЙ раз при входе в
  // конструктор — согласие НЕ персистится, живёт только на текущий монтаж ---
  const [acceptedNow, setAcceptedNow] = useState(false);
  const consented = acceptedNow;
  // Повторное согласие на шаге оплаты (PRD §5.2 — до оплаты)
  // Согласие перед оплатой — галочкой прямо на шаге, а не всплывающим окном.
  // Окно перекрывало сводку заказа: человек соглашался, не видя, за что платит,
  // а на телефоне ещё и перекрывало кнопку. Смысл согласия от этого не меняется:
  // текст тот же, отметка осознанная, без неё кнопка оплаты не работает.
  const [payAgreed, setPayAgreed] = useState(false);
  // Запоминаем момент каждого подтверждения: их два, и второе — перед
  // деньгами. Время браузерное, доказательное снимет сервер; здесь важен
  // сам факт и картина «когда человек это делал у себя».
  const consentAtRef = useRef<{ builder?: string; payment?: string }>({});
  const acceptConsent = () => {
    consentAtRef.current.builder = new Date().toISOString();
    setAcceptedNow(true);
  };

  // --- предвыбор из query ---
  const initialProgram = initialOptionId
    ? programs.find((p) => p.options.some((o) => o.id === initialOptionId))
    : undefined;

  // Дожим (resume) имеет приоритет над query-предвыбором; заполненный заказ
  // открываем сразу на шаге оплаты — покупателю остаётся один клик.
  const [step, setStep] = useState<Step>(resume ? 4 : 0);
  const [salonId, setSalonId] = useState<number | null>(resume?.salonId ?? null);
  const [type, setType] = useState<"program" | "nominal">(
    resume?.type ?? initialType ?? (initialNominalId ? "nominal" : "program"),
  );
  const [programId, setProgramId] = useState<number | null>(
    resume?.programId ?? initialProgram?.id ?? null,
  );
  const [optionId, setOptionId] = useState<number | null>(
    resume?.optionId ?? initialOptionId ?? null,
  );
  const [nominalId, setNominalId] = useState<number | null>(
    resume?.nominalId ?? initialNominalId ?? nominals[0]?.id ?? null,
  );
  const [customAmount, setCustomAmount] = useState(resume?.customAmount ?? "");
  const [designIdx, setDesignIdx] = useState(
    resume ? Math.min(Math.max(resume.designIdx, 0), designs.length - 1) : 0,
  );
  const [toName, setToName] = useState(resume?.toName ?? "");
  const [fromName, setFromName] = useState(resume?.fromName ?? "");
  const [message, setMessage] = useState(resume?.message ?? "");
  // Всегда почта. Старый черновик мог содержать "whatsapp" — приводим к email,
  // иначе восстановление корзины падало бы на несуществующем варианте.
  const method = "email" as const;
  const [contact, setContact] = useState(resume?.contact ?? "");
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [buyerEmail, setBuyerEmail] = useState(resume?.buyerEmail ?? "");
  const [provider, setProvider] = useState<"kaspi" | "forte" | "mock">("kaspi");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // --- промокод (Фаза 2): скидка на сумму оплаты; сервер — источник истины ---
  const [promoInput, setPromoInput] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountKzt: number;
    payableKzt: number;
    /** Сумма, к которой применена скидка — чтобы сбросить превью при её смене */
    appliedTo: number;
  } | null>(null);

  // --- черновик заказа: сохраняем прогресс, предлагаем продолжить/начать заново.
  // Если клиент вышел на полпути и вернулся — не теряем выбор и тексты. ---
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [resumeResolved, setResumeResolved] = useState(false);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // приватный режим — черновика и не было
    }
  };

  const applyDraft = (d: Draft) => {
    setStep(d.step);
    setSalonId(d.salonId);
    setType(d.type);
    setProgramId(d.programId);
    setOptionId(d.optionId);
    setNominalId(d.nominalId);
    setCustomAmount(d.customAmount);
    setDesignIdx(Math.min(Math.max(d.designIdx, 0), designs.length - 1));
    setToName(d.toName);
    setFromName(d.fromName);
    setMessage(d.message);
    setContact(d.contact);
    setWhen(d.when);
    setScheduledAt(d.scheduledAt);
    setBuyerEmail(d.buyerEmail);
    // Черновик мог сохраниться, когда оплата картой ещё показывалась
    setProvider(d.provider === "forte" && !cardEnabled ? "kaspi" : d.provider);
  };

  const resumeContinue = () => {
    if (pendingDraft) applyDraft(pendingDraft);
    setPendingDraft(null);
    setResumeResolved(true);
  };
  const resumeNew = () => {
    clearDraft();
    setPendingDraft(null);
    setResumeResolved(true);
  };

  // При входе читаем черновик: есть прогресс → спросим (после согласия),
  // иначе сразу разрешаем сохранение нового. Дожим (resume) авторитетнее
  // черновика: заказ уже восстановлен из письма — старый черновик стираем.
  //
  // setState в эффекте здесь намеренный: localStorage на сервере нет, а чтение
  // его прямо в рендере разошлось бы с разметкой при гидрации. Правило про
  // каскадные перерисовки этот случай не покрывает — эффект как раз и есть
  // «подписка на внешнюю систему», для которой он предназначен.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (resume) {
      clearDraft();
      setResumeResolved(true);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (isResumable(d)) {
          setPendingDraft(d);
          return;
        }
      }
    } catch {
      // битый/недоступный storage — игнорируем
    }
    // Пустые зависимости намеренно: черновик читаем ровно один раз при входе.
    // Добавить сюда `resume` — значит перечитывать его на каждое изменение
    // пропса и затирать уже начатое оформление.
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Сохраняем черновик на каждое изменение — но только после того, как решён
  // вопрос «продолжить/заново» и пока заказ не создан (иначе затрём при входе).
  useEffect(() => {
    if (!resumeResolved || createdOrderId) return;
    const draft: Draft = {
      step,
      salonId,
      type,
      programId,
      optionId,
      nominalId,
      customAmount,
      designIdx,
      toName,
      fromName,
      message,
      method,
      contact,
      when,
      scheduledAt,
      buyerEmail,
      // Демо-оплату в черновик не кладём: он переживает выход из админки, и
      // вернувшийся обычным посетителем упёрся бы в способ, которого больше нет
      provider: provider === "mock" ? "kaspi" : provider,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // приватный режим — просто не сохраняем
    }
  }, [
    resumeResolved,
    createdOrderId,
    step,
    salonId,
    type,
    programId,
    optionId,
    nominalId,
    customAmount,
    designIdx,
    toName,
    fromName,
    message,
    method,
    contact,
    when,
    scheduledAt,
    buyerEmail,
    provider,
  ]);

  // Показ конструктора для A/B цен — один раз за вкладку, иначе перезагрузки
  // раздували бы знаменатель конверсии
  useEffect(() => {
    if (sessionStorage.getItem("imbir_ab_view")) return;
    sessionStorage.setItem("imbir_ab_view", "1");
    void fetch("/api/ab/view", { method: "POST" }).catch(() => {});
  }, []);

  const selectedSalon = salons.find((s) => s.id === salonId) ?? null;
  // Ключ города — русский (совпадает с ProgramDto.cities), подпись — локализованная
  const cities = [...new Map(salons.map((s) => [s.cityKey, s.city])).entries()];

  // Филиал фильтрует доступные программы (PRD §5.1.3)
  const availablePrograms = useMemo(
    () =>
      programs.filter(
        (p) =>
          !selectedSalon ||
          p.cities.length === 0 ||
          p.cities.includes(selectedSalon.cityKey),
      ),
    [programs, selectedSalon],
  );

  const program = availablePrograms.find((p) => p.id === programId) ?? null;
  const option = program?.options.find((o) => o.id === optionId) ?? null;
  const nominal = nominals.find((n) => n.id === nominalId) ?? null;
  const design = designs[designIdx];

  const availableAmounts = salonId ? (amountsBySalon[salonId] ?? []) : [];
  const custom = customAmount ? Number(customAmount) : null;
  const customValid =
    custom !== null &&
    Number.isInteger(custom) &&
    custom >= bounds.min &&
    custom <= bounds.max &&
    // Пустой список — филиал не привязан к CRM, ограничивать нечем.
    (availableAmounts.length === 0 || availableAmounts.includes(custom));

  // Отображаемая цена; источник истины — сервер (пересчёт в /api/orders)
  const price =
    type === "program"
      ? (option?.priceKzt ?? 0)
      : customAmount
        ? customValid
          ? custom
          : 0
        : (nominal?.amountKzt ?? 0);

  // Выбор позиции для API (единый формат для заказа и превью промокода)
  const buildItem = () =>
    type === "program"
      ? { type: "program" as const, programOptionId: optionId! }
      : customAmount
        ? { type: "nominal" as const, customAmountKzt: custom! }
        : { type: "nominal" as const, nominalId: nominalId! };

  // Скидка актуальна, только если применена к текущей сумме
  const promoValid = promoApplied !== null && promoApplied.appliedTo === price;
  const discountKzt = promoValid ? promoApplied.discountKzt : 0;
  const total = price - discountKzt;

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code || !salonId || price <= 0) return;
    setPromoChecking(true);
    setPromoError("");
    try {
      const response = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, item: buildItem(), promoCode: code }),
      });
      if (response.status === 429) {
        setPromoError(t("errRateLimited"));
        return;
      }
      const data = (await response.json()) as
        | { ok: true; code: string; discountKzt: number; payableKzt: number }
        | { ok: false; reason: string };
      if (!response.ok || !data.ok) {
        setPromoApplied(null);
        setPromoError(t("promoInvalid"));
        return;
      }
      setPromoApplied({
        code: data.code,
        discountKzt: data.discountKzt,
        payableKzt: data.payableKzt,
        appliedTo: price,
      });
    } catch {
      setPromoError(t("promoInvalid"));
    } finally {
      setPromoChecking(false);
    }
  };

  const clearPromo = () => {
    setPromoApplied(null);
    setPromoError("");
    setPromoInput("");
  };

  const guests = (count: number) => tCommon("guests", { count });
  const hourUnit = tCommon("hour");

  const stepValid = (s: Step): boolean => {
    switch (s) {
      case 0:
        if (!salonId) return false;
        return type === "program"
          ? Boolean(option)
          : customAmount
            ? customValid
            : Boolean(nominal);
      case 1:
        return Boolean(design);
      case 2:
        return toName.trim().length > 0 && fromName.trim().length > 0;
      case 3:
        // Обязателен только адрес покупателя: почту получателя он часто не
        // знает. Указал — проверяем, чтобы опечатка не увела сертификат.
        if (!/\S+@\S+\.\S+/.test(buyerEmail)) return false;
        if (contact.trim() && !/\S+@\S+\.\S+/.test(contact)) return false;
        if (when === "scheduled" && !scheduledAt) return false;
        return true;
      default:
        return true;
    }
  };

  const next = () => {
    if (!stepValid(step)) {
      setError(t("errRequired"));
      return;
    }
    setError("");
    setStep((s) => Math.min(4, s + 1) as Step);
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          item: buildItem(),
          designId: design.id,
          toName: toName.trim(),
          fromName: fromName.trim(),
          message: message.trim(),
          delivery: {
            method,
            contact: contact.trim(),
            // datetime-local → ISO в таймзоне Asia/Almaty (UTC+5)
            ...(when === "scheduled" && scheduledAt
              ? { scheduledAt: `${scheduledAt}:00+05:00` }
              : {}),
          },
          buyerEmail: buyerEmail.trim(),
          // Промокод применяется, только если превью валидно к текущей сумме
          ...(promoValid ? { promoCode: promoApplied.code } : {}),
          provider,
          locale,
          consentAccepted: true,
          consentSteps: consentAtRef.current,
        }),
      });
      if (response.status === 429) {
        setError(t("errRateLimited"));
        return;
      }
      if (!response.ok) {
        setError(t("errGeneric"));
        return;
      }
      const data = (await response.json()) as {
        orderId: string;
        paymentUrl: string | null;
      };
      // Заказ создан — черновик больше не нужен
      clearDraft();
      if (data.paymentUrl) {
        window.location.assign(data.paymentUrl);
        return;
      }
      // Провайдер недоступен — заказ создан, показываем номер
      setCreatedOrderId(data.orderId);
    } catch {
      setError(t("errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  if (createdOrderId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-brand-gold/50 bg-white p-8 text-center shadow-lg">
        <h2 className="mb-3 font-display text-2xl font-semibold text-brand-purple">
          {t("createdTitle")}
        </h2>
        <p className="mb-6 text-sm text-brand-purple-950/70">
          {t("createdText", { orderId: createdOrderId })}
        </p>
        <button
          type="button"
          onClick={() => {
            setCreatedOrderId(null);
            setStep(0);
          }}
          className="rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white hover:bg-brand-purple-600"
        >
          {t("createdAgain")}
        </button>
      </div>
    );
  }

  const stepTitles = [
    t("step1"),
    t("step2"),
    t("step3"),
    t("step4"),
    t("step5"),
  ];

  const previewTitle =
    type === "program"
      ? (program?.name ?? "…")
      : price > 0
        ? formatKzt(price)
        : "…";
  const previewSubtitle =
    type === "program"
      ? option
        ? optionLabel(option, guests, hourUnit)
        : undefined
      : t("sumTypeNominal");

  // Пока согласие не дано — на странице нет ничего, кроме модалки.
  //
  // Раньше конструктор рендерился под ней всегда, и до полей можно было
  // добраться клавишей Tab, ни разу не поставив галочку. Оформить заказ так
  // всё равно было нельзя (кнопка оплаты открывает вторую модалку, а submit
  // вызывается только из неё), но утверждение «без галочки дальше не пройти»
  // становилось опровержимым — а именно его фиксирует нотариальный протокол.
  // Ранний выход убирает разночтение: за модалкой физически ничего нет.
  if (!consented) {
    return <ConsentModal html={consentHtml} onAccept={acceptConsent} />;
  }

  return (
    <>
      {/* Есть незавершённый черновик — предложить продолжить или начать заново
          (после согласия, чтобы модалки не накладывались) */}
      {consented && pendingDraft && (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-purple-950/70 p-4 backdrop-blur-sm"
        >
          <div className="modal-panel w-full max-w-md rounded-2xl border border-brand-gold/40 bg-white p-6 shadow-2xl sm:p-8">
            <h2 className="mb-3 font-display text-2xl font-semibold text-brand-purple">
              {t("resumeTitle")}
            </h2>
            <p className="mb-6 text-sm text-brand-purple-950/70">
              {t("resumeText")}
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resumeNew}
                className="rounded-full border-[1.5px] border-brand-purple-100 px-6 py-3 text-sm font-bold text-brand-purple-800 transition-colors hover:border-brand-red hover:text-brand-red"
              >
                {t("resumeNew")}
              </button>
              <button
                type="button"
                onClick={resumeContinue}
                className="rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
              >
                {t("resumeContinue")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-7 flex flex-wrap gap-1.5">
        {stepTitles.map((title, index) => (
          <div
            key={title}
            className={`min-w-[90px] flex-1 border-b-[3px] pb-2.5 text-center text-xs font-bold whitespace-nowrap transition-colors ${
              index === step
                ? "border-brand-gold text-brand-purple"
                : index < step
                  ? "border-brand-purple-600 text-brand-purple-600"
                  : "border-brand-purple-100 text-brand-purple-950/40"
            }`}
          >
            {index < step ? "✓ " : ""}
            {title}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-9 lg:grid-cols-[1fr_400px]">
        {/* key={step}: перемонтаж контейнера при смене шага даёт короткий
            вход .step-enter вместо мгновенной подмены контента */}
        <div key={step} className="step-enter rounded-2xl border border-brand-purple-100 bg-white p-6 shadow-sm sm:p-8">
          {/* ШАГ 1: тип + город/филиал */}
          {step === 0 && (
            <>
              <h3 className="font-display text-2xl font-semibold text-brand-purple">
                {t("s1Title")}
              </h3>
              <p className="mt-1 mb-5 text-sm text-brand-purple-950/60">
                {t("s1Hint")}
              </p>

              <div className="mb-5 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="b-city">
                    {t("s1City")}
                  </label>
                  <select
                    id="b-city"
                    className={inputCls}
                    value={selectedSalon?.cityKey ?? ""}
                    onChange={(e) => {
                      const cityFirst = salons.find(
                        (s) => s.cityKey === e.target.value,
                      );
                      setSalonId(cityFirst?.id ?? null);
                      setProgramId(null);
                      setOptionId(null);
                    }}
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {cities.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="b-salon">
                    {t("s1Salon")}
                  </label>
                  <select
                    id="b-salon"
                    className={inputCls}
                    value={salonId ?? ""}
                    disabled={!selectedSalon}
                    onChange={(e) => setSalonId(Number(e.target.value))}
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {salons
                      .filter((s) => s.cityKey === selectedSalon?.cityKey)
                      .map((salon) => (
                        <option key={salon.id} value={salon.id}>
                          {salon.address}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <p className="mb-6 text-xs text-brand-purple-950/55">
                {t("s1SalonHint")}
              </p>

              <div className="mb-6 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className={segBtn(type === "program")}
                  onClick={() => setType("program")}
                >
                  🌿 {t("s1Program")}
                  <small className="font-medium text-brand-purple-950/55">
                    {t("s1ProgramSub")}
                  </small>
                </button>
                <button
                  type="button"
                  className={segBtn(type === "nominal")}
                  onClick={() => setType("nominal")}
                >
                  💳 {t("s1Nominal")}
                  <small className="font-medium text-brand-purple-950/55">
                    {t("s1NominalSub")}
                  </small>
                </button>
              </div>

              {type === "program" ? (
                <>
                  <div className="mb-4">
                    <label className={labelCls} htmlFor="b-program">
                      {t("s1SelectProgram")}
                    </label>
                    <select
                      id="b-program"
                      className={inputCls}
                      value={programId ?? ""}
                      disabled={!selectedSalon}
                      onChange={(e) => {
                        const p = availablePrograms.find(
                          (x) => x.id === Number(e.target.value),
                        );
                        setProgramId(p?.id ?? null);
                        setOptionId(p?.options[0]?.id ?? null);
                      }}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {availablePrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {program && (
                    <div>
                      <span className={labelCls}>{t("s1SelectOption")}</span>
                      <div className="flex flex-wrap gap-2.5">
                        {program.options.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={segBtn(o.id === optionId)}
                            onClick={() => setOptionId(o.id)}
                          >
                            {optionLabel(o, guests, hourUnit)}
                            <small className="font-medium text-brand-purple-950/55">
                              {formatKzt(o.priceKzt)}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {nominals.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={segBtn(
                          !customAmount && n.id === nominalId,
                        )}
                        onClick={() => {
                          setNominalId(n.id);
                          setCustomAmount("");
                        }}
                      >
                        {formatKzt(n.amountKzt)}
                        {n.label && (
                          <small className="font-medium text-brand-gold-700">
                            {n.label}
                          </small>
                        )}
                      </button>
                    ))}
                  </div>
                  <label className={labelCls} htmlFor="b-custom">
                    {t("s1Custom", {
                      min: formatKzt(bounds.min),
                      max: formatKzt(bounds.max),
                    })}
                  </label>
                  <input
                    id="b-custom"
                    type="number"
                    list="b-amounts"
                    min={bounds.min}
                    max={bounds.max}
                    step={500}
                    className={inputCls}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                  <datalist id="b-amounts">
                    {availableAmounts.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                  {customAmount && !customValid && (
                    <p className="mt-1.5 text-xs font-semibold text-brand-red">
                      {custom !== null &&
                      custom >= bounds.min &&
                      custom <= bounds.max
                        ? t("errAmountUnavailable")
                        : t("errAmount", {
                            min: formatKzt(bounds.min),
                            max: formatKzt(bounds.max),
                          })}
                    </p>
                  )}
                  {availableAmounts.length > 0 && (
                    <p className="mt-1.5 text-xs text-brand-purple/60">
                      {t("amountsHint", {
                        list: availableAmounts.map(formatKzt).join(", "),
                      })}
                    </p>
                  )}
                </>
              )}

              <a
                href={priceHref(locale as "ru" | "kk" | "en")}
                target="_blank"
                rel="noopener"
                className="mt-6 inline-block text-sm font-semibold text-brand-gold-700 underline decoration-brand-gold/40 underline-offset-4 transition-colors hover:text-brand-gold"
              >
                📄 {t("priceLink")}
              </a>
            </>
          )}

          {/* ШАГ 2: дизайн */}
          {step === 1 && (
            <>
              <h3 className="font-display text-2xl font-semibold text-brand-purple">
                {t("s2Title")}
              </h3>
              <p className="mt-1 mb-5 text-sm text-brand-purple-950/60">
                {t("s2Hint")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {designs.map((d, index) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDesignIdx(index)}
                    className={`rounded-2xl border-[2.5px] p-1 transition-colors ${
                      index === designIdx
                        ? "border-brand-gold"
                        : "border-transparent hover:border-brand-purple-100"
                    }`}
                  >
                    {d.imageUrl ? (
                      // В сетке — лёгкое превью (~8 КБ вместо ~60 КБ);
                      // если превью нет (старые загрузки) — фолбэк на оригинал
                      // eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна
                      <img
                        src={designThumb(d.imageUrl)}
                        onError={(e) => {
                          if (e.currentTarget.src !== new URL(d.imageUrl!, location.href).href) {
                            e.currentTarget.src = d.imageUrl!;
                          }
                        }}
                        alt={d.name}
                        loading="lazy"
                        className="block aspect-[1400/903] w-full rounded-xl border border-brand-purple-100 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="block aspect-[1400/903] w-full rounded-xl border border-brand-purple-100"
                        style={{
                          background:
                            d.bgStyle.kind === "gradient"
                              ? `linear-gradient(${d.bgStyle.angle ?? 135}deg, ${d.bgStyle.from}, ${d.bgStyle.to})`
                              : d.bgStyle.color,
                        }}
                      />
                    )}
                    <span className="mt-1.5 block text-center text-xs font-bold text-brand-purple-950/60">
                      {d.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ШАГ 3: персонализация */}
          {step === 2 && (
            <>
              <h3 className="font-display text-2xl font-semibold text-brand-purple">
                {t("s3Title")}
              </h3>
              <p className="mt-1 mb-5 text-sm text-brand-purple-950/60">
                {t("s3Hint")}
              </p>
              <div className="mb-4 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="b-to">
                    {t("s3To")} <span className="text-brand-red">*</span>
                  </label>
                  <input
                    id="b-to"
                    className={inputCls}
                    maxLength={80}
                    required
                    value={toName}
                    onChange={(e) => setToName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="b-from">
                    {t("s3From")} <span className="text-brand-red">*</span>
                  </label>
                  <input
                    id="b-from"
                    className={inputCls}
                    maxLength={80}
                    required
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                  />
                </div>
              </div>
              <label className={labelCls} htmlFor="b-msg">
                {t("s3Message")}
              </label>
              <textarea
                id="b-msg"
                className={`${inputCls} min-h-[90px] resize-y`}
                maxLength={120}
                placeholder={t("s3MessagePh")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="mt-1 text-right text-[11px] text-brand-purple-950/50">
                {message.length}/120
              </p>
            </>
          )}

          {/* ШАГ 4: доставка */}
          {step === 3 && (
            <>
              <h3 className="font-display text-2xl font-semibold text-brand-purple">
                {t("s4Title")}
              </h3>
              <p className="mt-1 mb-5 text-sm text-brand-purple-950/60">
                {t("s4Hint")}
              </p>
              <div className="mb-4">
                <label className={labelCls} htmlFor="b-buyer">
                  {t("s4BuyerEmail")} <span className="text-brand-red">*</span>
                </label>
                <input
                  id="b-buyer"
                  type="email"
                  placeholder="name@mail.kz"
                  className={inputCls}
                  required
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-brand-purple-950/55">
                  {t("s4BuyerNote")}
                </p>
              </div>
              <div className="mb-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className={segBtn(when === "now")}
                  onClick={() => setWhen("now")}
                >
                  ⚡ {t("s4Now")}
                </button>
                <button
                  type="button"
                  className={segBtn(when === "scheduled")}
                  onClick={() => setWhen("scheduled")}
                >
                  📅 {t("s4Scheduled")}
                </button>
              </div>
              {when === "scheduled" && (
                <div className="mb-4">
                  <label className={labelCls} htmlFor="b-when">
                    {t("s4DateTime")}
                  </label>
                  <input
                    id="b-when"
                    type="datetime-local"
                    className={inputCls}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="b-contact">
                  {t("s4ContactEmail")}{" "}
                  <span className="font-normal text-brand-purple-950/45">
                    {t("s4Optional")}
                  </span>
                </label>
                <input
                  id="b-contact"
                  type="email"
                  placeholder="name@mail.kz"
                  className={inputCls}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-brand-purple-950/55">
                  {t("s4ContactNote")}
                </p>
              </div>
            </>
          )}

          {/* ШАГ 5: оплата */}
          {step === 4 && (
            <>
              <h3 className="font-display text-2xl font-semibold text-brand-purple">
                {t("s5Title")}
              </h3>
              <div
                className={`mt-5 grid gap-3.5 ${cardEnabled ? "sm:grid-cols-2" : ""}`}
              >
                <button
                  type="button"
                  className={segBtn(provider === "kaspi")}
                  onClick={() => setProvider("kaspi")}
                >
                  <span className="rounded-lg bg-brand-red px-3.5 py-1 text-sm font-extrabold text-white">
                    Kaspi.kz
                  </span>
                  <small className="font-medium text-brand-purple-950/55">
                    {t("s5KaspiSub")}
                  </small>
                </button>
                {cardEnabled && (
                  <button
                    type="button"
                    className={segBtn(provider === "forte")}
                    onClick={() => setProvider("forte")}
                  >
                    {t("s5Card")}
                    <small className="font-medium text-brand-purple-950/55">
                      {t("s5CardSub")}
                    </small>
                  </button>
                )}
                {/* Демо-оплата: видна только вошедшему администратору, сервер
                    проверяет это ещё раз. Нужна, чтобы пройти покупку целиком,
                    пока настоящая оплата не подключена. */}
                {demoEnabled && (
                  <button
                    type="button"
                    className={segBtn(provider === "mock")}
                    onClick={() => setProvider("mock")}
                  >
                    <span className="rounded-lg bg-brand-purple px-3.5 py-1 text-sm font-extrabold text-white">
                      Демо-оплата
                    </span>
                    <small className="font-medium text-brand-purple-950/55">
                      без списания денег · видно только вам
                    </small>
                  </button>
                )}
              </div>

              {/* Промокод */}
              <div className="mt-6 border-t border-brand-purple-100 pt-5">
                <label className={labelCls} htmlFor="b-promo">
                  {t("promoLabel")}
                </label>
                {promoValid ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-brand-gold bg-brand-gold-100/50 px-3.5 py-3 text-sm">
                    <span className="font-bold text-brand-purple">
                      {promoApplied.code}
                    </span>
                    <span className="text-brand-purple-950/70">
                      {t("promoApplied", {
                        amount: formatKzt(promoApplied.discountKzt),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={clearPromo}
                      className="ml-auto text-xs font-semibold text-brand-red hover:underline"
                    >
                      {t("promoRemove")}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="b-promo"
                      className={`${inputCls} flex-1`}
                      placeholder={t("promoPlaceholder")}
                      value={promoInput}
                      maxLength={40}
                      autoCapitalize="characters"
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoError("");
                      }}
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoChecking || !promoInput.trim()}
                      className="rounded-full border-[1.5px] border-brand-purple px-6 py-3 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple-50 disabled:opacity-50"
                    >
                      {promoChecking ? "…" : t("promoApply")}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="mt-1.5 text-xs font-semibold text-brand-red">
                    {promoError}
                  </p>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-brand-purple-100 bg-brand-purple-50/40 p-4 text-sm text-brand-purple-950">
              <input
                type="checkbox"
                checked={payAgreed}
                onChange={(e) => {
                  if (e.target.checked) {
                    consentAtRef.current.payment = new Date().toISOString();
                  }
                  setPayAgreed(e.target.checked);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-purple"
              />
              <span>
                {t.rich("s5Agree", {
                  rules: (chunks) => (
                    <Link
                      href="/legal/rules"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-purple underline underline-offset-2 hover:text-brand-gold"
                    >
                      {chunks}
                    </Link>
                  ),
                  offer: (chunks) => (
                    <Link
                      href="/legal/offer"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-purple underline underline-offset-2 hover:text-brand-gold"
                    >
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link
                      href="/legal/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-purple underline underline-offset-2 hover:text-brand-gold"
                    >
                      {chunks}
                    </Link>
                  ),
                  payment: (chunks) => (
                    <Link
                      href="/legal/payment_info"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-purple underline underline-offset-2 hover:text-brand-gold"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
          )}

          {error && (
            <p className="mt-4 text-sm font-semibold text-brand-red">{error}</p>
          )}

          <div className="mt-7 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              className={`rounded-full border-[1.5px] border-brand-purple px-6 py-3 text-sm font-bold text-brand-purple transition-colors hover:bg-brand-purple-50 ${step === 0 ? "invisible" : ""}`}
            >
              {tCommon("back")}
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
              >
                {tCommon("next")} →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !payAgreed}
                onClick={submit}
                className="bg-gold-gradient rounded-full px-7 py-3 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50"
              >
                {t("s5Pay", { price: formatKzt(total) })}
              </button>
            )}
          </div>
        </div>

        {/* Живой предпросмотр + сводка */}
        <aside className="lg:sticky lg:top-24">
          <CertPreview
            imageUrl={design.imageUrl}
            bgStyle={design.bgStyle}
            textColor={design.textColor}
            giftLabel={t("certGift")}
            title={previewTitle}
            subtitle={previewSubtitle}
            forLabel={toName ? t("certFor", { name: toName }) : undefined}
            message={message || undefined}
          />
          <p className="mt-3 text-center text-xs text-brand-purple-950/55">
            {t("previewNote")}
          </p>
          <dl className="mt-4 rounded-2xl border border-brand-purple-100 bg-brand-purple-50/50 p-5 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-brand-purple-950/60">
                {type === "program" ? t("sumTypeProgram") : t("sumTypeNominal")}
              </dt>
              <dd className="font-semibold">
                {type === "program" ? (program?.name ?? "—") : formatKzt(price)}
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-brand-purple-950/60">{t("sumSalon")}</dt>
              <dd className="max-w-[60%] text-right font-semibold">
                {selectedSalon
                  ? `${selectedSalon.city}, ${selectedSalon.address}`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-brand-purple-950/60">{t("sumDesign")}</dt>
              <dd className="font-semibold">{design.name}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-brand-purple-950/60">{t("sumDelivery")}</dt>
              <dd className="font-semibold">
                {t("s4Email")}
              </dd>
            </div>
            {promoValid && (
              <div className="flex justify-between py-1 text-brand-gold-700">
                <dt>{t("sumPromo", { code: promoApplied.code })}</dt>
                <dd className="font-semibold">
                  −{formatKzt(promoApplied.discountKzt)}
                </dd>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-brand-purple-100 pt-3 text-base font-extrabold text-brand-purple">
              <dt>{t("sumTotal")}</dt>
              <dd>{price > 0 ? formatKzt(total) : "—"}</dd>
            </div>
            <p className="mt-2 text-[11px] text-brand-purple-950/50">
              {t("validity")}
            </p>
          </dl>
        </aside>
      </div>
    </>
  );
}
