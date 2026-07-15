"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperadmin, auditLog } from "@/lib/admin/guard";

/**
 * Русский город — не просто подпись, а ключ: по нему Program.cities решает,
 * где программа доступна, и на нём же завязаны отчёты. Переименование города
 * поэтому идёт отдельным действием, которое чинит и программы.
 */
const salonSchema = z.object({
  city: z.string().trim().min(1).max(60),
  cityKk: z.string().trim().min(1).max(60),
  cityEn: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(200),
  addressKk: z.string().trim().min(1).max(200),
  addressEn: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,4}$/, "Префикс — 1–4 латинские буквы")
    .nullable(),
  altegioLocationId: z.number().int().positive().nullable(),
});

type SalonInput = z.infer<typeof salonSchema>;

function parseSalon(formData: FormData) {
  const raw = (k: string) => String(formData.get(k) ?? "");
  const prefix = raw("codePrefix").trim();
  const altegio = raw("altegioLocationId").trim();
  return salonSchema.safeParse({
    city: raw("city"),
    cityKk: raw("cityKk"),
    cityEn: raw("cityEn"),
    name: raw("name"),
    address: raw("address"),
    addressKk: raw("addressKk"),
    addressEn: raw("addressEn"),
    phone: raw("phone"),
    codePrefix: prefix === "" ? null : prefix,
    altegioLocationId: altegio === "" ? null : Number(altegio),
  });
}

function toData(s: SalonInput) {
  return {
    city: s.city,
    cityNames: { ru: s.city, kk: s.cityKk, en: s.cityEn },
    name: s.name,
    address: s.address,
    addressNames: { ru: s.address, kk: s.addressKk, en: s.addressEn },
    phone: s.phone,
    codePrefix: s.codePrefix,
    altegioLocationId: s.altegioLocationId,
  };
}

/** Префикс серийника уникален по салону — проверяем до записи, чтобы дать текст. */
async function prefixTaken(prefix: string | null, exceptId?: number) {
  if (!prefix) return false;
  const other = await prisma.salon.findUnique({ where: { codePrefix: prefix } });
  return Boolean(other && other.id !== exceptId);
}

export async function createSalonAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = parseSalon(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля." };
  }
  if (await prefixTaken(parsed.data.codePrefix)) {
    return { error: `Префикс ${parsed.data.codePrefix} уже занят другим салоном.` };
  }

  const count = await prisma.salon.count();
  const created = await prisma.salon.create({
    data: { ...toData(parsed.data), sort: count },
  });
  await auditLog({
    actor: admin.email,
    action: "salon.create",
    entity: "salon",
    entityId: String(created.id),
    diff: { city: created.city, address: created.address },
  });
  revalidatePath("/admin/salons");
  return { ok: true };
}

export async function updateSalonAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const parsed = parseSalon(formData);
  if (!Number.isFinite(id) || !parsed.success) {
    return { error: parsed.success ? "Салон не найден." : parsed.error.issues[0]?.message ?? "Проверьте поля." };
  }
  if (await prefixTaken(parsed.data.codePrefix, id)) {
    return { error: `Префикс ${parsed.data.codePrefix} уже занят другим салоном.` };
  }

  await prisma.salon.update({ where: { id }, data: toData(parsed.data) });
  await auditLog({
    actor: admin.email,
    action: "salon.update",
    entity: "salon",
    entityId: String(id),
    diff: { city: parsed.data.city, address: parsed.data.address },
  });
  revalidatePath("/admin/salons");
  return { ok: true };
}

export async function toggleSalonActiveAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const salon = await prisma.salon.findUnique({ where: { id } });
  if (!salon) return { error: "Салон не найден." };

  await prisma.salon.update({ where: { id }, data: { active: !salon.active } });
  await auditLog({
    actor: admin.email,
    action: salon.active ? "salon.deactivate" : "salon.activate",
    entity: "salon",
    entityId: String(id),
  });
  revalidatePath("/admin/salons");
  return { ok: true };
}

/** Удаление — только если на салон не завязаны заказы и сертификаты. */
export async function deleteSalonAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const id = Number(formData.get("id"));
  const salon = await prisma.salon.findUnique({ where: { id } });
  if (!salon) return { error: "Салон не найден." };

  const [orders, certificates] = await Promise.all([
    prisma.order.count({ where: { salonId: id } }),
    prisma.certificate.count({ where: { salonId: id } }),
  ]);
  if (orders > 0 || certificates > 0) {
    return {
      error: `Нельзя удалить: заказов ${orders}, сертификатов ${certificates}. Скройте салон вместо удаления — история продаж останется целой.`,
    };
  }

  await prisma.salon.delete({ where: { id } });
  await auditLog({
    actor: admin.email,
    action: "salon.delete",
    entity: "salon",
    entityId: String(id),
    diff: { city: salon.city, address: salon.address },
  });
  revalidatePath("/admin/salons");
  return { ok: true };
}

/** Порядок в конструкторе — обмен sort с соседом. */
export async function moveSalonAction(formData: FormData) {
  await requireSuperadmin();
  const id = Number(formData.get("id"));
  const dir = formData.get("dir") === "up" ? "up" : "down";
  const current = await prisma.salon.findUnique({ where: { id } });
  if (!current) return { error: "Салон не найден." };

  const neighbor = await prisma.salon.findFirst({
    where:
      dir === "up" ? { sort: { lt: current.sort } } : { sort: { gt: current.sort } },
    orderBy: { sort: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return { ok: true }; // край списка

  await prisma.$transaction([
    prisma.salon.update({ where: { id: current.id }, data: { sort: neighbor.sort } }),
    prisma.salon.update({ where: { id: neighbor.id }, data: { sort: current.sort } }),
  ]);
  revalidatePath("/admin/salons");
  return { ok: true };
}

const citySchema = z.object({
  oldCity: z.string().trim().min(1),
  city: z.string().trim().min(1).max(60),
  cityKk: z.string().trim().min(1).max(60),
  cityEn: z.string().trim().min(1).max(60),
});

/**
 * Правка города целиком: переводы — всем салонам города, а смена русского
 * названия тянет за собой Program.cities (иначе программы «потеряют» город
 * и исчезнут из конструктора).
 */
export async function renameCityAction(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = citySchema.safeParse({
    oldCity: formData.get("oldCity"),
    city: formData.get("city"),
    cityKk: formData.get("cityKk"),
    cityEn: formData.get("cityEn"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте названия." };
  }
  const { oldCity, city, cityKk, cityEn } = parsed.data;

  if (city !== oldCity) {
    const clash = await prisma.salon.findFirst({ where: { city } });
    if (clash) {
      return {
        error: `Город «${city}» уже есть — переносить салоны между городами здесь нельзя, смените город у самих салонов.`,
      };
    }
  }

  const affected = await prisma.program.findMany({
    where: { cities: { has: oldCity } },
    select: { id: true, cities: true },
  });

  await prisma.$transaction([
    prisma.salon.updateMany({
      where: { city: oldCity },
      data: { city, cityNames: { ru: city, kk: cityKk, en: cityEn } },
    }),
    ...affected.map((p) =>
      prisma.program.update({
        where: { id: p.id },
        data: { cities: p.cities.map((c) => (c === oldCity ? city : c)) },
      }),
    ),
  ]);

  await auditLog({
    actor: admin.email,
    action: "salon.city.update",
    entity: "salon",
    entityId: city,
    diff: { from: oldCity, to: { ru: city, kk: cityKk, en: cityEn }, programsUpdated: affected.length },
  });
  revalidatePath("/admin/salons");
  return { ok: true };
}
