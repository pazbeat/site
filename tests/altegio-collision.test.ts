import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Номер сертификата уникален в филиале Altegio, а нумерация там общая с
 * действующим сайтом: часть номеров уже занята его историей. На занятом
 * номере Altegio отвергает продажу целиком — сертификат в CRM не появляется.
 *
 * Раньше такой отказ принимался за идемпотентный повтор и записывался как
 * «синхронизировано»: покупатель получал номер, которого в CRM нет, а кассир
 * по этому номеру нашёл бы чужой сертификат (поймано живьём 2026-08-26, WM0006).
 */

const issue = vi.fn();
const nextSerial = vi.fn();
const updates: Array<Record<string, unknown>> = [];

let cert: Record<string, unknown>;

vi.mock("../lib/altegio/operations", () => ({
  issueCertificateOperation: (...args: unknown[]) => issue(...args),
}));
vi.mock("../lib/certificates", () => ({
  nextSalonSerial: (...args: unknown[]) => nextSerial(...args),
}));
vi.mock("../lib/altegio/client", () => ({ isAltegioConfigured: () => true }));
vi.mock("../lib/altegio/redemptions", () => ({
  syncOneCertificate: async () => {},
}));
vi.mock("../lib/crypto", () => ({
  encryptSecret: (v: string) => `enc:${v}`,
  decryptSecret: (v: string) => v.replace(/^enc:/, ""),
}));
vi.mock("../lib/db", () => ({
  prisma: {
    certificate: {
      findUnique: async () => cert,
      findUniqueOrThrow: async () => cert,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(cert, data);
        return cert;
      },
    },
  },
}));

const { syncCertificateToAltegio } = await import("../lib/altegio/sync");

beforeEach(() => {
  vi.stubEnv("ALTEGIO_SYNC", "1");
  vi.stubEnv("ALTEGIO_TEST", "0");
  issue.mockReset();
  nextSerial.mockReset();
  updates.length = 0;
  cert = {
    id: "cert1",
    salonId: 1,
    salon: { altegioLocationId: 225022 },
    serial: "WM9001",
    codeEncrypted: "enc:WM9001",
    amountKzt: 20000,
    balanceKzt: 20000,
    fromName: "Покупатель",
    orderId: "ord1",
    order: { buyerEmail: "a@b.kz", buyerPhone: null },
    programOption: null,
    altegioCertId: null,
    altegioCompanyId: null,
  };
});

describe("занятый номер сертификата в Altegio", () => {
  it("берёт следующий номер и выпускает под ним", async () => {
    issue
      .mockResolvedValueOnce({
        status: "already_exists",
        companyId: 225022,
        number: "WM9001",
        message: "Gift card with such number already exists",
      })
      .mockResolvedValueOnce({
        status: "issued",
        documentId: 777,
        companyId: 225022,
        clientId: null,
        number: "WM9002",
        clientPhone: "",
        paid: true,
        fallback: false,
      });
    nextSerial.mockResolvedValue("WM9002");

    await syncCertificateToAltegio("cert1");

    expect(issue).toHaveBeenCalledTimes(2);
    expect(issue.mock.calls[1][0].code).toBe("WM9002");
    // Номер сертификата переписан вместе с хэшем — иначе проверка по коду
    // искала бы старое значение.
    const renumber = updates.find((u) => u.serial === "WM9002");
    expect(renumber).toBeTruthy();
    expect(renumber!.codeHash).toBeTypeOf("string");
    expect(cert.altegioSyncStatus).toBe("synced");
    expect(cert.altegioCertId).toBe("777");
  });

  it("не считает чужой номер успехом, если подобрать замену нечем", async () => {
    cert.serial = null;
    issue.mockResolvedValue({
      status: "already_exists",
      companyId: 225022,
      number: "IMB-AAAA-BBBB",
      message: "Gift card with such number already exists",
    });

    await expect(syncCertificateToAltegio("cert1")).rejects.toThrow(/занят/);
    expect(cert.altegioSyncStatus).toBe("failed");
  });

  it("свой же повтор остаётся идемпотентным успехом", async () => {
    // Документ продажи уже записан за этим сертификатом — значит номер занят
    // нами, и перевыпускать под новым номером нечего.
    cert.altegioCertId = "764020108";
    issue.mockResolvedValue({
      status: "already_exists",
      companyId: 225022,
      number: "WM9001",
      message: "Gift card with such number already exists",
    });

    await syncCertificateToAltegio("cert1");

    expect(issue).toHaveBeenCalledTimes(1);
    expect(nextSerial).not.toHaveBeenCalled();
    expect(cert.altegioSyncStatus).toBe("synced");
  });

  it("сдаётся после десяти занятых номеров, а не молотит дальше", async () => {
    issue.mockResolvedValue({
      status: "already_exists",
      companyId: 225022,
      number: "WM9001",
      message: "Gift card with such number already exists",
    });
    let n = 9001;
    nextSerial.mockImplementation(async () => `WM${++n}`);

    await expect(syncCertificateToAltegio("cert1")).rejects.toThrow(
      /свободный номер/,
    );
    expect(issue).toHaveBeenCalledTimes(10);
    expect(cert.altegioSyncStatus).toBe("failed");
  });
});
