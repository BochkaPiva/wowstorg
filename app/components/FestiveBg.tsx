"use client";

import { useMemo } from "react";

const DOTS = 24;
const COLORS = ["#a78bfa", "#c084fc", "#fbbf24", "#ec4899", "#7c3aed"];

function seed(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function FestiveBg() {
  const dots = useMemo(() => {
    return Array.from({ length: DOTS }, (_, i) => ({
      left: seed(i) * 100,
      top: seed(i + 1) * 100,
      size: 4 + seed(i + 2) * 6,
      color: COLORS[Math.floor(seed(i + 3) * COLORS.length)],
      delay: seed(i + 4) * 4,
      duration: 8 + seed(i + 5) * 4,
    }));
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {dots.map((d, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-20"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            backgroundColor: d.color,
            animation: `festive-float ${d.duration}s ease-in-out ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
