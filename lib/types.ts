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

export type ProgramDto = {
  id: number;
  category: "massage" | "spa" | "set";
  popular: boolean;
  name: string;
  description: string;
  photoUrl: string | null;
  /** Пустой массив = доступна во всей сети */
  cities: string[];
  options: ProgramOptionDto[];
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
