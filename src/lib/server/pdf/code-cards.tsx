import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { base } from "./base";

// 登録コードのカード（A03）：A4 に 2列×5段（1枚 91×55mm）。お子さまの名前は印字しない（13章）

export type CardData = {
  serialNo: number;
  code: string; // 4文字ずつハイフンで区切った形
  qr: string; // data URL
  schoolName: string;
  classLabel: string;
  fiscalYear: number;
  siteUrl: string;
  purpose: string;
};

const MM = 72 / 25.4;
const s = StyleSheet.create({
  page: { ...base.page, padding: 0, paddingTop: 11 * MM, paddingLeft: 14 * MM, flexDirection: "row", flexWrap: "wrap" },
  card: {
    width: 91 * MM,
    height: 55 * MM,
    padding: 3.5 * MM,
    borderWidth: 0.5,
    borderColor: "#9aa3b2",
    borderStyle: "dashed",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 7, color: "#556070" },
  heading: { fontSize: 11, fontWeight: "bold" },
  meta: { fontSize: 8 },
  code: { fontSize: 15, fontWeight: "bold", letterSpacing: 1.5, textAlign: "center", backgroundColor: "#f4f6fa", paddingVertical: 2 },
  how: { fontSize: 6.3, color: "#556070", lineHeight: 1.35 },
  qr: { width: 24 * MM, height: 24 * MM },
});

export function CodeCardsDocument({ cards }: { cards: CardData[] }) {
  const pages: CardData[][] = [];
  for (let i = 0; i < cards.length; i += 10) pages.push(cards.slice(i, i + 10));
  return (
    <Document title="登録コードのカード" author="ツチダ映像">
      {pages.map((group, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          {group.map((c) => (
            <View key={c.serialNo} style={s.card} wrap={false}>
              <View style={s.row}>
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <Text style={s.title}>ツチダ映像 DVD・Blu-ray ネット注文</Text>
                  <Text style={s.heading}>登録コード{c.purpose === "spare" ? "（予備）" : ""}</Text>
                  <Text style={s.meta}>{c.schoolName}</Text>
                  <Text style={s.meta}>{c.classLabel}</Text>
                  <Text style={s.meta}>{c.fiscalYear}年度　No.{String(c.serialNo).padStart(6, "0")}</Text>
                </View>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={c.qr} style={s.qr} />
              </View>
              <Text style={s.code}>{c.code}</Text>
              <Text style={s.how}>
                QRコードを読み取るか、{c.siteUrl} を開き、会員登録のあと「お子さまの登録」でこのコードとお子さまのお名前・ふりがなを入力してください。ご家族も同じコードで登録できます。
              </Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
