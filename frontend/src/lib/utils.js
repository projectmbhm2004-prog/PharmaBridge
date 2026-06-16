import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// the usual clsx + tailwind-merge combo the shadcn components want
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// turn a Date / "YYYY-MM-DD" string / null into a local Date for the calendar.
// parse bare date strings as LOCAL midnight, not UTC - otherwise the picked day jumps a
// day in some timezones. undefined when there's nothing to select.
export function parseDateValue(value) {
  if (!value) return undefined;
  if (value instanceof Date) return isNaN(value) ? undefined : value;
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return isNaN(d) ? undefined : d;
  }
  return undefined;
}

// Date -> "YYYY-MM-DD" using local fields. has to match exactly what the old
// <input type="date"> produced so the query params / filter state stay identical. ""  on null/invalid.
export function toISODate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : parseDateValue(date);
  if (!d || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// money, e.g. "₪1,234.00"
export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `₪${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// date only, e.g. "Jun 5, 2026"
export function formatDate(str) {
  if (!str) return "";
  const date = new Date(str);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// date + time, e.g. "Jun 5, 2026 · 3:45 PM"
export function formatDateTime(str) {
  if (!str) return "";
  const date = new Date(str);
  if (isNaN(date)) return "";
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

// relative time, e.g. "2 hours ago"
export function timeAgo(str) {
  if (!str) return "";
  const date = new Date(str);
  if (isNaN(date)) return "";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";

  const units = [
    { label: "year", secs: 31536000 },
    { label: "month", secs: 2592000 },
    { label: "week", secs: 604800 },
    { label: "day", secs: 86400 },
    { label: "hour", secs: 3600 },
    { label: "minute", secs: 60 },
    { label: "second", secs: 1 },
  ];

  for (const { label, secs } of units) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) {
      return `${count} ${label}${count > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

// badge colors per order status
export function getStatusColor(status) {
  const map = {
    pending: "bg-amber-100 text-amber-700",
    accepted: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    picked_up: "bg-blue-100 text-blue-700",
    on_the_way: "bg-indigo-100 text-indigo-700",
    arrived: "bg-purple-100 text-purple-700",
    delivered: "bg-green-100 text-green-700",
    partially_delivered: "bg-orange-100 text-orange-700",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

// pretty label per order status
export function getStatusLabel(status) {
  const map = {
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    picked_up: "Picked Up",
    on_the_way: "On the Way",
    arrived: "Arrived",
    delivered: "Delivered",
    partially_delivered: "Partially Delivered",
  };
  return map[status] || status || "";
}

// mirrors the backend: offer price when there's a live offer, otherwise the base price
export function calculateEffectivePrice(price, offerPrice, hasOffer) {
  if (hasOffer && offerPrice != null) {
    return Number(offerPrice);
  }
  return Number(price) || 0;
}
