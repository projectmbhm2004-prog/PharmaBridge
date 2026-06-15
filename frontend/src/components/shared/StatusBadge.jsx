import { getStatusColor, getStatusLabel } from "@/lib/utils";

/**
 * Rounded pill showing a status with its themed colors.
 *
 * @param {{ status?: string }} props
 */
export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-black/5 ${getStatusColor(
        status
      )}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}
