"use client";

import { useSyncExternalStore } from "react";
import { Notice } from "./notice";

// LINE 以外のアプリ内ブラウザ（Instagram・Facebook など）では、ログインの前に
// 「Safari／Chrome で開く」案内を出す（4章）。PayPay から戻ったときにログインし直しになるのを防ぐ

const IN_APP = /(FBAN|FBAV|Instagram|Line\/|KAKAOTALK|Twitter|YJApp|GSA\/)/i;

function subscribe() {
  return () => {};
}

export function InAppBrowserNotice() {
  const inApp = useSyncExternalStore(
    subscribe,
    () => IN_APP.test(navigator.userAgent),
    () => false,
  );
  if (!inApp) return null;
  return (
    <Notice tone="warning" title="Safari または Chrome で開いてください">
      アプリの中のブラウザでは、お支払いのあとにログインし直しになることがあります。画面の「…」や「共有」から、
      「Safari で開く」または「ブラウザで開く」を選んでください。
    </Notice>
  );
}
