import "server-only";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { base } from "./base";
import type { ShippingRow, SortingClass } from "@/lib/server/fulfillment";

const MM = 72 / 25.4;
const s = StyleSheet.create({
  table: { borderTopWidth: 0.5, borderColor: "#9aa3b2" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#9aa3b2", paddingVertical: 3 },
  th: { fontWeight: "bold", backgroundColor: "#f4f6fa" },
  cell: { paddingHorizontal: 3 },
  check: { width: 9, height: 9, borderWidth: 0.7, borderColor: "#1d2a44", marginTop: 1 },
});

/** 仕分けリスト（クラス別・名前順。家族の別々の注文もまとめて1行） */
export function SortingListDocument({ schoolName, eventName, classes }: { schoolName: string; eventName: string; classes: SortingClass[] }) {
  return (
    <Document title={`仕分けリスト ${eventName}`}>
      {classes.map((c) => (
        <Page key={c.classId} size="A4" style={base.page}>
          <Text style={base.h1}>仕分けリスト　{c.label}</Text>
          <Text style={[base.muted, { marginBottom: 8 }]}>{schoolName}　{eventName}　{c.children.length}人</Text>
          <View style={s.table}>
            <View style={[s.row, s.th]}>
              <Text style={[s.cell, { width: 18 }]}>済</Text>
              <Text style={[s.cell, { width: 150 }]}>お子さま</Text>
              <Text style={[s.cell, { flex: 1 }]}>商品と枚数</Text>
              <Text style={[s.cell, { width: 110 }]}>注文番号</Text>
            </View>
            {c.children.map((ch) => (
              <View key={ch.childId} style={s.row} wrap={false}>
                <View style={[s.cell, { width: 18 }]}><View style={s.check} /></View>
                <View style={[s.cell, { width: 150 }]}>
                  <Text style={base.bold}>{ch.name}</Text>
                  <Text style={[base.small, base.muted]}>{ch.kana}</Text>
                </View>
                <Text style={[s.cell, { flex: 1 }]}>{ch.lines.map((l) => `${l.product} × ${l.quantity}`).join("\n")}</Text>
                <Text style={[s.cell, { width: 110 }, base.small]}>{ch.orderNos.join("\n")}</Text>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}

export type LabelLayout = { cols: number; rows: number; width: number; height: number; top: number; left: number; gapX: number; gapY: number };
export const DEFAULT_LABEL_LAYOUT: LabelLayout = { cols: 2, rows: 6, width: 86.4, height: 42.3, top: 21.6, left: 18.6, gapX: 2.5, gapY: 0 };

/** お届けラベル（袋に貼る。お子さまの名前・学年・クラス・商品・枚数）。用紙の型番は未決なので位置は設定で変える */
export function SchoolLabelsDocument({ eventName, classes, layout }: { eventName: string; classes: SortingClass[]; layout: LabelLayout }) {
  const labels = classes.flatMap((c) => c.children.map((ch) => ({ ...ch, classLabel: c.label })));
  const per = layout.cols * layout.rows;
  const pages: (typeof labels)[] = [];
  for (let i = 0; i < labels.length; i += per) pages.push(labels.slice(i, i + per));
  return (
    <Document title={`お届けラベル ${eventName}`}>
      {pages.map((group, pi) => (
        <Page key={pi} size="A4" style={{ ...base.page, padding: 0 }}>
          {group.map((l, i) => {
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);
            return (
              <View
                key={`${l.childId}-${i}`}
                style={{
                  position: "absolute",
                  left: (layout.left + col * (layout.width + layout.gapX)) * MM,
                  top: (layout.top + row * (layout.height + layout.gapY)) * MM,
                  width: layout.width * MM,
                  height: layout.height * MM,
                  padding: 3 * MM,
                }}
              >
                <Text style={[base.small, base.muted]}>{eventName}</Text>
                <Text style={{ fontSize: 9 }}>{l.classLabel}</Text>
                <Text style={{ fontSize: 14, fontWeight: "bold" }}>{l.name}</Text>
                <Text style={{ fontSize: 9, marginTop: 2 }}>{l.lines.map((x) => `${x.product} × ${x.quantity}`).join("　")}</Text>
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}

/** 納品書（学校・園あて。クラスごとの本数。個人名は載せない） */
export function DeliveryNoteDocument({ schoolName, eventName, businessName, classes, date }: { schoolName: string; eventName: string; businessName: string; classes: SortingClass[]; date: string }) {
  const products = [...new Set(classes.flatMap((c) => c.children.flatMap((ch) => ch.lines.map((l) => l.product))))].sort();
  const count = (c: SortingClass, p: string) => c.children.reduce((n, ch) => n + (ch.lines.find((l) => l.product === p)?.quantity ?? 0), 0);
  return (
    <Document title={`納品書 ${eventName}`}>
      <Page size="A4" style={base.page}>
        <Text style={{ fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 16 }}>納品書</Text>
        <Text style={{ fontSize: 13, marginBottom: 4 }}>{schoolName} 御中</Text>
        <Text style={[base.muted, { textAlign: "right" }]}>{date}　{businessName}</Text>
        <Text style={{ marginVertical: 10 }}>行事：{eventName}</Text>
        <View style={s.table}>
          <View style={[s.row, s.th]}>
            <Text style={[s.cell, { flex: 1 }]}>クラス</Text>
            {products.map((p) => <Text key={p} style={[s.cell, { width: 90, textAlign: "right" }]}>{p}</Text>)}
            <Text style={[s.cell, { width: 60, textAlign: "right" }]}>人数</Text>
          </View>
          {classes.map((c) => (
            <View key={c.classId} style={s.row}>
              <Text style={[s.cell, { flex: 1 }]}>{c.label}</Text>
              {products.map((p) => <Text key={p} style={[s.cell, { width: 90, textAlign: "right" }]}>{count(c, p)}</Text>)}
              <Text style={[s.cell, { width: 60, textAlign: "right" }]}>{c.children.length}</Text>
            </View>
          ))}
          <View style={[s.row, s.th]}>
            <Text style={[s.cell, { flex: 1 }]}>合計</Text>
            {products.map((p) => <Text key={p} style={[s.cell, { width: 90, textAlign: "right" }]}>{classes.reduce((n, c) => n + count(c, p), 0)}</Text>)}
            <Text style={[s.cell, { width: 60, textAlign: "right" }]}>{classes.reduce((n, c) => n + c.children.length, 0)}</Text>
          </View>
        </View>
        <Text style={[base.small, base.muted, { marginTop: 12 }]}>お子さまごとの袋に、お名前のラベルを貼っています。</Text>
      </Page>
    </Document>
  );
}

/** 宛名ラベル（郵送） */
export function AddressLabelsDocument({ rows, layout }: { rows: ShippingRow[]; layout: LabelLayout }) {
  const per = layout.cols * layout.rows;
  const pages: ShippingRow[][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return (
    <Document title="宛名ラベル">
      {pages.map((group, pi) => (
        <Page key={pi} size="A4" style={{ ...base.page, padding: 0 }}>
          {group.map((r, i) => {
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);
            return (
              <View
                key={r.orderId}
                style={{
                  position: "absolute",
                  left: (layout.left + col * (layout.width + layout.gapX)) * MM,
                  top: (layout.top + row * (layout.height + layout.gapY)) * MM,
                  width: layout.width * MM,
                  height: layout.height * MM,
                  padding: 3 * MM,
                }}
              >
                <Text style={{ fontSize: 9 }}>〒{r.postalCode}</Text>
                <Text style={{ fontSize: 10 }}>{r.address}</Text>
                <Text style={{ fontSize: 13, fontWeight: "bold", marginTop: 2 }}>{r.name} 様</Text>
                <Text style={[base.small, base.muted, { marginTop: 2 }]}>{r.orderNo}　{r.contents}</Text>
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}
