import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn, parseDateValue } from "@/lib/utils";

function pageDir() {
  if (typeof document === "undefined") return "ltr";
  return document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr";
}

/** Two months side-by-side on wider screens, one on phones. */
function useMonthCount() {
  const [count, setCount] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
      ? 2
      : 1
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setCount(mq.matches ? 2 : 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return count;
}

/**
 * A From → To range picker that replaces a pair of native date inputs with a
 * single trigger and one range calendar.
 *
 * Props:
 *   from        Date | "YYYY-MM-DD" string | null — range start
 *   to          Date | "YYYY-MM-DD" string | null — range end
 *   onSelect    ({ from, to }) => void  (each is Date | null)
 *   placeholder string shown when nothing is selected
 *   disabled    boolean
 *   className   extra classes for the trigger button
 *   locale      optional date-fns locale (e.g. `ar` for Arabic)
 */
export default function DateRangePicker({
  from,
  to,
  onSelect,
  placeholder = "Select range",
  disabled = false,
  className,
  locale,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const dir = pageDir();
  const months = useMonthCount();
  const localeOpt = locale ? { locale } : undefined;

  const fromDate = parseDateValue(from);
  const toDate = parseDateValue(to);
  const selected = fromDate ? { from: fromDate, to: toDate } : undefined;

  const fmt = (d) => format(d, "dd/MM/yyyy", localeOpt);
  let label = placeholder;
  if (fromDate && toDate) label = `${fmt(fromDate)} – ${fmt(toDate)}`;
  else if (fromDate) label = `${fmt(fromDate)} – …`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-[38px] min-w-[14rem] items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150",
            "hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !fromDate && "text-text-secondary",
            className
          )}
          {...rest}
        >
          <CalendarIcon size={16} className="shrink-0 text-text-secondary" />
          <span className="flex-1 text-start">{label}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          dir={dir}
          className="pb-popover z-50 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <DayPicker
            mode="range"
            selected={selected}
            defaultMonth={fromDate}
            numberOfMonths={months}
            onSelect={(range) => {
              onSelect?.({ from: range?.from ?? null, to: range?.to ?? null });
              if (range?.from && range?.to) setOpen(false);
            }}
            locale={locale}
            dir={dir}
            showOutsideDays
            animate
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
