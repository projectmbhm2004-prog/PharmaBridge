import { formatDateTime } from "@/lib/utils";

// Print/PDF-only report scaffold shared by the Financial and Orders pages.
// It is hidden on screen (`.print-report` is `display:none`) and revealed only
// by the print stylesheet in index.css. It renders the branded header, the
// active-filter summary, and a footer that repeats on every printed page;
// the caller supplies the summary + table as children.
//
// `filters` is a list of { label, value } pairs describing the data on the
// page. Pass only the filters that are actually applied — when the list is
// empty the report prints "All records".
export default function PrintReport({ title, filters = [], children }) {
  const applied = filters.filter(
    (f) => f && f.value != null && String(f.value).trim() !== ""
  );

  return (
    <div className="print-report">
      <header className="print-header">
        <div>
          <div className="print-brand">
            Pharma<span>Bridge</span>
          </div>
          <div className="print-doc-title">{title}</div>
        </div>
        <div className="print-meta">
          <strong>Generated</strong>
          {formatDateTime(new Date())}
        </div>
      </header>

      <section className="print-filters">
        <div className="print-filters-title">Applied Filters</div>
        <ul>
          {applied.length === 0 ? (
            <li>All records</li>
          ) : (
            applied.map((f) => (
              <li key={f.label}>
                <b>{f.label}:</b> {f.value}
              </li>
            ))
          )}
        </ul>
      </section>

      {children}

      <footer className="print-footer">
        <span>PharmaBridge — Confidential</span>
        <span className="print-page" />
      </footer>
    </div>
  );
}
