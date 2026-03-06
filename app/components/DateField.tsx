"use client";

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
 * Поле выбора даты: видимая подпись под нашим контролем (не вылезает на мобильных),
 * нативный input скрыт и только открывает пикер по тапу.
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
  const borderClass =
    variant === "readyBy"
      ? "border-2 border-amber-300 bg-amber-50"
      : "border border-[var(--border)] bg-white";

  return (
    <div
      className={`relative min-w-0 max-w-full overflow-hidden rounded-xl py-2 pl-3 pr-10 text-sm ${borderClass} ${className}`}
    >
      {/* Видимый текст — не перехватывает клики */}
      <div
        className="pointer-events-none select-none text-left text-[var(--foreground)]"
        aria-hidden="true"
      >
        {value ? formatDateDisplay(value) : "Выберите дату"}
      </div>
      {/* Невидимый input поверх всего блока — кликабелен и на десктопе, и на мобильных */}
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        style={{ fontSize: "16px" }}
        aria-hidden="false"
        tabIndex={0}
      />
    </div>
  );
}
