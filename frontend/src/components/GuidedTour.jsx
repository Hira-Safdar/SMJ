import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    route: "/",
    target: "[data-tour='dashboard-title']",
    title: "Dashboard",
    desc: "Your business at a glance — key metrics, recent activity, and quick navigation.",
    placement: "bottom",
  },
  {
    route: "/",
    target: "[data-tour='sidebar']",
    title: "Navigation Sidebar",
    desc: "Switch between modules from here. Expandable sections group related pages together.",
    placement: "right",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in']",
    title: "Gate Pass Inward",
    desc: "Record incoming vehicles — company, truck number, driver name, product items with bag weights, and freight charges.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out']",
    title: "Gate Pass Outward",
    desc: "Record outgoing deliveries — product items with quantity, weight, and price details in a structured grid.",
    placement: "bottom",
  },
  {
    route: "/stock",
    target: "[data-tour='stock-table']",
    title: "Stock Management",
    desc: "Track current stock levels per product. Click any column header to sort. Use filters and search to find records quickly.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production']",
    title: "Production Management",
    desc: "Create production batches, record input/output, and track yield per batch.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=coa",
    target: "[data-tour='coa-table']",
    title: "Chart of Accounts",
    desc: "Manage all accounts. Use checkboxes for bulk sub-type assignment. Filter by account type.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook']",
    title: "Daybook Entries",
    desc: "Record daily transactions — cash in hand, debit/credit accounts, amounts, and narration.",
    placement: "bottom",
  },
  {
    route: "/reports?tab=gatepass",
    target: "[data-tour='report-tabs']",
    title: "Reports",
    desc: "Switch between Gate Pass, Stock, Production, and Accounting reports. Export to Excel or PDF.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system",
    target: "[data-tour='settings-tabs']",
    title: "System Settings",
    desc: "Configure company info, set your master PIN, manage backups, and access this tutorial.",
    placement: "bottom",
  },
];

export default function GuidedTour() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);

  const current = STEPS[step] || null;

  const stop = useCallback(() => {
    setActive(false);
    setStep(0);
    setSpot(null);
    try { localStorage.removeItem("smj-tour"); } catch (_err) { void _err; }
  }, []);

  const goNext = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else stop();
  }, [step, stop]);

  const goPrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  useEffect(() => {
    const onStart = () => {
      setActive(true);
      setStep(0);
      try { localStorage.setItem("smj-tour", "1"); } catch (_err) { void _err; }
    };
    window.addEventListener("smj-start-tour", onStart);
    return () => window.removeEventListener("smj-start-tour", onStart);
  }, []);

  useEffect(() => {
    if (!active || !current) return;
    const loc = window.location.pathname + window.location.search;
    const targetLoc = current.route || "/";
    if (loc !== targetLoc) {
      navigate(targetLoc);
    }
  }, [active, step, current, navigate]);

  useEffect(() => {
    if (!active || !current) { setSpot(null); return; }
    const find = () => {
      const el = document.querySelector(current.target);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      setSpot({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
      return true;
    };
    if (!find()) {
      const t = setTimeout(find, 300);
      return () => clearTimeout(t);
    }
  }, [active, step, current]);

  useEffect(() => {
    if (!active || !spot) return;
    const onResize = () => {
      const el = document.querySelector(current?.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpot({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, spot, current]);

  useEffect(() => {
    if (!active || !spot || !tooltipRef.current) return;
    const tr = tooltipRef.current.getBoundingClientRect();
    const pad = 12;
    const cw = window.innerWidth;
    const ch = window.innerHeight;

    let top, left;
    const pos = current?.placement || "bottom";

    if (pos === "bottom") {
      top = spot.top + spot.height + pad;
      left = spot.left + spot.width / 2 - tr.width / 2;
    } else if (pos === "right") {
      top = spot.top + spot.height / 2 - tr.height / 2;
      left = spot.left + spot.width + pad;
    } else if (pos === "top") {
      top = spot.top - tr.height - pad;
      left = spot.left + spot.width / 2 - tr.width / 2;
    } else {
      top = spot.top + spot.height / 2 - tr.height / 2;
      left = spot.left - tr.width - pad;
    }

    if (left < pad) left = pad;
    if (left + tr.width > cw - pad) left = cw - tr.width - pad;
    if (top < pad) top = pad;
    if (top + tr.height > ch - pad) top = ch - tr.height - pad;

    setTooltipPos({ top, left });
  }, [spot, current]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop, goNext, goPrev]);

  if (!active) return null;

  const total = STEPS.length;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={stop} />

      {/* Spotlight cutout */}
      {spot && (
        <div
          className="absolute rounded-lg transition-all duration-300"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute z-[10000] w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 transition-all duration-300"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Sparkles size={14} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{current?.title || "Tour"}</div>
              <div className="text-[10px] text-gray-400">Step {step + 1} of {total}</div>
            </div>
          </div>
          <button type="button" onClick={stop} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title="End tour">
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed mb-3">{current?.desc}</p>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={stop}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
            >
              Skip
            </button>
            {step < total - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
