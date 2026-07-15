"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";
import {
  uploadDesignAction,
  renameDesignAction,
  toggleDesignActiveAction,
  deleteDesignAction,
  moveDesignAction,
} from "@/app/admin/designs/actions";

export type AdminDesign = {
  id: number;
  nameRu: string;
  nameKk: string;
  nameEn: string;
  imageUrl: string | null;
  active: boolean;
  usedCount: number;
};

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";

export function DesignsAdmin({
  designs,
}: Readonly<{ designs: AdminDesign[] }>) {
  return (
    <div className="space-y-6">
      <Uploader />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {designs.map((d, i) => (
          <DesignCard
            key={d.id}
            design={d}
            isFirst={i === 0}
            isLast={i === designs.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function Uploader() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        start(async () => {
          if (toastResult(await uploadDesignAction(fd), "Дизайн добавлен.")) {
            formRef.current?.reset();
            setPreview(null);
            router.refresh();
          }
        });
      }}
      className="rounded-2xl border border-brand-purple-100 bg-white p-5"
    >
      <div className="mb-3 text-sm font-bold text-brand-purple">
        Загрузить новую открытку
      </div>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <label className="flex aspect-[1400/903] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-brand-purple-100 bg-brand-purple-50/40 text-center text-xs text-brand-purple-950/50 hover:border-brand-gold">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- предпросмотр локального файла
              <img
                src={preview}
                alt="Предпросмотр"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="px-3">
                Нажмите, чтобы выбрать
                <br />
                JPEG / PNG / WebP
              </span>
            )}
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              required
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
        </div>
        <div className="space-y-2">
          <input
            name="nameRu"
            required
            placeholder="Название RU"
            className={inputCls}
          />
          <input
            name="nameKk"
            required
            placeholder="Название KK"
            className={inputCls}
          />
          <input
            name="nameEn"
            required
            placeholder="Название EN"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
          >
            {pending ? "Загрузка…" : "Добавить дизайн"}
          </button>
        </div>
      </div>
    </form>
  );
}

function DesignCard({
  design,
  isFirst,
  isLast,
}: Readonly<{ design: AdminDesign; isFirst: boolean; isLast: boolean }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState({
    ru: design.nameRu,
    kk: design.nameKk,
    en: design.nameEn,
  });

  function run(
    fn: () => Promise<{ error?: string; ok?: boolean } | undefined>,
    done: string,
  ) {
    start(async () => {
      if (toastResult(await fn(), done)) router.refresh();
    });
  }

  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    f.set("id", String(design.id));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white ${
        design.active
          ? "border-brand-purple-100"
          : "border-brand-purple-100/60 opacity-70"
      }`}
    >
      <div className="relative aspect-[1400/903] bg-brand-purple-50">
        {design.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- динамический путь дизайна
          <img
            src={design.imageUrl}
            alt={design.nameRu}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-brand-purple-950/40">
            без картинки
          </div>
        )}
        {!design.active && (
          <span className="absolute top-2 left-2 rounded-full bg-brand-purple-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
            Скрыт
          </span>
        )}
      </div>

      <div className="p-3">
        {editing ? (
          <div className="space-y-2">
            <input
              value={names.ru}
              onChange={(e) => setNames({ ...names, ru: e.target.value })}
              placeholder="RU"
              className={inputCls}
            />
            <input
              value={names.kk}
              onChange={(e) => setNames({ ...names, kk: e.target.value })}
              placeholder="KK"
              className={inputCls}
            />
            <input
              value={names.en}
              onChange={(e) => setNames({ ...names, en: e.target.value })}
              placeholder="EN"
              className={inputCls}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await renameDesignAction(
                      fd({
                        nameRu: names.ru,
                        nameKk: names.kk,
                        nameEn: names.en,
                      }),
                    );
                    if (!res?.error) setEditing(false);
                    return res;
                  }, "Название сохранено.")
                }
                className="rounded-full bg-brand-purple px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setNames({
                    ru: design.nameRu,
                    kk: design.nameKk,
                    en: design.nameEn,
                  });
                }}
                className="rounded-full border border-brand-purple-100 px-4 py-1.5 text-xs text-brand-purple-950/60"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 truncate text-sm font-bold text-brand-purple">
              {design.nameRu}
            </div>
            <div className="mb-2 text-xs text-brand-purple-950/45">
              {design.usedCount > 0
                ? `Продано с этим дизайном: ${design.usedCount}`
                : "Ещё не использован"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => toggleDesignActiveAction(fd({})),
                    design.active ? "Дизайн скрыт." : "Дизайн снова виден.",
                  )
                }
                className="rounded-full border border-brand-purple-100 px-3 py-1 font-semibold text-brand-purple hover:bg-brand-purple-50"
              >
                {design.active ? "Скрыть" : "Показать"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full border border-brand-purple-100 px-3 py-1 text-brand-purple-950/70 hover:bg-brand-purple-50"
              >
                Переименовать
              </button>
              <button
                type="button"
                disabled={pending || isFirst}
                onClick={() =>
                  run(
                    () => moveDesignAction(fd({ dir: "up" })),
                    "Порядок изменён.",
                  )
                }
                className="rounded-full border border-brand-purple-100 px-2.5 py-1 text-brand-purple-950/70 hover:bg-brand-purple-50 disabled:opacity-30"
                title="Выше"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={pending || isLast}
                onClick={() =>
                  run(
                    () => moveDesignAction(fd({ dir: "down" })),
                    "Порядок изменён.",
                  )
                }
                className="rounded-full border border-brand-purple-100 px-2.5 py-1 text-brand-purple-950/70 hover:bg-brand-purple-50 disabled:opacity-30"
                title="Ниже"
              >
                ↓
              </button>
              {design.usedCount === 0 && (
                <ConfirmButton
                  label="Удалить"
                  title={`Удалить дизайн «${design.nameRu}»?`}
                  body="Открытка исчезнет из конструктора, файл будет удалён. Отменить нельзя."
                  confirmLabel="Удалить"
                  danger
                  disabled={pending}
                  className="rounded-full border border-red-200 px-3 py-1 font-semibold text-brand-red hover:bg-red-50 disabled:opacity-50"
                  onConfirm={() =>
                    run(() => deleteDesignAction(fd({})), "Дизайн удалён.")
                  }
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
