"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShareCertificate } from "@/components/share-certificate";
import type { GiftPaletteKey } from "@/lib/gift-palettes";
import { GIFT_OPENED_STORAGE_PREFIX, giftOpenedCookieName } from "@/lib/gift-opened";

/**
 * Экран «Вам подарок» на странице сертификата (/success).
 *
 * Перенос выбранного заказчиком прототипа (docs/design/gift-reveal,
 * анимация B «Праздник»): закрытая коробка с золотой фольгой и бантом → по
 * нажатию коробка нетерпеливо дёргается, подпрыгивает, крышка кувырком
 * улетает, из горловины бьёт фонтан конфетти, сертификат выпрыгивает из
 * коробки и встаёт на место в золотой рамке.
 *
 * Как устроено:
 * - Сервер рендерит ЗАКРЫТУЮ сцену: сертификат до нажатия не мелькает. Без
 *   JavaScript открытое состояние включает <noscript>-стиль — сертификат и
 *   кнопки остаются доступными.
 * - Цвет коробки приходит со страницы (`data-palette`, записан в сертификате),
 *   все цвета — в app/globals.css по `.gr[data-palette=…]`. Ни одного
 *   инлайн-цвета и ни одного инлайн-скрипта (CSP со строгим nonce).
 * - Фаза сцены (`data-phase`) — состояние React; замеры и конфетти делаются
 *   императивно в обработчике нажатия, как в прототипе: хореография задана в
 *   CSS, JS только переносит в неё геометрию конкретного экрана.
 * - Открытый подарок помнится по токену заказа (lib/gift-opened.ts): cookie
 *   читает сервер и сразу рендерит открытый экран — без мелькания коробки до
 *   гидрации; sessionStorage — запасной путь, если cookie не сохранилась.
 */

type Phase = "closed" | "measure" | "opening" | "open";

/** Моменты сцены, мс от нажатия. Должны совпадать с CSS (`.gr-*` в globals.css). */
const TIMING = { ready: 1640, open: 2700, fxEnd: 4500, burst: 850, burst2: 1010 };
/** То же для «уменьшить движение»: короткие затухания без прыжков и конфетти. */
const REDUCED = { ready: 230, open: 700 };
/** После нажатия повторный щелчок (второй щелчок двойного, повтор Enter) игнорируется. */
const GUARD_MS = 350;

export type GiftRevealCard = Readonly<{
  /** Картинка-открытка дизайна; без неё — фирменная заглушка. */
  imageUrl: string | null;
  /** «Подарочный сертификат» */
  label: string;
  /** Сумма («50 000 ₸») или название программы */
  title: string;
  /** «Сертификат на сумму», длительность или число гостей */
  subtitle?: string;
  /** Название программы бывает длинным — ему нужен перенос, сумме нет */
  isProgram: boolean;
  code: string;
  message?: string;
}>;

type GiftRevealProps = Readonly<{
  palette: GiftPaletteKey;
  /** Токен заказа: ключ отметки «уже открыт» (cookie и sessionStorage) */
  revealKey: string;
  /** Сервер нашёл cookie «уже открыт» — рендерить сразу открытый экран */
  openedOnServer: boolean;
  toName: string;
  /** Может быть пустым — «От кого» в конструкторе необязательно */
  fromName: string;
  card: GiftRevealCard;
  links: Readonly<{ pdf: string; receipt: string; wallet: string | null }>;
  share: Readonly<{ pageUrl: string; message: string; fileName: string }>;
  /** Срок действия, уже отформатированный по времени салона */
  validUntil: string;
  /** Строка о доставке письма: её видит покупатель сразу после оплаты */
  deliveryNote: string;
}>;

const noopSubscribe = () => () => {};

function wasOpened(key: string): boolean {
  try {
    return sessionStorage.getItem(GIFT_OPENED_STORAGE_PREFIX + key) === "1";
  } catch {
    // приватный режим или запрет хранилища — просто покажем коробку
    return false;
  }
}

export function GiftReveal({
  palette,
  revealKey,
  openedOnServer,
  toName,
  fromName,
  card,
  links,
  share,
  validUntil,
  deliveryNote,
}: GiftRevealProps) {
  const t = useTranslations("Gift");
  const ts = useTranslations("Success");

  const [phase, setPhase] = useState<Phase>("closed");
  // Кнопки открытого экрана оживают в момент, когда они проявились (ready)
  const [live, setLive] = useState(false);
  // Главная отметка — cookie, её прочёл сервер: открытый экран приходит уже в
  // HTML. sessionStorage есть только в браузере: на сервере и при гидрации —
  // «не открыт», сразу после гидрации — настоящее значение. Без эффекта с
  // setState и без расхождения с серверной разметкой.
  const openedStored = useSyncExternalStore(
    noopSubscribe,
    () => wasOpened(revealKey),
    () => false,
  );
  const openedBefore = openedOnServer || openedStored;
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const shown: Phase = phase === "closed" && openedBefore ? "open" : phase;
  const interactive = shown === "open" || live;
  // Без JS (сервер) inert не ставим: иначе noscript-версия осталась бы
  // без рабочих кнопок.
  const inert = hydrated && !interactive;

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const certRef = useRef<HTMLElement>(null);
  const frameRef = useRef<SVGSVGElement>(null);
  const frameLeftRef = useRef<SVGPathElement>(null);
  const frameRightRef = useRef<SVGPathElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef({
    started: false,
    finished: false,
    reduce: false,
    t0: 0,
    timers: [] as number[],
    fx: null as HTMLDivElement | null,
  });

  // Золотая рамка вокруг сертификата строится по его настоящему размеру:
  // при первом показе, при смене ширины экрана, после загрузки шрифтов.
  useEffect(() => {
    const cert = certRef.current;
    if (!cert) return;
    // Сразу, не дожидаясь наблюдателя: у уже открытого подарка CSS-рамка
    // (gr-frame-static) снимается после гидрации, и SVG должна успеть встать
    buildFrame(cert, frameRef.current, frameLeftRef.current, frameRightRef.current);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      buildFrame(cert, frameRef.current, frameLeftRef.current, frameRightRef.current);
    });
    observer.observe(cert);
    return () => observer.disconnect();
  }, []);

  // Уход со страницы посреди сцены — гасим таймеры и слой конфетти
  useEffect(() => {
    const scene = sceneRef.current;
    return () => {
      scene.timers.forEach((id) => window.clearTimeout(id));
      scene.timers.length = 0;
      scene.fx?.remove();
      scene.fx = null;
    };
  }, []);

  const dropFx = () => {
    const scene = sceneRef.current;
    scene.fx?.remove();
    scene.fx = null;
  };

  /**
   * Фокус на заголовок открытого экрана — но только если человек его никуда
   * не перевёл: кнопки оживают раньше конца сцены, и с клавиатуры до них
   * успевают дойти клавишей Tab. Забираем фокус лишь с «ничего» (body) и с
   * закрытой сцены (кнопка «Открыть подарок»), которая сейчас исчезнет.
   */
  const focusTitle = () => {
    const title = titleRef.current;
    if (!title) return;
    const active = document.activeElement;
    if (active === title) return;
    const idle =
      active === null ||
      active === document.body ||
      Boolean(active.closest(".gr-scene"));
    if (idle) title.focus({ preventScroll: true });
  };

  const land = () => {
    const scene = sceneRef.current;
    if (scene.finished) return;
    scene.finished = true;
    // Пока закрытая сцена на месте — фокус с её кнопки ещё виден как есть;
    // после смены фазы кнопка скрыта, и браузер роняет фокус на body не сразу.
    focusTitle();
    flushSync(() => {
      setPhase("open");
      setLive(true);
    });
    focusTitle();
  };

  /** Повторное нажатие — сразу к финалу сцены. */
  const skip = () => {
    const scene = sceneRef.current;
    scene.timers.forEach((id) => window.clearTimeout(id));
    scene.timers.length = 0;
    dropFx();
    land();
  };

  const later = (fn: () => void, ms: number) => {
    sceneRef.current.timers.push(window.setTimeout(fn, ms));
  };

  const open = () => {
    const scene = sceneRef.current;
    if (scene.started) {
      if (!scene.finished) skip();
      return;
    }
    const root = rootRef.current;
    const stage = stageRef.current;
    const float = floatRef.current;
    const wrap = wrapRef.current;
    const actions = actionsRef.current;
    const cert = certRef.current;
    if (!root || !stage || !float || !wrap || !actions || !cert) return;
    scene.started = true;

    try {
      // сессионная, без срока — как sessionStorage; в имени хэш токена, не токен
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${giftOpenedCookieName(revealKey)}=1; Path=/; SameSite=Lax${secure}`;
    } catch {
      // не критично: останется отметка в sessionStorage
    }
    try {
      sessionStorage.setItem(GIFT_OPENED_STORAGE_PREFIX + revealKey, "1");
    } catch {
      // не критично: при перезагрузке коробка просто закроется снова
    }
    scene.reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Парение → статичное смещение, без скачка: при открытии анимация парения
    // снимается, чтобы слои коробки и сертификат оказались в одном контексте
    // наложения (сертификат поднимается ИЗ-ЗА передней стенки).
    const translate = getComputedStyle(float).translate;
    let offsetY = 0;
    if (translate && translate !== "none") {
      offsetY = Number.parseFloat(translate.split(" ")[1] ?? "0") || 0;
    }
    float.style.top = `${offsetY}px`;
    float.style.bottom = `${-offsetY}px`;

    // Открытый экран раскладывается невидимым, чтобы снять геометрию
    flushSync(() => setPhase("measure"));
    buildFrame(cert, frameRef.current, frameLeftRef.current, frameRightRef.current);
    makeRoomAbove(root, float, wrap);
    const origin = measureScene(root, stage, float, wrap, actions);
    flushSync(() => setPhase("opening"));

    scene.t0 = performance.now();
    const moments = scene.reduce ? REDUCED : TIMING;
    if (!scene.reduce) scene.fx = celebrate(root, origin);
    // Фокус на заголовок открытого экрана — как только он проявился
    later(() => {
      flushSync(() => setLive(true));
      focusTitle();
    }, moments.ready);
    later(land, moments.open);
    if (!scene.reduce) later(dropFx, TIMING.fxEnd);
  };

  // Любое нажатие во время сцены доводит её до финала; уже проявившиеся
  // кнопки при этом работают сразу.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (phase !== "opening") return;
    const scene = sceneRef.current;
    const moments = scene.reduce ? REDUCED : TIMING;
    const since = performance.now() - scene.t0;
    const target = event.target;
    const button =
      target instanceof Element
        ? target.closest(".gr-actions a, .gr-actions button")
        : null;
    if (button && since >= moments.ready) {
      skip();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (since < GUARD_MS) return;
    skip();
  };

  const forName = t("forName", { name: toName });
  const fromLabel = fromName ? t("fromName", { name: fromName }) : "";

  return (
    <div
      ref={rootRef}
      className="gr"
      data-palette={palette}
      onClickCapture={onClickCapture}
    >
      {/* Без JavaScript коробку не открыть — показываем сертификат сразу, а
          кнопку WhatsApp (без скрипта она ничего не делает) прячем. Этот
          <style> держится на style-src 'unsafe-inline' (lib/security.ts). */}
      <noscript>
        <style>
          {
            ".gr-stage[data-phase=closed] .gr-scene{display:none}.gr-stage[data-phase=closed] .gr-opened{display:block}.gr-share{display:none!important}"
          }
        </style>
      </noscript>

      <GiftDefs />

      <div ref={stageRef} className="gr-stage" data-phase={shown}>
        {/* ═════════ ЗАКРЫТО ═════════ */}
        <section className="gr-scene">
          <h1 className="gr-title">{t("eyebrow")}</h1>

          {/* Коробка — картинка, а не кнопка: открывает её и щелчок, но
              единственный элемент управления для клавиатуры и экранного
              диктора — «Открыть подарок» ниже. */}
          <div className="gr-box" aria-hidden="true" onClick={open}>
            <div ref={floatRef} className="gr-float">
              <span className="gr-ground" />
              <span className="gr-shaft" />
              <span className="gr-glow" />
              <span className="gr-spill" />
              <GiftBoxLayers />
            </div>
          </div>

          <p className="gr-names">
            <span className="gr-for">{forName}</span>
            {fromLabel && <span className="gr-from">{fromLabel}</span>}
          </p>
          <button type="button" className="gr-cta" onClick={open}>
            {t("open")}
          </button>
          <p className="gr-hint">{t("openHint")}</p>
        </section>

        {/* ═════════ ОТКРЫТО ═════════ */}
        <section className="gr-opened">
          <div className="gr-ohead">
            <p className="gr-oeyebrow">{t("openedEyebrow")}</p>
            <h1 ref={titleRef} className="gr-otitle" tabIndex={-1}>
              {t("openedTitle", { name: toName })}
            </h1>
            <p className="gr-osub">
              {fromName
                ? t("openedSub", { name: fromName })
                : t("openedSubNoFrom")}
            </p>
          </div>

          <div ref={wrapRef} className="gr-cert-wrap">
            <svg ref={frameRef} className="gr-frame" aria-hidden="true">
              <path ref={frameLeftRef} className="gr-fr" pathLength={1} stroke="url(#gr-g-frame)" />
              <path ref={frameRightRef} className="gr-fr" pathLength={1} stroke="url(#gr-g-frame)" />
            </svg>
            {/* Контур SVG-рамки считает скрипт по размеру карточки. Пока его
                нет (без JavaScript или до гидрации уже открытого подарка) —
                та же рамка средствами CSS. */}
            {!hydrated && <span className="gr-frame-static" aria-hidden="true" />}
            <span className="gr-mark" aria-hidden="true" />
            <article
              ref={certRef}
              className="gr-cert"
              aria-label={`${card.label} ${card.code}`}
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна
                <img className="gr-cert-img" src={card.imageUrl} alt="" />
              ) : (
                <span className="gr-cert-img gr-cert-art" aria-hidden="true" />
              )}
              <div className="gr-panel">
                <div className="gr-cp-top">
                  <span className="gr-cp-label">{card.label}</span>
                  <span className="gr-cp-code">{card.code}</span>
                </div>
                <div className={card.isProgram ? "gr-cp-bottom gr-cp-bottom--program" : "gr-cp-bottom"}>
                  <div className={card.isProgram ? "gr-cp-sum gr-cp-sum--program" : "gr-cp-sum"}>
                    {card.title}
                    {card.subtitle && <small>{card.subtitle}</small>}
                  </div>
                  <div className="gr-cp-names">
                    <b>{forName}</b>
                    {fromLabel && <i>{fromLabel}</i>}
                  </div>
                </div>
                {card.message && <p className="gr-cp-msg">«{card.message}»</p>}
              </div>
            </article>
          </div>

          <div ref={actionsRef} className="gr-actions" inert={inert}>
            <a className="gr-btn gr-btn--dark" href={links.pdf}>
              <ActionIcon kind="download" />
              {ts("downloadPdf")}
            </a>
            {/* Одна кнопка на обе платформы: маршрут сам уводит в Apple Wallet
                или Google Кошелёк. Страница передаёт ссылку, только если
                хотя бы одна платформа настроена. */}
            {links.wallet && (
              <a className="gr-btn gr-btn--quiet" href={links.wallet}>
                <ActionIcon kind="wallet" />
                {ts("addToWallet")}
              </a>
            )}
            <a className="gr-btn gr-btn--quiet" href={links.receipt}>
              <ActionIcon kind="receipt" />
              {ts("downloadReceipt")}
            </a>
            {/* Файл, а не строка с номером: wa.me умеет только текст, сам
                сертификат уходит через системное «Поделиться». */}
            <ShareCertificate
              pdfUrl={links.pdf}
              pageUrl={share.pageUrl}
              message={share.message}
              label={ts("waShare")}
              textLabel={ts("waShareText")}
              fileName={share.fileName}
              className="gr-btn gr-btn--dark gr-share"
              icon={<ActionIcon kind="whatsapp" />}
            />
            <Link href="/create" className="gr-btn gr-btn--link">
              {ts("createMore")}
            </Link>
            <p className="gr-note">{deliveryNote}</p>
          </div>

          {/* Условия — те же, что покупатель видел при согласии. Здесь они
              нужны второй раз: сертификат часто пересылают, и получатель
              этой страницы согласия не читал. */}
          <ul className="gr-terms" inert={inert}>
            <Term icon="calendar">
              {ts.rich("termValidUntil", {
                date: validUntil,
                b: (chunks) => <b>{chunks}</b>,
              })}
            </Term>
            <Term icon="pin">{ts("termBranches")}</Term>
            <Term icon="device">{ts("termElectronic")}</Term>
            <Term icon="phone">{ts("termBooking")}</Term>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ───────────── Разметка коробки ───────────── */

/** Общие градиенты: цвета стопов — классы `gr-s-*`, значения — палитра в CSS. */
function GiftDefs() {
  return (
    <svg className="gr-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gr-g-foil" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-fo1" />
          <stop offset=".42" className="gr-s-fo2" />
          <stop offset=".58" className="gr-s-fo3" />
          <stop offset="1" className="gr-s-fo1" />
        </linearGradient>
        <linearGradient id="gr-g-lid-top" x1="0" y1="26" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-top1" />
          <stop offset="1" className="gr-s-top2" />
        </linearGradient>
        <linearGradient id="gr-g-lid" x1="0" y1="40" x2="0" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-lid1" />
          <stop offset="1" className="gr-s-lid2" />
        </linearGradient>
        <linearGradient id="gr-g-body" x1="0" y1="132" x2="0" y2="292" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-body1" />
          <stop offset="1" className="gr-s-body2" />
        </linearGradient>
        <linearGradient id="gr-g-sides" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-deep" stopOpacity=".2" />
          <stop offset=".1" className="gr-s-deep" stopOpacity="0" />
          <stop offset=".9" className="gr-s-deep" stopOpacity="0" />
          <stop offset="1" className="gr-s-deep" stopOpacity=".24" />
        </linearGradient>
        <linearGradient id="gr-g-lid-shadow" x1="0" y1="132" x2="0" y2="152" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-deep" stopOpacity=".38" />
          <stop offset="1" className="gr-s-deep" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gr-g-rim" x1="0" y1="121" x2="0" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-rimhi" />
          <stop offset="1" className="gr-s-rimlo" />
        </linearGradient>
        {/* матовый атлас ленты: мягкий, без жёсткого блика */}
        <linearGradient id="gr-g-satin" x1="0" y1="163" x2="0" y2="189" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-sat1" />
          <stop offset=".38" className="gr-s-sat2" />
          <stop offset=".62" className="gr-s-sat3" />
          <stop offset="1" className="gr-s-sat4" />
        </linearGradient>
        <linearGradient id="gr-g-bow" x1="80" y1="140" x2="160" y2="196" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-bow1" />
          <stop offset=".45" className="gr-s-bow2" />
          <stop offset="1" className="gr-s-bow3" />
        </linearGradient>
        <linearGradient id="gr-g-tail" x1="0" y1="184" x2="0" y2="232" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-tail1" />
          <stop offset="1" className="gr-s-tail2" />
        </linearGradient>
        <linearGradient id="gr-g-knot" x1="138" y1="0" x2="162" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="gr-s-knot1" />
          <stop offset=".5" className="gr-s-knot2" />
          <stop offset="1" className="gr-s-knot3" />
        </linearGradient>
        <linearGradient id="gr-g-frame" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="gr-s-frame1" />
          <stop offset=".5" className="gr-s-frame2" />
          <stop offset="1" className="gr-s-frame3" />
        </linearGradient>
        <symbol id="gr-star" viewBox="-6 -6 12 12">
          <path
            fill="currentColor"
            d="M0-6C.5-1.6 1.6-.5 6 0 1.6.5.5 1.6 0 6-.5 1.6-1.6.5-6 0-1.6-.5-.5-1.6 0-6Z"
          />
        </symbol>
      </defs>
    </svg>
  );
}

const LID_FRONT = "M0 40H300V126a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z";
const BODY_FRONT = "M14 132H286V286a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6Z";
const LOOP_TOP = "M148 172C134 152 106 140 92 149 84 154 82 163 86 170";
const LOOP_BOTTOM = "M148 180C134 183 112 185 98 180 90 177 86 174 86 170";
const TAIL = "M145 184L118 229 128 225.5 132 235 156 188Z";
const MIRROR = "matrix(-1 0 0 1 300 0)";

function Loop() {
  return (
    <>
      <path className="gr-rib gr-rib-edge" pathLength={1} d={LOOP_TOP} />
      <path className="gr-rib gr-rib-edge" pathLength={1} d={LOOP_BOTTOM} />
      <path className="gr-rib gr-rib-satin" pathLength={1} stroke="url(#gr-g-bow)" d={LOOP_TOP} />
      <path className="gr-rib gr-rib-satin" pathLength={1} stroke="url(#gr-g-bow)" d={LOOP_BOTTOM} />
      <path className="gr-rib gr-rib-fold" pathLength={1} d={LOOP_TOP} />
    </>
  );
}

function Tail() {
  return (
    <>
      <path className="gr-k-goldstroke" d={TAIL} fill="url(#gr-g-tail)" strokeOpacity=".45" strokeWidth=".7" />
      <path className="gr-k-goldline" d="M147.5 188L125 226" fill="none" strokeOpacity=".55" strokeWidth=".7" />
    </>
  );
}

function GiftBoxLayers() {
  return (
    <>
      {/* крышка */}
      <span className="gr-layer gr-lid">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <path d="M13 26H287L300 40H0Z" fill="url(#gr-g-lid-top)" />
          <path d={LID_FRONT} fill="url(#gr-g-lid)" />
          <path d={LID_FRONT} fill="url(#gr-g-sides)" />
          <path className="gr-k-seam" d="M6 131.5H294" strokeOpacity=".3" />
          <path className="gr-foil gr-d0" pathLength={1} stroke="url(#gr-g-foil)" d="M10 86V52a2 2 0 0 1 2-2H288a2 2 0 0 1 2 2V120a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2Z" />
          <path className="gr-foil gr-thin gr-d1" pathLength={1} stroke="url(#gr-g-foil)" d="M14.5 86V56.5a2 2 0 0 1 2-2H283.5a2 2 0 0 1 2 2V115.5a2 2 0 0 1-2 2H16.5a2 2 0 0 1-2-2Z" />
          <path className="gr-foil-dot" fill="url(#gr-g-foil)" d="M10 79.5L16.5 86 10 92.5 3.5 86Z M290 79.5L296.5 86 290 92.5 283.5 86Z" />
        </svg>
        {/* логотип фольгой по центру крышки — настоящий файл через маску */}
        <span className="gr-lid-logo" />
      </span>

      {/* корпус */}
      <span className="gr-layer gr-body">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <path className="gr-rim" d="M26 121.5H274L286 132H14Z" fill="url(#gr-g-rim)" />
          <path d={BODY_FRONT} fill="url(#gr-g-body)" />
          <path d={BODY_FRONT} fill="url(#gr-g-sides)" />
          <rect className="gr-lid-shadow" x="14" y="132" width="272" height="20" fill="url(#gr-g-lid-shadow)" />
          <path className="gr-rim gr-k-rimline" d="M14 132.5H286" strokeWidth="1" />
          <path className="gr-foil gr-d2" pathLength={1} stroke="url(#gr-g-foil)" d="M24 222V148a2 2 0 0 1 2-2H274a2 2 0 0 1 2 2V280a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2Z" />
          <path className="gr-foil gr-thin gr-d3" pathLength={1} stroke="url(#gr-g-foil)" d="M28.5 222V152.5a2 2 0 0 1 2-2H269.5a2 2 0 0 1 2 2V275.5a2 2 0 0 1-2 2H30.5a2 2 0 0 1-2-2Z" />
          <path className="gr-foil-dot" fill="url(#gr-g-foil)" d="M24 215.5L30.5 222 24 228.5 17.5 222Z M276 215.5L282.5 222 276 228.5 269.5 222Z" />
          {/* уголки-веера */}
          <path className="gr-foil gr-thin gr-d5" pathLength={1} stroke="url(#gr-g-foil)" d="M28.5 168a17.5 17.5 0 0 0 17.5-17.5M28.5 161a10.5 10.5 0 0 0 10.5-10.5" />
          <path className="gr-foil gr-thin gr-d5" pathLength={1} stroke="url(#gr-g-foil)" d="M271.5 168a17.5 17.5 0 0 1-17.5-17.5M271.5 161a10.5 10.5 0 0 1-10.5-10.5" />
          <path className="gr-foil gr-thin gr-d6" pathLength={1} stroke="url(#gr-g-foil)" d="M28.5 260a17.5 17.5 0 0 1 17.5 17.5M28.5 267a10.5 10.5 0 0 1 10.5 10.5" />
          <path className="gr-foil gr-thin gr-d6" pathLength={1} stroke="url(#gr-g-foil)" d="M271.5 260a17.5 17.5 0 0 0-17.5 17.5M271.5 267a10.5 10.5 0 0 0-10.5 10.5" />
          {/* центральный мотив внизу: ромб с точками */}
          <path className="gr-foil gr-thin gr-d7" pathLength={1} stroke="url(#gr-g-foil)" d="M150 250L158 258 150 266 142 258Z" />
          <path className="gr-foil gr-thin gr-d7" pathLength={1} stroke="url(#gr-g-foil)" d="M112 258H136M164 258H188" />
        </svg>
      </span>

      {/* лента и бант */}
      <span className="gr-layer gr-bow">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <path className="gr-sash gr-sash-l" pathLength={1} d="M150 176H14" stroke="url(#gr-g-satin)" strokeWidth="26" />
          <path className="gr-sash gr-sash-r" pathLength={1} d="M150 176H286" stroke="url(#gr-g-satin)" strokeWidth="26" />
          <path className="gr-sash-line gr-sash-l gr-k-goldline" pathLength={1} d="M150 166H14" strokeWidth=".9" />
          <path className="gr-sash-line gr-sash-l gr-k-goldline" pathLength={1} d="M150 186H14" strokeWidth=".9" />
          <path className="gr-sash-line gr-sash-r gr-k-goldline" pathLength={1} d="M150 166H286" strokeWidth=".9" />
          <path className="gr-sash-line gr-sash-r gr-k-goldline" pathLength={1} d="M150 186H286" strokeWidth=".9" />

          <g className="gr-tail-l">
            <Tail />
          </g>
          <g className="gr-tail-r">
            <g transform={MIRROR}>
              <Tail />
            </g>
          </g>
          {/* петли — сама лента (толстая линия) */}
          <g className="gr-loop-l">
            <Loop />
          </g>
          <g className="gr-loop-r">
            <g transform={MIRROR}>
              <Loop />
            </g>
          </g>
          <g className="gr-knot">
            <path className="gr-k-goldstroke" d="M150 164h4.5a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7h-9a7 7 0 0 1-7-7v-10a7 7 0 0 1 7-7Z" fill="url(#gr-g-knot)" strokeOpacity=".45" strokeWidth=".7" />
            <path className="gr-k-goldline" d="M146.5 167.5v17M153.5 167.5v17" fill="none" strokeOpacity=".45" strokeWidth=".6" />
          </g>
        </svg>
      </span>

      {/* звёздочки, как «✧» на открытках бренда */}
      <span className="gr-tw gr-tw1"><svg><use href="#gr-star" /></svg></span>
      <span className="gr-tw gr-tw2"><svg><use href="#gr-star" /></svg></span>
      <span className="gr-tw gr-tw3"><svg><use href="#gr-star" /></svg></span>
      <span className="gr-tw gr-tw4"><svg><use href="#gr-star" /></svg></span>
    </>
  );
}

/* ───────────── Иконки кнопок и условий ───────────── */

function ActionIcon({ kind }: Readonly<{ kind: "download" | "wallet" | "receipt" | "whatsapp" }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "download" && <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />}
      {kind === "wallet" && (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18M16 14.5h2" />
        </>
      )}
      {kind === "receipt" && (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
          <path d="M9 8h6M9 12h6" />
        </>
      )}
      {kind === "whatsapp" && (
        <>
          <path d="M4 20l1.3-3.8A8 8 0 1 1 8 19Z" />
          <path d="M9 9.5c.3 2.5 2.3 4.6 5 5l1.2-1.3-2-1-.8.8c-1-.4-1.8-1.2-2.2-2.2l.8-.8-1-2Z" />
        </>
      )}
    </svg>
  );
}

function Term({
  icon,
  children,
}: Readonly<{ icon: "calendar" | "pin" | "device" | "phone"; children: ReactNode }>) {
  return (
    <li>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon === "calendar" && (
          <>
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </>
        )}
        {icon === "pin" && (
          <>
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
            <circle cx="12" cy="10" r="2.3" />
          </>
        )}
        {icon === "device" && (
          <>
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18.5h3" />
          </>
        )}
        {icon === "phone" && (
          <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
        )}
      </svg>
      <span>{children}</span>
    </li>
  );
}

/* ───────────── Геометрия сцены ───────────── */

type Origin = Readonly<{ x: number; y: number; w: number; hop: number; limit: number }>;

/** Рамка вокруг сертификата: две половины от знака имбиря сверху вниз. */
function buildFrame(
  cert: HTMLElement,
  svg: SVGSVGElement | null,
  left: SVGPathElement | null,
  right: SVGPathElement | null,
) {
  if (!svg || !left || !right || cert.offsetWidth === 0) return;
  const w = cert.offsetWidth + 20;
  const h = cert.offsetHeight + 20;
  const r = 28;
  const g = 18;
  const o = 0.6;
  const cx = w / 2;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  left.setAttribute(
    "d",
    `M${cx - g} ${o}H${r}A${r - o} ${r - o} 0 0 0 ${o} ${r}V${h - r}A${r - o} ${r - o} 0 0 0 ${r} ${h - o}H${cx}`,
  );
  right.setAttribute(
    "d",
    `M${cx + g} ${o}H${w - r}A${r - o} ${r - o} 0 0 1 ${w - o} ${r}V${h - r}A${r - o} ${r - o} 0 0 1 ${w - r} ${h - o}H${cx}`,
  );
}

/** Низ фиксированной шапки сайта: под ней сертификату взлетать некуда. */
function fixedTopInset(): number {
  let bottom = 0;
  for (const el of document.querySelectorAll("header")) {
    const position = getComputedStyle(el).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const rect = el.getBoundingClientRect();
    if (rect.top <= 1 && rect.bottom > bottom) bottom = rect.bottom;
  }
  return bottom;
}

/**
 * Страницу прокрутили, и прыжку не хватает места под шапкой — возвращает её
 * вверх ровно на недостающее, но не дальше начала экрана подарка. Анимация
 * считается от раскладки, а не от окна: прокрутка до замера её не ломает.
 */
function makeRoomAbove(root: HTMLElement, float: HTMLElement, wrap: HTMLElement) {
  const inset = fixedTopInset();
  const hidden = inset - root.getBoundingClientRect().top; // ушло под шапку
  if (hidden <= 1) return;
  const F = wrap.getBoundingClientRect();
  const B = float.getBoundingClientRect();
  const mouthY = B.top + B.height * (132 / 300);
  const s0 = Math.min(
    0.46,
    (B.width * (272 / 300) * 0.66) / F.width,
    (B.height * (160 / 300) - 12) / F.height,
  );
  const lack = F.height * s0 + 26 + 10 - (mouthY - inset);
  if (lack <= 0) return;
  window.scrollBy({ top: -Math.ceil(Math.min(lack, hidden)), behavior: "instant" });
}

/**
 * Снимает геометрию сцены для прыжка сертификата и полёта крышки. Открытый
 * экран в этот момент разложен, но невидим (фаза measure).
 */
function measureScene(
  root: HTMLElement,
  stage: HTMLElement,
  float: HTMLElement,
  wrap: HTMLElement,
  actions: HTMLElement,
): Origin {
  const F = wrap.getBoundingClientRect();
  const B = float.getBoundingClientRect();
  const P = root.getBoundingClientRect();
  const A = actions.getBoundingClientRect();
  const bodyH = B.height * (160 / 300);
  const mouthY = B.top + B.height * (132 / 300);
  const bodyW = B.width * (272 / 300);
  const fcx = F.left + F.width / 2;
  const fcy = F.top + F.height / 2;
  const s0 = Math.min(0.46, (bodyW * 0.66) / F.width, (bodyH - 12) / F.height);
  // В прототипе потолок прыжка — низ логотипа над сценой. На сайте логотип
  // в фиксированной шапке: потолок — верх экрана подарка, но не выше низа
  // шапки и края окна (страницу могли прокрутить).
  const minTop = Math.max(P.top, fixedTopInset(), 0) + 10;
  // В верхней точке сертификат растёт, пока есть место; нет места (телефон
  // лёжа) — не растёт вовсе: скромный прыжок лучше карточки под шапкой.
  // Раньше рост на 0.08 был обязательным и перекрывал потолок.
  const s1 = Math.max(s0, Math.min(0.7, (mouthY - 26 - minTop) / F.height));
  const dx0 = B.left + B.width / 2 - fcx;
  const dy0 = mouthY + 6 + (F.height * s0) / 2 - fcy;
  // Не влезает и без роста — верхняя точка ниже, под потолком, но не ниже старта
  const dy1 = Math.min(
    dy0,
    Math.max(mouthY - 26 - (F.height * s1) / 2, minTop + (F.height * s1) / 2) - fcy,
  );
  wrap.style.setProperty("--gr-dx0", `${dx0.toFixed(1)}px`);
  wrap.style.setProperty("--gr-dy0", `${dy0.toFixed(1)}px`);
  wrap.style.setProperty("--gr-dy1", `${dy1.toFixed(1)}px`);
  wrap.style.setProperty("--gr-s0", s0.toFixed(3));
  wrap.style.setProperty("--gr-s1", s1.toFixed(3));
  // крышка и бант улетают гарантированно за верхний край окна
  const lidCy = B.top + B.height * (86 / 300);
  stage.style.setProperty("--gr-lid-up", `${(-(lidCy + B.width * 0.6 + 200)).toFixed(0)}px`);
  const bowCy = B.top + B.height * (176 / 300);
  stage.style.setProperty("--gr-bow-up", `${((-(bowCy + 360) * 300) / B.width).toFixed(0)}px`);
  return {
    x: B.left + B.width / 2 - P.left,
    y: mouthY - P.top,
    w: bodyW,
    hop: B.height * 0.13,
    limit: A.top - P.top - 20,
  };
}

/* ───────────── Конфетти и лепестки ─────────────
   Фонтан из горловины, дальше медленно оседают. Кадры считаются заранее и
   отдаются Web Animations. Цвета — классы `gr-c-*` (переменные палитры в
   CSS). Порядок и длина массивов — как в прототипе: детерминированный ГСЧ
   выбирает те же кусочки, сцена одинакова при каждом показе. */

type PieceKind = "rect" | "strip" | "dot" | "star" | "petal";

const GOLD = ["gr-c-g1", "gr-c-g2", "gr-c-g3", "gr-c-g4"] as const;
const LIGHT = ["gr-c-l1", "gr-c-l2", "gr-c-l3", "gr-c-l4", "gr-c-l5"] as const;
const PETAL = ["gr-c-p1", "gr-c-p2", "gr-c-p3", "gr-c-p4"] as const;
const SVG_NS = "http://www.w3.org/2000/svg";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function svgNode(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function makePiece(kind: PieceKind, r: () => number): HTMLElement {
  const el = document.createElement("i");
  let w: number;
  let h: number;
  let tone: string;
  if (kind === "petal") {
    w = 13 + r() * 8;
    h = w * 1.35;
    tone = pick(r, PETAL);
    const svg = svgNode("svg", { viewBox: "-10 -13 20 26" });
    svg.appendChild(svgNode("path", { class: "gr-petal", d: "M0-12C8-6 7.5 5 0 12C-7.5 5-8-6 0-12Z" }));
    svg.appendChild(svgNode("path", { class: "gr-petal-vein", d: "M0-9.5V9" }));
    el.appendChild(svg);
  } else if (kind === "star") {
    w = 12 + r() * 7;
    h = w;
    tone = pick(r, GOLD);
    const svg = svgNode("svg", { viewBox: "-6 -6 12 12" });
    svg.appendChild(svgNode("use", { href: "#gr-star" }));
    el.appendChild(svg);
  } else if (kind === "strip") {
    w = 3.6;
    h = 13 + r() * 6;
    tone = pick(r, GOLD);
  } else if (kind === "dot") {
    w = 6 + r() * 3;
    h = w;
    tone = pick(r, r() < 0.5 ? GOLD : LIGHT);
  } else {
    // прямоугольник бумаги
    w = 7 + r() * 3;
    h = 10 + r() * 4;
    tone = pick(r, r() < 0.55 ? GOLD : LIGHT);
  }
  el.className = `gr-bit gr-bit--${kind} ${tone}`;
  el.style.width = `${w.toFixed(1)}px`;
  el.style.height = `${h.toFixed(1)}px`;
  el.style.margin = `${(-h / 2).toFixed(1)}px 0 0 ${(-w / 2).toFixed(1)}px`;
  return el;
}

/** Траектория: выстрел вверх, торможение, после вершины — плавное оседание с покачиванием. */
function flightPath(o: Origin, r: () => number, kind: PieceKind, power: number, y0: number) {
  const petal = kind === "petal";
  const ang = (r() * 2 - 1) * (petal ? 0.74 : 0.62);
  const v0 = power * (petal ? 480 + r() * 300 : 560 + r() * 440);
  let vx = Math.sin(ang) * v0;
  let vy = -Math.cos(ang) * v0;
  let x = o.x + (r() * 2 - 1) * o.w * 0.2;
  let y = y0;
  const g = 1700;
  const vt = petal ? 46 + r() * 28 : 70 + r() * 55;
  let rot = r() * 360;
  const spin = (r() * 2 - 1) * (petal ? 200 : 600);
  const fl = petal ? 0.6 + r() * 0.5 : 1.4 + r() * 2;
  const ph = r() * 6.283;
  const swA = petal ? 14 + r() * 16 : 5 + r() * 9;
  const swF = petal ? 0.9 + r() * 0.7 : 1.2 + r();
  const life = petal ? 3.0 + r() * 0.7 : 2.5 + r() * 0.8;
  const N = Math.round(life * 16);
  const dt = 1 / 120;
  let t = 0;
  let apex = -1;
  let sway = 0;
  const frames: Keyframe[] = [];
  for (let k = 0; k <= N; k += 1) {
    const ts = (life * k) / N;
    while (t < ts - 1e-9) {
      if (vy < 0) {
        vy += g * dt;
        vx *= Math.exp(-2.2 * dt);
        vy *= Math.exp(-0.8 * dt);
      } else {
        if (apex < 0) apex = t;
        vy += (vt - vy) * (1 - Math.exp(-3 * dt));
        vx *= Math.exp(-2.8 * dt);
      }
      x += vx * dt;
      y += vy * dt;
      rot += spin * dt;
      if (apex >= 0) {
        const ta = t - apex;
        sway = swA * Math.sin(swF * 6.283 * ta) * Math.min(1, ta / 0.5);
      }
      t += dt;
    }
    const sc = Math.min(1, 0.35 + (ts / 0.16) * 0.65);
    let op = ts < 0.05 ? ts / 0.05 : 1;
    const fade = life * 0.62;
    if (ts > fade) op = Math.min(op, 1 - (ts - fade) / (life - fade));
    // к кнопкам не долетает
    if (y > o.limit - 90) op = Math.min(op, Math.max(0, (o.limit - y) / 90));
    const f = Math.cos(fl * 6.283 * ts + ph);
    const sx = petal ? f : 1;
    const sy = petal ? 1 : f;
    frames.push({
      offset: k / N,
      opacity: +Math.max(0, op).toFixed(3),
      transform: `translate(${(x + sway).toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${(sc * sx).toFixed(3)},${(sc * sy).toFixed(3)})`,
    });
  }
  return { frames, life };
}

function celebrate(root: HTMLElement, o: Origin): HTMLDivElement {
  const fx = document.createElement("div");
  fx.className = "gr-fx";
  fx.setAttribute("aria-hidden", "true");
  const r = seeded(20260915);
  const wave = (
    mix: ReadonlyArray<readonly [PieceKind, number]>,
    delay: number,
    power: number,
    y0: number,
    spread: number,
  ) => {
    for (const [kind, count] of mix) {
      for (let i = 0; i < count; i += 1) {
        const el = makePiece(kind, r);
        const flight = flightPath(o, r, kind, power, y0);
        fx.appendChild(el);
        // ГСЧ дёргаем всегда, даже без Web Animations: иначе поплывёт вся сцена
        const start = delay + r() * spread;
        if (typeof el.animate === "function") {
          el.animate(flight.frames, {
            duration: flight.life * 1000,
            delay: start,
            fill: "both",
            easing: "linear",
          });
        }
      }
    }
  };
  // первая волна — когда слетает крышка (коробка в верхней точке прыжка)
  wave(
    [["rect", 30], ["strip", 12], ["dot", 12], ["star", 10], ["petal", 22]],
    TIMING.burst,
    1,
    o.y - o.hop - 8,
    160,
  );
  // вторая, поменьше — когда коробка приземляется и выпускает сертификат
  wave([["petal", 12], ["star", 10], ["dot", 6], ["rect", 8]], TIMING.burst2, 0.82, o.y - 8, 110);
  root.appendChild(fx);
  return fx;
}
