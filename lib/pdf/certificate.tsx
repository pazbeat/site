// Без "server-only": модуль нужен и воркеру очереди, и unit-тестам (vitest)
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { DesignBgStyle } from "../types";

const fontsDir = path.join(process.cwd(), "assets", "fonts");

Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(fontsDir, "Montserrat-Regular.ttf") },
    { src: path.join(fontsDir, "Montserrat-Bold.ttf"), fontWeight: 700 },
    {
      src: path.join(fontsDir, "Montserrat-Italic.ttf"),
      fontStyle: "italic",
    },
  ],
});
Font.register({
  family: "Cormorant",
  src: path.join(fontsDir, "CormorantGaramond-Bold.ttf"),
});
// Не переносить слова по дефису
Font.registerHyphenationCallback((word) => [word]);

export type CertificatePdfData = {
  code: string;
  qrDataUrl: string;
  title: string;
  subtitle?: string;
  toName: string;
  fromName: string;
  message?: string;
  validUntilLabel: string;
  validUntil: string;
  salonLine: string;
  giftLabel: string;
  codeLabel: string;
  locale: string;
  bgStyle: DesignBgStyle;
  textColor: string;
  /**
   * JPEG data-URL художественной открытки (react-pdf не умеет WebP —
   * конвертация в lib/delivery.ts). Если задан — макет «арт + панель».
   */
  imageDataUrl?: string;
};

const GOLD = "#B69244";

const styles = StyleSheet.create({
  page: { fontFamily: "Montserrat", padding: 18 },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 26,
    flexDirection: "row",
  },
  frame: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 10,
  },
  left: { flex: 1.5, paddingRight: 22, justifyContent: "space-between" },
  right: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 15, letterSpacing: 2 },
  giftLabel: {
    fontSize: 7,
    letterSpacing: 3,
    textTransform: "uppercase",
    opacity: 0.8,
    marginTop: 3,
  },
  title: { fontSize: 24, marginTop: 10 },
  subtitle: { fontSize: 10, opacity: 0.85, marginTop: 4 },
  names: { fontSize: 10, marginTop: 2 },
  message: { fontSize: 10, fontStyle: "italic", opacity: 0.9, marginTop: 8 },
  qr: { width: 110, height: 110 },
  codeLabel: {
    fontSize: 7,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#8f7335",
    marginTop: 10,
  },
  code: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 2,
    color: "#4D295D",
    marginTop: 3,
  },
  meta: { fontSize: 8, color: "#2c1736", marginTop: 8, textAlign: "center" },
});

// ---- Макет с картинкой (A5 альбом): картинка на весь лист + подложка снизу ----
// Пропорция открыток (1280×903 ≈ 1.42) совпадает с A5 landscape → без искажений.
const imgStyles = StyleSheet.create({
  page: { fontFamily: "Montserrat", position: "relative" },
  art: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Полупрозрачная фирменная подложка поверх низа картинки
    backgroundColor: "rgba(45, 22, 54, 0.82)",
    paddingVertical: 16,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  left: { flex: 1, paddingRight: 16 },
  gift: {
    fontSize: 7,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#FFFFFF",
    opacity: 0.8,
  },
  title: { fontSize: 20, color: "#FFFFFF", marginTop: 3 },
  subtitle: { fontSize: 9, color: "#FFFFFF", opacity: 0.85, marginTop: 2 },
  names: { fontSize: 10, color: "#FFFFFF", marginTop: 8 },
  message: {
    fontSize: 9,
    fontStyle: "italic",
    color: "#FFFFFF",
    opacity: 0.9,
    marginTop: 3,
  },
  meta: { fontSize: 7, color: "#FFFFFF", opacity: 0.75, marginTop: 8 },
  qrBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 7,
    alignItems: "center",
  },
  qrImg: { width: 74, height: 74 },
  qrCode: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: "#4D295D",
    marginTop: 3,
  },
});

function CertificatePdfWithImage({
  data,
}: Readonly<{ data: CertificatePdfData }>) {
  // У Cormorant нет казахских глифов (ә, ү…) — для kk заголовки в Montserrat
  const displayFamily = data.locale === "kk" ? "Montserrat" : "Cormorant";

  return (
    <Document
      title={`Imbir Thai Spa — ${data.giftLabel}`}
      author="Imbir Thai Spa"
    >
      <Page size="A5" orientation="landscape" style={imgStyles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        <Image src={data.imageDataUrl} style={imgStyles.art} />
        <View style={imgStyles.overlay}>
          <View style={imgStyles.left}>
            <Text style={imgStyles.gift}>{data.giftLabel}</Text>
            <Text style={[imgStyles.title, { fontFamily: displayFamily }]}>
              {data.title}
            </Text>
            {data.subtitle ? (
              <Text style={imgStyles.subtitle}>{data.subtitle}</Text>
            ) : null}
            <Text style={imgStyles.names}>
              {data.toName} · {data.fromName}
            </Text>
            {data.message ? (
              <Text style={imgStyles.message}>«{data.message}»</Text>
            ) : null}
            <Text style={imgStyles.meta}>
              {data.validUntilLabel}: {data.validUntil} · {data.salonLine}
            </Text>
          </View>
          <View style={imgStyles.qrBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={data.qrDataUrl} style={imgStyles.qrImg} />
            <Text style={imgStyles.qrCode}>{data.code}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function CertificatePdf({ data }: Readonly<{ data: CertificatePdfData }>) {
  const background =
    data.bgStyle.kind === "gradient"
      ? (data.bgStyle.from ?? "#4D295D") // градиент упрощаем до основного цвета
      : (data.bgStyle.color ?? "#4D295D");
  // У Cormorant нет казахских глифов (ә, ү…) — для kk заголовки в Montserrat
  const displayFamily = data.locale === "kk" ? "Montserrat" : "Cormorant";

  return (
    <Document
      title={`Imbir Thai Spa — ${data.giftLabel}`}
      author="Imbir Thai Spa"
    >
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={[styles.card, { backgroundColor: background }]}>
          <View style={styles.frame} />
          <View style={[styles.left, { color: data.textColor }]}>
            <View>
              <Text style={[styles.brand, { fontFamily: displayFamily, color: data.textColor }]}>
                IMBIR THAI SPA
              </Text>
              <Text style={[styles.giftLabel, { color: data.textColor }]}>
                {data.giftLabel}
              </Text>
            </View>
            <View>
              <Text style={[styles.title, { fontFamily: displayFamily, color: data.textColor }]}>
                {data.title}
              </Text>
              {data.subtitle ? (
                <Text style={[styles.subtitle, { color: data.textColor }]}>
                  {data.subtitle}
                </Text>
              ) : null}
            </View>
            <View>
              <Text style={[styles.names, { color: data.textColor }]}>
                {data.toName}
              </Text>
              <Text style={[styles.names, { color: data.textColor, opacity: 0.8 }]}>
                {data.fromName}
              </Text>
              {data.message ? (
                <Text style={[styles.message, { color: data.textColor }]}>
                  «{data.message}»
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.right}>
            {/* QR ведёт на /check?code=… (PRD §5.4) */}
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, не DOM */}
            <Image src={data.qrDataUrl} style={styles.qr} />
            <Text style={styles.codeLabel}>{data.codeLabel}</Text>
            <Text style={styles.code}>{data.code}</Text>
            <Text style={styles.meta}>
              {data.validUntilLabel}: {data.validUntil}
            </Text>
            <Text style={styles.meta}>{data.salonLine}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(
  data: CertificatePdfData,
): Promise<Buffer> {
  const element = data.imageDataUrl ? (
    <CertificatePdfWithImage data={data} />
  ) : (
    <CertificatePdf data={data} />
  );
  return Buffer.from(await renderToBuffer(element));
}
