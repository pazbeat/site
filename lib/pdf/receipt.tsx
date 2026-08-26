// Без "server-only": модуль нужен и воркеру очереди, и unit-тестам (vitest)
import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { COMPANY } from "../company";

/**
 * Товарный чек к заказу: кто продал, что, за сколько и когда.
 *
 * Это НЕ фискальный чек ОФД — его выдаёт касса продавца, и к сайту она не
 * подключена (в Altegio у филиалов не заведён кассовый провайдер, проверено
 * 2026-08-26). Здесь — документ, подтверждающий покупку: с реквизитами
 * продавца, номером заказа, позицией и суммой.
 *
 * Шрифт один, Montserrat: у Cormorant нет знака ₸, а в чеке он в каждой
 * строке.
 */

const fontsDir = path.join(process.cwd(), "assets", "fonts");

Font.register({
  family: "MontserratReceipt",
  fonts: [
    { src: path.join(fontsDir, "Montserrat-Regular.ttf") },
    { src: path.join(fontsDir, "Montserrat-Bold.ttf"), fontWeight: 700 },
  ],
});

const PURPLE = "#4D295D";
const GOLD = "#B69244";
const INK = "#2A1733";
const MUTED = "#6B5A72";

export type ReceiptLabels = {
  title: string;
  seller: string;
  bin: string;
  address: string;
  phone: string;
  orderNo: string;
  date: string;
  method: string;
  item: string;
  amount: string;
  discount: string;
  total: string;
  certificate: string;
  validUntil: string;
  note: string;
  filename: string;
};

export type ReceiptPdfData = {
  labels: ReceiptLabels;
  orderRef: string;
  dateLabel: string;
  methodLabel: string;
  itemTitle: string;
  /** Номинал сертификата (полная стоимость позиции). */
  faceKzt: number;
  /** Сколько реально оплачено — меньше номинала при промокоде. */
  paidKzt: number;
  certificateCode: string;
  validUntil: string;
  salonLine: string;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "MontserratReceipt",
    fontSize: 9,
    color: INK,
    paddingVertical: 36,
    paddingHorizontal: 40,
  },
  head: {
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 16, fontWeight: 700, color: PURPLE },
  title: { fontSize: 11, color: MUTED, marginTop: 3 },
  block: { marginBottom: 14 },
  row: { flexDirection: "row", marginBottom: 3 },
  key: { width: 130, color: MUTED },
  val: { flex: 1 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E4DAE8",
    paddingBottom: 5,
    marginBottom: 6,
    color: MUTED,
  },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  colItem: { flex: 1, paddingRight: 12 },
  colSum: { width: 90, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E4DAE8",
    marginTop: 6,
    paddingTop: 8,
  },
  totalLabel: { flex: 1, paddingRight: 12, fontWeight: 700 },
  totalSum: { width: 90, textAlign: "right", fontWeight: 700, fontSize: 12, color: PURPLE },
  note: {
    marginTop: 22,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E4DAE8",
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.5,
  },
});

/** Сумма с разделителем тысяч и знаком тенге. */
export function kzt(value: number): string {
  return `${value.toLocaleString("ru-RU").replace(/ /g, " ")} ₸`;
}

function Receipt({ data }: Readonly<{ data: ReceiptPdfData }>) {
  const l = data.labels;
  const discount = data.faceKzt - data.paidKzt;
  return (
    <Document title={`${COMPANY.brand} — ${l.title}`} author={COMPANY.legalName}>
      <Page size="A5" style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.brand}>{COMPANY.brand}</Text>
          <Text style={styles.title}>{l.title}</Text>
        </View>

        <View style={styles.block}>
          <View style={styles.row}>
            <Text style={styles.key}>{l.seller}</Text>
            <Text style={styles.val}>{COMPANY.legalName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.bin}</Text>
            <Text style={styles.val}>{COMPANY.bin}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.address}</Text>
            <Text style={styles.val}>{COMPANY.legalAddress}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.phone}</Text>
            <Text style={styles.val}>{COMPANY.phone}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.row}>
            <Text style={styles.key}>{l.orderNo}</Text>
            <Text style={styles.val}>{data.orderRef}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.date}</Text>
            <Text style={styles.val}>{data.dateLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.method}</Text>
            <Text style={styles.val}>{data.methodLabel}</Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.colItem}>{l.item}</Text>
          <Text style={styles.colSum}>{l.amount}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.colItem}>{data.itemTitle}</Text>
          <Text style={styles.colSum}>{kzt(data.faceKzt)}</Text>
        </View>
        {discount > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.colItem}>{l.discount}</Text>
            <Text style={styles.colSum}>−{kzt(discount)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{l.total}</Text>
          <Text style={styles.totalSum}>{kzt(data.paidKzt)}</Text>
        </View>

        <View style={[styles.block, { marginTop: 18 }]}>
          <View style={styles.row}>
            <Text style={styles.key}>{l.certificate}</Text>
            <Text style={styles.val}>{data.certificateCode}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>{l.validUntil}</Text>
            <Text style={styles.val}>{data.validUntil}</Text>
          </View>
        </View>

        <Text style={styles.note}>
          {l.note}
          {"\n"}
          {data.salonLine}
        </Text>
      </Page>
    </Document>
  );
}

export function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<Receipt data={data} />);
}
