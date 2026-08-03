import React from "react";

export default function SummaryBar({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2"
        >
          <div className="text-xs text-gray-500">{item.label}</div>
          <div className="text-sm font-semibold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
