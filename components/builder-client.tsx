"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BuilderIntro } from "./builder-intro";
import { BuilderDesigns } from "./builder-designs";
import { ConsentModal } from "./consent-modal";
import { optionLabel } from "./program-card";
import { formatKzt } from "@/lib/format";
import { priceHref } from "@/lib/price-list";
import { groupDesigns } from "@/lib/designs";
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
  /** Все продаваемые суммы сети — для шага «Подарок», до выбора филиала. */
  allAmounts: number[];
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
/* v2: порядок шагов изменился (дизайн стал первым), и черновик хранит
   номер шага — старый ключ восстановил бы покупателя не на тот экран. */
const DRAFT_KEY = "imbir-builder-draft-v2";

/**
 * Меньше восьми чисел в дугу не складываются: выходит не кривая, а
 * перекошенный столбец. Филиал без маппинга в CRM отдаёт только карточные
 * номиналы из админки — такому набору место в прежнем ряду плиток, и он там
 * остался целиком, вместе с кнопкой «своя сумма».
 */
const WHEEL_MIN = 8;


/** Снимок конструктора для сохранения черновика в localStorage. */
type Draft = {
  step: Step;
  salonId: number | null;
  type: "program" | "nominal";
  programId: number | null;
  optionId: number | null;
  nominalId: number | null;
  customAmount: string;
  designId: number | null;
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

// 16px на телефоне (text-base) — не «покрупнее для красоты», а обязательное:
// при шрифте меньше 16px iOS Safari сам увеличивает страницу на фокусе поля
// и обратно не отъезжает, дальше вся форма заполняется на съехавшем экране.
// С 640px возвращаем прежние 14px.
export function BuilderClient({
  salons,
  programs,
  nominals,
  designs,
  bounds,
  amountsBySalon,
  allAmounts,
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
  /**
   * Пройден ли входной экран «на сумму / на услугу».
   *
   * Сразу true, если покупатель пришёл по прямой ссылке (с карточки
   * программы, из квиза, из письма о брошенном заказе) — там тип уже выбран
   * за него, и спрашивать второй раз значит терять человека на ровном месте.
   */
  const [introDone, setIntroDone] = useState(
    Boolean(resume || initialType || initialOptionId || initialNominalId),
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
  /** Своя сумма раскрывается по требованию — но остаётся раскрытой, если
   *  покупатель вернулся на шаг с уже введённой суммой. */
  const [customOpen, setCustomOpen] = useState(Boolean(resume?.customAmount));
  /**
   * Открытка хранится ПО НОМЕРУ, а не по месту в списке. С индексом любое
   * переупорядочивание или отключение дизайна в админке молча подменяло бы
   * выбор покупателя — и особенно теперь, когда дизайн выбирается вторым
   * шагом и решение живёт до самой оплаты.
   */
  const [designId, setDesignId] = useState<number | null>(
    (resume
      ? designs[Math.min(Math.max(resume.designIdx, 0), designs.length - 1)]
      : // Первая открытка ПЕРВОГО повода, а не первая в списке: карусель
        // открывается там же, где стоит бусина на дуге. designs[0] лежит в
        // «Просто так» — корзине для всего, что не привязано к дате, и шаг
        // начинался с неё.
        groupDesigns(designs)[0]?.designs[0] ?? designs[0]
    )?.id ?? null,
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
    setDesignId(d.designId ?? designs[0]?.id ?? null);
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
    setIntroDone(true);
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
    // Черновика нет (или он без прогресса) — спрашивать нечего, сразу
    // разрешаем сохранение нового. Без этой строки флаг оставался false
    // навсегда, эффект сохранения выходил на первой же проверке, и черновик
    // не писался ВООБЩЕ ни у кого: диалог «Продолжить оформление?» не мог
    // появиться, потому что появляться было нечему.
    setResumeResolved(true);
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
      designId,
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
    designId,
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
  /**
   * Филиалы, где выбранное действительно продаётся. У программы может быть
   * задан список городов; тогда предлагать филиал вне этого списка нельзя —
   * покупатель оплатил бы то, чего в филиале нет. Наборы сумм у всех
   * продаваемых филиалов одинаковы, поэтому номинал список не сужает.
   *
   * Программа берётся из ПОЛНОГО списка, а не из отфильтрованного филиалом:
   * иначе получилось бы кольцо — филиал сужает программы, программы сужают
   * филиалы, и первый же выбор обнулял бы сам себя.
   */
  const salonsForChoice = useMemo(() => {
    const chosen = programs.find((p) => p.id === programId) ?? null;
    if (type === "program" && chosen && chosen.cities.length > 0) {
      return salons.filter((s) => chosen.cities.includes(s.cityKey));
    }
    return salons;
  }, [salons, programs, programId, type]);

  const cities = [
    ...new Map(salonsForChoice.map((s) => [s.cityKey, s.city])).entries(),
  ];

  const design = designs.find((d) => d.id === designId) ?? designs[0];

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

  /**
   * Колесо несёт ВЕСЬ продаваемый набор сети, а не четыре карточки из
   * админки. Причина не декоративная: свободного ввода суммы в Altegio нет —
   * под каждый номинал заведён свой товар, и заказ на сумму вне списка
   * упирается в amount_not_available. Показать список целиком честнее, чем
   * объяснять его строкой-подсказкой под полем ввода.
   *
   * Источник — allAmounts (объединение по сети), а НЕ availableAmounts:
   * филиал спрашивается на шаге доставки, здесь salonId ещё null, набор
   * филиала пуст — на нём колесо не появилось бы ни разу.
   */
  const wheelAmounts = ((): { amountKzt: number; label: string | null; text: string }[] => {
    const byAmount = new Map(nominals.map((n) => [n.amountKzt, n] as const));
    const source =
      allAmounts.length > 0 ? allAmounts : nominals.map((n) => n.amountKzt);
    return [...new Set(source)]
      .filter((a) => a >= bounds.min && a <= bounds.max)
      .sort((a, b) => a - b)
      .map((amountKzt) => ({
        amountKzt,
        label: byAmount.get(amountKzt)?.label ?? null,
        text: formatKzt(amountKzt),
      }));
  })();

  /**
   * −1 значит «выбранной суммы в списке нет»: покупатель набирает свою и она
   * ещё не сошлась. Подменять −1 нулём нельзя — колесо подсветило бы 18 000 и
   * объявило бы его выбранным скринридеру в тот момент, когда плашка на
   * открытке показывает другое. Пусть лучше не выбрано ничего.
   */
  const selIdx = wheelAmounts.findIndex((w) => w.amountKzt === price);
  /**
   * Куда повёрнут диск. Когда выбранной суммы в списке нет (покупатель как
   * раз набирает свою), диск показывает БЛИЖАЙШУЮ — иначе он прыгал бы на
   * начало списка и спорил с плашкой на открытке. Это чистое вычисление, а
   * не запомненное состояние: правка рефа во время рендера пережила бы не
   * каждый повторный рендер, а эффект добавил бы лишний кадр.
   *
   * Выбранным при этом НЕ помечается ничего: aria-selected смотрит на selIdx,
   * поэтому скринридер не объявит суммой подарка то, чего покупатель не
   * выбирал.
   */
  const pos =
    selIdx >= 0
      ? selIdx
      : wheelAmounts.reduce(
          (best, w, i) =>
            Math.abs(w.amountKzt - price) <
            Math.abs(wheelAmounts[best]?.amountKzt ?? 0 - price)
              ? i
              : best,
          0,
        );
  /** Одна остановка Tab на весь список; когда не выбрано ничего — первая. */
  const tabIdx = selIdx >= 0 ? selIdx : 0;

  const wheelRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    y: number; from: number; pitch: number; at: number; moved: boolean;
  } | null>(null);
  /** Перетаскивание кончается кликом. Без этого флага он выбрал бы ту строку,
   *  над которой случайно оказался курсор в конце жеста. */
  const clickOffRef = useRef(false);

  /** Числа геометрии читаются ИЗ CSS. Продублировать их в JS значит развести
   *  вёрстку и жест при первой же правке радиуса или шага. */
  const cssNum = (name: string, fallback: number) => {
    const el = wheelRef.current;
    if (!el) return fallback;
    const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };

  /** Где диск СЕЙЧАС, а не куда он ехал. Иначе разворот на полпути (End, через
   *  сто миллисекунд Home) считает длительность по маршруту, которого уже нет,
   *  и колесо почти полсекунды «едет никуда». */
  const wheelPos = () => {
    const hub = hubRef.current;
    if (!hub) return pos;
    const t = getComputedStyle(hub).transform;
    if (!t || t === "none") return pos;
    try {
      const m = new DOMMatrixReadOnly(t);
      return (-Math.atan2(m.b, m.a) * 180) / Math.PI / cssNum("--whl-step", 5);
    } catch {
      return pos;
    }
  };

  const pickAmount = (amountKzt: number) => {
    const n = nominals.find((x) => x.amountKzt === amountKzt) ?? null;
    if (n) {
      setNominalId(n.id);
      setCustomAmount("");
    } else {
      // Сумма без карточки в админке: она продаётся, но отдельного номинала в
      // админке под неё нет. Едет как «своя» — сервер всё равно перепроверит
      // её через resolveOrderAmount.
      setCustomAmount(String(amountKzt));
    }
    setCustomOpen(false);
  };

  const pickIndex = (i: number) => {
    const w = wheelAmounts[i];
    if (!w) return;
    const el = wheelRef.current;
    if (el) {
      // Длительность считается от ПУТИ, а не от того, как часто нажимают:
      // соседняя сумма доезжает за 0.2с, край списка за 0.45с. Одна
      // длительность на обе роли не годится — 0.45с на соседнюю читается как
      // залипшая кнопка, а 0.2с на двадцать пять позиций как рывок. Заодно
      // это и есть ответ на удержание стрелки: шаг там всегда один, значит
      // ход всегда короткий и жирное число не отстаёт от головки.
      const d = Math.abs(i - wheelPos());
      el.style.setProperty(
        "--whl-dur",
        `${Math.min(0.45, 0.14 + 0.08 * Math.sqrt(d)).toFixed(2)}s`,
      );
    }
    pickAmount(w.amountKzt);
  };

  /** preventScroll обязателен: фокус ставится ДО того, как диск довернётся,
   *  то есть на строку, которая физически лежит за пределами окна, и браузер
   *  попытался бы подтянуть к ней страницу. */
  const focusOpt = (i: number) =>
    hubRef.current
      ?.querySelector<HTMLElement>(`[data-i="${i}"]`)
      ?.focus({ preventScroll: true });

  const goTo = (i: number) => {
    const j = Math.min(wheelAmounts.length - 1, Math.max(0, i));
    pickIndex(j);
    // Фокус переезжает вместе с выбором: иначе следующая стрелка придёт в
    // узел с tabIndex=-1, который уже не выбран.
    focusOpt(j);
  };

  const onWheelKey = (e: React.KeyboardEvent) => {
    const jump: Record<string, number> = {
      ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1,
      PageUp: -5, PageDown: 5,
    };
    if (e.key in jump) {
      e.preventDefault(); // иначе стрелки заодно прокрутят страницу
      goTo(pos + jump[e.key]);
      return;
    }
    if (e.key === "Home") { e.preventDefault(); goTo(0); return; }
    if (e.key === "End") { e.preventDefault(); goTo(wheelAmounts.length - 1); return; }
  };

  /* Перетаскивание — ТОЛЬКО мышью. Пальцем страницу листают тем же движением,
     и отобрать у него вертикаль (touch-action:none) значит менять СУММУ
     ПОДАРКА случайным жестом при обычном пролистывании. Мышь страницу
     перетаскиванием не листает, конфликта нет. */
  const onWheelDown = (e: React.PointerEvent<HTMLDivElement>) => {
    clickOffRef.current = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragRef.current = {
      y: e.clientY,
      from: wheelPos(),
      pitch: cssNum("--whl-line", 40),
      at: -1,
      moved: false,
    };
    wheelRef.current?.style.setProperty("--whl-dur", "0s");
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onWheelMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    // Порог: дрожание руки на обычном клике не должно крутить колесо.
    if (!d.moved && Math.abs(dy) < 8) return;
    d.moved = true;
    const el = wheelRef.current;
    el?.setAttribute("data-drag", "1");
    const f = Math.min(
      wheelAmounts.length - 1,
      Math.max(0, d.from + dy / d.pitch),
    );
    // Значение ДРОБНОЕ — колесо идёт за курсором, а не защёлкивается шагами.
    // Пишем прямо в DOM: React здесь не нужен, иначе это шестьдесят
    // перерисовок в секунду и перезапуск анимации плашки на каждом кадре.
    // --whl-drag перекрывает --whl-sel только на время жеста (см. --whl-at).
    el?.style.setProperty("--whl-drag", String(f));
    const near = Math.round(f);
    if (near !== d.at) {
      d.at = near;
      hubRef.current
        ?.querySelectorAll("[data-live]")
        .forEach((n) => n.removeAttribute("data-live"));
      hubRef.current
        ?.querySelector(`[data-i="${near}"]`)
        ?.setAttribute("data-live", "1");
    }
  };

  const onWheelUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const el = wheelRef.current;
    el?.removeAttribute("data-drag");
    if (!d || !d.moved) return;
    // Доводка до целого: снимаем --whl-drag, и --whl-at падает обратно на
    // --whl-sel, который React обновит в этом же кадре.
    el?.style.setProperty("--whl-dur", ".24s");
    el?.style.removeProperty("--whl-drag");
    hubRef.current
      ?.querySelectorAll("[data-live]")
      .forEach((n) => n.removeAttribute("data-live"));
    clickOffRef.current = true;
    pickAmount(wheelAmounts[d.at >= 0 ? d.at : pos]?.amountKzt ?? 0);
  };

  /** Клик по пустому месту колеса выбирает БЛИЖАЙШУЮ сумму. Обратная задача
   *  к посадке на дугу: y = R·sin(d·шаг). Без этого левая половина окна и
   *  гаснущие крайние строки были бы мёртвой зоной, в которую всё равно
   *  целятся. */
  const onWheelClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".whl__opt")) return;
    if (clickOffRef.current) { clickOffRef.current = false; return; }
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = cssNum("--whl-r", 460);
    const stepDeg = cssNum("--whl-step", 5);
    const dy = e.clientY - (r.top + r.height / 2);
    const d =
      (Math.asin(Math.max(-1, Math.min(1, dy / R))) * 180) / Math.PI / stepDeg;
    goTo(Math.round(pos + d));
  };

  const stepValid = (s: Step): boolean => {
    switch (s) {
      case 0:
        return Boolean(design);
      case 1:
        // Филиала здесь ещё нет — он спрашивается на шаге доставки. Своя
        // сумма проверяется по границам, а её продаваемость в конкретном
        // филиале — там же, где филиал и выбирают (шаг 3).
        return type === "program"
          ? Boolean(option)
          : customAmount
            ? customValid
            : Boolean(nominal);
      case 2:
        return toName.trim().length > 0 && fromName.trim().length > 0;
      case 3:
        if (!salonId) return false;
        // Своя сумма проверяется ЗДЕСЬ ещё раз: до выбора филиала список
        // продаваемых сумм неизвестен, и без этой проверки можно было бы
        // оплатить номинал, которого в Altegio у филиала нет.
        if (type === "nominal" && customAmount && !customValid) return false;
        if (type === "program" && !option) return false;
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

  // Порядок подписей идёт за порядком экранов: открытка теперь первая.
  const stepTitles = [
    t("step2"),
    t("step1"),
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

  /**
   * Примеры на плашках входного экрана. Берём из настоящего каталога, а не
   * пишем числом в разметке: сумма в списке номиналов может измениться, и
   * рисованный пример разошёлся бы с тем, что покупатель увидит дальше.
   */
  const sampleAmount = formatKzt(
    nominals[Math.min(2, nominals.length - 1)]?.amountKzt ?? 15000,
  );
  const firstProgram = programs[0];
  const sampleProgram = firstProgram
    ? `${firstProgram.name}${
        firstProgram.options[0]?.durationMin
          ? ` · ${firstProgram.options[0].durationMin} мин`
          : ""
      }`
    : "";

  // Входной экран: сумма или услуга. Он стоит ПЕРЕД согласием намеренно.
  // Модалка первым же экраном встречала человека, который ещё ничего не
  // выбрал и не понимал, с чем соглашается. Здесь он не вводит ни одного
  // своего данного — только говорит, что дарит; согласие спрашивается сразу
  // после, до самого конструктора и до любого поля. Гарантия та же: ниже
  // стоит ранний выход по !consented, и за модалкой нет ни одного узла,
  // который можно поймать клавишей Tab.
  if (!introDone) {
    return (
      <BuilderIntro
        images={designs
          .map((d) => d.imageUrl)
          .filter((u): u is string => Boolean(u))
          .slice(0, 4)}
        sampleAmount={sampleAmount}
        sampleProgram={sampleProgram}
        onPick={(picked) => {
          setType(picked);
          setIntroDone(true);
        }}
      />
    );
  }

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

      {/* Шкала шагов: пять сегментов, пройденные залиты золотом, текущий
          заливается наполовину. Серые подписи в строку читались как хлебные
          крошки и не говорили главного — сколько осталось. Кликать нечего:
          это указатель, а не вкладки, переходы идут только кнопками. */}
      <ol className="stp" aria-label={t("eyebrow")}>
        {stepTitles.map((title, index) => (
          <li
            key={title}
            className="stp__it"
            data-state={
              index === step ? "on" : index < step ? "done" : "next"
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span className="stp__bar" aria-hidden="true" />
            <span className="stp__label">{title}</span>
          </li>
        ))}
      </ol>

      {/* Каждый шаг занимает всю ширину — правой колонки с вечным
          предпросмотром больше нет. Она превращала любой экран в придаток к
          сводке пустого заказа: на выборе открытки одна и та же картинка
          показывалась дважды и обе выходили мелкими. Предпросмотр остался
          там, где он что-то решает: на «Подписи» (имена ложатся на карточку)
          и на «Оплате» (итог перед списанием). */}
      <div
        className={`bld__flow${step > 0 ? " bld__flow--split" : ""}`}
        data-step={step}
      >
        {/* Открытка — герой всего пути, как в подарочных картах Apple и у
            Золотого Яблока: слева крупно, справа то, что её меняет. На шаге
            дизайна героя нет — там карусель сама и есть открытка, и ей нужна
            вся ширина. Суммы на открытке на шаге суммы нет намеренно: там
            огромное число справа, и второе такое же было бы дублем. */}
        {step > 0 && (
          <aside className="hero" aria-label={t("previewNote")}>
            <div className="hero__stage">
              <span className="hero__glow" aria-hidden="true" />
              <div className="hero__card">
                {design.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна
                  <img src={design.imageUrl} alt={design.name} />
                )}
                <span className="hero__edge" aria-hidden="true" />
                {step >= 2 && (
                  <div className="hero__panel">
                    <div className="hero__row">
                      <span
                        className={`hero__title${type === "nominal" ? " hero__title--sum" : ""}`}
                      >
                        {previewTitle}
                      </span>
                      <span className="hero__gift">{t("certGift")}</span>
                    </div>
                    {previewSubtitle && type === "program" && (
                      <span className="hero__sub">{previewSubtitle}</span>
                    )}
                    <div className="hero__row hero__row--end">
                      <span className="hero__for">
                        {toName && (
                          <span className="hero__to">
                            {t("certFor", { name: toName })}
                          </span>
                        )}
                        {message && <em className="hero__msg">«{message}»</em>}
                      </span>
                      <span className="hero__code">WM••••</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="hero__note">{design.name}</p>
          </aside>
        )}

        {/* key={step}: перемонтаж контейнера при смене шага даёт короткий
            вход .step-enter вместо мгновенной подмены контента */}
        <div key={step} className="step-enter bld__pane">
          {/* ШАГ 2: филиал и что именно дарим.
              Сумма спрашивается ПОСЛЕ филиала и только так: в Altegio под
              каждый номинал заведён свой товар, и наборы у филиалов разные —
              сумма, выбранная раньше филиала, могла бы оказаться непродаваемой. */}
          {step === 1 && (
            <>
              <div className="bld__head">
                <h2 className="bld__title">
                  {type === "nominal" ? t("s1TitleNominal") : t("s1TitleProgram")}
                </h2>
                <p className="bld__lede">
                  {type === "nominal" ? t("s1LedeNominal") : t("s1LedeProgram")}
                </p>
              </div>

              {/* Тип уже выбран на входном экране — не спрашиваем второй раз,
                  а даём тихо передумать одной строкой. Два больших переключателя
                  здесь повторяли тот же вопрос и превращали экран в анкету. */}
              <p className="bld__swap">
                {type === "nominal" ? t("s1IsNominal") : t("s1IsProgram")}{" "}
                <button
                  type="button"
                  className="bld__swaplink"
                  onClick={() => setType(type === "nominal" ? "program" : "nominal")}
                >
                  {type === "nominal" ? t("s1ToProgram") : t("s1ToNominal")}
                </button>
              </p>

              {/* ── Сумма или программа ─────────────────────────────────── */}
              {type === "program" ? (
                <>
                  <p className="bld__sect">{t("s1SelectProgram")}</p>
                  <div className="prg">
                    {availablePrograms.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="prg__it"
                        data-on={p.id === programId ? "1" : undefined}
                        onClick={() => {
                          setProgramId(p.id);
                          setOptionId(p.options[0]?.id ?? null);
                        }}
                      >
                        <span className="prg__name">{p.name}</span>
                        <span className="prg__from">
                          {tCommon("from", {
                            price: formatKzt(
                              Math.min(...p.options.map((o) => o.priceKzt)),
                            ),
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                  {program && (
                    <>
                      <p className="bld__sect">{t("s1SelectOption")}</p>
                      <div className="pil">
                        {program.options.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className="pil__it"
                            data-on={o.id === optionId ? "1" : undefined}
                            onClick={() => setOptionId(o.id)}
                          >
                            {optionLabel(o, guests, hourUnit)}
                            <small>{formatKzt(o.priceKzt)}</small>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="amt">
                    {wheelAmounts.length < WHEEL_MIN ? (
                      /* Короткий набор — прежний ряд плиток целиком, вместе со «своей
                         суммой». Это не заглушка: филиалы без маппинга в CRM (WJ, WE)
                         реально сюда попадают, и терять на них свободный ввод нельзя. */
                      <div className="amt__picker">
                        {nominals.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="amt__chip"
                            data-on={!customAmount && n.id === nominalId ? "1" : undefined}
                            onClick={() => {
                              setNominalId(n.id);
                              setCustomAmount("");
                              setCustomOpen(false);
                            }}
                          >
                            {formatKzt(n.amountKzt)}
                            {n.label && <small>{n.label}</small>}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="amt__chip amt__chip--own"
                          data-on={customOpen ? "1" : undefined}
                          onClick={() => setCustomOpen(true)}
                        >
                          {t("s1OwnOpen")}
                        </button>
                      </div>
                    ) : (
                      <div className="amt__side">
                        <div
                          ref={wheelRef}
                          className="whl"
                          style={{ "--whl-sel": pos } as React.CSSProperties}
                          onPointerDown={onWheelDown}
                          onPointerMove={onWheelMove}
                          onPointerUp={onWheelUp}
                          onPointerCancel={onWheelUp}
                          onClick={onWheelClick}
                        >
                          {/* Читающая головка: бусина стоит НЕПОДВИЖНО у правого края, суммы
                              едут под ней. Она и говорит, что выбор определяется положением
                              диска, а не тем, куда последний раз попал палец. */}
                          <span className="whl__head" aria-hidden="true" />

                          <div
                            ref={hubRef}
                            className="whl__hub"
                            role="listbox"
                            aria-label={t("s1SelectAmount")}
                            onKeyDown={onWheelKey}
                          >
                            {wheelAmounts.map((w, i) => (
                              <button
                                key={w.amountKzt}
                                type="button"
                                role="option"
                                data-i={i}
                                className="whl__opt"
                                aria-selected={i === selIdx}
                                /* Метка из админки читается вместе с суммой, а не отдельным
                                   узлом после неё: «50 000 ₸, Хит». */
                                aria-label={w.label ? `${w.text}, ${w.label}` : undefined}
                                tabIndex={i === tabIdx ? 0 : -1}
                                style={{ "--whl-i": i } as React.CSSProperties}
                                onClick={() => {
                                  if (clickOffRef.current) { clickOffRef.current = false; return; }
                                  pickIndex(i);
                                  focusOpt(i);
                                }}
                              >
                                <span className="whl__num">
                                  {w.label && <small className="whl__tag">{w.label}</small>}
                                  {w.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Свободный ввод остаётся. Формально сумма и так ограничена списком
                            колеса, но это единственный путь для Voice Control и Switch
                            Control и единственный способ доехать до 200 000 одним действием,
                            а не семью нажатиями. */}
                        <button
                          type="button"
                          className="amt__own"
                          data-on={customOpen ? "1" : undefined}
                          onClick={() => setCustomOpen(true)}
                        >
                          {t("s1OwnOpen")}
                        </button>
                      </div>
                    )}

                    {/* Выбранная сумма крупно — главный элемент экрана, как в
                        референсе. На открытке слева на этом шаге суммы НЕТ:
                        одно число, одно место. key={price} перемонтирует узел, и
                        сумма проявляется заново на каждый выбор. */}
                    <p className="amt__big" key={price} aria-live="polite">
                      {price > 0 ? formatKzt(price) : "—"}
                    </p>
                  </div>

                  {customOpen && (
                    <div className="amt__ownbox">
                      <label className="bld__label" htmlFor="b-custom">
                        {t("s1OwnOpen")}
                      </label>
                      <input
                        id="b-custom"
                        type="number"
                        list="b-amounts"
                        min={bounds.min}
                        max={bounds.max}
                        step={500}
                        className="bld__input"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                      />
                      {/* Подсказка и датлист берут тот же список, что и колесо: раньше они
                          читали availableAmounts, который на этом шаге пуст, и молчали. */}
                      <datalist id="b-amounts">
                        {wheelAmounts.map((w) => (
                          <option key={w.amountKzt} value={w.amountKzt} />
                        ))}
                      </datalist>
                      <p className="bld__hint">
                        {t("s1OwnNote", {
                          min: formatKzt(bounds.min),
                          max: formatKzt(bounds.max),
                        })}
                      </p>
                      {customAmount && !customValid && (
                        <p className="mt-1.5 text-xs font-semibold text-brand-red">
                          {custom !== null && custom >= bounds.min && custom <= bounds.max
                            ? t("errAmountUnavailable")
                            : t("errAmount", {
                                min: formatKzt(bounds.min),
                                max: formatKzt(bounds.max),
                              })}
                        </p>
                      )}
                      {wheelAmounts.length > 0 && (
                        <p className="bld__hint">
                          {t("amountsHint", {
                            list: wheelAmounts.map((w) => w.text).join(", "),
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <a
                href={priceHref(locale as "ru" | "kk" | "en")}
                target="_blank"
                rel="noopener"
                className="bld__pricelink"
              >
                📄 {t("priceLink")}
              </a>
            </>
          )}

          {/* ШАГ 1: открытка. Дизайн выбирается ПЕРВЫМ — список открыток
              ни от филиала, ни от типа сертификата не зависит (проверено:
              getActiveDesigns без единого фильтра), поэтому спрашивать про
              город раньше, чем про подарок, незачем. */}
          {step === 0 && (
            <>
              <div className="bld__head">
                <h2 className="bld__title">{t("s2Title")}</h2>
                <p className="bld__lede">{t("s2Hint")}</p>
              </div>
              <BuilderDesigns
                designs={designs}
                value={designId}
                onChange={setDesignId}
              />
            </>
          )}

          {/* ШАГ 3: персонализация */}
          {step === 2 && (
            <>
              <div className="bld__head">
                <h2 className="bld__title">{t("s3Title")}</h2>
                <p className="bld__lede">{t("s3Hint")}</p>
              </div>

              <div className="fld">
                <div className="fld__pair">
                  <div>
                    <label className="bld__label" htmlFor="b-to">
                      {t("s3To")} <span className="text-brand-red">*</span>
                    </label>
                    <input
                      id="b-to"
                      className="bld__input"
                      maxLength={80}
                      required
                      value={toName}
                      onChange={(e) => setToName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="bld__label" htmlFor="b-from">
                      {t("s3From")} <span className="text-brand-red">*</span>
                    </label>
                    <input
                      id="b-from"
                      className="bld__input"
                      maxLength={80}
                      required
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="bld__label" htmlFor="b-msg">
                    {t("s3Message")}
                  </label>
                  <textarea
                    id="b-msg"
                    className="bld__input bld__input--area"
                    maxLength={120}
                    placeholder={t("s3MessagePh")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <p className="fld__count">{message.length}/120</p>
                </div>
              </div>
            </>
          )}

          {/* ШАГ 4: доставка */}
          {step === 3 && (
            <>
              <div className="bld__head">
                <h2 className="bld__title">{t("s4Title")}</h2>
                <p className="bld__lede">{t("s4Hint")}</p>
              </div>

              {/* ── Город и филиал ──────────────────────────────────────
                  Филиал спрашивается здесь, а не на шаге суммы: набор сумм у
                  продаваемых филиалов одинаковый (проверено выгрузкой
                  каталога), поэтому выбирать город раньше подарка незачем —
                  а шаг подарка от этого получал полэкрана анкеты. Если у
                  программы задан список городов, здесь остаются только те
                  филиалы, где она есть: выбор, сделанный раньше, сужает
                  предложенное позже, а не наоборот. */}
              <p className="bld__sect">{t("s1City")}</p>
              <div className="pil">
                {cities.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="pil__it"
                    data-on={selectedSalon?.cityKey === key ? "1" : undefined}
                    onClick={() => {
                      const cityFirst = salonsForChoice.find(
                        (x) => x.cityKey === key,
                      );
                      setSalonId(cityFirst?.id ?? null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectedSalon && (
                <>
                  <p className="bld__sect">{t("s1Salon")}</p>
                  <div className="brc">
                    {salonsForChoice
                      .filter((x) => x.cityKey === selectedSalon.cityKey)
                      .map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="brc__it"
                          data-on={x.id === salonId ? "1" : undefined}
                          onClick={() => setSalonId(x.id)}
                        >
                          <span className="brc__name">{x.name}</span>
                          <span className="brc__addr">{x.address}</span>
                        </button>
                      ))}
                  </div>
                </>
              )}

              <p className="bld__sect">{t("s4When")}</p>
              <div className="pil">
                <button
                  type="button"
                  className="pil__it"
                  data-on={when === "now" ? "1" : undefined}
                  onClick={() => setWhen("now")}
                >
                  {t("s4Now")}
                </button>
                <button
                  type="button"
                  className="pil__it"
                  data-on={when === "scheduled" ? "1" : undefined}
                  onClick={() => setWhen("scheduled")}
                >
                  {t("s4Scheduled")}
                </button>
              </div>

              <div className="fld">
                {when === "scheduled" && (
                  <div>
                    <label className="bld__label" htmlFor="b-when">
                      {t("s4DateTime")}
                    </label>
                    <input
                      id="b-when"
                      type="datetime-local"
                      className="bld__input"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                    <p className="bld__hint">{t("s4TimeZone")}</p>
                  </div>
                )}
                <div>
                  <label className="bld__label" htmlFor="b-buyer">
                    {t("s4BuyerEmail")} <span className="text-brand-red">*</span>
                  </label>
                  <input
                    id="b-buyer"
                    type="email"
                    placeholder="name@mail.kz"
                    className="bld__input"
                    required
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                  />
                  <p className="bld__hint">{t("s4BuyerNote")}</p>
                </div>
                <div>
                  <label className="bld__label" htmlFor="b-contact">
                    {t("s4ContactEmail")}{" "}
                    <span className="bld__opt">{t("s4Optional")}</span>
                  </label>
                  <input
                    id="b-contact"
                    type="email"
                    placeholder="name@mail.kz"
                    className="bld__input"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                  <p className="bld__hint">{t("s4ContactNote")}</p>
                </div>
              </div>
            </>
          )}

          {/* ШАГ 5: оплата */}
          {step === 4 && (
            <>
              <div className="bld__head">
                <h2 className="bld__title">{t("s5Title")}</h2>
              </div>

              {/* Сводка стоит перед способом оплаты, а не сбоку: это
                  последнее место, где ещё можно заметить чужой филиал или не
                  ту сумму. */}
              <dl className="sum">
                <div className="sum__row">
                  <dt className="sum__k">
                    {type === "program" ? t("sumTypeProgram") : t("sumTypeNominal")}
                  </dt>
                  <dd>
                    {type === "program"
                      ? (program?.name ?? "—")
                      : price > 0
                        ? formatKzt(price)
                        : "—"}
                  </dd>
                </div>
                <div className="sum__row">
                  <dt className="sum__k">{t("sumSalon")}</dt>
                  <dd>
                    {selectedSalon
                      ? `${selectedSalon.city}, ${selectedSalon.address}`
                      : "—"}
                  </dd>
                </div>
                <div className="sum__row">
                  <dt className="sum__k">{t("sumDesign")}</dt>
                  <dd>{design.name}</dd>
                </div>
                <div className="sum__row">
                  <dt className="sum__k">{t("sumDelivery")}</dt>
                  <dd>{buyerEmail.trim() || t("s4Email")}</dd>
                </div>
                {promoValid && (
                  <div className="sum__row sum__row--promo">
                    <dt>{t("sumPromo", { code: promoApplied.code })}</dt>
                    <dd>−{formatKzt(promoApplied.discountKzt)}</dd>
                  </div>
                )}
                <div className="sum__row sum__row--total">
                  <dt>{t("sumTotal")}</dt>
                  <dd>{price > 0 ? formatKzt(total) : "—"}</dd>
                </div>
                <p className="sum__note">{t("validity")}</p>
              </dl>

              <p className="bld__sect">{t("s5How")}</p>
              <div className="pay">
                <button
                  type="button"
                  className="pay__it"
                  data-on={provider === "kaspi" ? "1" : undefined}
                  onClick={() => setProvider("kaspi")}
                >
                  <span className="pay__mark pay__mark--kaspi">Kaspi.kz</span>
                  <span className="pay__note">{t("s5KaspiSub")}</span>
                </button>
                {cardEnabled && (
                  <button
                    type="button"
                    className="pay__it"
                    data-on={provider === "forte" ? "1" : undefined}
                    onClick={() => setProvider("forte")}
                  >
                    <span className="pay__mark">{t("s5Card")}</span>
                    <span className="pay__note">{t("s5CardSub")}</span>
                  </button>
                )}
                {/* Демо-оплата: видна только вошедшему администратору, сервер
                    проверяет это ещё раз. Нужна, чтобы пройти покупку целиком,
                    пока настоящая оплата не подключена. */}
                {demoEnabled && (
                  <button
                    type="button"
                    className="pay__it"
                    data-on={provider === "mock" ? "1" : undefined}
                    onClick={() => setProvider("mock")}
                  >
                    <span className="pay__mark pay__mark--demo">Демо-оплата</span>
                    <span className="pay__note">
                      без списания денег · видно только вам
                    </span>
                  </button>
                )}
              </div>

              {/* Промокод */}
              <div className="bld__promo">
                {promoValid ? (
                  <div className="bld__promook">
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
                  <>
                    <label className="bld__label" htmlFor="b-promo">
                      {t("promoLabel")}
                    </label>
                    <div className="bld__promorow">
                      <input
                        id="b-promo"
                        className="bld__input"
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
                        className="bld__btn bld__btn--ghost"
                      >
                        {promoChecking ? "…" : t("promoApply")}
                      </button>
                    </div>
                  </>
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
            <label className="bld__consent">
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

          <div className="bld__actions">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              className={`bld__btn bld__btn--ghost${step === 0 ? " bld__btn--hidden" : ""}`}
            >
              {tCommon("back")}
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                className="bld__btn bld__btn--go"
              >
                {tCommon("next")} →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !payAgreed}
                onClick={submit}
                className="bld__btn bld__btn--pay"
              >
                {t("s5Pay", { price: formatKzt(total) })}
              </button>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
