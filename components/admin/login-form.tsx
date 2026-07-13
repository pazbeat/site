"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputCls =
  "w-full rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-gold";
const labelCls = "mb-1.5 block text-[13px] font-bold";

export function LoginForm({ show2fa = true }: Readonly<{ show2fa?: boolean }>) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      totp: show2fa ? totp : "",
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      // Единая ошибка — не раскрываем, что именно не совпало
      setError("Неверный email, пароль или код 2FA.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-4">
        <label className={labelCls} htmlFor="l-email">
          Email
        </label>
        <input
          id="l-email"
          type="email"
          autoComplete="username"
          required
          className={inputCls}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className={labelCls} htmlFor="l-password">
          Пароль
        </label>
        <input
          id="l-password"
          type="password"
          autoComplete="current-password"
          required
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {show2fa && (
        <div className="mb-6">
          <label className={labelCls} htmlFor="l-totp">
            Код 2FA (TOTP)
          </label>
          <input
            id="l-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="000000"
            className={`${inputCls} tracking-[0.3em]`}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      )}
      {error && (
        <p className="mb-4 text-sm font-semibold text-brand-red">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-brand-purple px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
      >
        Войти
      </button>
    </form>
  );
}
