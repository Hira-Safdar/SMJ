import React, { useMemo, useState, useEffect } from "react";
import { X } from "lucide-react";

const toDayStr = (d) => {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
};

export const applyGatePassFilters = (rows = [], criteria = {}, opts = {}) => {
  const senderKeys = opts.senderKeys || [];
  let result = [...rows];

  const rDate = (r) => toDayStr(r?.date || r?.createdAt);

  if (criteria.dateMode === "today") {
    const today = toDayStr(new Date());
    result = result.filter((r) => rDate(r) === today);
  } else if (criteria.dateMode === "custom" && criteria.customDate) {
    const target = toDayStr(criteria.customDate);
    result = result.filter((r) => rDate(r) === target);
  } else if (criteria.dateMode === "range" && criteria.fromDate && criteria.toDate) {
    const f = toDayStr(criteria.fromDate);
    const t = toDayStr(criteria.toDate);
    result = result.filter((r) => {
      const d = rDate(r);
      return d && d >= f && d <= t;
    });
  }

  if (criteria.sender) {
    const s = String(criteria.sender).trim().toLowerCase();
    result = result.filter((r) =>
      senderKeys.some((k) => String(r?.[k] || "").trim().toLowerCase() === s)
    );
  }

  if (criteria.company) {
    const comp = String(criteria.company).trim().toLowerCase();
    result = result.filter((r) =>
      (r?.items || []).some((it) => String(it?.brand || "").trim().toLowerCase() === comp)
    );
  }

  if (criteria.product) {
    const p = String(criteria.product).trim().toLowerCase();
    result = result.filter((r) =>
      (r?.items || []).some((it) => {
        const name = String(it?.itemType || it?.customItemName || "").trim();
        return name.toLowerCase() === p;
      })
    );
  }

  return result;
};

export const gatePassFilterSummary = (criteria = {}, senderLabel = "Sender") => {
  const lines = [];
  if (criteria.dateMode === "today") lines.push("Date: Today");
  else if (criteria.dateMode === "custom" && criteria.customDate)
    lines.push(`Date: ${criteria.customDate}`);
  else if (criteria.dateMode === "range" && criteria.fromDate && criteria.toDate)
    lines.push(`Date: ${criteria.fromDate} to ${criteria.toDate}`);
  if (criteria.sender) lines.push(`${senderLabel}: ${criteria.sender}`);
  if (criteria.company) lines.push(`Product Owner: ${criteria.company}`);
  if (criteria.product) lines.push(`Product: ${criteria.product}`);
  return lines;
};

export default function GatePassFilter({
  rows = [],
  senderKeys = [],
  senderLabel = "Sender Company",
  onChange,
}) {
  const [dateMode, setDateMode] = useState("all");
  const [customDate, setCustomDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sender, setSender] = useState("");
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");

  const senderOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) =>
      senderKeys.forEach((k) => {
        const v = String(r?.[k] || "").trim();
        if (v) set.add(v);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, senderKeys]);

  const companyOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) =>
      (r?.items || []).forEach((it) => {
        const v = String(it?.brand || "").trim();
        if (v) set.add(v);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const productOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) =>
      (r?.items || []).forEach((it) => {
        if (
          company &&
          String(it?.brand || "").trim().toLowerCase() !== company.toLowerCase()
        )
          return;
        const name = String(it?.itemType || it?.customItemName || "").trim();
        if (name) set.add(name);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, company]);

  const handleCompanyChange = (v) => {
    setCompany(v);
    setProduct("");
  };

  useEffect(() => {
    onChange({ dateMode, customDate, fromDate, toDate, sender, company, product });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, customDate, fromDate, toDate, sender, company, product]);

  const hasActive =
    dateMode !== "all" || customDate || fromDate || toDate || sender || company || product;

  const clear = () => {
    setDateMode("all");
    setCustomDate("");
    setFromDate("");
    setToDate("");
    setSender("");
    setCompany("");
    setProduct("");
  };

  const selectCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Date</label>
          <select
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value)}
            className={`${selectCls} min-w-[120px]`}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="custom">Specific Date</option>
            <option value="range">Date Range</option>
          </select>
        </div>

        {dateMode === "custom" && (
          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className={selectCls}
            />
          </div>
        )}

        {dateMode === "range" && (
          <>
            <div>
              <label className={labelCls}>From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={selectCls}
              />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={selectCls}
              />
            </div>
          </>
        )}

        <div>
          <label className={labelCls}>{senderLabel}</label>
          <select
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            className={`${selectCls} min-w-[160px]`}
          >
            <option value="">All</option>
            {senderOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Product Owner Company</label>
          <select
            value={company}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className={`${selectCls} min-w-[170px]`}
          >
            <option value="">All</option>
            {companyOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Product</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className={`${selectCls} min-w-[150px]`}
          >
            <option value="">All</option>
            {productOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        {hasActive && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
