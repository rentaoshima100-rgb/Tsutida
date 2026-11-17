import { cardDataFor } from "@/lib/server/codes";
import { staffOr401 } from "@/lib/server/admin-guard";
import { CodeCardsDocument } from "@/lib/server/pdf/code-cards";
import { pdfResponse, renderPdf } from "@/lib/server/pdf/base";

export const maxDuration = 60;

// A03 登録コードのカード（PDF）。何百枚もあるときは、クラスごとに分けて作る（13章）
export async function GET(request: Request) {
  const { response } = await staffOr401();
  if (response) return response;
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId") ?? undefined;
  const codeIds = url.searchParams.getAll("id");
  if (!classId && codeIds.length === 0) return new Response("classId か id が必要です", { status: 400 });
  const cards = await cardDataFor({ classId, codeIds, onlyUnused: url.searchParams.get("unused") === "1" });
  if (cards.length === 0) return new Response("印刷するコードがありません", { status: 404 });
  const pdf = await renderPdf(<CodeCardsDocument cards={cards} />);
  return pdfResponse(pdf, `登録コード_${cards[0].schoolName}_${cards[0].classLabel}.pdf`);
}
