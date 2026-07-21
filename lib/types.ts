/** Сериализованные объекты БД, передаваемые в клиентские компоненты. */

export type DesignBgStyle = {
  kind: "solid" | "gradient";
  color?: string;
  from?: string;
  to?: string;
  angle?: number;
  border?: string;
};

export type DesignDto = {
  id: number;
  name: string;
  imageUrl: string | null;
  bgStyle: DesignBgStyle;
  textColor: string;
};

export type ProgramOptionDto = {
  id: number;
  durationMin: number | null;
  persons: number | null;
  priceKzt: number;
};

export type ProgramHighlightDto = "hit" | "trend" | "season";

export type ProgramDto = {
  id: number;
  category: "massage" | "spa" | "set";
  /** Метка-подборка («Хит»/«В тренде»/«Сезонное»), null — без метки */
  highlight: ProgramHighlightDto | null;
  name: string;
  description: string;
  photoUrl: string | null;
  /** Пустой массив = доступна во всей сети */
  cities: string[];
  options: ProgramOptionDto[];
};

/** Предзаполнение конструктора из брошенного заказа (дожим по email-ссылке). */
export type BuilderResume = {
  salonId: number;
  type: "program" | "nominal";
  programId: number | null;
  optionId: number | null;
  nominalId: number | null;
  customAmount: string;
  designIdx: number;
  toName: string;
  fromName: string;
  message: string;
  method: "email" | "whatsapp";
  contact: string;
  buyerEmail: string;
};

export type SalonDto = {
  id: number;
  /** Русский ключ города: значение селекта и связь с ProgramDto.cities */
  cityKey: string;
  /** Локализованный город — только для показа */
  city: string;
  name: string;
  /** Локализованный адрес — только для показа */
  address: string;
};

export type NominalDto = {
  id: number;
  amountKzt: number;
  label: string | null;
};
