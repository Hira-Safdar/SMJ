import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

const STEPS = [
  // ===== DASHBOARD =====
  {
    route: "/",
    target: "[data-tour='dashboard-title']",
    title: "Dashboard",
    desc: "Your business at a glance. This is the home screen where you'll land after login.",
    placement: "bottom",
  },
  {
    route: "/",
    target: "[data-tour='dashboard-kpis']",
    title: "KPI Cards",
    desc: "Key figures at a glance — Cash in Hand, Inward gate passes, Outward gate passes, and Pending Payments. Click the info icon on Pending Payments for a customer-wise breakdown.",
    placement: "bottom",
  },
  {
    route: "/",
    target: "[data-tour='dashboard-activities']",
    title: "Recent Activities",
    desc: "Every important action in the system appears here. Use 'View All' to see the full activity history.",
    placement: "bottom",
  },
  {
    route: "/",
    target: "[data-tour='dashboard-stock-summary']",
    title: "Stock Summary",
    desc: "Live donut charts of your Raw Inventory and Production stock, so you can see totals without opening the Stock module.",
    placement: "bottom",
  },
  {
    route: "/",
    target: "[data-tour='sidebar']",
    title: "Navigation Sidebar",
    desc: "Switch between all modules from here. Expandable sections group related pages. Your current page is highlighted.",
    placement: "right",
  },

  // ===== GATE PASS =====
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in']",
    title: "Gate Pass Inward",
    desc: "Record incoming vehicles. Enter date, truck number, sender company, and the products with their weights.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-records']",
    title: "Inward Records & Filters",
    desc: "Below the form you'll find all saved IN gate passes. Use the filters (date range, sender, company, product) and search to find specific entries. Export to PDF or Excel, print, or delete records.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out']",
    title: "Gate Pass Outward",
    desc: "Record outgoing deliveries. Enter date, customer (Send To), truck number, then add product rows with bag count, weights, rate and price.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-payment']",
    title: "Payment Status",
    desc: "Mark the sale as Paid, Unpaid, or Partial. Amount paid and remaining balance are tracked here and flow into the Dashboard's Pending Payments.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-records']",
    title: "Outward Records & Filters",
    desc: "All saved OUT gate passes live here with the same filter, search, export and print tools as the IN records.",
    placement: "bottom",
  },

  // ===== STOCK =====
  {
    route: "/stock",
    target: "[data-tour='stock-tabs']",
    title: "Stock Module Tabs",
    desc: "Switch between Raw Inventory (grains/paddy in) and Production Inventory (finished rice products).",
    placement: "bottom",
  },
  {
    route: "/stock",
    target: "[data-tour='stock-filters']",
    title: "Stock Filters & Totals",
    desc: "Filter stock by company (and product in Production view). The summary line shows total companies, products and combined kg.",
    placement: "bottom",
  },
  {
    route: "/stock",
    target: "[data-tour='stock-table']",
    title: "Stock Table",
    desc: "Product-wise stock totals. Click column headers to sort, use search to jump to a product. Export and print are available.",
    placement: "bottom",
  },

  // ===== PRODUCTION =====
  {
    route: "/production",
    target: "[data-tour='production-tabs']",
    title: "Production Batches",
    desc: "Each paddy source becomes a batch. Use the status tabs — In-Process, Ready, Done — to move batches through production.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-create-batch']",
    title: "Create a Batch",
    desc: "Pick a date and paddy source company to start a new batch. Enter the paddy weight to begin processing.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-output']",
    title: "Products & Output",
    desc: "Once a source's batches are complete (Ready), add production output here — rice, broken, husk, bran — with bag weights and empty bag weight to get net output.",
    placement: "bottom",
  },

  // ===== ACCOUNTING & FINANCE =====
  {
    route: "/accounting-finance?tab=coa",
    target: "[data-tour='coa-table']",
    title: "Chart of Accounts",
    desc: "Your account list (Expense, Income, Accounts Payable). Use checkboxes to select rows, then Edit, Activate, or Deactivate accounts.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=coa",
    target: "[data-tour='coa-toolbar']",
    title: "Account Tools",
    desc: "'Set Sub-Type' applies a label to selected accounts in one go. 'New Account' opens the create form for a fresh account.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook']",
    title: "Daybook Entries",
    desc: "Daily bookkeeping. Record cash in hand, pick the account, enter amount, choose Debit or Credit, add a short description and save.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook-form']",
    title: "Daybook Form",
    desc: "Cash in hand shows the running cash balance. Enter the amount, select the account, choose debit/credit, and describe the transaction before saving.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-report",
    target: "[data-tour='journal-report']",
    title: "Journal",
    desc: "Build and generate formal journal reports from your daybook entries. Choose a range (all, day, particular, month, year, custom) and generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=ledger",
    target: "[data-tour='ledger']",
    title: "Ledger",
    desc: "Account-wise statement of debits and credits with running balance. Pick the account and date range, then generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=trial",
    target: "[data-tour='trial']",
    title: "Trial Balance",
    desc: "Summarizes all ledger balances for a period — the standard check that debits equal credits.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=pl",
    target: "[data-tour='pl']",
    title: "Profit & Loss",
    desc: "See income vs expenses for a period and your resulting profit or loss.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=balance",
    target: "[data-tour='balance']",
    title: "Balance Sheet",
    desc: "Snapshot of assets, liabilities and equity at a point in time.",
    placement: "bottom",
  },

  // ===== REPORTS =====
  {
    route: "/reports?tab=gatepass",
    target: "[data-tour='report-tabs']",
    title: "Reports",
    desc: "Central reporting hub. Switch between Gate Pass, Stock, Production Summary, and Accounting reports.",
    placement: "bottom",
  },
  {
    route: "/reports?tab=gatepass",
    target: "[data-tour='gatepass-reports']",
    title: "Gate Pass Reports",
    desc: "Sender/company lists plus detailed IN and OUT reports. Set date ranges and filters, then generate to PDF or Excel, or print.",
    placement: "bottom",
  },
  {
    route: "/reports?tab=stock-reports",
    target: "[data-tour='stock-reports']",
    title: "Stock Reports",
    desc: "Stock Snapshot (current levels) and Stock Movement (changes over time). Filter by company, product and date.",
    placement: "bottom",
  },
  {
    route: "/reports?tab=production-summary",
    target: "[data-tour='report-data-table']",
    title: "Production Summary Report",
    desc: "Batch-wise production summary — paddy in, rice/broken/husk/bran output, totals and status. Export and print available.",
    placement: "bottom",
  },

  // ===== SYSTEM SETTINGS =====
  {
    route: "/masterdata?tab=system",
    target: "[data-tour='settings-tabs']",
    title: "System Settings",
    desc: "Configure the whole system — company info, security PIN, backups, and the About page.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system",
    target: "[data-tour='settings-general']",
    title: "General Settings",
    desc: "Company name, address, phone, email, logo, and SMTP email configuration (for password/OTP emails). Save your changes here.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system",
    target: "[data-tour='settings-admin']",
    title: "Admin Settings",
    desc: "Set your Master PIN (4 digits). This same PIN protects login, deletions, and every protected action in the system.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system",
    target: "[data-tour='settings-about']",
    title: "About & Help",
    desc: "System info, module overview, and the button to restart this tour anytime.",
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
      {/* Spotlight cutout: transparent center keeps the target lit, box-shadow dims the rest */}
      {spot ? (
        <div
          className="absolute rounded-lg transition-all duration-300"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/50" />
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
