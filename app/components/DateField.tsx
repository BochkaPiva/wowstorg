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
 * Поле выбора даты.
 * На десктопе (md+): нативный input виден и кликабелен — пикер открывается по клику.
 * На мобильных: видимая подпись под нашим контролем (без вылезания), нативный input поверх с opacity-0 — тап открывает пикер.
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
      className={`relative min-w-0 max-w-full overflow-hidden rounded-xl py-0 text-sm ${borderClass} ${className}`}
    >
      {/* Мобильные: видимая подпись, input поверх прозрачный — тап по области открывает пикер */}
      <div
        className="pointer-events-none py-2 pl-3 pr-10 text-left text-[var(--foreground)] md:hidden"
        aria-hidden
      >
        {value ? formatDateDisplay(value) : "Выберите дату"}
      </div>
      {/* На десктопе (md+): нативный input виден и сразу кликабелен */}
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        style={{ fontSize: "16px" }}
        className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent py-2 pl-3 pr-10 opacity-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-inset md:relative md:inset-auto md:block md:h-auto md:min-h-[2.5rem] md:opacity-100"
      />
    </div>
  );
}
