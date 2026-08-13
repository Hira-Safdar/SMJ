import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Sparkles, MousePointerClick } from "lucide-react";

const STEPS = [
  // ===== DASHBOARD =====
  {
    route: "/",
    target: "[data-tour='dashboard-title']",
    title: "Dashboard",
    desc: "Your business at a glance. This is the home screen you'll land on after login. Scroll down to see everything, then come back here.",
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
    desc: "Switch between all modules from here. Expandable sections group related pages. Your current page is highlighted. We'll visit every module now.",
    placement: "right",
  },

  // ===== GATE PASS INWARD =====
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in']",
    title: "Gate Pass Inward",
    desc: "Record incoming vehicles (paddy/goods arriving). Start with Date and Truck Number, then the Sender Company below.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-sender']",
    title: "Sender Company",
    desc: "Type the company the goods came from. Start typing and it will suggest existing companies; type a new name and press List to save it.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-items']",
    title: "Products & Weights",
    desc: "Each incoming item goes on its own row: pick the product, enter bags, gross weight, and the total empty bag weight. Net weight is calculated automatically.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-add-row']",
    title: "Add Product Row",
    desc: "Click '+ Add' to add another product line for this gate pass.",
    placement: "top",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-submit']",
    title: "Generate Gate Pass",
    desc: "When the form is complete, click 'Generate Gate Pass' to save it. It will appear in the records table below.",
    placement: "top",
  },
  {
    route: "/gatepass?tab=IN",
    target: "[data-tour='gatepass-in-records']",
    title: "Inward Records & Filters",
    desc: "All saved IN gate passes live here. Use the Filters button (top-right of the table) for date range, sender, company and product. Export, print, or delete records too.",
    placement: "bottom",
  },

  // ===== GATE PASS OUTWARD =====
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out']",
    title: "Gate Pass Outward",
    desc: "Record outgoing deliveries. Enter date, customer (Send To), and truck number, then add product rows below.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-customer']",
    title: "Customer (Send To)",
    desc: "Pick the customer company the goods are going to. Type a new name to add a new customer on the spot.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-items']",
    title: "Products, Bags & Pricing",
    desc: "Each outgoing item: product, bags, weight, rate per bag and total price. Net weight subtracts the empty bags automatically.",
    placement: "bottom",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-add-row']",
    title: "Add Product Row",
    desc: "Click '+ Add' to add another outgoing product row.",
    placement: "top",
  },
  {
    route: "/gatepass?tab=OUT",
    target: "[data-tour='gatepass-out-submit']",
    title: "Generate Gate Pass",
    desc: "Click 'Generate Gate Pass' to save the outward entry. It appears in the records table below.",
    placement: "top",
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
    target: "[data-tour='stock-view-toggle']",
    title: "Stock View Toggle",
    desc: "Switch between 'Per kg' and 'No. of Bags'. The summary totals and the table update to show either kilograms or bag counts.",
    placement: "bottom",
  },
  {
    route: "/stock",
    target: "[data-tour='stock-filters']",
    title: "Stock Filters & Totals",
    desc: "Filter stock by company (and by product in the Production view). The summary line shows total companies, products and combined kg.",
    placement: "bottom",
  },
  {
    route: "/stock",
    target: "[data-tour='stock-table']",
    title: "Stock Table",
    desc: "Product-wise stock totals for each company. Click column headers to sort, use search to jump to a product, and export or print the view.",
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
    desc: "Pick a date and paddy source company, enter the paddy weight, then click '+ New Batch' to start processing.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-batch-actions']",
    title: "Batch Actions",
    desc: "Each batch has Edit, Complete, Reopen, and Delete. 'Complete' marks a source's paddy as fully processed.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-output']",
    title: "Products & Output",
    desc: "Once a source's batches are Ready, add production output here — rice, broken, husk, bran — with bag weights and empty bag weight to get net output.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-add-output']",
    title: "Add Output Button",
    desc: "Click '+ Add Output' to open the output form for the selected source.",
    placement: "bottom",
  },
  {
    route: "/production",
    target: "[data-tour='production-finalize']",
    title: "Finalize Group",
    desc: "After entering all output, click 'Finalize Group' to lock the production run and move it to Done.",
    placement: "top",
  },

  // ===== ACCOUNTING & FINANCE =====
  {
    route: "/accounting-finance?tab=coa",
    target: "[data-tour='coa-table']",
    title: "Chart of Accounts",
    desc: "Your account list (Expense, Income, Accounts Payable). Use each row's Edit, Activate, or Deactivate action to manage accounts.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=coa",
    target: "[data-tour='coa-toolbar']",
    title: "Account Tools",
    desc: "Use Filters to narrow accounts by type and sub-type. 'New Account' opens the create form, and you can export or print the account list anytime.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook']",
    title: "Daybook Entries",
    desc: "Daily bookkeeping. Pick the account, enter amount, choose Debit or Credit, add a short description and save.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook-form']",
    title: "Daybook Form",
    desc: "Cash in hand shows the running balance. Enter the amount, select the account, choose debit/credit, describe the transaction and click Save.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=journal-entry",
    target: "[data-tour='daybook-save']",
    title: "Save Entry",
    desc: "Click 'Save' to post the entry. The entry lands in the table below and flows into your Journal, Ledger, and financial statements.",
    placement: "top",
  },
  {
    route: "/accounting-finance?tab=journal-report",
    target: "[data-tour='journal-report']",
    title: "Journal",
    desc: "Build formal journal reports from your daybook entries. Choose a range (all, day, particular, month, year, custom) and Generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=ledger",
    target: "[data-tour='ledger']",
    title: "Ledger",
    desc: "Account-wise statement of debits and credits with running balance. Pick the account and date range, then Generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=trial",
    target: "[data-tour='trial']",
    title: "Trial Balance",
    desc: "Summarizes all ledger balances for a period — the standard check that debits equal credits. Pick a range and Generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=pl",
    target: "[data-tour='pl']",
    title: "Profit & Loss",
    desc: "See income vs expenses for a period and your resulting profit or loss. Pick a range and Generate.",
    placement: "bottom",
  },
  {
    route: "/accounting-finance?tab=balance",
    target: "[data-tour='balance']",
    title: "Balance Sheet",
    desc: "Snapshot of assets, liabilities and equity at a point in time. Pick a date and Generate.",
    placement: "bottom",
  },

  // ===== REPORTS =====
  {
    route: "/reports?tab=gatepass",
    target: "[data-tour='report-tabs']",
    title: "Reports",
    desc: "Central reporting hub. Switch between Gate Pass, Stock, Production Summary, and Accounting & Finance reports.",
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
    desc: "Full production report — one section per batch with its sub-batches, raw material in, products produced with yield %, leftover raw material and a movements timeline. Filter by company and date, then Print.",
    placement: "bottom",
  },
  {
    route: "/reports?tab=acc-reports",
    target: "[data-tour='acc-reports']",
    title: "Accounting & Finance Reports",
    desc: "Your generated Journal, Ledger, Trial Balance, Profit & Loss and Balance Sheet reports, ready to download as PDF or delete.",
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
    route: "/masterdata?tab=system&sub=general",
    target: "[data-tour='settings-general']",
    title: "General Settings",
    desc: "Company name, address, phone, email, logo, and SMTP email configuration (for password/OTP emails). Save your changes at the bottom.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system&sub=admin",
    target: "[data-tour='settings-admin']",
    title: "PIN Setup",
    desc: "Three cards: 1) Set PIN — first time only, just enter and confirm. 2) Reset PIN — verify your current PIN, then enter the new one. 3) Forgot PIN — reset through an email OTP. The PIN protects login, deletions, and protected actions.",
    placement: "bottom",
  },
  {
    route: "/masterdata?tab=system&sub=about",
    target: "[data-tour='settings-about']",
    title: "About & Help",
    desc: "System info, module overview, and the button to restart this tour anytime.",
    placement: "bottom",
  },
];

export default function GuidedTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);
  const actionRef = useRef(null);
  const measureTimer = useRef(null);

  const current = STEPS[step] || null;
  const total = STEPS.length;

  const clearMeasure = useCallback(() => {
    if (measureTimer.current) {
      clearTimeout(measureTimer.current);
      measureTimer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearMeasure();
    setActive(false);
    setStep(0);
    setSpot(null);
    try { localStorage.removeItem("smj-tour"); } catch (_err) { void _err; }
  }, [clearMeasure]);

  // Shared transition: cancel in-flight measurement and drop the stale highlight
  // immediately so the UI never shows the previous step's spotlight/tooltip.
  const goTo = useCallback((next) => {
    clearMeasure();
    setSpot(null);
    setStep(Math.max(0, Math.min(next, STEPS.length - 1)));
  }, [clearMeasure]);

  const goNext = useCallback(() => {
    if (step >= total - 1) { stop(); return; }
    goTo(step + 1);
  }, [step, total, stop, goTo]);

  const goPrev = useCallback(() => {
    if (step <= 0) return;
    goTo(step - 1);
  }, [step, goTo]);

  useEffect(() => {
    const onStart = () => {
      clearMeasure();
      setActive(true);
      setStep(0);
      setSpot(null);
      try { localStorage.setItem("smj-tour", "1"); } catch (_err) { void _err; }
    };
    window.addEventListener("smj-start-tour", onStart);
    return () => window.removeEventListener("smj-start-tour", onStart);
  }, [clearMeasure]);

  // Navigate to the step's route. Uses replace so the tour never pollutes
  // browser history (pressing browser Back shouldn't replay the tour).
  // Compares only the params the target route actually sets, so pages that
  // normalize their own query string (e.g. adding tab) don't cause re-nav loops.
  useEffect(() => {
    if (!active || !current) return;
    const target = current.route || "/";
    const qIndex = target.indexOf("?");
    const targetPath = qIndex === -1 ? target : target.slice(0, qIndex);
    if (location.pathname !== targetPath) {
      navigate(target, { replace: true });
      return;
    }
    const want = new URLSearchParams(qIndex === -1 ? "" : target.slice(qIndex + 1));
    const have = new URLSearchParams(location.search);
    let dirty = false;
    for (const [k, v] of want) {
      if (have.get(k) !== v) { dirty = true; break; }
    }
    if (dirty) navigate(target, { replace: true });
  }, [active, step, current, location.pathname, location.search, navigate]);

  // Measure + spotlight the target, retrying patiently. Pages that fetch data
  // before rendering the highlighted element (reports, ledger, etc.) can take
  // a while, so we keep retrying instead of giving up after a short window.
  useEffect(() => {
    if (!active || !current) { setSpot(null); return; }
    clearMeasure();
    let cancelled = false;
    let attempts = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(current.target);
      if (!el) {
        attempts += 1;
        if (attempts <= 150) measureTimer.current = setTimeout(measure, 250);
        return;
      }
      const r = el.getBoundingClientRect();
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const fullyInView =
        r.width > 0 && r.height > 0 &&
        r.top >= -20 && r.bottom <= ch + 20 &&
        r.left >= -20 && r.right <= cw + 20;
      if (!fullyInView) {
        const scrollTarget = el.closest("[data-tour-scroll]") || el;
        if (typeof scrollTarget.scrollIntoView === "function") {
          scrollTarget.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        }
        attempts += 1;
        if (attempts <= 150) measureTimer.current = setTimeout(measure, 350);
        return;
      }
      setSpot({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };

    measureTimer.current = setTimeout(measure, 80);
    return () => { cancelled = true; clearMeasure(); };
  }, [active, step, current, clearMeasure]);

  // Keep the spotlight glued to the element while the user scrolls / resizes.
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (!current) return;
      const el = document.querySelector(current.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setSpot({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active, current]);

  // Position the tooltip relative to the spotlight; until the target is found
  // (navigation/data loading), keep it visible near the top-center so the
  // tour controls are always reachable.
  useEffect(() => {
    if (!active) return;
    const compute = () => {
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const pad = 12;
      const tr = tooltipRef.current ? tooltipRef.current.getBoundingClientRect() : null;
      const tw = tr ? tr.width : 320;
      const th = tr ? tr.height : 240;
      let top, left;
      if (spot) {
        const pos = current?.placement || "bottom";
        if (pos === "bottom") {
          top = spot.top + spot.height + pad;
          left = spot.left + spot.width / 2 - tw / 2;
        } else if (pos === "right") {
          top = spot.top + spot.height / 2 - th / 2;
          left = spot.left + spot.width + pad;
        } else if (pos === "top") {
          top = spot.top - th - pad;
          left = spot.left + spot.width / 2 - tw / 2;
        } else {
          top = spot.top + spot.height / 2 - th / 2;
          left = spot.left - tw - pad;
        }
      } else {
        top = 72;
        left = (cw - tw) / 2;
      }
      if (left < pad) left = pad;
      if (left + tw > cw - pad) left = cw - tw - pad;
      if (top < pad) top = pad;
      if (top + th > ch - pad) top = ch - th - pad;
      setTooltipPos({ top, left });
    };
    const t = setTimeout(compute, 20);
    window.addEventListener("resize", compute);
    return () => { clearTimeout(t); window.removeEventListener("resize", compute); };
  }, [active, spot, current]);

  // Keyboard navigation. Ignore keys while the user is typing in a form field.
  // Enter only advances when a button does not already own the key press,
  // otherwise a focused Next button would double-advance (skip a step).
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const isFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable);
      if (isFormField) return;
      if (e.key === "Escape") { e.preventDefault(); stop(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "Enter") {
        if (tag !== "BUTTON") { e.preventDefault(); goNext(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop, goNext, goPrev]);

  // Support "action" steps: highlight a button and continue when the user clicks it.
  useEffect(() => {
    if (!active || !current?.action) { actionRef.current = null; return; }
    const el = document.querySelector(current.action);
    if (!el) return;
    actionRef.current = el;
    const onClick = (e) => {
      e.stopPropagation();
      actionRef.current = null;
      goNext();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [active, step, current, goNext]);

  if (!active) return null;

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

        {current?.action && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <MousePointerClick size={15} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs font-medium text-emerald-800">{current.actionHint || "Click the highlighted button to continue."}</div>
          </div>
        )}

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
