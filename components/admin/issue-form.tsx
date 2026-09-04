"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { issueManualAction } from "@/app/admin/issue/actions";

type Salon = {
  id: number;
  label: string;
  nextSerial: string | null;
  inAltegio: boolean;
  orderable: boolean;
};
type Program = {
  id: number;
  name: string;
  cities: string[];
  options: { id: number; priceKzt: number; label: string }[];
};

const money = (v: number) => `${v.toLocaleString("ru-RU")} ₸`;

/** Общая обёртка поля: подпись сверху, подсказка снизу. */
function Field({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-brand-purple-950/70">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-brand-purple-950/55">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-brand-purple-100 px-3 py-2 text-base outline-none focus:border-brand-gold sm:text-sm";

export function IssueForm({
  salons,
  programs,
  nominals,
  designs,
  defaultMonths,
}: Readonly<{
  salons: Salon[];
  programs: Program[];
  nominals: { id: number; amountKzt: number }[];
  designs: { id: number; name: string }[];
  defaultMonths: number;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [salonId, setSalonId] = useState(String(salons[0]?.id ?? ""));
  const [kind, setKind] = useState<"program" | "nominal" | "custom">("nominal");
  const [programId, setProgramId] = useState(String(programs[0]?.id ?? ""));
  const [optionId, setOptionId] = useState(
    String(programs[0]?.options[0]?.id ?? ""),
  );
  const [nominalId, setNominalId] = useState(String(nominals[0]?.id ?? ""));
  const [customAmount, setCustomAmount] = useState("");
  const [paidKzt, setPaidKzt] = useState("");
  const [sync, setSync] = useState(true);

  const salon = salons.find((s) => String(s.id) === salonId);
  const program = programs.find((p) => String(p.id) === programId);
  // Через useMemo, а не просто `?? []`: новый пустой массив на каждый рендер
  // менял бы зависимости расчёта номинала ниже и пересчитывал его вхолостую.
  const options = useMemo(() => program?.options ?? [], [program]);

  // Номинал сертификата — то, что увидит получатель. Показываем его отдельно
  // от «сколько получено»: при подарке салона они расходятся полностью.
  const faceKzt = useMemo(() => {
    if (kind === "program") {
      return options.find((o) => String(o.id) === optionId)?.priceKzt ?? 0;
    }
    if (kind === "nominal") {
      return (
        nominals.find((n) => String(n.id) === nominalId)?.amountKzt ?? 0
      );
    }
    return Number(customAmount) || 0;
  }, [kind, options, optionId, nominals, nominalId, customAmount]);

  const submit = (formData: FormData) =>
    startTransition(async () => {
      const result = await issueManualAction(formData);
      if (toastResult(result)) router.refresh();
    });

  return (
    <form action={submit} className="max-w-3xl">
      <p className="mb-5 max-w-2xl text-sm text-brand-purple-950/60">
        Для случаев, когда заказа у нас нет: человек купил на действующем сайте
        и потерял письмо, оплатил переводом, получил сертификат в подарок.{" "}
        <strong>Если заказ в системе есть</strong>, а сертификат не выпустился —
        откройте карточку заказа и нажмите «Довыпустить»: так деньги не
        посчитаются дважды.
      </p>

      <div className="grid gap-5 rounded-2xl border border-brand-purple-100 bg-white p-5 sm:grid-cols-2">
        <Field
          label="Филиал"
          hint={
            salon
              ? `${salon.nextSerial ? `Следующий номер: ${salon.nextSerial}. ` : "У филиала нет префикса номеров. "}${salon.inAltegio ? "" : "Филиал не заведён в Altegio — запись в CRM невозможна."}`
              : undefined
          }
        >
          <select
            name="salonId"
            value={salonId}
            onChange={(e) => setSalonId(e.target.value)}
            className={inputClass}
          >
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.orderable ? "" : " (не продаётся на сайте)"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Что за сертификат">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={inputClass}
          >
            <option value="nominal">На сумму (из списка номиналов)</option>
            <option value="custom">На свою сумму</option>
            <option value="program">На программу</option>
          </select>
        </Field>

        {kind === "program" && (
          <>
            <Field label="Программа">
              <select
                name="programId"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  const next = programs.find(
                    (p) => String(p.id) === e.target.value,
                  );
                  setOptionId(String(next?.options[0]?.id ?? ""));
                }}
                className={inputClass}
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Вариант">
              <select
                name="programOptionId"
                value={optionId}
                onChange={(e) => setOptionId(e.target.value)}
                className={inputClass}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {[o.label, money(o.priceKzt)].filter(Boolean).join(" — ")}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {kind === "nominal" && (
          <Field label="Номинал">
            <select
              name="nominalId"
              value={nominalId}
              onChange={(e) => setNominalId(e.target.value)}
              className={inputClass}
            >
              {nominals.map((n) => (
                <option key={n.id} value={n.id}>
                  {money(n.amountKzt)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {kind === "custom" && (
          <Field
            label="Сумма сертификата, ₸"
            hint="Под сумму должен быть товар в Altegio, иначе снимите галочку записи в CRM."
          >
            <input
              name="customAmountKzt"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Дизайн">
          <select name="designId" className={inputClass}>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Кому">
          <input name="toName" maxLength={80} required className={inputClass} />
        </Field>
        <Field label="От кого">
          <input name="fromName" maxLength={80} required className={inputClass} />
        </Field>

        <Field label="Пожелание" hint="Печатается на сертификате, до 120 знаков.">
          <input name="message" maxLength={120} className={inputClass} />
        </Field>

        <Field
          label="Почта покупателя"
          hint="Туда уйдёт копия сертификата и чек."
        >
          <input
            name="buyerEmail"
            type="email"
            required
            className={inputClass}
          />
        </Field>
        <Field
          label="Почта получателя"
          hint="Пусто — отправим только покупателю."
        >
          <input name="recipientEmail" type="email" className={inputClass} />
        </Field>

        <Field
          label="Телефон покупателя"
          hint="Не обязателен. С ним Altegio заводит карточку клиента, и остаток сертификата можно читать из CRM напрямую."
        >
          <input
            name="buyerPhone"
            inputMode="tel"
            placeholder="+7 700 000 00 00"
            className={inputClass}
          />
        </Field>

        <Field
          label="Номер сертификата"
          hint={
            salon?.nextSerial
              ? `Пусто — присвоим ${salon.nextSerial}. Заполняйте, если номер уже на руках у клиента.`
              : "Заполняйте, если номер уже на руках у клиента."
          }
        >
          <input
            name="serial"
            maxLength={32}
            placeholder={salon?.nextSerial ?? "WM9001"}
            className={inputClass}
          />
        </Field>

        <Field
          label="Срок действия, месяцев"
          hint={`По умолчанию ${defaultMonths}.`}
        >
          <input
            name="validMonths"
            defaultValue={defaultMonths}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        <Field
          label="Сколько реально получено, ₸"
          hint={`Попадёт в выручку. Ноль — подарок салона. Номинал сертификата: ${money(faceKzt)}.`}
        >
          <input
            name="paidKzt"
            value={paidKzt}
            onChange={(e) => setPaidKzt(e.target.value)}
            inputMode="numeric"
            placeholder={String(faceKzt)}
            required
            className={inputClass}
          />
        </Field>

        <Field
          label="Основание"
          hint="Номер чека, платёжки или причина. Останется в заказе и в журнале."
        >
          <input
            name="reference"
            maxLength={64}
            required
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2 flex flex-col gap-3 border-t border-brand-purple-100 pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="syncToAltegio"
              checked={sync && (salon?.inAltegio ?? false)}
              disabled={!salon?.inAltegio}
              onChange={(e) => setSync(e.target.checked)}
              className="mt-1"
            />
            <span>
              Записать продажу в Altegio
              <span className="block text-xs text-brand-purple-950/55">
                {salon?.inAltegio
                  ? "Снимите, если сертификат в CRM уже есть — например, его продал действующий сайт. Иначе в кассе появится вторая продажа."
                  : "Недоступно: филиал не заведён в Altegio. Сертификат будет жить только у нас, и погасить его в кассе не получится."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="sendEmail"
              defaultChecked
              className="mt-1"
            />
            <span>
              Отправить письмо с сертификатом
              <span className="block text-xs text-brand-purple-950/55">
                Получателю — сертификат, покупателю — копия и чек.
              </span>
            </span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 rounded-full bg-brand-purple px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
      >
        {pending ? "Выпускаем…" : "Выпустить сертификат"}
      </button>
    </form>
  );
}
