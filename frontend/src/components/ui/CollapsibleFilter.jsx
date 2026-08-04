import React, { useState } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";

export function FilterToggleButton({ open, onToggle, title = "Filters", className = "", dataTour }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-tour={dataTour}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-sm text-emerald-700 hover:bg-emerald-50 bg-white ${className}`}
    >
      <SlidersHorizontal size={15} />
      {title}
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
    </button>
  );
}

export default function CollapsibleFilter({
  title = "Filters",
  defaultOpen = false,
  open,
  onToggle,
  children,
  dataTour,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internalOpen;
  const toggle = () => {
    if (onToggle) onToggle(!isOpen);
    else setInternalOpen((p) => !p);
  };

  return (
    <div className="space-y-2">
      <FilterToggleButton
        open={isOpen}
        onToggle={toggle}
        title={title}
        dataTour={dataTour}
      />
      {isOpen && children}
    </div>
  );
}
