"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const EDGE_START_PX = 28;
const MIN_SWIPE_PX = 72;
const MAX_Y_DRIFT_PX = 42;

export default function SwipeBack() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let active = false;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    function onTouchStart(event: TouchEvent) {
      if (pathname === "/") {
        return;
      }
      if (!event.touches || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (touch.clientX > EDGE_START_PX) {
        return;
      }
      active = true;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    }

    function onTouchEnd(event: TouchEvent) {
      if (!active) {
        return;
      }
      active = false;
      const touch = event.changedTouches?.[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      const dt = Date.now() - startTime;
      if (dx >= MIN_SWIPE_PX && dy <= MAX_Y_DRIFT_PX && dt <= 800) {
        router.back();
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  return null;
}
