"use client";

import { useEffect } from "react";

/** 註冊 PWA service worker（僅正式環境，避免開發時快取干擾） */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 註冊失敗不影響主要功能
    });
  }, []);
  return null;
}
