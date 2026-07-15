"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";
import {
  createAdminAction,
  resetPasswordAction,
  resetTotpAction,
  changeRoleAction,
  toggleAdminActiveAction,
  unlockAdminAction,
} from "@/app/admin/users/actions";

export type AdminUserRow = {
  id: number;
  email: string;
  role: "superadmin" | "manager";
  active: boolean;
  lockedUntil: string | null;
  hasTotp: boolean;
  createdAt: string;
  isSelf: boolean;
};

type Totp = { email: string; uri: string; qr: string };
type Result =
  | { ok?: boolean; error?: string; message?: string; totp?: Totp }
  | undefined;

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-semibold text-brand-purple-950/70";
const btnPrimary =
  "rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50";
const btnGhost =
  "rounded-full border border-brand-purple-100 px-3 py-1 text-xs font-semibold text-brand-purple hover:bg-brand-purple-50 disabled:opacity-30";

export function UsersAdmin({ users }: Readonly<{ users: AdminUserRow[] }>) {
  const [totp, setTotp] = useState<Totp | null>(null);

  return (
    <div className="space-y-6">
      <CreateForm onTotp={setTotp} />
      <ul className="divide-y divide-brand-purple-100 rounded-2xl border border-brand-purple-100 bg-white">
        {users.map((u) => (
          <UserRow key={u.id} user={u} onTotp={setTotp} />
        ))}
      </ul>
      {totp && <TotpModal totp={totp} onClose={() => setTotp(null)} />}
    </div>
  );
}

/** Секрет показывается один раз — восстановить его потом нельзя. */
function TotpModal({
  totp,
  onClose,
}: Readonly<{ totp: Totp; onClose: () => void }>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-purple-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
      >
        <h2 className="mb-1 font-display text-xl font-semibold text-brand-purple">
          Двухфакторная аутентификация
        </h2>
        <p className="mb-4 text-sm text-brand-purple-950/70">
          Отсканируйте QR в Google Authenticator (или 1Password) для{" "}
          <b>{totp.email}</b>. Это единственный раз, когда мы его показываем —
          потом только перевыпуск.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, не файл */}
        <img
          src={totp.qr}
          alt="QR-код для приложения-аутентификатора"
          className="mx-auto mb-4 rounded-xl border border-brand-purple-100"
        />
        <details className="mb-4 text-left">
          <summary className="cursor-pointer text-xs font-semibold text-brand-purple-950/60">
            Не сканируется? Показать код для ручного ввода
          </summary>
          <code className="mt-2 block rounded-lg bg-brand-purple-50 p-2 text-[11px] break-all">
            {totp.uri}
          </code>
        </details>
        <button type="button" onClick={onClose} className={btnPrimary}>
          Готово, я сохранил
        </button>
      </div>
    </div>
  );
}

function CreateForm({ onTotp }: Readonly<{ onTotp: (t: Totp) => void }>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
        + Добавить пользователя
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError("");
        start(async () => {
          const res: Result = await createAdminAction(fd);
          if (res?.error) {
            setError(res.error);
            return;
          }
          if (res?.totp) onTotp(res.totp);
          formRef.current?.reset();
          setOpen(false);
          router.refresh();
        });
      }}
      className="rounded-2xl border border-brand-purple-100 bg-white p-5"
    >
      <div className="mb-3 text-sm font-bold text-brand-purple">
        Новый пользователь админки
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="u-email">
            Email *
          </label>
          <input id="u-email" name="email" type="email" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-pass">
            Пароль * (от 12 символов)
          </label>
          <input
            id="u-pass"
            name="password"
            type="text"
            minLength={12}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-role">
            Роль *
          </label>
          <select id="u-role" name="role" defaultValue="manager" className={inputCls}>
            <option value="manager">Менеджер</option>
            <option value="superadmin">Суперадмин</option>
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-brand-purple-950/50">
        Менеджер видит заказы, сертификаты и заявки. Суперадмин — ещё и контент,
        филиалы, правовые тексты и пользователей.
      </p>
      {error && <p className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Создание…" : "Создать"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="rounded-full border border-brand-purple-100 px-5 py-2 text-sm text-brand-purple-950/60"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  onTotp,
}: Readonly<{ user: AdminUserRow; onTotp: (t: Totp) => void }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");

  const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  function run(fn: () => Promise<Result>, done?: string) {
    start(async () => {
      const res = await fn();
      if (res?.totp) {
        onTotp(res.totp);
        router.refresh();
        return;
      }
      if (toastResult(res, done)) router.refresh();
    });
  }

  const fd = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("id", String(user.id));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  return (
    <li className={`px-5 py-4 ${user.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-brand-purple">{user.email}</span>
            {user.isSelf && (
              <span className="rounded-full bg-brand-purple-50 px-2 py-0.5 text-[10px] font-semibold text-brand-purple">
                это вы
              </span>
            )}
            {!user.active && (
              <span className="rounded-full bg-brand-purple-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                Отключён
              </span>
            )}
            {locked && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-brand-red">
                Заблокирован до {new Date(user.lockedUntil!).toLocaleTimeString("ru")}
              </span>
            )}
            {!user.hasTotp && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                Без 2FA
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-brand-purple-950/45">
            {user.role === "superadmin" ? "Суперадмин" : "Менеджер"} · создан{" "}
            {user.createdAt.slice(0, 10)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            disabled={pending}
            defaultValue={user.role}
            onChange={(e) => run(() => changeRoleAction(fd({ role: e.target.value })))}
            className="rounded-full border border-brand-purple-100 px-2.5 py-1 text-xs font-semibold text-brand-purple disabled:opacity-30"
          >
            <option value="manager">Менеджер</option>
            <option value="superadmin">Суперадмин</option>
          </select>
          <button
            type="button"
            onClick={() => setPwOpen((v) => !v)}
            className={btnGhost}
          >
            Сменить пароль
          </button>
          <ConfirmButton
            label="Перевыпустить 2FA"
            title={`Перевыпустить 2FA для ${user.email}?`}
            body="Старое приложение-аутентификатор перестанет работать — понадобится заново отсканировать новый QR."
            confirmLabel="Перевыпустить"
            disabled={pending}
            className={btnGhost}
            onConfirm={() => run(() => resetTotpAction(fd()))}
          />
          {locked && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unlockAdminAction(fd()), "Блокировка снята.")}
              className={btnGhost}
            >
              Снять блокировку
            </button>
          )}
          <ConfirmButton
            label={user.active ? "Отключить" : "Включить"}
            title={`${user.active ? "Отключить" : "Включить"} ${user.email}?`}
            body={
              user.active
                ? "Пользователь не сможет войти в админку. Его действия в аудит-логе останутся."
                : "Пользователь снова сможет входить с прежним паролем и 2FA."
            }
            confirmLabel={user.active ? "Отключить" : "Включить"}
            danger={user.active}
            disabled={pending || user.isSelf}
            className={btnGhost}
            onConfirm={() => run(() => toggleAdminActiveAction(fd()))}
          />
        </div>
      </div>

      {pwOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label className={labelCls} htmlFor={`pw-${user.id}`}>
              Новый пароль (от 12 символов)
            </label>
            <input
              id={`pw-${user.id}`}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={12}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            disabled={pending || pw.length < 12}
            onClick={() =>
              run(async () => {
                const res = await resetPasswordAction(fd({ password: pw }));
                if (!res?.error) {
                  setPw("");
                  setPwOpen(false);
                }
                return res;
              })
            }
            className={btnPrimary}
          >
            Сохранить пароль
          </button>
        </div>
      )}
    </li>
  );
}
