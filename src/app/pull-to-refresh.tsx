"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

// WebView Android Capacitor tidak punya gestur "tarik ke bawah buat refresh"
// bawaan (beda dari Chrome/Safari biasa) -- sebelumnya satu-satunya cara
// menyegarkan konten adalah menutup penuh & buka ulang app. Cuma aktif di
// app native; browser desktop/mobile sudah punya cara refresh sendiri.
const TRIGGER_PULL = 60; // jarak visual (px, setelah resistensi) buat memicu reload
const MAX_PULL = 90;

function findScrollableAncestor(start: Element | null): Element {
  let node = start;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

export default function PullToRefresh() {
  const [isNative, setIsNative] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullValueRef = useRef(0);
  const dragState = useRef<{ startY: number; scrollEl: Element | null; active: boolean }>({
    startY: 0,
    scrollEl: null,
    active: false,
  });

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    if (!isNative || refreshing) return;

    function reset() {
      dragState.current.active = false;
      pullValueRef.current = 0;
      setPull(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const scrollEl = findScrollableAncestor(e.target as Element);
      if (scrollEl.scrollTop > 0) return;
      dragState.current = { startY: touch.clientY, scrollEl, active: true };
    }

    function onTouchMove(e: TouchEvent) {
      const drag = dragState.current;
      if (!drag.active) return;
      const touch = e.touches[0];
      const delta = touch.clientY - drag.startY;
      if (delta <= 0 || (drag.scrollEl && drag.scrollEl.scrollTop > 0)) {
        reset();
        return;
      }
      const visual = Math.min(delta * 0.45, MAX_PULL);
      pullValueRef.current = visual;
      setPull(visual);
    }

    function onTouchEnd() {
      const drag = dragState.current;
      if (!drag.active) return;
      drag.active = false;
      if (pullValueRef.current >= TRIGGER_PULL) {
        setRefreshing(true);
        setPull(TRIGGER_PULL);
        window.location.reload();
      } else {
        setPull(0);
      }
      pullValueRef.current = 0;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [isNative, refreshing]);

  if (!isNative || (pull === 0 && !refreshing)) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] flex justify-center overflow-hidden transition-[height] duration-150"
      style={{ height: refreshing ? 44 : pull }}
    >
      <div className="mt-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
        <span
          className={`h-4 w-4 rounded-full border-2 border-brand-600 border-t-transparent ${
            refreshing ? "animate-spin" : ""
          }`}
          style={!refreshing ? { transform: `rotate(${pull * 3}deg)` } : undefined}
        />
      </div>
    </div>
  );
}
