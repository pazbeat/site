import { BRANCH_PARAMS } from "./branches";

/**
 * Соответствие наших салонов (по префиксу серийника) и филиалов Altegio
 * (company_id). Выводится из BRANCH_PARAMS, чтобы карты не разъезжались:
 * раньше список вёлся отдельно и отстал — в нём не было Семея, и его
 * сертификаты молча не попадали бы в CRM (поймано при проверке 2026-08-21).
 * Берём из `branches.ts`, а не из каталога: каталог помечен `server-only`, и
 * скрипт обслуживания на нём падал.
 *
 * Источник истины по company_id в рантайме — поле Salon.altegioLocationId;
 * эта карта используется скриптом первичного заполнения
 * (scripts/altegio-map-salons.ts).
 */
export const SALON_PREFIX_TO_ALTEGIO: Record<string, number> =
  Object.fromEntries(
    Object.entries(BRANCH_PARAMS).map(([companyId, params]) => [
      params.prefix,
      Number(companyId),
    ]),
  );
