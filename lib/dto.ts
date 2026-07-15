import "server-only";
import { pickL10n } from "./l10n";
import type {
  DesignBgStyle,
  DesignDto,
  NominalDto,
  ProgramDto,
  SalonDto,
} from "./types";
import type {
  Design,
  Nominal,
  Program,
  ProgramOption,
  Salon,
} from "./generated/prisma/client";

export function toProgramDto(
  program: Program & { options: ProgramOption[] },
  locale: string,
): ProgramDto {
  return {
    id: program.id,
    category: program.category,
    popular: program.popular,
    name: pickL10n(program.names, locale),
    description: pickL10n(program.descriptions, locale),
    photoUrl: program.photoUrl,
    cities: program.cities,
    options: program.options.map((o) => ({
      id: o.id,
      durationMin: o.durationMin,
      persons: o.persons,
      priceKzt: o.priceKzt,
    })),
  };
}

export function toSalonDto(salon: Salon, locale: string): SalonDto {
  return {
    id: salon.id,
    cityKey: salon.city,
    city: pickL10n(salon.cityNames, locale) || salon.city,
    name: salon.name,
    address: pickL10n(salon.addressNames, locale) || salon.address,
  };
}

export function toNominalDto(nominal: Nominal): NominalDto {
  return {
    id: nominal.id,
    amountKzt: nominal.amountKzt,
    label: nominal.label,
  };
}

export function toDesignDto(design: Design, locale: string): DesignDto {
  return {
    id: design.id,
    name: pickL10n(design.names, locale),
    imageUrl: design.imageUrl,
    bgStyle: design.bgStyle as DesignBgStyle,
    textColor: design.textColor,
  };
}
