import { useState } from "react";
import { Popover } from "radix-ui";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn, parseDateValue } from "@/lib/utils";

// grabs the page dir so the calendar + trigger flip correctly under RTL
function pageDir() {
  if (typeof document === "undefined") return "ltr";
  return document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr";
}

// our own single-date picker, replaces the native <input type="date">. trigger button shows a
// calendar icon + DD/MM/YYYY and opens a styled popover calendar. RTL- and locale-aware.
// props: value (Date | "YYYY-MM-DD" | null), onChange, placeholder, disabled, className, locale,
// minDate (Date | "YYYY-MM-DD" | null) - days before it are greyed out and unselectable.
export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
  locale,
  minDate,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);
  const min = parseDateValue(minDate);
  const dir = pageDir();
  const localeOpt = locale ? { locale } : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-[38px] min-w-40 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150",
            "hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-text-secondary",
            className
          )}
          {...rest}
        >
          <CalendarIcon size={16} className="shrink-0 text-text-secondary" />
          <span className="flex-1 text-start">
            {selected ? format(selected, "dd/MM/yyyy", localeOpt) : placeholder}
          </span>
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
            mode="single"
            selected={selected}
            defaultMonth={selected || min}
            startMonth={min}
            disabled={min ? { before: min } : undefined}
            onSelect={(d) => {
              onChange?.(d ?? null);
              setOpen(false);
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
