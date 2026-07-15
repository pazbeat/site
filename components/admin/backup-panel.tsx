"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";
import {
  createBackupAction,
  deleteBackupAction,
  restoreBackupAction,
} from "@/app/admin/backup/actions";

type Row = {
  name: string;
  sizeMb: string;
  createdAt: string;
  hasUploads: boolean;
};

export function BackupPanel({ backups }: Readonly<{ backups: Row[] }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      if (toastResult(await fn())) router.refresh();
    });

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => createBackupAction())}
          className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
        >
          {pending ? "Выполняется…" : "Создать бэкап сейчас"}
        </button>
        <span className="text-xs text-brand-purple-950/55">
          База (заказы, сертификаты, настройки) + загруженные фото. Скачивайте
          копии и храните вне сервера.
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Бэкап</th>
              <th className="px-4 py-3 font-semibold">Создан</th>
              <th className="px-4 py-3 font-semibold">Размер</th>
              <th className="px-4 py-3 font-semibold">Фото</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-brand-purple-950/55">
                  Бэкапов пока нет.
                </td>
              </tr>
            )}
            {backups.map((b) => (
              <tr key={b.name} className="border-b border-brand-purple-100/60 last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{b.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">{b.createdAt}</td>
                <td className="px-4 py-3 whitespace-nowrap">{b.sizeMb} МБ</td>
                <td className="px-4 py-3">{b.hasUploads ? "✓" : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <a
                      href={`/api/admin/backup/download?name=${b.name}`}
                      className="rounded-full border-[1.5px] border-brand-purple-100 px-4 py-1.5 text-xs font-bold hover:border-brand-gold"
                    >
                      Скачать
                    </a>
                    <ConfirmButton
                      label="Восстановить"
                      title={`Восстановить базу из ${b.name}?`}
                      body="Текущие данные будут ЗАМЕНЕНЫ состоянием на момент бэкапа: заказы и сертификаты, созданные позже, исчезнут. Действие необратимо — сначала создайте свежий бэкап."
                      confirmLabel="Да, восстановить"
                      danger
                      disabled={pending}
                      className="rounded-full border-[1.5px] border-brand-red px-4 py-1.5 text-xs font-bold text-brand-red hover:bg-brand-red/5"
                      onConfirm={() => {
                        const fd = new FormData();
                        fd.set("name", b.name);
                        run(() => restoreBackupAction(fd));
                      }}
                    />
                    <ConfirmButton
                      label="Удалить"
                      title={`Удалить бэкап ${b.name}?`}
                      body="Файл бэкапа будет удалён с сервера безвозвратно."
                      confirmLabel="Удалить"
                      danger
                      disabled={pending}
                      className="rounded-full border-[1.5px] border-brand-purple-100 px-4 py-1.5 text-xs font-bold text-brand-purple-950/60 hover:border-brand-red hover:text-brand-red"
                      onConfirm={() => {
                        const fd = new FormData();
                        fd.set("name", b.name);
                        run(() => deleteBackupAction(fd));
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
