// Shared date formatter: always DD/MM/YYYY.
// Date-only strings like "2026-08-05" are parsed component-wise so they never
// shift a day due to UTC/local timezone differences (entry date vs report).
export const fmtDate = (v) => {
  if (!v) return "-";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }
  const d = new Date(v);
  if (isNaN(d)) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};
