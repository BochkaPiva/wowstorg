"use client";

import { useRef } from "react";

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDateDisplay(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!m || m < 1 || m > 12) return isoDate;
  const day = d ?? 1;
  const month = MONTHS_RU[m - 1];
  const year = y ?? new Date().getFullYear();
  return `${day} ${month} ${year} г.`;
}

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  /** Вариант оформления: каталог (жёлтая рамка для готовности) или обычный */
  variant?: "default" | "readyBy";
};

/**
 * Поле выбора даты: видимая подпись под нашим контролем (не вылезает на мобильных).
 * По клику по видимой области программно вызывается input.click() — так пикер открывается и на десктопе, и на мобильных.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  id,
  className = "",
  variant = "default",
}: DateFieldProps) {
  const inputId = id ?? `date-${Math.random().toString(36).slice(2, 9)}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const borderClass =
    variant === "readyBy"
      ? "border-2 border-amber-300 bg-amber-50"
      : "border border-[var(--border)] bg-white";

  return (
    <>
      <input
        id={inputId}
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="sr-only"
        style={{ fontSize: "16px" }}
        tabIndex={-1}
        aria-hidden
      />
      <div
        role="button"
        tabIndex={0}
        className={`min-w-0 max-w-full cursor-pointer rounded-xl py-2 pl-3 pr-10 text-left text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 ${borderClass} ${className}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {value ? formatDateDisplay(value) : "Выберите дату"}
      </div>
    </>
  );
}
