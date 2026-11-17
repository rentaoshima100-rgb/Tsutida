"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// G08 登録コードの入口：# 以降のコードを読み、sessionStorage に一時保存して先へ進む（4章）
export function CodeEntry({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    try {
      if (code) sessionStorage.setItem("pending_code", code);
    } catch {
      // 保存できない環境では、M08 で手で入力してもらう
    }
    // アドレスからコードを消す（履歴や共有に残さない）
    window.history.replaceState(null, "", "/r");
    router.replace(loggedIn ? "/mypage/children" : "/signup?next=%2Fmypage%2Fchildren");
  }, [loggedIn, router]);
  return <p className="py-16 text-center text-lg">登録コードを読み取っています…</p>;
}
