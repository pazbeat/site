"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { useState } from "react";

/**
 * Rich-text для правовых текстов (PRD §6.4).
 *
 * Набор расширений подобран под allowlist санитайзера (lib/admin/sanitize.ts):
 * заголовки, списки, ссылки, подчёркивание, таблицы. Это важно: редактор
 * молча выбрасывает теги, которых не знает, а тексты — действующие договоры
 * с таблицами (приложения к оферте), терять их куски нельзя. По той же
 * причине есть переключатель «HTML»: если документ содержит что-то, чего
 * редактор не понимает, его всегда можно поправить в исходнике.
 */

const btn =
  "rounded px-2 py-1 text-xs font-semibold text-brand-purple-950/70 hover:bg-brand-purple-50";
const btnOn = "rounded px-2 py-1 text-xs font-semibold bg-brand-purple text-white";

function Toolbar({ editor }: Readonly<{ editor: Editor }>) {
  const mark = (active: boolean) => (active ? btnOn : btn);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-brand-purple-100 px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={mark(editor.isActive("bold"))}
        title="Полужирный"
      >
        <b>Ж</b>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={mark(editor.isActive("italic"))}
        title="Курсив"
      >
        <i>К</i>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={mark(editor.isActive("underline"))}
        title="Подчёркнутый"
      >
        <u>Ч</u>
      </button>
      <span className="mx-1 h-4 w-px bg-brand-purple-100" />
      {[1, 2, 3].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() =>
            editor
              .chain()
              .focus()
              .toggleHeading({ level: level as 1 | 2 | 3 })
              .run()
          }
          className={mark(editor.isActive("heading", { level }))}
          title={`Заголовок ${level}`}
        >
          H{level}
        </button>
      ))}
      <button
        type="button"
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={mark(editor.isActive("paragraph"))}
        title="Обычный абзац"
      >
        ¶
      </button>
      <span className="mx-1 h-4 w-px bg-brand-purple-100" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={mark(editor.isActive("bulletList"))}
        title="Маркированный список"
      >
        • Список
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={mark(editor.isActive("orderedList"))}
        title="Нумерованный список"
      >
        1. Список
      </button>
      <span className="mx-1 h-4 w-px bg-brand-purple-100" />
      <button
        type="button"
        onClick={() => {
          const previous = editor.getAttributes("link").href ?? "";
          const url = window.prompt("Ссылка (https:// или mailto:)", previous);
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href: url }).run();
        }}
        className={mark(editor.isActive("link"))}
        title="Ссылка"
      >
        Ссылка
      </button>
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
        }
        className={btn}
        title="Вставить таблицу"
      >
        Таблица
      </button>
      {editor.isActive("table") && (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className={btn}
          >
            +строка
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className={btn}
          >
            +столбец
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className={btn}
          >
            −строка
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className={btn}
          >
            удалить таблицу
          </button>
        </>
      )}
      <span className="mx-1 h-4 w-px bg-brand-purple-100" />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        className={btn}
        title="Отменить"
      >
        ↶
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        className={btn}
        title="Повторить"
      >
        ↷
      </button>
    </div>
  );
}

export function RichText({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (html: string) => void }>) {
  const [source, setSource] = useState(false);

  const editor = useEditor({
    immediatelyRender: false, // редактор в SSR не рендерим
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, protocols: ["https", "mailto"] },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "legal-content min-h-64 max-h-[32rem] overflow-y-auto px-3 py-2 text-sm outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (source) {
    return (
      <div className="rounded-xl border-[1.5px] border-brand-purple-100">
        <div className="flex justify-end border-b border-brand-purple-100 px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              editor?.commands.setContent(value);
              setSource(false);
            }}
            className={btnOn}
          >
            Вернуться к тексту
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          className="w-full rounded-b-xl px-3 py-2 font-mono text-xs outline-none"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border-[1.5px] border-brand-purple-100">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div className="flex justify-end border-t border-brand-purple-100 px-2 py-1.5">
        <button type="button" onClick={() => setSource(true)} className={btn}>
          Открыть HTML
        </button>
      </div>
    </div>
  );
}
