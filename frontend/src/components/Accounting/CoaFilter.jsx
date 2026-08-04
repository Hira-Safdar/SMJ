import React, { useMemo, useState, useEffect } from "react";
import { X, Search } from "lucide-react";

const toDayStr = (d) => {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
};

const getTypeKey = (row = {}) => {
  const type = String(row?.type || "").toUpperCase();
  if (type === "ACCOUNT_PAYABLE") return "ACCOUNT_PAYABLE";
  if (type === "INCOME") return "INCOME";
  return "EXPENSE";
};

export const applyCoaFilters = (rows = [], criteria = {}) => {
  let result = [...(rows || [])];

  const rDate = (r) => toDayStr(r?.createdOn || r?.createdAt);

  if (criteria.name) {
    const n = String(criteria.name).trim().toLowerCase();
    if (n) result = result.filter((r) => String(r?.name || "").trim().toLowerCase().includes(n));
  }

  if (criteria.type) {
    const t = String(criteria.type);
    result = result.filter((r) => getTypeKey(r) === t);
  }

  if (criteria.subType) {
    const s = String(criteria.subType).trim().toLowerCase();
    result = result.filter((r) => String(r?.subType || "").trim().toLowerCase() === s);
  }

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

  return result;
};

export const coaFilterSummary = (criteria = {}) => {
  const lines = [];
  if (criteria.name) lines.push(`Account Name: ${criteria.name}`);
  if (criteria.type) lines.push(`Type: ${criteria.type}`);
  if (criteria.subType) lines.push(`Sub-Type: ${criteria.subType}`);
  if (criteria.dateMode === "today") lines.push("Created: Today");
  else if (criteria.dateMode === "custom" && criteria.customDate)
    lines.push(`Created: ${criteria.customDate}`);
  else if (criteria.dateMode === "range" && criteria.fromDate && criteria.toDate)
    lines.push(`Created: ${criteria.fromDate} to ${criteria.toDate}`);
  return lines;
};

export default function CoaFilter({ rows = [], onChange }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [subType, setSubType] = useState("");
  const [dateMode, setDateMode] = useState("all");
  const [customDate, setCustomDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const typeOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => set.add(getTypeKey(r)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const subTypeOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      const v = String(r?.subType || "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    onChange({ name, type, subType, dateMode, customDate, fromDate, toDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, type, subType, dateMode, customDate, fromDate, toDate]);

  const hasActive =
    name || type || subType || dateMode !== "all" || customDate || fromDate || toDate;

  const clear = () => {
    setName("");
    setType("");
    setSubType("");
    setDateMode("all");
    setCustomDate("");
    setFromDate("");
    setToDate("");
  };

  const selectCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Account Name</label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Search accounts..."
              className={`${selectCls} pl-8 min-w-[180px]`}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`${selectCls} min-w-[150px]`}
          >
            <option value="">All</option>
            {typeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Sub-Type</label>
          <select
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
            className={`${selectCls} min-w-[160px]`}
          >
            <option value="">All</option>
            {subTypeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Created On</label>
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
