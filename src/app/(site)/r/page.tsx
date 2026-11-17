import type { Metadata } from "next";
import { getMember } from "@/lib/server/auth";
import { CodeEntry } from "./code-entry";

export const metadata: Metadata = { title: "登録コード", robots: { index: false } };

export default async function CodeEntryPage() {
  const member = await getMember();
  return <CodeEntry loggedIn={Boolean(member)} />;
}
