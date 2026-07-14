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

// ---- Макет с картинкой-открыткой (A5 портрет): арт сверху + панель снизу ----
const imgStyles = StyleSheet.create({
  page: { padding: 16, backgroundColor: "#FFFFFF" },
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GOLD,
  },
  art: { width: "100%", objectFit: "cover" },
  panel: { flex: 1, padding: 20, flexDirection: "column" },
  headRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 12, letterSpacing: 2 },
  gift: {
    fontSize: 7,
    letterSpacing: 3,
    textTransform: "uppercase",
    opacity: 0.75,
  },
  title: { fontSize: 22, marginTop: 12 },
  subtitle: { fontSize: 10, opacity: 0.85, marginTop: 3 },
  names: { fontSize: 11, marginTop: 10 },
  from: { fontSize: 10, opacity: 0.8, marginTop: 2 },
  message: { fontSize: 11, fontStyle: "italic", opacity: 0.92, marginTop: 8 },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  metaLine: { fontSize: 8, opacity: 0.85, marginTop: 3 },
  qrBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  qrImg: { width: 92, height: 92 },
  qrCode: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "#4D295D",
    marginTop: 4,
  },
});

function CertificatePdfWithImage({
  data,
}: Readonly<{ data: CertificatePdfData }>) {
  const panelBg =
    data.bgStyle.kind === "gradient"
      ? (data.bgStyle.from ?? "#4D295D")
      : (data.bgStyle.color ?? "#4D295D");
  const text = data.textColor || "#FFFFFF";
  const displayFamily = data.locale === "kk" ? "Montserrat" : "Cormorant";

  return (
    <Document
      title={`Imbir Thai Spa — ${data.giftLabel}`}
      author="Imbir Thai Spa"
    >
      <Page size="A5" style={imgStyles.page}>
        <View style={imgStyles.card}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={data.imageDataUrl} style={imgStyles.art} />
          <View style={[imgStyles.panel, { backgroundColor: panelBg }]}>
            <View style={imgStyles.headRow}>
              <Text
                style={[
                  imgStyles.brand,
                  { fontFamily: displayFamily, color: text },
                ]}
              >
                IMBIR THAI SPA
              </Text>
              <Text style={[imgStyles.gift, { color: text }]}>
                {data.giftLabel}
              </Text>
            </View>

            <Text
              style={[
                imgStyles.title,
                { fontFamily: displayFamily, color: text },
              ]}
            >
              {data.title}
            </Text>
            {data.subtitle ? (
              <Text style={[imgStyles.subtitle, { color: text }]}>
                {data.subtitle}
              </Text>
            ) : null}

            <Text style={[imgStyles.names, { color: text }]}>
              {data.toName}
            </Text>
            <Text style={[imgStyles.from, { color: text }]}>
              {data.fromName}
            </Text>
            {data.message ? (
              <Text style={[imgStyles.message, { color: text }]}>
                «{data.message}»
              </Text>
            ) : null}

            <View style={imgStyles.footer}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[imgStyles.metaLine, { color: text }]}>
                  {data.validUntilLabel}: {data.validUntil}
                </Text>
                <Text style={[imgStyles.metaLine, { color: text }]}>
                  {data.salonLine}
                </Text>
              </View>
              <View style={imgStyles.qrBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                <Image src={data.qrDataUrl} style={imgStyles.qrImg} />
                <Text style={imgStyles.qrCode}>{data.code}</Text>
              </View>
            </View>
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
