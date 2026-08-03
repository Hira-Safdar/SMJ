import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function Combobox({
  value = "",
  onChange,
  options = [],
  placeholder = "",
  className = "",
  error = false,
  disabled = false,
  id,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const q = String(value || "").toLowerCase().trim();
  const filtered = (options || []).filter((o) => String(o || "").toLowerCase().includes(q));

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [q, open]);

  const commit = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            if (filtered.length) setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (filtered.length) setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[highlight] != null) {
              e.preventDefault();
              commit(filtered[highlight]);
            } else if (open) {
              e.preventDefault();
              setOpen(false);
            }
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 pr-9 rounded-lg border text-sm ${
          error ? "border-red-300 bg-red-50" : "border-gray-300"
        } disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          setOpen((p) => !p);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600"
      >
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length ? (
            filtered.map((o, idx) => (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`w-full text-left px-3 py-2 text-sm ${idx === highlight ? "bg-emerald-50" : ""} hover:bg-emerald-50`}
              >
                {String(o) === String(value) ? <Check size={14} className="inline mr-1 text-emerald-600" /> : null}
                {o}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">No matching options. Type a new sub-type.</div>
          )}
        </div>
      )}
    </div>
  );
}
