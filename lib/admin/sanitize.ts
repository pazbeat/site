import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Серверная санитизация правовых текстов (PRD §6.4, §9.2): allowlist тегов,
 * никаких скриптов/стилей/обработчиков. Результат безопасен для
 * dangerouslySetInnerHTML.
 */
export function sanitizeLegalHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "h1", "h2", "h3", "h4",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u",
      "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    allowedSchemes: ["https", "mailto"],
    transformTags: {
      // Внешние ссылки — безопасные rel и target
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
    },
    disallowedTagsMode: "discard",
  });
}
