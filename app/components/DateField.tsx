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
 * На десктопе (lg+, ≥1024px): нативный input виден и кликабелен.
 * В уменьшенном окне и на мобильных (<1024px): видимая подпись, input поверх с z-10 и малой opacity — тап/клик открывает пикер.
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
      className={`relative min-w-0 max-w-full overflow-hidden rounded-xl py-0 text-sm min-h-[2.75rem] ${borderClass} ${className}`}
    >
      {/* Мобильные / уменьшенное окно: видимая подпись, input поверх — тап открывает пикер */}
      <div
        className="pointer-events-none py-2 pl-3 pr-10 text-left text-[var(--foreground)] lg:hidden"
        aria-hidden
      >
        {value ? formatDateDisplay(value) : "Выберите дату"}
      </div>
      {/* На десктопе (lg+): нативный input виден. Ниже lg: input поверх с минимальной opacity для hit-test в WebView/уменьшенном окне */}
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        style={{ fontSize: "16px" }}
        className="absolute inset-0 z-10 h-full w-full min-h-[2.75rem] cursor-pointer border-0 bg-transparent py-2 pl-3 pr-10 opacity-[0.01] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-inset lg:relative lg:z-auto lg:block lg:h-auto lg:min-h-0 lg:opacity-100"
      />
    </div>
  );
}
