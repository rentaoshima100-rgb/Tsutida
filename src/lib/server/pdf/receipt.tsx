import "server-only";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { base } from "./base";

// 領収書（M07）：支払い済みの注文だけ。適格請求書にするかは未決（17章）
const s = StyleSheet.create({
  box: { borderWidth: 1, borderColor: "#1d2a44", padding: 16, marginTop: 16 },
  amount: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginVertical: 12 },
});

export function ReceiptDocument(p: {
  name: string;
  amount: string;
  proviso: string;
  issuedOn: string;
  paidOn: string;
  orderNo: string;
  business: { name: string; postalCode: string; address: string; phone: string };
  lines: string[];
}) {
  return (
    <Document title={`領収書 ${p.orderNo}`}>
      <Page size="A5" orientation="landscape" style={base.page}>
        <Text style={{ fontSize: 20, fontWeight: "bold", textAlign: "center" }}>領収書</Text>
        <Text style={{ textAlign: "right", marginTop: 4 }}>発行日 {p.issuedOn}　No. {p.orderNo}</Text>
        <View style={s.box}>
          <Text style={{ fontSize: 13 }}>{p.name} 様</Text>
          <Text style={s.amount}>{p.amount}（税込）</Text>
          <Text>但し {p.proviso}</Text>
          <Text style={[base.small, base.muted, { marginTop: 4 }]}>お支払い日 {p.paidOn}</Text>
          <Text style={[base.small, base.muted, { marginTop: 4 }]}>{p.lines.join("　")}</Text>
        </View>
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <Text style={base.bold}>{p.business.name}</Text>
          <Text style={base.small}>{p.business.postalCode ? `〒${p.business.postalCode} ` : ""}{p.business.address}</Text>
          <Text style={base.small}>{p.business.phone}</Text>
        </View>
      </Page>
    </Document>
  );
}
