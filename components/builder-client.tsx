"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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
  /**
   * Вариант программы → филиалы, где под него есть товар в Altegio. Варианты
   * без товара ни в одном филиале сюда не попадают — они сняты с витрины ещё
   * на сервере. На шаге доставки список филиалов сужается по выбранному
   * варианту: иначе оплата упиралась бы в отказ.
   */
  optionSalons: Record<number, number[]>;
  /** Вариант программы для примера на входном экране. */
  sampleOptionId?: number;
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
/* v3: сумма и программа больше не предвыбираются, а в черновиках v2 лежит
   номинал, подставленный по умолчанию, — восстановление выбрало бы за
   покупателя то, чего он не нажимал. Старый ключ стирается при входе. */
const DRAFT_KEY = "imbir-builder-draft-v3";
const DRAFT_KEY_OLD = "imbir-builder-draft-v2";

/**
 * Меньше восьми сумм на круге не читаются как циферблат: несколько строк
 * висят у края, а остальной круг пуст. Такой набор (филиалы без привязки к
 * CRM — остаются только номиналы из админки) показывается рядом кнопок.
 */
const WHEEL_MIN = 8;


/** Снимок конструктора для сохранения черновика в localStorage. */
type Draft = {
  step: Step;
  salonId: number | null;
  type: "program" | "nominal";
  programId: number | null;
  optionId: number | null;
  /** Выбранная сумма из списка витрины; null — не выбрана. */
  amountKzt: number | null;
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
    d.amountKzt != null ||
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
  optionSalons,
  sampleOptionId,
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

  /**
   * Сумма продаётся в филиале: есть в его списке витрины, а у филиала без
   * привязки к CRM (ключ есть, список пуст) — совпадает с номиналом из
   * админки, так решает сервер. Филиала нет в списке вовсе — он закрыт или
   * снят с продажи: там не продаётся ничего.
   */
  const amountSoldAt = (salon: number, amount: number) => {
    const list = amountsBySalon[salon];
    if (list === undefined) return false;
    return list.length > 0
      ? list.includes(amount)
      : nominals.some((n) => n.amountKzt === amount);
  };
  /** Филиал ещё продаётся и продаёт выбранное — черновик и письмо о брошенном
   *  заказе могли пролежать дольше, чем филиал или товар. */
  const salonSells = (
    salon: number | null,
    kind: "program" | "nominal",
    optId: number | null,
    amount: number | null,
  ) =>
    salon != null &&
    salons.some((s) => s.id === salon) &&
    (kind === "program"
      ? optId != null && (optionSalons[optId] ?? []).includes(salon)
      : amount != null && amountSoldAt(salon, amount));

  // --- предвыбор из query ---
  const initialProgram = initialOptionId
    ? programs.find((p) => p.options.some((o) => o.id === initialOptionId))
    : undefined;

  // Дожим (resume) имеет приоритет над query-предвыбором; заполненный заказ
  // открываем сразу на шаге оплаты — покупателю остаётся один клик. Но только
  // если его выбор всё ещё есть на витрине: сумму могли снять, вариант —
  // лишиться товара в CRM. Тогда — на шаг выбора, а не к оплате пустого.
  const resumeSelectionOk = resume
    ? resume.type === "program"
      ? programs.some((p) => p.options.some((o) => o.id === resume.optionId))
      : resume.amountKzt != null &&
        (allAmounts.length > 0
          ? allAmounts.includes(resume.amountKzt)
          : nominals.some((n) => n.amountKzt === resume.amountKzt))
    : false;
  const resumeSalonOk = resume
    ? salonSells(resume.salonId, resume.type, resume.optionId, resume.amountKzt)
    : false;
  // Филиал письма закрыт или не продаёт выбранное — на шаг доставки, а не к
  // оплате: иначе каждый повтор упирался бы в отказ сервера.
  const [step, setStep] = useState<Step>(
    resume ? (resumeSelectionOk ? (resumeSalonOk ? 4 : 3) : 1) : 0,
  );
  const [salonId, setSalonId] = useState<number | null>(
    resume && resumeSalonOk ? resume.salonId : null,
  );
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
    resume?.optionId ?? (initialProgram ? initialOptionId : undefined) ?? null,
  );
  /**
   * Сумма подарка. По умолчанию НЕ выбрана — решение заказчика 2026-09-11:
   * «клиент сам должен ткнуть». Раньше подставлялся первый номинал из
   * админки, и человек, не глядя, уходил дальше с суммой, которую не
   * выбирал. Предвыбор остаётся только там, где выбор уже сделан самим
   * покупателем: письмо о брошенном заказе и ссылка с конкретным номиналом.
   */
  const [amountKzt, setAmountKzt] = useState<number | null>(
    resume?.amountKzt ??
      nominals.find((n) => n.id === initialNominalId)?.amountKzt ??
      null,
  );
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
  /** Направление перехода: «Далее» вводит шаг справа, «Назад» — слева. */
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  /** Откуда въезжает выбранная сумма/программа справа от круга. */
  const [pickDir, setPickDir] = useState<"up" | "down">("up");
  /** Счётчик неудачных «Далее»: чётность перезапускает покачивание кнопки. */
  const [shake, setShake] = useState(0);
  /** Счётчик выборов на круге: чётность перезапускает отклик открытки и
   *  солнца на каждый шаг — тот же приём, что у покачивания «Далее». */
  const [tick, setTick] = useState(0);
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

  /** Выбор из черновика ещё есть на витрине? Сумму могли снять с продажи,
   *  вариант — лишиться товара в CRM, пока черновик лежал. */
  const draftSelectionOk = (d: Draft) =>
    d.type === "program"
      ? programs.some(
          (p) => p.id === d.programId && p.options.some((o) => o.id === d.optionId),
        )
      : d.amountKzt != null &&
        (allAmounts.length > 0
          ? allAmounts.includes(d.amountKzt)
          : nominals.some((n) => n.amountKzt === d.amountKzt));

  const applyDraft = (d: Draft) => {
    const ok = draftSelectionOk(d);
    const salonOk = ok && salonSells(d.salonId, d.type, d.optionId, d.amountKzt);
    // Устаревший выбор не восстанавливаем, а возвращаем на шаг выбора; филиал,
    // который закрылся или не продаёт выбранное, — на шаг доставки. Иначе
    // черновик довёл бы до оплаты того, чего больше нет.
    setStep(
      !ok
        ? (Math.min(d.step, 1) as Step)
        : salonOk
          ? d.step
          : (Math.min(d.step, 3) as Step),
    );
    setSalonId(salonOk ? d.salonId : null);
    setType(d.type);
    setProgramId(ok && d.type === "program" ? d.programId : null);
    setOptionId(ok && d.type === "program" ? d.optionId : null);
    setAmountKzt(ok && d.type === "nominal" ? d.amountKzt : null);
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
    try {
      localStorage.removeItem(DRAFT_KEY_OLD);
    } catch {
      // приватный режим — нечего стирать
    }
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
      amountKzt,
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
    amountKzt,
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

  /**
   * Филиалы, где выбранное действительно продаётся. У программы может быть
   * задан список городов, а вариант — иметь товар в Altegio не везде;
   * предлагать такой филиал нельзя — покупатель оплатил бы то, чего там не
   * выпустить. Для суммы то же по списку витрины филиала.
   *
   * Программа берётся из ПОЛНОГО списка, а не из отфильтрованного филиалом:
   * иначе получилось бы кольцо — филиал сужает программы, программы сужают
   * филиалы, и первый же выбор обнулял бы сам себя.
   */
  const salonsForChoice = salons.filter((s) => {
    if (type === "program") {
      const chosen = programs.find((p) => p.id === programId) ?? null;
      if (chosen && chosen.cities.length > 0 && !chosen.cities.includes(s.cityKey)) {
        return false;
      }
      return optionId == null || (optionSalons[optionId] ?? []).includes(s.id);
    }
    return amountKzt == null || amountSoldAt(s.id, amountKzt);
  });

  const cities = [
    ...new Map(salonsForChoice.map((s) => [s.cityKey, s.city])).entries(),
  ];
  /** Выбранный филиал, если он всё ещё подходит к выбранному; иначе шаг
   *  доставки просит выбрать заново, а не показывает пустую группу. */
  const choiceSalon = salonsForChoice.find((s) => s.id === salonId) ?? null;

  const design = designs.find((d) => d.id === designId) ?? designs[0];

  /**
   * Круг несёт список витрины сети, а не четыре карточки из админки.
   * Свободного ввода суммы нет ни в Altegio (под каждую сумму свой товар), ни
   * на витрине (решение заказчика 2026-09-11) — покупатель выбирает только из
   * этого списка, и сервер принимает только его.
   *
   * Источник — allAmounts (объединение по сети), а НЕ список филиала: филиал
   * спрашивается на шаге доставки, здесь его ещё нет.
   */
  const wheelAmounts = ((): { amountKzt: number; label: string | null; text: string }[] => {
    const byAmount = new Map(nominals.map((n) => [n.amountKzt, n] as const));
    const source =
      allAmounts.length > 0 ? allAmounts : nominals.map((n) => n.amountKzt);
    return [...new Set(source)]
      .filter((a) => a >= bounds.min && a <= bounds.max)
      .sort((a, b) => a - b)
      .map((a) => ({
        amountKzt: a,
        label: byAmount.get(a)?.label ?? null,
        text: formatKzt(a),
      }));
  })();

  /** Индекс выбранной суммы на круге; −1 — не выбрана (или устарела). */
  const selIdx =
    amountKzt == null ? -1 : wheelAmounts.findIndex((w) => w.amountKzt === amountKzt);

  // Отображаемая цена; источник истины — сервер (пересчёт в /api/orders)
  const price =
    type === "program"
      ? (option?.priceKzt ?? 0)
      : selIdx >= 0
        ? wheelAmounts[selIdx].amountKzt
        : 0;

  /** Сумма продаётся в выбранном филиале — проверка шага доставки. */
  const amountSellableHere =
    salonId != null && price > 0 && amountSoldAt(salonId, price);

  // Выбор позиции для API (единый формат для заказа и превью промокода).
  // Номинал из админки уходит своим id, остальные суммы списка — суммой:
  // сервер примет её, только если она есть в списке витрины филиала.
  const buildItem = () => {
    if (type === "program") {
      return { type: "program" as const, programOptionId: optionId! };
    }
    const n = nominals.find((x) => x.amountKzt === price);
    return n
      ? { type: "nominal" as const, nominalId: n.id }
      : { type: "nominal" as const, customAmountKzt: price };
  };

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

  const pickAmount = (amount: number) => {
    setAmountKzt(amount);
    // Филиал, выбранный раньше, эту сумму не продаёт — снимаем, чтобы шаг
    // доставки попросил выбрать заново, а не упёрся в отказ.
    if (salonId != null && !amountSoldAt(salonId, amount)) setSalonId(null);
    setError("");
  };
  /** Выбор варианта программы; филиал, где его не выпустить, снимается. */
  const pickOption = (optId: number | null) => {
    setOptionId(optId);
    if (salonId != null && (optId == null || !(optionSalons[optId] ?? []).includes(salonId))) {
      setSalonId(null);
    }
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
  /** Выбранное — или −1, если ничего не выбрано. */
  const dialSelected =
    type === "nominal"
      ? selIdx
      : availablePrograms.findIndex((p) => p.id === programId);
  /**
   * Куда повёрнут круг. Без выбора — на середину списка, чтобы суммы легли
   * вокруг бусины поровну (решение заказчика), причём бусина встаёт МЕЖДУ
   * двумя строками: строка под бусиной читалась бы как уже выбранная.
   */
  const dialMid =
    (dialItems.length - 1) / 2 - (dialItems.length % 2 === 1 ? 0.5 : 0);
  const dialSel = dialSelected >= 0 ? dialSelected : Math.max(0, dialMid);
  /** Строка, на которую встаёт Tab: выбранная, а без выбора — ближайшая к
   *  бусине (крайние строки в этот момент погашены и схлопнуты). */
  const dialTab = dialSelected >= 0 ? dialSelected : Math.round(dialSel);

  const dialRef = useRef<HTMLDivElement>(null);
  /** Сцена шага: на ней живут --sel и длительность поворота — их читают и
   *  круг сумм, и корона солнца, и на неё же вешается колесо мыши. */
  const orbRef = useRef<HTMLDivElement>(null);

  const pickDial = (i: number) => {
    // Откуда въедет крупная сумма справа: к большей — снизу, к меньшей — сверху.
    setPickDir(i >= dialSel ? "up" : "down");
    setTick((n) => n + 1);
    const el = orbRef.current;
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
    pickOption(p.options[0]?.id ?? null);
    setError("");
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
      const delta = jump[e.key];
      // Без выбора бусина стоит между строками: «вниз» берёт строку под ней,
      // «вверх» — над ней, а не перескакивает через одну.
      const from =
        dialSelected >= 0
          ? dialSelected
          : delta > 0
            ? Math.ceil(dialSel) - 1
            : Math.floor(dialSel) + 1;
      goDial(from + delta);
      return;
    }
    if (e.key === "Home") { e.preventDefault(); goDial(0); return; }
    if (e.key === "End") { e.preventDefault(); goDial(dialItems.length - 1); }
  };

  /**
   * Колесо мыши над кругом крутит его — и суммы, и программы (решение
   * заказчика 2026-09-11). Один щелчок колеса — одна строка; тачпад шлёт
   * мелкие шаги, они копятся до порога, иначе круг проскакивал бы список.
   * На краях списка колесо отдаётся странице: человека нельзя запирать на
   * круге, когда дальше крутить некуда.
   */
  const wheelAcc = useRef(0);
  const onDialWheel = useEffectEvent((e: WheelEvent) => {
    if (step !== 1 || !showDial) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const last = dialItems.length - 1;
    if (
      dialSelected >= 0 &&
      ((dir > 0 && dialSelected >= last) || (dir < 0 && dialSelected <= 0))
    ) {
      return;
    }
    e.preventDefault();
    const px =
      e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    wheelAcc.current += px;
    if (Math.abs(wheelAcc.current) < 40) return;
    wheelAcc.current = 0;
    const target =
      dialSelected >= 0
        ? dialSelected + dir
        : dir > 0
          ? Math.ceil(dialSel)
          : Math.floor(dialSel);
    pickDial(Math.min(last, Math.max(0, target)));
  });
  // Слушатель нативный и НЕ пассивный: React вешает wheel пассивным, и
  // preventDefault в onWheel не сработал бы — страница уезжала бы вместе с
  // кругом. Переподписка на смену шага: сцена появляется только после
  // согласия, а шаг «Подарок» может открыться сразу из черновика.
  useEffect(() => {
    const el = orbRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onDialWheel(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [step, acceptedNow, introDone]);

  /**
   * Смена «сумма ↔ программа». Ничего не предвыбирается — программу, как и
   * сумму, покупатель выбирает сам (решение заказчика 2026-09-11).
   */
  const switchType = (next: "program" | "nominal") => {
    setType(next);
    setError("");
  };

  const stepValid = (s: Step): boolean => {
    switch (s) {
      case 0:
        return Boolean(design);
      case 1:
        // Филиала здесь ещё нет — он спрашивается на шаге доставки; там же
        // проверяется, продаётся ли выбранное в конкретном филиале.
        return type === "program" ? Boolean(option) : price > 0;
      case 2:
        // «От кого» необязательно — дарят и без подписи.
        return toName.trim().length > 0;
      case 3:
        // Филиал должен подходить к выбранному: покупатель мог вернуться и
        // сменить сумму или вариант, а черновик — пережить закрытие филиала.
        if (!choiceSalon) return false;
        if (type === "nominal" && !amountSellableHere) return false;
        if (
          type === "program" &&
          (!option || !(optionSalons[option.id] ?? []).includes(choiceSalon.id))
        ) {
          return false;
        }
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

  /** Текст ошибки шага: на шаге подарка — что именно выбрать. */
  const stepError = (s: Step) =>
    s === 1
      ? type === "nominal"
        ? t("s1ErrAmount")
        : t("s1ErrProgram")
      : s === 3 && !choiceSalon
        ? t("s4ErrSalon")
        : t("errRequired");

  const next = () => {
    if (!stepValid(step)) {
      setError(stepError(step));
      setShake((n) => n + 1);
      return;
    }
    setError("");
    setDir("fwd");
    setStep((s) => Math.min(4, s + 1) as Step);
  };

  /** Назад — на шаг раньше или прямо на пройденный шаг из пути слева. */
  const goBack = (to: Step) => {
    setError("");
    setDir("back");
    setStep(to);
  };

  const submit = async () => {
    // Перед деньгами — ещё раз выбор и доставка: черновик или письмо о
    // брошенном заказе могли привести сюда с тем, чего уже нет на витрине.
    for (const s of [1, 3] as const) {
      if (!stepValid(s)) {
        goBack(s);
        setError(stepError(s));
        return;
      }
    }
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
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          body?.error === "amount_not_available"
            ? t("errAmountUnavailable")
            : t("errGeneric"),
        );
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
            // Следующий сертификат — с чистого листа: ничего не выбрано.
            setAmountKzt(null);
            setProgramId(null);
            setOptionId(null);
            setDir("back");
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
  const sampleProg = programs.find((p) =>
    p.options.some((o) => o.id === sampleOptionId),
  );
  const sampleOpt = sampleProg?.options.find((o) => o.id === sampleOptionId);
  const sampleProgram =
    sampleProg && sampleOpt
      ? [sampleProg.name, optionLabel(sampleOpt, guests, hourUnit)]
          .filter(Boolean)
          .join(" · ")
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
      <div
        ref={stageRef}
        className="stg"
        data-step={step}
        data-kind={type}
        data-dir={dir}
      >
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
                    onClick={() => goBack(index as Step)}
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
            <div
              ref={orbRef}
              className="stg__orb"
              style={
                step === 1 ? ({ "--sel": dialSel } as React.CSSProperties) : undefined
              }
              data-tick={step === 1 && tick > 0 ? (tick % 2 ? "a" : "b") : undefined}
              data-pdir={pickDir}
            >
              {/* Круг и открытка — одни и те же узлы на шагах 2–5: при
                  переходе они не появляются заново, а переезжают на новое
                  место, и путь читается одним движением. */}
              <span className="stg__circle" aria-hidden="true" />
              {/* Солнце шага «Подарок»: суммы и программы — его лучи. На
                  остальных шагах гаснет обратно в сиреневый круг. */}
              <span className="stg__sun" aria-hidden="true" />

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
                >
                  <span className="dial__head" aria-hidden="true" />
                  {/* Круг от бусины на каждый выбор: key перемонтирует узел, и
                      анимация запускается заново. */}
                  {dialSelected >= 0 && (
                    <span
                      key={`p${dialSelected}`}
                      className="dial__ping"
                      aria-hidden="true"
                    />
                  )}
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
                        tabIndex={i === dialTab ? 0 : -1}
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
                      значении: узел перемонтируется и въезжает заново на
                      каждый выбор — снизу к большей сумме, сверху к меньшей.
                      Пока не выбрано ничего, на месте суммы бледный прочерк и
                      подсказка: место занято, выбор не двигает раскладку. */}
                  {type === "nominal" ? (
                    price > 0 ? (
                      <>
                        <p
                          className="stg__big"
                          key={price}
                          data-dir={pickDir === "down" ? "down" : undefined}
                          aria-live="polite"
                        >
                          {formatKzt(price)}
                        </p>
                        <p className="stg__lede">{t("s1LedeNominal")}</p>
                      </>
                    ) : (
                      <>
                        <p className="stg__big stg__big--empty" aria-hidden="true">
                          — ₸
                        </p>
                        <p className="stg__lede" aria-live="polite">
                          {t("s1PickAmount", {
                            min: wheelAmounts[0]?.text ?? "",
                            max: wheelAmounts[wheelAmounts.length - 1]?.text ?? "",
                          })}
                        </p>
                      </>
                    )
                  ) : program ? (
                    <div
                      className="stg__prog"
                      key={program.id}
                      data-dir={pickDir === "down" ? "down" : undefined}
                      aria-live="polite"
                    >
                      <p className="stg__progname">{program.name}</p>
                      {option && (
                        <p className="stg__progprice">
                          {formatKzt(option.priceKzt)}
                        </p>
                      )}
                      {program.description && (
                        <p className="stg__progdesc">{program.description}</p>
                      )}
                      {program.options.length > 1 && (
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
                              onClick={() => pickOption(o.id)}
                            >
                              {optionLabel(o, guests, hourUnit)}
                              <small>{formatKzt(o.priceKzt)}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p
                      className="stg__progname stg__progname--empty"
                      aria-live="polite"
                    >
                      {t("s1PickProgram")}
                    </p>
                  )}

                  {/* Короткий набор сумм — ряд кнопок: меньше восьми значений
                      в круг не складываются (филиалы без привязки к CRM, где
                      остаются только номиналы из админки). */}
                  {type === "nominal" && !showDial && (
                    <div className="seg seg--gap">
                      {wheelAmounts.map((w) => (
                        <button
                          key={w.amountKzt}
                          type="button"
                          className="seg__it"
                          aria-pressed={w.amountKzt === price}
                          onClick={() => pickAmount(w.amountKzt)}
                        >
                          {w.text}
                          {w.label && <small>{w.label}</small>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="stg__links">
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
                      {t("s3From")}{" "}
                      <span className="fld__opt">{t("s4Optional")}</span>
                    </label>
                    <input
                      id="b-from"
                      className="fld__input"
                      maxLength={80}
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
                    <div className="fld__it fld__reveal">
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
                          aria-checked={choiceSalon?.cityKey === key}
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

                  {choiceSalon && (
                    <div className="fld__it">
                      <span className="fld__label" id="b-salon">
                        {t("s1Salon")}
                      </span>
                      <div
                        key={choiceSalon.cityKey}
                        className="opt"
                        role="radiogroup"
                        aria-labelledby="b-salon"
                      >
                        {salonsForChoice
                          .filter((x) => x.cityKey === choiceSalon.cityKey)
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
            {/* key={shake}: повторная ошибка въезжает заново, а не висит
                неподвижно, будто кнопка не сработала. */}
            {error && (
              <p className="stg__err" role="alert" key={shake}>
                {error}
              </p>
            )}
            {step > 0 && (
              <button
                type="button"
                className="stg__back"
                onClick={() => goBack(Math.max(0, step - 1) as Step)}
              >
                ← {tCommon("back")}
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                className="stg__go"
                // Шаг заполнен — кольцо один раз расходится: пора дальше.
                data-ready={stepValid(step) ? "1" : undefined}
                // На ошибку кнопка качается; чётность перезапускает анимацию.
                // Только вместе с видимой ошибкой: возврат с оплаты заново
                // добавил бы атрибут, и кнопка качнулась бы без причины.
                data-shake={error && shake ? (shake % 2 ? "a" : "b") : undefined}
              >
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
