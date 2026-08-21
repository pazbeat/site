/**
 * Складские параметры филиалов Altegio: company_id → storage/master/account
 * и префикс серийника. Вынесено отдельным модулем БЕЗ `server-only`, потому
 * что этими данными пользуются и скрипты обслуживания (tsx запускает их вне
 * серверного окружения Next, и `server-only` там падает).
 * Секретов здесь нет — только идентификаторы справочников.
 */

export type BranchParams = {
  storageId: number;
  masterId: number;
  accountId: number;
  prefix: string;
  city: string;
  name: string;
};

/** company_id → складские параметры филиала (storage/master/account). */
export const BRANCH_PARAMS: Record<string, BranchParams> = {
  "225022": {
    "storageId": 424028,
    "masterId": 646602,
    "accountId": 551001,
    "prefix": "WM",
    "city": "Астана",
    "name": "Мангілік ел, 29/2"
  },
  "260948": {
    "storageId": 498843,
    "masterId": 768720,
    "accountId": 551003,
    "prefix": "WT",
    "city": "Астана",
    "name": "Тәуелсіздік, 40/5"
  },
  "271994": {
    "storageId": 520076,
    "masterId": 810339,
    "accountId": 525227,
    "prefix": "WN",
    "city": "Алматы",
    "name": "Наурызбай батыра, 99/1"
  },
  "271997": {
    "storageId": 520082,
    "masterId": 808893,
    "accountId": 521969,
    "prefix": "WR",
    "city": "Алматы",
    "name": "Розыбакиева, 247"
  },
  "375262": {
    "storageId": 734440,
    "masterId": 1106967,
    "accountId": 737273,
    "prefix": "WK",
    "city": "Караганда",
    "name": "Гоголя, 34A"
  },
  "375266": {
    "storageId": 734448,
    "masterId": 1106973,
    "accountId": 737281,
    "prefix": "WP",
    "city": "Павлодар",
    "name": "Бектурова, 79"
  },
  "1257161": {
    "storageId": 2520011,
    "masterId": 2754733,
    "accountId": 2544855,
    "prefix": "WB",
    "city": "Астана",
    "name": "Бокейхана, 24"
  },
  "1355056": {
    "storageId": 2720488,
    "masterId": 3010072,
    "accountId": 2749076,
    "prefix": "WS",
    "city": "Семей",
    "name": "Рымбека Ильяшева, 45А"
  }
};

/** company_id → { номинал(тенге) → good_id } (номинальные сертификаты). */
