import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { base } from "./base";
import { deliveryText, type FlyerData } from "@/lib/server/flyers";
import { formatYen } from "@/lib/domain/pricing";
import { formatJstDate, formatJstDateTime } from "@/lib/domain/time";

const INK = "#1d2a44";
const BRAND = "#23417a";
const CAP = "#f3c33c";

const s = StyleSheet.create({
  page: { ...base.page, padding: 0, fontSize: 10.5 },
  band: { backgroundColor: BRAND, color: "#ffffff", paddingHorizontal: 36, paddingTop: 22, paddingBottom: 16 },
  bandSchool: { fontSize: 12, marginBottom: 4 },
  bandTitle: { fontSize: 24, fontWeight: "bold", lineHeight: 1.25 },
  bandLead: { fontSize: 13, marginTop: 4 },
  body: { paddingHorizontal: 36, paddingTop: 14, paddingBottom: 84 },
  top: { flexDirection: "row", gap: 16, marginBottom: 4 },
  qrBox: { width: 136, alignItems: "center", borderWidth: 1.5, borderColor: INK, borderRadius: 6, padding: 8 },
  qrCaption: { fontSize: 8.5, textAlign: "center", marginTop: 4, fontWeight: "bold" },
  h: { fontSize: 12, fontWeight: "bold", marginTop: 9, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 1, borderColor: INK },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#9aa3b2", paddingVertical: 4 },
  deadline: { marginTop: 10, backgroundColor: CAP, borderRadius: 6, padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  deadlineLabel: { fontSize: 11, fontWeight: "bold" },
  deadlineValue: { fontSize: 17, fontWeight: "bold" },
  step: { flexDirection: "row", gap: 8, marginBottom: 3 },
  stepNo: { width: 16, height: 16, borderRadius: 8, backgroundColor: INK, color: "#ffffff", fontSize: 9, fontWeight: "bold", textAlign: "center", paddingTop: 2 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, borderTopWidth: 1.5, borderColor: INK, paddingTop: 8, fontSize: 9.5 },
});

/** 行事の案内チラシ（A4・1枚） */
export function FlyerDocument({ d, qr, phoneOrders }: { d: FlyerData; qr: string; phoneOrders: boolean }) {
  const hasSecond = d.products.some((p) => p.secondPrice !== null);
  const hasLate = d.lateUntil !== null && d.products.some((p) => p.latePrice !== null);
  const b = d.business;
  return (
    <Document title={`${d.eventName} のご案内`}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.bandSchool}>{d.schoolName}の皆さまへ</Text>
          <Text style={s.bandTitle}>{d.eventName}</Text>
          <Text style={s.bandLead}>DVD・Blu-ray のご案内{d.heldOn ? `（${formatJstDate(d.heldOn)} 開催）` : ""}</Text>
        </View>

        <View style={s.body}>
          <View style={s.top}>
            <View style={{ flex: 1 }}>
              <Text style={[s.h, { marginTop: 0 }]}>収録内容</Text>
              <Text>{d.contents?.trim() || `${d.eventName}の様子を収録しています。`}</Text>
            </View>
            <View style={s.qrBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={qr} style={{ width: 112, height: 112 }} />
              <Text style={s.qrCaption}>スマートフォンで{"\n"}読み取ってご注文ください</Text>
            </View>
          </View>

          <Text style={s.h}>商品と価格（税込）</Text>
          <View style={[s.row, { fontWeight: "bold" }]}>
            <Text style={{ flex: 1 }}>商品</Text>
            <Text style={{ width: 80, textAlign: "right" }}>1枚目</Text>
            {hasSecond ? <Text style={{ width: 90, textAlign: "right" }}>2枚目から</Text> : null}
            {hasLate ? <Text style={{ width: 90, textAlign: "right" }}>締切後</Text> : null}
          </View>
          {d.products.map((p) => (
            <View key={p.name} style={s.row}>
              <Text style={{ flex: 1 }}>{p.name}</Text>
              <Text style={{ width: 80, textAlign: "right" }}>{formatYen(p.price)}</Text>
              {hasSecond ? <Text style={{ width: 90, textAlign: "right" }}>{p.secondPrice !== null ? formatYen(p.secondPrice) : "—"}</Text> : null}
              {hasLate ? <Text style={{ width: 90, textAlign: "right" }}>{p.latePrice !== null ? formatYen(p.latePrice) : "—"}</Text> : null}
            </View>
          ))}
          {hasSecond ? <Text style={[base.small, { marginTop: 3 }]}>「2枚目から」は、同じ商品を同じご注文で2枚以上お求めのときの、2枚目からの価格です。</Text> : null}

          <View style={s.deadline}>
            <Text style={s.deadlineLabel}>ご注文の締切</Text>
            <Text style={s.deadlineValue}>{formatJstDateTime(d.deadlineAt)}</Text>
          </View>
          {d.lateUntil ? (
            <Text style={[base.small, { marginTop: 3 }]}>締切のあとも {formatJstDateTime(d.lateUntil)} まで受け付けます（郵送のみ・締切後の価格）。</Text>
          ) : null}

          <Text style={s.h}>お届け</Text>
          <Text>{deliveryText(d)}</Text>
          {d.deliveryNote ? <Text style={{ marginTop: 2 }}>{d.deliveryNote}</Text> : null}

          <Text style={s.h}>ご注文の方法</Text>
          {[
            "上の QR コードを読み取るか、下のアドレスを開きます",
            "はじめての方は、メールアドレスで会員登録をします",
            "お配りした登録コード（カード）を入力して、お子さまを登録します",
            "商品と枚数を選んで、お支払いをします",
          ].map((t, i) => (
            <View key={t} style={s.step}>
              <Text style={s.stepNo}>{i + 1}</Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
          <Text style={[base.small, { marginTop: 2 }]}>{d.orderUrl}</Text>

          <Text style={s.h}>お支払い方法</Text>
          <Text>{d.paymentMethods.join("・")}</Text>
          <Text style={[base.small, { marginTop: 2 }]}>ご注文の取り消しは、締切までマイページからできます。くわしくは注文サイトの「キャンセル・交換について」をご覧ください。</Text>
          {phoneOrders && b.phone ? (
            <Text style={{ marginTop: 6 }}>スマートフォンをお持ちでない方は、お電話でもご注文いただけます（{b.phone}）。</Text>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text style={{ fontWeight: "bold", fontSize: 11 }}>{b.name}</Text>
          <Text>{[b.postal_code ? `〒${b.postal_code}` : "", b.address].filter(Boolean).join(" ")}</Text>
          <Text>{[b.phone ? `電話 ${b.phone}` : "", b.hours ? `（${b.hours}）` : "", b.email ? `メール ${b.email}` : ""].filter(Boolean).join("　")}</Text>
          <Text style={[base.small, base.muted, { marginTop: 2 }]}>事業者の表示などは、注文サイトの「特定商取引法に基づく表記」をご覧ください。</Text>
        </View>
      </Page>
    </Document>
  );
}
