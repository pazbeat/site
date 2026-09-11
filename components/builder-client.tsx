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
 * Меньше восьми сумм на круге не читаются как циферблат: несколько строк
 * висят у края, а остальной круг пуст. Такой набор (филиал без маппинга в
 * CRM отдаёт только карточные номиналы из админки) показывается рядом
 * кнопок справа, вместе со «своей суммой».
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
  /** Поле поздравления раскрывается строкой «добавить поздравление +». */
  const [msgOpen, setMsgOpen] = useState(false);
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

  // Смена шага: если начало сцены ушло выше экрана (нажали «Далее» внизу
  // длинной формы доставки), подтягиваем его, иначе следующий шаг
  // открывается с середины. Внутри шага положение не трогаем: прыжки
  // страницы при выборе открытки как раз и были жалобой.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    el.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [step]);

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
   * ещё не сошлась. Подменять −1 нулём нельзя — круг подсветил бы 18 000 и
   * объявил бы его выбранным скринридеру в тот момент, когда покупатель
   * набирает другое. Пусть лучше не выбрано ничего.
   */
  const selIdx = wheelAmounts.findIndex((w) => w.amountKzt === price);
  /**
   * Куда повёрнут круг. Когда выбранной суммы в списке нет (покупатель как
   * раз набирает свою), круг показывает БЛИЖАЙШУЮ — иначе он прыгал бы на
   * начало списка. Выбранным при этом не помечается ничего: aria-selected
   * смотрит на selIdx.
   *
   * Скобки вокруг `?? 0` обязательны: без них `a ?? 0 - price` читается как
   * `a ?? (0 - price)`, и «ближайшей» оказывалась просто самая маленькая
   * сумма списка.
   */
  const pos =
    selIdx >= 0
      ? selIdx
      : wheelAmounts.reduce(
          (best, w, i) =>
            Math.abs(w.amountKzt - price) <
            Math.abs((wheelAmounts[best]?.amountKzt ?? 0) - price)
              ? i
              : best,
          0,
        );

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

  /**
   * Циферблат шага «Подарок»: суммы или программы по краю круга. Один и тот
   * же механизм на оба случая — сетка из двадцати одной карточки программ,
   * которая стояла здесь раньше, была отдельным экраном со своим языком и
   * выбиралась наугад.
   */
  const dialItems: { key: number; text: string; tag: string | null; aria: string }[] =
    type === "nominal"
      ? wheelAmounts.map((w) => ({
          key: w.amountKzt,
          text: w.text,
          tag: w.label,
          // Метка из админки читается вместе с суммой: «50 000 ₸, Хит».
          aria: w.label ? `${w.text}, ${w.label}` : w.text,
        }))
      : availablePrograms.map((p) => ({
          key: p.id,
          text: p.name,
          tag: null,
          aria: p.name,
        }));
  /** Меньше восьми сумм в круг не складываются — там ряд кнопок. */
  const showDial =
    type === "program" ? dialItems.length > 0 : dialItems.length >= WHEEL_MIN;
  /** Выбранное — или −1, если в списке его нет (см. selIdx). */
  const dialSelected =
    type === "nominal"
      ? selIdx
      : availablePrograms.findIndex((p) => p.id === programId);
  /** Куда повёрнут круг: к выбранному, а без выбора — к ближайшему. */
  const dialSel = type === "nominal" ? pos : Math.max(0, dialSelected);

  const dialRef = useRef<HTMLDivElement>(null);

  const pickDial = (i: number) => {
    const el = dialRef.current;
    if (el) {
      // Длительность — от ПУТИ: соседняя позиция доезжает за четверть
      // секунды, край списка — за семь десятых. Одна длительность на обе
      // роли не годится: долгий ход на соседнюю читается как залипшая
      // кнопка, короткий через весь круг — как рывок.
      const d = Math.abs(i - dialSel);
      el.style.setProperty(
        "--dial-dur",
        `${Math.min(0.7, 0.24 + 0.08 * Math.sqrt(d)).toFixed(2)}s`,
      );
    }
    if (type === "nominal") {
      const w = wheelAmounts[i];
      if (w) pickAmount(w.amountKzt);
      return;
    }
    const p = availablePrograms[i];
    if (!p) return;
    setProgramId(p.id);
    setOptionId(p.options[0]?.id ?? null);
  };

  /** preventScroll обязателен: фокус ставится ДО того, как круг довернётся,
   *  то есть на строку, которая ещё стоит в стороне, и браузер подтянул бы к
   *  ней страницу. */
  const goDial = (i: number) => {
    const j = Math.min(dialItems.length - 1, Math.max(0, i));
    pickDial(j);
    dialRef.current
      ?.querySelector<HTMLElement>(`[data-i="${j}"]`)
      ?.focus({ preventScroll: true });
  };

  const onDialKey = (e: React.KeyboardEvent) => {
    const jump: Record<string, number> = {
      ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1,
      PageUp: -5, PageDown: 5,
    };
    if (e.key in jump) {
      e.preventDefault(); // иначе стрелки заодно прокрутят страницу
      goDial(dialSel + jump[e.key]);
      return;
    }
    if (e.key === "Home") { e.preventDefault(); goDial(0); return; }
    if (e.key === "End") { e.preventDefault(); goDial(dialItems.length - 1); }
  };

  /**
   * Смена «сумма ↔ программа». Программа сразу предвыбирается: на круге
   * всегда что-то стоит под бусиной, и пустое «ничего не выбрано» рядом с
   * подсвеченной строкой читалось бы как поломка. Первой берётся программа
   * с меткой из админки («Хит»), без неё — первая в списке.
   */
  const switchType = (next: "program" | "nominal") => {
    setType(next);
    if (next === "program" && programId == null) {
      const first =
        availablePrograms.find((p) => p.highlight === "hit") ??
        availablePrograms[0];
      if (first) {
        setProgramId(first.id);
        setOptionId(first.options[0]?.id ?? null);
      }
    }
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
          switchType(picked);
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

      {/* ── Сцена конструктора — по устройству подарочных карт Золотого
          Яблока (три снимка заказчика). Вся композиция держится на одном
          большом круге: открытка лежит на нём, суммы и программы идут по его
          краю циферблатом, поля ввода стоят справа. Слева — крупный номер
          шага и путь столбиком, справа внизу — круглая «Далее».
          Прежний каркас (полоса сегментов сверху, открытка в колонке, дуга
          сумм сама по себе) ни к чему не привязывал части друг к другу и
          поэтому читался набором блоков, а не одной вещью. */}
      <div ref={stageRef} className="stg" data-step={step} data-kind={type}>
        <nav className="stg__rail" aria-label={t("eyebrow")}>
          {/* key: номер перемонтируется и въезжает заново на каждом шаге */}
          <p className="stg__num" key={step} aria-hidden="true">
            {String(step + 1).padStart(2, "0")}
          </p>
          <div className="stg__path">
            <p className="stg__cur" aria-hidden="true">
              {stepTitles[step]}
            </p>
            {/* Пройденные шаги кликабельны — вернуться можно прямо отсюда,
                как у референса. Вперёд — только кнопкой «Далее»: там
                проверяются обязательные поля. */}
            <ol
              className="stg__steps"
              style={{ "--at": step } as React.CSSProperties}
            >
              {stepTitles.map((title, index) => (
                <li
                  key={title}
                  className="stg__step"
                  data-state={
                    index === step ? "on" : index < step ? "done" : "next"
                  }
                >
                  <button
                    type="button"
                    disabled={index >= step}
                    aria-current={index === step ? "step" : undefined}
                    onClick={() => {
                      setError("");
                      setStep(index as Step);
                    }}
                  >
                    {index + 1}. {title}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="stg__main">
          <h2 className="stg__title" key={`t${step}${type}`}>
            {step === 0
              ? t("s2Title")
              : step === 1
                ? type === "nominal"
                  ? t("s1TitleNominal")
                  : t("s1TitleProgram")
                : step === 2
                  ? t("s3Title")
                  : step === 3
                    ? t("s4Title")
                    : t("s5Title")}
          </h2>

          {/* ── Визуал: круг, открытка, циферблат ─────────────────────── */}
          <div className="stg__visual">
            <div className="stg__orb">
              {/* Круг и открытка — одни и те же узлы на шагах 2–5: при
                  переходе они не появляются заново, а переезжают на новое
                  место, и путь читается одним движением. */}
              <span className="stg__circle" aria-hidden="true" />

              {step === 0 ? (
                <BuilderDesigns
                  designs={designs}
                  value={designId}
                  onChange={setDesignId}
                />
              ) : (
                <div className="stg__card">
                  {design.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна
                    <img src={design.imageUrl} alt={design.name} />
                  )}
                  <span className="stg__edge" aria-hidden="true" />
                  {/* Подпись появляется с шага «Кому»: имя и поздравление
                      ложатся на открытку прямо при вводе. На шаге суммы
                      открытка чистая — сумма крупно справа, вторая копия
                      была бы дублем. */}
                  {step >= 2 && (
                    <div className="stg__panel">
                      <div className="stg__prow">
                        <span
                          className={`stg__ptitle${type === "nominal" ? " stg__ptitle--sum" : ""}`}
                        >
                          {previewTitle}
                        </span>
                        <span className="stg__pgift">{t("certGift")}</span>
                      </div>
                      {type === "program" && previewSubtitle && (
                        <span className="stg__psub">{previewSubtitle}</span>
                      )}
                      <div className="stg__prow stg__prow--end">
                        <span className="stg__pfor">
                          {toName && (
                            <span className="stg__pto">
                              {t("certFor", { name: toName })}
                            </span>
                          )}
                          {message && (
                            <em className="stg__pmsg">«{message}»</em>
                          )}
                        </span>
                        <span className="stg__pcode">WM••••</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Циферблат: суммы или программы по краю круга ─────────
                  Каждая строка стоит РАДИАЛЬНО — повёрнута от центра круга
                  наружу, как деление циферблата: вверху наклонена вверх, на
                  «трёх часах» горизонтальна, внизу почти вертикальна. Выбор
                  поворачивает весь круг, и выбранное встаёт на «три часа»
                  под золотую бусину. Так устроен экран номинала референса.
                  key={type}: при смене «сумма ↔ программа» круг
                  перемонтируется и раскрывается веером заново. */}
              {step === 1 && showDial && (
                <div
                  key={type}
                  ref={dialRef}
                  className="dial"
                  data-kind={type}
                  data-none={dialSelected < 0 ? "1" : undefined}
                  style={{ "--sel": dialSel } as React.CSSProperties}
                >
                  <span className="dial__head" aria-hidden="true" />
                  <div
                    className="dial__hub"
                    role="listbox"
                    aria-label={
                      type === "nominal"
                        ? t("s1SelectAmount")
                        : t("s1SelectProgram")
                    }
                    onKeyDown={onDialKey}
                  >
                    {dialItems.map((it, i) => (
                      <button
                        key={it.key}
                        type="button"
                        role="option"
                        className="dial__opt"
                        data-i={i}
                        aria-selected={i === dialSelected}
                        aria-label={it.aria}
                        tabIndex={
                          i === (dialSelected >= 0 ? dialSelected : 0) ? 0 : -1
                        }
                        style={{ "--i": i } as React.CSSProperties}
                        onClick={() => goDial(i)}
                      >
                        <span className="dial__txt">
                          {it.text}
                          {it.tag && <small className="dial__tag">{it.tag}</small>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Правая колонка: решение шага ──────────────────────────── */}
          {step > 0 && (
            <div key={step} className="stg__content">
              {step === 1 && (
                <>
                  {/* Выбранное крупно — главный элемент экрана. key на
                      значении: узел перемонтируется и проявляется заново на
                      каждый выбор. */}
                  {type === "nominal" ? (
                    <>
                      <p className="stg__big" key={price} aria-live="polite">
                        {price > 0 ? formatKzt(price) : "—"}
                      </p>
                      <p className="stg__lede">{t("s1LedeNominal")}</p>
                    </>
                  ) : (
                    <div
                      className="stg__prog"
                      key={programId ?? "none"}
                      aria-live="polite"
                    >
                      <p className="stg__progname">
                        {program?.name ?? t("s1SelectProgram")}
                      </p>
                      {program && option && (
                        <p className="stg__progprice">
                          {formatKzt(option.priceKzt)}
                        </p>
                      )}
                      {program?.description && (
                        <p className="stg__progdesc">{program.description}</p>
                      )}
                      {program && program.options.length > 1 && (
                        <div
                          className="seg"
                          role="radiogroup"
                          aria-label={t("s1SelectOption")}
                        >
                          {program.options.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              role="radio"
                              aria-checked={o.id === optionId}
                              className="seg__it"
                              onClick={() => setOptionId(o.id)}
                            >
                              {optionLabel(o, guests, hourUnit)}
                              <small>{formatKzt(o.priceKzt)}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Короткий набор сумм — ряд кнопок: меньше восьми значений
                      в круг не складываются. Филиалы без маппинга в CRM
                      реально сюда попадают, и терять на них выбор нельзя. */}
                  {type === "nominal" && !showDial && (
                    <div className="seg seg--gap">
                      {nominals.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className="seg__it"
                          aria-pressed={!customAmount && n.id === nominalId}
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
                    </div>
                  )}

                  <div className="stg__links">
                    {type === "nominal" && (
                      <button
                        type="button"
                        className="stg__link"
                        aria-expanded={customOpen}
                        onClick={() => setCustomOpen(!customOpen)}
                      >
                        {t("s1OwnOpen")}
                      </button>
                    )}
                    {/* Тип выбран на входном экране — здесь только тихая
                        возможность передумать, без второго большого вопроса. */}
                    <button
                      type="button"
                      className="stg__link"
                      onClick={() =>
                        switchType(type === "nominal" ? "program" : "nominal")
                      }
                    >
                      {type === "nominal" ? t("s1ToProgram") : t("s1ToNominal")}
                    </button>
                    {type === "program" && (
                      <a
                        href={priceHref(locale as "ru" | "kk" | "en")}
                        target="_blank"
                        rel="noopener"
                        className="stg__link"
                      >
                        {t("priceLink")}
                      </a>
                    )}
                  </div>

                  {/* Свободный ввод остаётся: это единственный путь для Voice
                      Control и Switch Control и способ доехать до 200 000
                      одним действием. Датлист берёт тот же список, что круг. */}
                  {customOpen && type === "nominal" && (
                    <div className="fld fld--own">
                      <div className="fld__it">
                        <label className="fld__label" htmlFor="b-custom">
                          {t("s1OwnOpen")}
                        </label>
                        <input
                          id="b-custom"
                          type="number"
                          inputMode="numeric"
                          list="b-amounts"
                          min={bounds.min}
                          max={bounds.max}
                          step={500}
                          className="fld__input"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                        />
                        <datalist id="b-amounts">
                          {wheelAmounts.map((w) => (
                            <option key={w.amountKzt} value={w.amountKzt} />
                          ))}
                        </datalist>
                        {customAmount && !customValid ? (
                          <p className="fld__err">
                            {custom !== null &&
                            custom >= bounds.min &&
                            custom <= bounds.max
                              ? t("errAmountUnavailable")
                              : t("errAmount", {
                                  min: formatKzt(bounds.min),
                                  max: formatKzt(bounds.max),
                                })}
                          </p>
                        ) : (
                          <p className="fld__hint">
                            {t("s1OwnNote", {
                              min: formatKzt(bounds.min),
                              max: formatKzt(bounds.max),
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Кому ─────────────────────────────────────────────── */}
              {step === 2 && (
                <div className="fld">
                  <div className="fld__it">
                    <label className="fld__label" htmlFor="b-to">
                      {t("s3To")} <span className="fld__req">*</span>
                    </label>
                    <input
                      id="b-to"
                      className="fld__input"
                      maxLength={80}
                      required
                      autoComplete="off"
                      value={toName}
                      onChange={(e) => setToName(e.target.value)}
                    />
                  </div>
                  <div className="fld__it">
                    <label className="fld__label" htmlFor="b-from">
                      {t("s3From")} <span className="fld__req">*</span>
                    </label>
                    <input
                      id="b-from"
                      className="fld__input"
                      maxLength={80}
                      required
                      autoComplete="name"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                    />
                  </div>
                  {/* Поздравление раскрывается по требованию — строкой
                      «добавить поздравление +», как у референса:
                      необязательное поле не должно занимать экран с первого
                      взгляда. Уже написанное остаётся раскрытым. */}
                  {msgOpen || message ? (
                    <div className="fld__it">
                      <label className="fld__label" htmlFor="b-msg">
                        {t("s3Message")}
                      </label>
                      <textarea
                        id="b-msg"
                        className="fld__input fld__input--area"
                        maxLength={120}
                        placeholder={t("s3MessagePh")}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                      <p className="fld__hint fld__hint--end">
                        {message.length}/120
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="fld__add"
                      onClick={() => setMsgOpen(true)}
                    >
                      {t("s3AddMessage")}
                      <span aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
              )}

              {/* ── Куда отправить: город, филиал, почта ─────────────── */}
              {step === 3 && (
                <div className="fld">
                  {/* Филиал спрашивается здесь, а не на шаге суммы: набор
                      сумм у продаваемых филиалов одинаковый (сверено
                      выгрузкой каталога). Если у программы задан список
                      городов, остаются только филиалы, где она есть. */}
                  <div className="fld__it">
                    <span className="fld__label" id="b-city">
                      {t("s1City")}
                    </span>
                    <div className="seg" role="radiogroup" aria-labelledby="b-city">
                      {cities.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={selectedSalon?.cityKey === key}
                          className="seg__it"
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
                  </div>

                  {selectedSalon && (
                    <div className="fld__it">
                      <span className="fld__label" id="b-salon">
                        {t("s1Salon")}
                      </span>
                      <div className="opt" role="radiogroup" aria-labelledby="b-salon">
                        {salonsForChoice
                          .filter((x) => x.cityKey === selectedSalon.cityKey)
                          .map((x) => (
                            <button
                              key={x.id}
                              type="button"
                              role="radio"
                              aria-checked={x.id === salonId}
                              className="opt__it"
                              onClick={() => setSalonId(x.id)}
                            >
                              <span className="opt__name">{x.name}</span>
                              <span className="opt__sub">{x.address}</span>
                            </button>
                          ))}
                      </div>
                      <p className="fld__hint">{t("s4Hint")}</p>
                    </div>
                  )}

                  <div className="fld__it">
                    <span className="fld__label" id="b-whenlbl">
                      {t("s4When")}
                    </span>
                    <div className="seg" role="radiogroup" aria-labelledby="b-whenlbl">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={when === "now"}
                        className="seg__it"
                        onClick={() => setWhen("now")}
                      >
                        {t("s4Now")}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={when === "scheduled"}
                        className="seg__it"
                        onClick={() => setWhen("scheduled")}
                      >
                        {t("s4Scheduled")}
                      </button>
                    </div>
                  </div>

                  {when === "scheduled" && (
                    <div className="fld__it">
                      <label className="fld__label" htmlFor="b-when">
                        {t("s4DateTime")}
                      </label>
                      <input
                        id="b-when"
                        type="datetime-local"
                        className="fld__input"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                      />
                      <p className="fld__hint">{t("s4TimeZone")}</p>
                    </div>
                  )}

                  <div className="fld__it">
                    <label className="fld__label" htmlFor="b-buyer">
                      {t("s4BuyerEmail")} <span className="fld__req">*</span>
                    </label>
                    <input
                      id="b-buyer"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@mail.kz"
                      className="fld__input"
                      required
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                    />
                    <p className="fld__hint">{t("s4BuyerNote")}</p>
                  </div>

                  <div className="fld__it">
                    <label className="fld__label" htmlFor="b-contact">
                      {t("s4ContactEmail")}{" "}
                      <span className="fld__opt">{t("s4Optional")}</span>
                    </label>
                    <input
                      id="b-contact"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      placeholder="name@mail.kz"
                      className="fld__input"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                    />
                    <p className="fld__hint">{t("s4ContactNote")}</p>
                  </div>
                </div>
              )}

              {/* ── Оплата ───────────────────────────────────────────── */}
              {step === 4 && (
                <div className="fld">
                  {/* Сводка перед способом оплаты: последнее место, где ещё
                      можно заметить чужой филиал или не ту сумму. */}
                  <div>
                    <dl className="sum">
                      <div className="sum__row">
                        <dt>
                          {type === "program"
                            ? t("sumTypeProgram")
                            : t("sumTypeNominal")}
                        </dt>
                        <dd>
                          {type === "program"
                            ? [program?.name, previewSubtitle]
                                .filter(Boolean)
                                .join(" · ") || "—"
                            : price > 0
                              ? formatKzt(price)
                              : "—"}
                        </dd>
                      </div>
                      <div className="sum__row">
                        <dt>{t("sumSalon")}</dt>
                        <dd>
                          {selectedSalon
                            ? `${selectedSalon.city}, ${selectedSalon.address}`
                            : "—"}
                        </dd>
                      </div>
                      <div className="sum__row">
                        <dt>{t("sumDesign")}</dt>
                        <dd>{design.name}</dd>
                      </div>
                      <div className="sum__row">
                        <dt>{t("sumDelivery")}</dt>
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
                    </dl>
                    <p className="fld__hint">{t("validity")}</p>
                  </div>

                  <div className="fld__it">
                    <span className="fld__label" id="b-how">
                      {t("s5How")}
                    </span>
                    <div className="seg" role="radiogroup" aria-labelledby="b-how">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={provider === "kaspi"}
                        className="seg__it seg__it--tall"
                        onClick={() => setProvider("kaspi")}
                      >
                        <span className="seg__mark seg__mark--kaspi">Kaspi.kz</span>
                        <small>{t("s5KaspiSub")}</small>
                      </button>
                      {cardEnabled && (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={provider === "forte"}
                          className="seg__it seg__it--tall"
                          onClick={() => setProvider("forte")}
                        >
                          <span className="seg__mark">{t("s5Card")}</span>
                          <small>{t("s5CardSub")}</small>
                        </button>
                      )}
                      {/* Демо-оплата: видна только вошедшему администратору,
                          сервер проверяет это ещё раз. Нужна, чтобы пройти
                          покупку целиком без списания денег. */}
                      {demoEnabled && (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={provider === "mock"}
                          className="seg__it seg__it--tall"
                          onClick={() => setProvider("mock")}
                        >
                          <span className="seg__mark seg__mark--demo">
                            Демо-оплата
                          </span>
                          <small>без списания денег · видно только вам</small>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="fld__it">
                    {promoValid ? (
                      <div className="promo promo--ok">
                        <span className="promo__code">{promoApplied.code}</span>
                        <span className="promo__txt">
                          {t("promoApplied", {
                            amount: formatKzt(promoApplied.discountKzt),
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={clearPromo}
                          className="promo__rm"
                        >
                          {t("promoRemove")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <label className="fld__label" htmlFor="b-promo">
                          {t("promoLabel")}
                        </label>
                        <div className="promo">
                          <input
                            id="b-promo"
                            className="fld__input"
                            placeholder={t("promoPlaceholder")}
                            value={promoInput}
                            maxLength={40}
                            autoCapitalize="characters"
                            autoComplete="off"
                            onChange={(e) => {
                              setPromoInput(e.target.value);
                              setPromoError("");
                            }}
                          />
                          <button
                            type="button"
                            onClick={applyPromo}
                            disabled={promoChecking || !promoInput.trim()}
                            className="promo__apply"
                          >
                            {promoChecking ? "…" : t("promoApply")}
                          </button>
                        </div>
                      </>
                    )}
                    {promoError && <p className="fld__err">{promoError}</p>}
                  </div>

                  <label className="agree">
                    <input
                      type="checkbox"
                      checked={payAgreed}
                      onChange={(e) => {
                        if (e.target.checked) {
                          consentAtRef.current.payment = new Date().toISOString();
                        }
                        setPayAgreed(e.target.checked);
                      }}
                    />
                    <span>
                      {t.rich("s5Agree", {
                        rules: (chunks) => (
                          <Link
                            href="/legal/rules"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunks}
                          </Link>
                        ),
                        offer: (chunks) => (
                          <Link
                            href="/legal/offer"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunks}
                          </Link>
                        ),
                        privacy: (chunks) => (
                          <Link
                            href="/legal/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunks}
                          </Link>
                        ),
                        payment: (chunks) => (
                          <Link
                            href="/legal/payment_info"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ── Кнопки: круглая «Далее» справа внизу ────────────────────── */}
          <div className="stg__nav">
            {error && (
              <p className="stg__err" role="alert">
                {error}
              </p>
            )}
            {step > 0 && (
              <button
                type="button"
                className="stg__back"
                onClick={() => {
                  setError("");
                  setStep((s) => Math.max(0, s - 1) as Step);
                }}
              >
                ← {tCommon("back")}
              </button>
            )}
            {step < 4 ? (
              <button type="button" onClick={next} className="stg__go">
                <span>{tCommon("next")}</span>
                <span className="stg__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !payAgreed}
                onClick={submit}
                className="stg__go stg__go--pay"
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
