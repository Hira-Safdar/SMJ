import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  BookOpen,
  BookCopy,
  PenSquare,
  Landmark,
  Scale,
  TrendingUp,
  Building2,
  HandCoins,
  Wallet,
  Plus,
  Save,
  X,
  Pencil,
  Eye,
  Trash2,
  Printer,
  Filter,
  Download,
  ChevronDown,
  RefreshCcw,
} from "lucide-react";
import api from "../services/api";
import DataTable from "../components/ui/DataTable";
import Reports from "./Reports";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const TABS = [
  { key: "coa", label: "Chart of Accounts", icon: <BookOpen size={16} /> },
  { key: "journal-entry", label: "Journal Entry", icon: <PenSquare size={16} /> },
  { key: "journal-report", label: "Journal", icon: <BookCopy size={16} /> },
  { key: "ledger", label: "Ledger", icon: <Landmark size={16} /> },
  { key: "trial", label: "Trial Balance", icon: <Scale size={16} /> },
  { key: "pl", label: "Profit & Loss", icon: <TrendingUp size={16} /> },
  { key: "balance", label: "Balance Sheet", icon: <Building2 size={16} /> },
  { key: "receivables", label: "Receivables", icon: <HandCoins size={16} /> },
  { key: "payables", label: "Payables", icon: <Wallet size={16} /> },
];

const VOUCHER_TYPES = ["JOURNAL", "PAYMENT", "RECEIPT"];
const RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "day", label: "Day (Today)" },
  { value: "particular", label: "Particular Date" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom Range" },
];
const BOOK_TYPES = [
  { value: "JOURNAL", label: "Journal Proper (General)" },
  { value: "CASH_BOOK", label: "Cash Book" },
  { value: "PURCHASE_BOOK", label: "Purchase Book" },
  { value: "SALES_BOOK", label: "Sales Book" },
  { value: "PURCHASE_RETURN", label: "Purchase Return" },
  { value: "SALES_RETURN", label: "Sales Return" },
  { value: "BILLS_RECEIVABLE", label: "Bills Receivable" },
  { value: "BILLS_PAYABLE", label: "Bills Payable" },
];

const ACCOUNT_SUBTYPES = {
  ASSET: ["CURRENT_ASSET", "FIXED_ASSET", "CASH", "BANK", "INVENTORY", "AR", "OTHER"],
  LIABILITY: ["CURRENT_LIABILITY", "LONG_TERM_LIABILITY", "AP", "PAYROLL", "OTHER"],
  EQUITY: ["OWNER_EQUITY", "CAPITAL", "DRAWING", "RESERVE", "OTHER"],
  INCOME: ["SALES", "SERVICE", "OTHER_INCOME", "OTHER"],
  EXPENSE: ["PURCHASE", "OPERATING", "PAYROLL", "ADMIN", "SELLING", "OTHER"],
  COGS: ["COGS", "OTHER"],
};

const blankLine = () => {
  const rowId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    rowId,
    entryType: "both",
    debitAccountId: "",
    debitMode: "list",
    debitInput: "",
    creditAccountId: "",
    creditMode: "list",
    creditInput: "",
    customerId: "",
    customerName: "",
    productTypeId: "",
    productName: "",
    debitAmount: "",
    creditAmount: "",
  };
};

const blankEntry = ({ like } = {}) => {
  const entryId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const likeLines = Array.isArray(like?.lines) ? like.lines : null;
  const lines =
    likeLines && likeLines.length
      ? likeLines.map((l, idx) => ({ ...blankLine(), entryType: l?.entryType || "both", isBase: idx === 0 }))
      : [{ ...blankLine(), entryType: "both", isBase: true }];

  return {
    entryId,
    date: new Date().toISOString().slice(0, 10),
    companyId: "",
    companyName: "",
    voucherType: like?.voucherType || "JOURNAL",
    customerId: "",
    customerName: "",
    productTypeId: "",
    productName: "",
    narration: "",
    lines,
  };
};

const n0 = (v) => (v === "" || v == null ? 0 : Number(v || 0) || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));
const normalizeText = (v) => String(v || "").trim().toLowerCase();
const toTitleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const normalizeCompanyName = (value) => toTitleCase(String(value || "").trim().replace(/\s+/g, " "));
  const formatMonthDay = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit" });
};
  const formatYear = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.getFullYear();
};

function GroupedProductDropdown({
  valueId,
  valueLabel,
  groups = [],
  preferredBrandKey = "",
  onSelect,
  disabled = false,
  placeholder = "(Optional)",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setQ(valueId ? String(valueLabel || "") : "");
  }, [open, valueId, valueLabel]);

  const normalizedPreferred = String(preferredBrandKey || "").trim().toLowerCase();
  const scopedGroups = useMemo(() => {
    if (!normalizedPreferred) return groups;
    const preferred = (groups || []).find((g) => String(g.brandKey || "").toLowerCase() === normalizedPreferred);
    return preferred ? [preferred] : groups;
  }, [groups, normalizedPreferred]);

  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return scopedGroups;
    return (scopedGroups || [])
      .map((g) => ({
        ...g,
        items: (g.items || []).filter((p) => String(p?.name || "").toLowerCase().includes(s)),
      }))
      .filter((g) => (g.items || []).length);
  }, [q, scopedGroups]);

  const showBrandInItem = !normalizedPreferred && String(q || "").trim().length > 0;

  return (
    <div ref={ref} className="relative">
      <div
        onMouseDown={() => {
          if (disabled) return;
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
        className="w-full relative"
      >
        <input
          ref={inputRef}
          disabled={disabled}
          value={q}
          onFocus={(e) => {
            if (disabled) return;
            setOpen(true);
            e.target.select?.();
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none ${
            disabled ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
          } placeholder:text-gray-500`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-700">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-auto">
            {!!valueId && (
              <button
                type="button"
                onClick={() => {
                  onSelect?.({ id: "", label: "" });
                  setQ("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-blue-50"
              >
                Clear selection
              </button>
            )}
            {(filtered || []).map((g) => (
              <div key={`grp-${g.brandKey || g.brand}`}>
                <div className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border-b border-gray-300">
                  {g.brand || "Other"}
                </div>
                {(g.items || []).map((p) => {
                  const label = showBrandInItem
                    ? `${String(g.brand || "").trim()} - ${String(p?.name || "").trim()}`.trim()
                    : String(p?.name || "").trim();
                  const selected = String(valueId) === String(p._id);
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => {
                        onSelect?.({ id: String(p._id), label });
                        setQ(label);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        selected ? "bg-blue-600 text-white hover:bg-blue-600" : "text-gray-900 hover:bg-blue-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-500">No products found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const isEntryActive = (e) => {
  const hasText = String(e?.companyId || "").trim() || String(e?.customerId || "").trim() || String(e?.productTypeId || "").trim() || String(e?.narration || "").trim();
  const hasLines =
    (e?.lines || []).some((l) => n0(l?.debitAmount) > 0 || n0(l?.creditAmount) > 0 || l?.debitAccountId || l?.creditAccountId);
  return !!(hasText || hasLines);
};

export default function AccountingFinance() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("coa");
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [gatepassCompanies, setGatepassCompanies] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);

  const [editingVoucherId, setEditingVoucherId] = useState("");
  const [editingVoucherNo, setEditingVoucherNo] = useState("");
  const [entries, setEntries] = useState([blankEntry()]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [journalMonth, setJournalMonth] = useState("");
  const [showJournalFilters, setShowJournalFilters] = useState(false);
  const [showVoucherFilters, setShowVoucherFilters] = useState(false);
  const [filterCompanyName, setFilterCompanyName] = useState("");
  const [filterBookType, setFilterBookType] = useState("ALL");
  const [filterVoucherNo, setFilterVoucherNo] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterVoucherType, setFilterVoucherType] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");
  const [filterProductId, setFilterProductId] = useState("");
  const [reportRangeStart, setReportRangeStart] = useState("");
  const [reportRangeEnd, setReportRangeEnd] = useState("");
  const [reportFilterCompanyName, setReportFilterCompanyName] = useState("");
  const [reportFilterBookType, setReportFilterBookType] = useState("ALL");
  const [reportFilterVoucherNo, setReportFilterVoucherNo] = useState("");
  const [reportFilterVoucherType, setReportFilterVoucherType] = useState("");
  const [reportFilterCompanyId, setReportFilterCompanyId] = useState("");
  const [reportFilterCustomerName, setReportFilterCustomerName] = useState("");
  const [reportFilterProductId, setReportFilterProductId] = useState("");
  const [vouchers, setVouchers] = useState([]);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "", voucherNo: "" });
  const [generatedJournals, setGeneratedJournals] = useState([]);
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState(new Set());
  const [submitErrors, setSubmitErrors] = useState([]);
  const [firstValidationError, setFirstValidationError] = useState(null);
  const [journalGenerateOpen, setJournalGenerateOpen] = useState(false);
  const [journalFilterOpen, setJournalFilterOpen] = useState(false);
  const [journalGenerateName, setJournalGenerateName] = useState("");
  const [journalNameTouched, setJournalNameTouched] = useState(false);
  const [generatedJournalList, setGeneratedJournalList] = useState([]);
  const [activeGeneratedJournalId, setActiveGeneratedJournalId] = useState("");
  const [journalGenerateRange, setJournalGenerateRange] = useState("all");
  const [journalGenerateDate, setJournalGenerateDate] = useState("");
  const [journalGenerateStart, setJournalGenerateStart] = useState("");
  const [journalGenerateEnd, setJournalGenerateEnd] = useState("");
  const [journalFilterCompanyName, setJournalFilterCompanyName] = useState("");
  const [journalFilterCustomerName, setJournalFilterCustomerName] = useState("");
  const [journalFilterProductId, setJournalFilterProductId] = useState("");
  const [journalFilterVoucherType, setJournalFilterVoucherType] = useState("");
  const [journalPreviewOpen, setJournalPreviewOpen] = useState(false);
  const [journalReportPreviewOpen, setJournalReportPreviewOpen] = useState(true);
  const [journalPreviewMeta, setJournalPreviewMeta] = useState(null);
  const [journalPreviewEntries, setJournalPreviewEntries] = useState([]);
  const [journalInfoDialog, setJournalInfoDialog] = useState({ open: false, message: "" });
  const [downloadMenu, setDownloadMenu] = useState({ open: false, journal: null, anchor: { x: 0, y: 0 } });
  const [ledgerFilterOpen, setLedgerFilterOpen] = useState(false);
  const [ledgerGenerateOpen, setLedgerGenerateOpen] = useState(false);
  const [ledgerGenerateName, setLedgerGenerateName] = useState("");
  const [ledgerNameTouched, setLedgerNameTouched] = useState(false);
  const [ledgerGenerateRange, setLedgerGenerateRange] = useState("all");
  const [ledgerGenerateDate, setLedgerGenerateDate] = useState("");
  const [ledgerGenerateStart, setLedgerGenerateStart] = useState("");
  const [ledgerGenerateEnd, setLedgerGenerateEnd] = useState("");
  const [ledgerFilterCompanyId, setLedgerFilterCompanyId] = useState("");
  const [ledgerFilterCompanyName, setLedgerFilterCompanyName] = useState("");
  const [ledgerFilterAccountId, setLedgerFilterAccountId] = useState("");
  const [ledgerFilterPartyName, setLedgerFilterPartyName] = useState("");
  const [ledgerFilterProductId, setLedgerFilterProductId] = useState("");
  const [ledgerPreviewOpen, setLedgerPreviewOpen] = useState(true);
  const [ledgerPreviewRows, setLedgerPreviewRows] = useState([]);
  const [ledgerHighlightId, setLedgerHighlightId] = useState("");
  const [generatedLedgerList, setGeneratedLedgerList] = useState([]);
  const [activeGeneratedLedgerId, setActiveGeneratedLedgerId] = useState("");
  const [printSettings, setPrintSettings] = useState({});
  const [printLogoDataUrl, setPrintLogoDataUrl] = useState("");

  const [accountDialog, setAccountDialog] = useState({
    open: false,
    mode: "create", // create|edit
    id: "",
    form: {
      code: "",
      name: "",
      type: "ASSET",
      subType: "CURRENT_ASSET",
      parentAccountId: "",
      isControl: false,
      isActive: true,
      journalSide: "BOTH",
    },
  });
  const [accountSaveError, setAccountSaveError] = useState("");
  const [accountFieldErrors, setAccountFieldErrors] = useState({ code: "", name: "" });

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && !TABS.some((t) => t.key === tab)) {
      setActiveTab("coa");
      return;
    }
    if (tab && TABS.some((t) => t.key === tab)) setActiveTab(tab);
  }, [searchParams, navigate]);

  useEffect(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", activeTab);
      return p;
    });
  }, [activeTab, setSearchParams]);

  const entryTotals = useMemo(() => {
    return (entries || []).map((e) => {
      const active = isEntryActive(e);
      const totalDebit = round2((e.lines || []).reduce((s, l) => s + n0(l.debitAmount), 0));
      const totalCredit = round2((e.lines || []).reduce((s, l) => s + n0(l.creditAmount), 0));
      return {
        entryId: e.entryId,
        totalDebit,
        totalCredit,
        balanced: !active || (totalDebit > 0 && totalDebit === totalCredit),
      };
    });
  }, [entries]);

  const entryTotalsById = useMemo(() => new Map(entryTotals.map((t) => [t.entryId, t])), [entryTotals]);

  const totals = useMemo(() => {
    const totalDebit = round2(entryTotals.reduce((s, t) => s + n0(t.totalDebit), 0));
    const totalCredit = round2(entryTotals.reduce((s, t) => s + n0(t.totalCredit), 0));
    const balanced = entryTotals.length ? entryTotals.every((t) => t.balanced) : false;
    return { totalDebit, totalCredit, balanced };
  }, [entryTotals]);

  const companyOptions = useMemo(() => {
    const map = new Map();
    (gatepassCompanies || []).forEach((name) => {
      const clean = normalizeCompanyName(name);
      if (!clean) return;
      const key = normalizeText(clean);
      if (!map.has(key)) map.set(key, { id: clean, name: clean });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [gatepassCompanies]);
  const accountOptions = useMemo(() => {
    const seen = new Set();
    return (accounts || [])
      .filter((a) => a.isActive !== false)
      .filter((a) => {
        const key = String(a?.name || "").trim().toLowerCase();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((a) => ({
        id: String(a._id),
        label: `${a.name}`,
        name: a.name,
        code: a.code,
        type: a.type,
        journalSide: a.journalSide || "BOTH",
      }));
  }, [accounts]);
  const debitAccountOptions = useMemo(() => {
    return accountOptions.filter((a) => String(a.journalSide || "BOTH").toUpperCase() !== "CREDIT");
  }, [accountOptions]);
  const creditAccountOptions = useMemo(() => {
    return accountOptions.filter((a) => String(a.journalSide || "BOTH").toUpperCase() !== "DEBIT");
  }, [accountOptions]);

  const productTypesByBrand = useMemo(() => {
    const buckets = new Map(); // brandKey -> { brand, items: [] }
    (productTypes || []).forEach((p) => {
      const brand = String(p?.brand || "").trim();
      const brandKey = brand.toLowerCase();
      const name = String(p?.name || "").trim();
      if (!name) return;
      const row = buckets.get(brandKey) || { brand: brand || "Other", items: [] };
      row.items.push(p);
      buckets.set(brandKey, row);
    });
    const groups = Array.from(buckets.values()).map((g) => ({
      brand: g.brand,
      brandKey: String(g.brand || "").trim().toLowerCase(),
      items: (g.items || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    }));
    groups.sort((a, b) => a.brand.localeCompare(b.brand));
    return { buckets, groups };
  }, [productTypes]);

  const productLabelById = useMemo(() => {
    const map = new Map();
    (productTypes || []).forEach((p) => {
      const label = [String(p.brand || "").trim(), String(p.name || "").trim()].filter(Boolean).join(" - ");
      map.set(String(p._id), label);
    });
    return map;
  }, [productTypes]);

  const filterProductLabel = productLabelById.get(String(filterProductId || "")) || "";
  const reportFilterProductLabel = productLabelById.get(String(reportFilterProductId || "")) || "";
  const journalFilterProductLabel = productLabelById.get(String(journalFilterProductId || "")) || "";
  const ledgerFilterProductLabel = productLabelById.get(String(ledgerFilterProductId || "")) || "";
  const isJournalReportFilterApplied = useMemo(() => {
    const hasCompany = String(reportFilterCompanyName || "").trim().length > 0;
    const hasCustomer = String(reportFilterCustomerName || "").trim().length > 0;
    const hasProduct = String(reportFilterProductId || "").trim().length > 0;
    const hasVoucherType = String(reportFilterVoucherType || "").trim().length > 0;
    const hasVoucherNo = String(reportFilterVoucherNo || "").trim().length > 0;
    const hasDateRange = String(reportRangeStart || "").trim().length > 0 || String(reportRangeEnd || "").trim().length > 0;
    return hasCompany || hasCustomer || hasProduct || hasVoucherType || hasVoucherNo || hasDateRange;
  }, [
    reportFilterCompanyName,
    reportFilterCustomerName,
    reportFilterProductId,
    reportFilterVoucherType,
    reportFilterVoucherNo,
    reportRangeStart,
    reportRangeEnd,
  ]);

  const openJournalFilterModal = () => {
    setJournalFilterCompanyName(reportFilterCompanyName || "");
    setJournalFilterCustomerName(reportFilterCustomerName || "");
    setJournalFilterProductId(reportFilterProductId || "");
    setJournalFilterVoucherType(reportFilterVoucherType || "");
    setJournalFilterOpen(true);
  };

  const clearJournalFilters = () => {
    setJournalFilterCompanyName("");
    setJournalFilterCustomerName("");
    setJournalFilterProductId("");
    setJournalFilterVoucherType("");
    setJournalGenerateRange("all");
    setJournalGenerateDate("");
    setJournalGenerateStart("");
    setJournalGenerateEnd("");
    setReportFilterCompanyName("");
    setReportFilterCustomerName("");
    setReportFilterProductId("");
    setReportFilterVoucherType("");
    setReportRangeStart("");
    setReportRangeEnd("");
    setActiveGeneratedJournalId("");
    loadGeneratedJournalsWithOverride({
      startDate: "",
      endDate: "",
      companyName: undefined,
      partyName: undefined,
      itemId: undefined,
      voucherType: undefined,
    }).catch(() => {});
  };

  const buildJournalRangeLabel = (opts = {}) => {
    const now = new Date();
    const range = opts.range || journalGenerateRange;
    const dateVal = opts.date || journalGenerateDate;
    const start = opts.start || journalGenerateStart;
    const end = opts.end || journalGenerateEnd;
    if (range === "day" || range === "particular") {
      const d = dateVal ? new Date(dateVal) : now;
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" });
    }
    if (range === "month") {
      const d = dateVal ? new Date(`${dateVal}-01`) : now;
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    }
    if (range === "year") {
      const y = Number(dateVal) || now.getFullYear();
      return String(y);
    }
    if (range === "custom") {
      return [start, end].filter(Boolean).join(" to ");
    }
    if (range === "all") return "All Dates";
    return now.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  };

  const getShortByStamp = () => {
    const now = new Date();
    const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `By ${date} ${time}`;
  };

  const toAbsoluteLogoUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = api.defaults.baseURL || "";
    const origin = base.replace(/\/api\/?$/i, "");
    return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const fetchLogoAsDataUrl = async (url) => {
    if (!url) return "";
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    } catch {
      return "";
    }
  };

  const resolvePrintHeader = () => {
    const name = String(printSettings.companyName || printSettings.shortName || "").trim();
    const address = String(printSettings.address || "").trim();
    const email = String(printSettings.email || "").trim();
    const logoUrl = toAbsoluteLogoUrl(printSettings.logoUrl || printSettings.logo || "");
    return { name, address, email, logoUrl, logoDataUrl: printLogoDataUrl };
  };

  const addPdfHeader = (doc, title, subTitle) => {
    const { name, address, email, logoDataUrl } = resolvePrintHeader();
    // revert to legacy: no custom header
    return 32;
  };

  const loadDropdowns = async () => {
    const [accRes, compRes] = await Promise.all([
      api.get("/accounting/accounts"),
      api.get("/companies"),
    ]);
    setAccounts(accRes.data?.data || []);
    setCompanies(compRes.data?.data || []);
  };

  const loadCustomers = async () => {
    const res = await api.get("/customers");
    setCustomerOptions(res.data?.data || []);
  };

  const loadGatepassCompanies = async () => {
    const [prodRes, settingsRes] = await Promise.all([
      api.get("/product-types"),
      api.get("/settings"),
    ]);
    const rows = prodRes.data?.data || [];
    setProductTypes(rows);
    const productBrands = rows.map((r) => normalizeCompanyName(r.brand)).filter(Boolean);
    const settingsData = settingsRes.data?.data || settingsRes.data || {};
    const settingsBrands = Array.isArray(settingsData.brandOptions)
      ? settingsData.brandOptions.map((b) => normalizeCompanyName(b)).filter(Boolean)
      : [];
    const merged = new Map();
    [...productBrands, ...settingsBrands].forEach((name) => {
      const clean = normalizeCompanyName(name);
      if (!clean) return;
      const key = normalizeText(clean);
      if (!merged.has(key)) merged.set(key, clean);
    });
    setGatepassCompanies(Array.from(merged.values()).sort((a, b) => a.localeCompare(b)));
  };

  const inferAccountType = (name) => {
    const s = String(name || "").toLowerCase();
    if (/(cash|bank|asset|inventory|stock)/.test(s)) return "ASSET";
    if (/(payable|loan|liability|creditor)/.test(s)) return "LIABILITY";
    if (/(capital|drawing|equity)/.test(s)) return "EQUITY";
    if (/(sale|sales|income|revenue)/.test(s)) return "INCOME";
    if (/(expense|salary|rent|utility|depreciation|loss|wages)/.test(s)) return "EXPENSE";
    return "EXPENSE";
  };

  const nextAccountCode = (type) => {
    const baseMap = { ASSET: 1000, LIABILITY: 2000, EQUITY: 3000, INCOME: 4000, EXPENSE: 5000, COGS: 6000 };
    const base = baseMap[type] || 9000;
    const codes = (accounts || [])
      .filter((a) => a.type === type && String(a.code || "").match(/^\d+$/))
      .map((a) => Number(a.code))
      .filter((n) => Number.isFinite(n));
    const max = codes.length ? Math.max(...codes) : base;
    return String(max + 10);
  };

  const createAccountByName = async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "";
    const existing = (accounts || []).find((a) => String(a.name || "").toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (existing.isActive === false) {
        await api.put(`/accounting/accounts/${existing._id}`, { isActive: true });
        await loadDropdowns();
        toast.success(`Re-activated account: ${existing.name}`);
      } else {
        toast.error(`Account already exists: ${existing.name}`);
      }
      return String(existing._id);
    }
    const type = inferAccountType(trimmed);
    const code = nextAccountCode(type);
    const res = await api.post("/accounting/accounts", {
      code,
      name: trimmed,
      type,
      subType: "",
      isControl: false,
      journalSide: "BOTH",
    });
    const id = res.data?.data?._id || "";
    await loadDropdowns();
    return id;
  };

  const openNewAccount = () => {
    setAccountSaveError("");
    setAccountFieldErrors({ code: "", name: "" });
    setAccountDialog({
      open: true,
      mode: "create",
      id: "",
      form: {
        code: "",
        name: "",
        type: "ASSET",
        subType: "CURRENT_ASSET",
        parentAccountId: "",
        isControl: false,
        isActive: true,
        journalSide: "BOTH",
      },
    });
  };

  const openEditAccount = (row) => {
    setAccountSaveError("");
    setAccountFieldErrors({ code: "", name: "" });
    setAccountDialog({
      open: true,
      mode: "edit",
      id: String(row?._id || ""),
      form: {
        code: String(row?.code || ""),
        name: String(row?.name || ""),
        type: row?.type || "ASSET",
        subType: String(row?.subType || ""),
        parentAccountId: row?.parentAccountId ? String(row.parentAccountId) : "",
        isControl: !!row?.isControl,
        isActive: row?.isActive !== false,
        journalSide: row?.journalSide || "BOTH",
      },
    });
  };

  const saveAccount = async () => {
    const f = accountDialog.form || {};
    const code = String(f.code || "").trim();
    const name = String(f.name || "").trim();
    const nextErrors = {
      code: code ? "" : "Account code is required.",
      name: name ? "" : "Account name is required.",
    };
    setAccountFieldErrors(nextErrors);
    if (nextErrors.code || nextErrors.name) return;
    try {
      setAccountSaveError("");
      setLoading(true);
      if (accountDialog.mode === "edit" && accountDialog.id) {
        await api.put(`/accounting/accounts/${accountDialog.id}`, {
          code,
          name,
          type: f.type,
          subType: String(f.subType || "").trim(),
          parentAccountId: f.parentAccountId || null,
          isControl: !!f.isControl,
          isActive: f.isActive !== false,
          journalSide: f.journalSide || "BOTH",
        });
        toast.success("Account updated.");
      } else {
        await api.post("/accounting/accounts", {
          code,
          name,
          type: f.type,
          subType: String(f.subType || "").trim(),
          parentAccountId: f.parentAccountId || null,
          isControl: !!f.isControl,
          isActive: f.isActive !== false,
          journalSide: f.journalSide || "BOTH",
        });
        toast.success("Account created.");
      }
      setAccountDialog((d) => ({ ...d, open: false }));
      await loadDropdowns();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to save account.";
      setAccountSaveError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const cycleJournalSide = async (account) => {
    const id = String(account?._id || "");
    if (!id) return;
    const current = String(account?.journalSide || "BOTH").toUpperCase();
    const next = current === "BOTH" ? "DEBIT" : current === "DEBIT" ? "CREDIT" : "BOTH";
    try {
      setLoading(true);
      await api.put(`/accounting/accounts/${id}`, { journalSide: next });
      setAccounts((prev) => prev.map((a) => (String(a._id) === id ? { ...a, journalSide: next } : a)));
      toast.success("Account side updated.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update account side.");
    } finally {
      setLoading(false);
    }
  };

  const deactivateAccount = async (id) => {
    try {
      setLoading(true);
      setAccounts((prev) => (prev || []).map((a) => (String(a?._id) === String(id) ? { ...a, isActive: false } : a)));
      await api.put(`/accounting/accounts/${id}`, { isActive: false });
      toast.success("Account deactivated.");
      await loadDropdowns();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to deactivate account.");
    } finally {
      setLoading(false);
    }
  };

  const activateAccount = async (id) => {
    try {
      setLoading(true);
      setAccounts((prev) => (prev || []).map((a) => (String(a?._id) === String(id) ? { ...a, isActive: true } : a)));
      await api.put(`/accounting/accounts/${id}`, { isActive: true });
      toast.success("Account activated.");
      await loadDropdowns();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to activate account.");
    } finally {
      setLoading(false);
    }
  };

  const loadVouchers = async () => {
    const hasCustomRange = !!rangeStart || !!rangeEnd;
    const todayIso = new Date().toISOString().slice(0, 10);
    const params = {
      startDate: hasCustomRange ? rangeStart || undefined : "1970-01-01",
      endDate: hasCustomRange ? rangeEnd || undefined : todayIso,
      companyId: filterCompanyId || undefined,
      voucherType: filterVoucherType || undefined,
      accountId: filterAccountId || undefined,
      partyName: filterCustomerName || undefined,
      itemId: filterProductId || undefined,
      itemName: filterProductLabel || undefined,
      range: "custom",
    };
    const res = await api.get("/accounting/vouchers", { params });
    setVouchers(res.data?.data || []);
  };

  const loadGeneratedJournalsEntry = async () => {
    const params = {
      startDate: rangeStart || undefined,
      endDate: rangeEnd || undefined,
      companyId: filterCompanyId || undefined,
      companyName: filterCompanyName || undefined,
      partyName: filterCustomerName || undefined,
      itemName: filterProductLabel || undefined,
      bookType: filterBookType && filterBookType !== "ALL" ? filterBookType : undefined,
      voucherNo: filterVoucherNo || undefined,
      range: "custom",
    };
    const res = await api.get("/accounting/journal", { params });
    setGeneratedJournals(res.data?.data || []);
    setSelectedGeneratedIds(new Set());
  };

  const loadGeneratedJournalsReport = async () => {
    const params = {
      startDate: reportRangeStart || undefined,
      endDate: reportRangeEnd || undefined,
      ignoreDate: "1",
      companyName: reportFilterCompanyName || undefined,
      partyName: reportFilterCustomerName || undefined,
      itemId: reportFilterProductId || undefined,
      itemName: reportFilterProductLabel || undefined,
      voucherType: reportFilterVoucherType || undefined,
      bookType: reportFilterBookType && reportFilterBookType !== "ALL" ? reportFilterBookType : undefined,
      voucherNo: reportFilterVoucherNo || undefined,
      range: "custom",
    };
    const res = await api.get("/accounting/journal", { params });
    setGeneratedJournals(res.data?.data || []);
    setSelectedGeneratedIds(new Set());
  };

  const loadGeneratedJournalsWithOverride = async (override = {}) => {
    const resolvedStart =
      typeof override.startDate !== "undefined" ? override.startDate : reportRangeStart || undefined;
    const resolvedEnd = typeof override.endDate !== "undefined" ? override.endDate : reportRangeEnd || undefined;
    const ignoreDate = resolvedStart || resolvedEnd ? undefined : "1";
    const res = await api.get("/accounting/journal", {
      params: {
        startDate: resolvedStart,
        endDate: resolvedEnd,
        ignoreDate,
        companyName: reportFilterCompanyName || undefined,
        partyName: reportFilterCustomerName || undefined,
        itemId: reportFilterProductId || undefined,
        itemName: reportFilterProductLabel || undefined,
        voucherType: reportFilterVoucherType || undefined,
        bookType: reportFilterBookType && reportFilterBookType !== "ALL" ? reportFilterBookType : undefined,
        voucherNo: reportFilterVoucherNo || undefined,
        range: "custom",
        ...override,
      },
    });
    const data = res.data?.data || [];
    setGeneratedJournals(data);
    setSelectedGeneratedIds(new Set());
    return data;
  };

  const loadGeneratedJournalList = async (reportKey = "journal") => {
    const res = await api.get("/accounting/generated-journals", {
      params: { reportKey },
    });
    setGeneratedJournalList(res.data?.data || []);
  };

  const openLedgerFromLf = (entryId) => {
    if (!entryId) return;
    setActiveTab("ledger");
    setSearchParams({ tab: "ledger" });
    setLedgerHighlightId(String(entryId));
    setLedgerPreviewOpen(true);
  };

    const loadPrintSettings = async () => {
      const res = await api.get("/settings");
      const data = res.data?.data || res.data || {};
      const general = data.general || data.generalSettings || data;
      setPrintSettings(general || {});
      const rawLogo = general?.logoUrl || general?.logo || general?.logoPath || "";
      if (String(rawLogo || "").startsWith("data:")) {
        setPrintLogoDataUrl(String(rawLogo));
        return;
      }
      const logoUrl = toAbsoluteLogoUrl(rawLogo);
      const dataUrl = await fetchLogoAsDataUrl(logoUrl);
      setPrintLogoDataUrl(dataUrl);
    };

    useEffect(() => {
      (async () => {
        try {
          setLoading(true);
          const syncRes = await Promise.allSettled([
            api.post("/accounting/sync/parties"),
            api.post("/accounting/sync/products"),
          ]);
          if (syncRes.some((r) => r.status === "rejected")) {
            toast.error("Master sync failed. Loading saved data.");
          }
          await Promise.all([
            loadPrintSettings(),
            loadDropdowns(),
            loadGatepassCompanies(),
            loadCustomers(),
            loadGeneratedJournalList(),
          ]);
        } catch (err) {
          toast.error(err?.response?.data?.message || "Failed to load accounting master data.");
        } finally {
          setLoading(false);
        }
      })();
    }, []);

    useEffect(() => {
      const onSettingsUpdated = () => {
        loadPrintSettings().catch(() => {});
      };
      window.addEventListener("smj-settings-updated", onSettingsUpdated);
      return () => window.removeEventListener("smj-settings-updated", onSettingsUpdated);
    }, []);

  // Reset voucher filters on full page refresh
  useEffect(() => {
    setRangeStart("");
    setRangeEnd("");
    setFilterCompanyId("");
    setFilterCompanyName("");
    setFilterProductId("");
    setFilterAccountId("");
    setReportRangeStart("");
    setReportRangeEnd("");
    setReportFilterCompanyId("");
    setReportFilterCompanyName("");
    setReportFilterCustomerName("");
    setReportFilterProductId("");
    setReportFilterVoucherType("");
  }, []);


  useEffect(() => {
    const onProductRefresh = () => {
      loadGatepassCompanies().catch(() => {});
    };
    window.addEventListener("product:refresh", onProductRefresh);
    return () => window.removeEventListener("product:refresh", onProductRefresh);
  }, []);

  useEffect(() => {
    if (activeTab !== "journal-entry") return;
    (async () => {
      try {
        setLoading(true);
        await loadVouchers();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load vouchers.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "ledger") return;
    loadGeneratedLedgerList().catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "ledger") return;
    applyLedgerFiltersOnly().catch(() => {});
  }, [activeTab, ledgerFilterAccountId, ledgerFilterCompanyId, ledgerFilterCompanyName, ledgerFilterPartyName]);

  useEffect(() => {
    if (activeTab !== "journal-entry") return;
    (async () => {
      try {
        setLoading(true);
        await loadGeneratedJournalsEntry();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load journals.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rangeStart, rangeEnd, filterCompanyId, filterCompanyName, filterBookType, filterVoucherNo]);

  useEffect(() => {
    if (activeTab !== "journal-report") return;
    (async () => {
      try {
        setLoading(true);
        await loadGeneratedJournalsReport();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load journals.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    reportRangeStart,
    reportRangeEnd,
    reportFilterCompanyName,
    reportFilterCustomerName,
    reportFilterProductId,
    reportFilterBookType,
    reportFilterVoucherType,
    reportFilterVoucherNo,
  ]);

  const patchEntry = (entryId, patch) => {
    setEntries((prev) => prev.map((e) => (e.entryId === entryId ? { ...e, ...patch } : e)));
  };

  const patchLine = (entryId, rowId, patch) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.entryId !== entryId) return e;
        return { ...e, lines: (e.lines || []).map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)) };
      })
    );
  };

  const setEntryCompany = (entryId, companyId) => {
    const c = companyOptions.find((x) => String(x.id) === String(companyId));
    patchEntry(entryId, { companyId: companyId || "", companyName: c?.name || "" });
  };

  const insertLineAfter = (entryId, rowId, entryType) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.entryId !== entryId) return e;
        const idx = (e.lines || []).findIndex((l) => l.rowId === rowId);
        if (idx < 0) return e;
        const nextLines = [...(e.lines || [])];
        nextLines.splice(idx + 1, 0, { ...blankLine(), entryType, isBase: false });
        return { ...e, lines: nextLines };
      })
    );
  };

  const deleteLine = (entryId, rowId) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.entryId !== entryId) return e;
        const target = (e.lines || []).find((l) => l.rowId === rowId);
        if (target?.isBase) return e;
        return { ...e, lines: (e.lines || []).filter((l) => l.rowId !== rowId) };
      })
    );
  };

  const addEntry = () => {
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      const next = blankEntry({ like: last });
      next.companyId = "";
      next.companyName = "";
      next.customerId = "";
      next.customerName = "";
      next.productTypeId = "";
      next.productName = "";
      next.narration = "";
      next.date = "";
      return [...prev, next];
    });
  };

  const deleteEntry = (entryId) => {
    setEntries((prev) => prev.filter((e) => e.entryId !== entryId));
  };

  const collectValidation = (allEntries) => {
    const errorsByEntry = new Map();
    let ok = true;

    let activeEntries = (allEntries || []).filter(isEntryActive);
    if ((!activeEntries || activeEntries.length === 0) && (allEntries || []).length) {
      activeEntries = [allEntries[0]];
    }

    for (const e of activeEntries) {
      const fields = {};
      const lines = new Map(); // rowId -> { debitAccountId?, debitAmount?, creditAccountId?, creditAmount? }

      const setLineErr = (rowId, key, msg) => {
        if (!rowId) return;
        const prev = lines.get(rowId) || {};
        if (!prev[key]) lines.set(rowId, { ...prev, [key]: msg });
      };

      if (!String(e.date || "").trim()) fields.date = "Date is required.";
      if (!String(e.companyId || "").trim()) fields.companyId = "Company is required.";
      if (!String(e.narration || "").trim()) fields.narration = "Narration is required.";

      const base = (e.lines || [])[0];
      if (base) {
        if (!String(base.debitAccountId || "").trim()) setLineErr(base.rowId, "debitAccountId", "Debit account required.");
        if (n0(base.debitAmount) <= 0) setLineErr(base.rowId, "debitAmount", "Debit amount required.");
        if (!String(base.creditAccountId || "").trim()) setLineErr(base.rowId, "creditAccountId", "Credit account required.");
        if (n0(base.creditAmount) <= 0) setLineErr(base.rowId, "creditAmount", "Credit amount required.");
      } else {
        fields.lines = "At least 1 row is required.";
      }

      (e.lines || []).forEach((l) => {
        const debitDisabled = l.entryType === "credit";
        const creditDisabled = l.entryType === "debit";
        const debitAmt = n0(l.debitAmount);
        const creditAmt = n0(l.creditAmount);

        if (!debitDisabled) {
          if (debitAmt > 0 && !String(l.debitAccountId || "").trim()) setLineErr(l.rowId, "debitAccountId", "Required");
          if (String(l.debitAccountId || "").trim() && debitAmt <= 0) setLineErr(l.rowId, "debitAmount", "Required");
        }
        if (!creditDisabled) {
          if (creditAmt > 0 && !String(l.creditAccountId || "").trim()) setLineErr(l.rowId, "creditAccountId", "Required");
          if (String(l.creditAccountId || "").trim() && creditAmt <= 0) setLineErr(l.rowId, "creditAmount", "Required");
        }
      });

      const td = round2((e.lines || []).reduce((s, l) => s + n0(l.debitAmount), 0));
      const tc = round2((e.lines || []).reduce((s, l) => s + n0(l.creditAmount), 0));
      const hasLineInput = (e.lines || []).some(
        (l) => n0(l.debitAmount) > 0 || n0(l.creditAmount) > 0 || String(l.debitAccountId || "").trim() || String(l.creditAccountId || "").trim()
      );
      if (hasLineInput && !(td > 0 && td === tc)) fields.balance = "Debit must equal credit.";

      const hasErr = Object.keys(fields).length > 0 || lines.size > 0;
      if (hasErr) ok = false;
      errorsByEntry.set(e.entryId, { fields, lines });
    }

    return { ok, errorsByEntry };
  };

  const validation = useMemo(() => {
    if (!submitAttempted) return { ok: true, errorsByEntry: new Map() };
    return collectValidation(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempted, entries]);

  const hasAnyInput = useMemo(() => {
    return (entries || []).some((e) =>
      (e.lines || []).some((l) => n0(l.debitAmount) > 0 || n0(l.creditAmount) > 0 || l.debitAccountId || l.creditAccountId)
    );
  }, [entries]);

  const hasAnyAmount = useMemo(() => {
    return (entries || []).some((e) => (e.lines || []).some((l) => n0(l.debitAmount) > 0 || n0(l.creditAmount) > 0));
  }, [entries]);

  const hasValidationErrors = useMemo(() => {
    if (!submitAttempted) return false;
    return !validation.ok;
  }, [submitAttempted, validation]);

  const resetEntry = () => {
    setEditingVoucherId("");
    setEditingVoucherNo("");
    setEntries([blankEntry()]);
    setSubmitAttempted(false);
    setSubmitErrors([]);
  };

  const buildSingleVoucherPayload = (entry) => {
    const lineItems = [];
    (entry?.lines || []).forEach((l) => {
      const debitAmt = round2(n0(l.debitAmount));
      const creditAmt = round2(n0(l.creditAmount));
      const narration = String(entry?.narration || "").trim();
      const partyName = String(entry?.customerName || "").trim();
      const itemName = String(entry?.productName || "").trim();
      if (debitAmt > 0 && l.debitAccountId) {
        lineItems.push({
          accountId: l.debitAccountId,
          debit: debitAmt,
          credit: 0,
          partyName,
          itemName,
          remarks: narration,
        });
      }
      if (creditAmt > 0 && l.creditAccountId) {
        lineItems.push({
          accountId: l.creditAccountId,
          debit: 0,
          credit: creditAmt,
          partyName,
          itemName,
          remarks: narration,
        });
      }
    });
    if (!lineItems.length) return null;
    const companyName =
      String(entry?.companyName || "").trim() ||
      (entry?.companyId ? String(entry.companyId) : "");
    return {
      date: entry?.date || new Date().toISOString().slice(0, 10),
      voucherType: entry?.voucherType || "JOURNAL",
      bookType: "JOURNAL",
      companyId: entry?.companyId || "",
      companyName,
      description: String(entry?.narration || "").trim(),
      lines: lineItems,
    };
  };

  const saveVoucher = async ({ andNew, autoPrint } = { andNew: false, autoPrint: false }) => {
    try {
      setSubmitAttempted(true);
      const v = collectValidation(entries);
      setFirstValidationError(null);
      setSubmitErrors([]);
      if (!v.ok) {
        toast.error("Please fix highlighted fields.");
        return;
      }
      setSubmitErrors([]);
      setLoading(true);
      let savedId = "";
      if (editingVoucherId) {
        const payload = buildSingleVoucherPayload(entries[0]);
        if (!payload) {
          toast.error("No valid rows to save.");
          return;
        }
        const res = await api.put(`/accounting/vouchers/${editingVoucherId}`, payload);
        setEditingVoucherNo(res.data?.data?.voucherNo || editingVoucherNo || "");
        savedId = res.data?.data?._id || editingVoucherId;
        toast.success("Voucher updated.");
      } else {
        const activeEntries = (entries || []).filter((e) => isEntryActive(e) && buildSingleVoucherPayload(e));
        if (!activeEntries.length) {
          toast.error("No valid rows to save.");
          return;
        }
        const payloadEntries = activeEntries.map((e) => ({
          date: e.date,
          voucherType: e.voucherType || "JOURNAL",
          bookType: "JOURNAL",
          companyId: e.companyId,
          companyName: e.companyName,
          customerId: e.customerId,
          customerName: e.customerName,
          productTypeId: e.productTypeId,
          productName: e.productName,
          narration: e.narration,
          lines: (buildSingleVoucherPayload(e)?.lines || []).map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            partyName: l.partyName,
            itemName: l.itemName,
            remarks: l.remarks,
          })),
        }));
        const res = await api.post("/accounting/vouchers", { entries: payloadEntries });
        const created = res.data?.data?.created || 0;
        toast.success(created > 1 ? `Saved ${created} vouchers.` : "Voucher saved.");
      }
      if (andNew) resetEntry();
      await loadVouchers();
      if (activeTab === "journal-entry") await loadGeneratedJournalsEntry();
      resetEntry();
      if (autoPrint && savedId) {
        await handlePrintVoucher(savedId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save voucher.");
    } finally {
      setLoading(false);
    }
  };

  const editVoucher = async (id) => {
    try {
      setLoading(true);
      await loadDropdowns();
      const res = await api.get(`/accounting/vouchers/${id}`);
      const v = res.data?.data;
      if (!v) throw new Error("Voucher not found.");
      setEditingVoucherId(String(v._id));
      setEditingVoucherNo(v.voucherNo || "");
      const firstParty = String(v.customerName || "").trim() || (v.lines || []).find((l) => String(l.partyName || "").trim())?.partyName || "";
      const firstItem = String(v.productName || "").trim() || (v.lines || []).find((l) => String(l.itemName || "").trim())?.itemName || "";

      const debitLines = (v.lines || []).filter((l) => n0(l.debit) > 0);
      const creditLines = (v.lines || []).filter((l) => n0(l.credit) > 0);
      const rowCount = Math.max(debitLines.length, creditLines.length, 1);
      const mappedLines = Array.from({ length: rowCount }).map((_, idx) => {
        const d = debitLines[idx];
        const c = creditLines[idx];
        const entryType = d && c ? "both" : d ? "debit" : "credit";
        return {
          rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          entryType,
          isBase: idx === 0,
          debitAccountId: d ? String(d.accountId || "") : "",
          debitMode: "list",
          debitInput: "",
          creditAccountId: c ? String(c.accountId || "") : "",
          creditMode: "list",
          creditInput: "",
          customerId: "",
          customerName: "",
          productTypeId: "",
          productName: "",
          debitAmount: d ? String(round2(n0(d.debit))) : "",
          creditAmount: c ? String(round2(n0(c.credit))) : "",
        };
      });
      const e = {
        ...blankEntry(),
        entryId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: v.date ? new Date(v.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherType: v.voucherType || "JOURNAL",
        companyId: v.companyId || "",
        companyName: v.companyName || "",
        customerId: v.customerId || "",
        customerName: firstParty || "",
        productTypeId: v.productTypeId || "",
        productName: firstItem || "",
        narration: v.description || "",
        lines: mappedLines.length ? mappedLines : [{ ...blankLine(), entryType: "debit", isBase: true }, { ...blankLine(), entryType: "credit" }],
      };
      setEntries([e]);
      setSubmitAttempted(false);
      setActiveTab("journal-entry");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to load voucher.");
    } finally {
      setLoading(false);
    }
  };

  const viewVoucher = async (id) => {
    try {
      setLoading(true);
      const res = await api.get(`/accounting/vouchers/${id}`);
      const v = res.data?.data;
      if (!v) throw new Error("Voucher not found.");

      const details = [
        `Voucher: ${v.voucherNo}`,
        `Date: ${new Date(v.date).toLocaleDateString()}`,
        `Type: ${v.voucherType}`,
        `Company: ${v.companyName}`,
        v.description ? `Description: ${v.description}` : "",
        "",
        `Total Debit: ${v.totalDebit}`,
        `Total Credit: ${v.totalCredit}`,
      ]
        .filter(Boolean)
        .join("\n");

      toast(
        <div className="text-sm whitespace-pre-wrap">
          <div className="font-semibold mb-1">Voucher Details</div>
          {details}
        </div>,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to view voucher.");
    } finally {
      setLoading(false);
    }
  };

  const askDeleteVoucher = (id, voucherNo) => {
    setShowJournalFilters(false);
    setShowVoucherFilters(false);
    setJournalFilterOpen(false);
    setJournalGenerateOpen(false);
    setJournalPreviewOpen(false);
    setDownloadMenu({ open: false, journal: null, anchor: { x: 0, y: 0 } });
    setDeleteDialog({ open: true, id, voucherNo: voucherNo || "" });
  };

  const confirmDeleteVoucher = async () => {
    if (!deleteDialog.id) return;
    try {
      setLoading(true);
      await api.delete(`/accounting/vouchers/${deleteDialog.id}`);
      toast.success("Voucher deleted.");
      setDeleteDialog({ open: false, id: "", voucherNo: "" });
      if (activeTab === "journal-entry") await loadVouchers();
      if (activeTab === "journal-entry") await loadGeneratedJournalsEntry();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete voucher.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (ok, hasValue) => {
    if (!submitAttempted || !hasValue) return "border-gray-300";
    return ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50";
  };

  const handleJournalMonth = (value) => {
    setJournalMonth(value);
    if (!value) return;
    const [y, m] = value.split("-").map((v) => Number(v));
    if (!y || !m) return;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const pad = (n) => String(n).padStart(2, "0");
    setRangeStart(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
    setRangeEnd(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
  };

  const buildReportRowsFromJournals = (journals = []) => {
    const rows = [];
    const sorted = [...journals].sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
    sorted.forEach((j) => {
      const date = j?.date;
      const narration = String(j?.description || j?.narration || "").trim();
      const debits = (j?.lines || []).filter((l) => round2(n0(l.debit)) > 0);
      const credits = (j?.lines || []).filter((l) => round2(n0(l.credit)) > 0);
      let dateShown = false;
      const groupRows = [];

      debits.forEach((l) => {
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "debit",
          account: ensureAccountSuffix(String(l.accountName || l.accountCode || "Account")),
          amount: round2(n0(l.debit)),
          narration,
          isNarrationRow: false,
          lf: shortVoucherSeq(j?.voucherNo || j?._id || ""),
          entryId: String(j?._id || ""),
        });
        dateShown = true;
      });

      credits.forEach((l) => {
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "credit",
          account: ensureAccountSuffix(String(l.accountName || l.accountCode || "Account")),
          amount: round2(n0(l.credit)),
          narration,
          isNarrationRow: false,
          lf: shortVoucherSeq(j?.voucherNo || j?._id || ""),
          entryId: String(j?._id || ""),
        });
        dateShown = true;
      });

      if (narration) {
        groupRows.push({
          date,
          showDate: false,
          side: "narration",
          account: "",
          amount: 0,
          narration,
          isNarrationRow: true,
        });
      }

      groupRows.forEach((r, idx) => {
        rows.push({
          ...r,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === groupRows.length - 1,
        });
      });
    });
    return rows;
  };

  const filterJournalsBy = (journals = [], filters = {}) => {
    const startDate = filters.startDate ? new Date(filters.startDate) : null;
    const endDate = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    const companyFilter = normalizeText(filters.companyName || filters.companyId || "");
    const partyFilter = normalizeText(filters.partyName || "");
    const itemId = filters.itemId || "";
    const itemNameFilter = normalizeText(filters.itemName || "");
    const voucherTypeFilter = normalizeText(filters.voucherType || "");
    return (journals || []).filter((j) => {
      const d = j?.date ? new Date(j.date) : null;
      const inRange =
        (!startDate || (d && d >= startDate)) && (!endDate || (d && d <= endDate));
      if (!inRange) return false;
      const byCompany = !companyFilter
        ? true
        : [String(j?.companyId || ""), String(j?.companyName || "")]
            .map((v) => normalizeText(v))
            .some((v) => v === companyFilter || v.includes(companyFilter));
      if (!byCompany) return false;
      const byType = !voucherTypeFilter
        ? true
        : normalizeText(j?.voucherType || "").includes(voucherTypeFilter);
      if (!byType) return false;
      const lines = j?.lines || [];
      const byParty = !partyFilter
        ? true
        : lines.some((l) => normalizeText(l.partyName || "").includes(partyFilter)) ||
          normalizeText(j?.customerName || "").includes(partyFilter);
      if (!byParty) return false;
      const byItemId = !itemId || lines.some((l) => String(l.itemId || "") === String(itemId));
      if (!byItemId) return false;
      const byItemName = !itemNameFilter
        ? true
        : lines.some((l) => normalizeText(l.itemName || "").includes(itemNameFilter)) ||
          normalizeText(j?.productName || "").includes(itemNameFilter);
      return byItemName;
    });
  };

  const buildGroupedJournalRows = (entries = []) => {
    const rows = [];
    (entries || []).forEach((entry) => {
      const dateText = entry?.date ? `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}` : "";
      const lines = entry?.lines || [];
      const narration = String(entry?.description || entry?.narration || "").trim();
      const lf = shortVoucherSeq(entry?.voucherNo || entry?._id || entry?.journalEntryId || "");
      const particulars = [];
      const debitLines = [];
      const creditLines = [];
      const debitsOnly = lines.filter((l) => round2(n0(l.debit)) > 0);
      const creditsOnly = lines.filter((l) => round2(n0(l.credit)) > 0);
      debitsOnly.forEach((l) => {
          const acc = ensureAccountSuffix(String(l.accountName || l.accountCode || "Account"));
          particulars.push({ text: `By ${acc}`, style: "normal", indent: 0 });
        debitLines.push(`Rs. ${String(round2(n0(l.debit)))}`);
        creditLines.push("");
      });
      creditsOnly.forEach((l) => {
          const acc = ensureAccountSuffix(String(l.accountName || l.accountCode || "Account"));
          particulars.push({ text: `To ${acc}`, style: "normal", indent: 1 });
        debitLines.push("");
        creditLines.push(`Rs. ${String(round2(n0(l.credit)))}`);
      });
      if (narration) {
        particulars.push({ text: `(${withBeing(narration)})`, style: "italic", indent: 0 });
        debitLines.push("");
        creditLines.push("");
      }
      const targetLen = Math.max(particulars.length, debitLines.length, creditLines.length, 1);
      while (debitLines.length < targetLen) debitLines.push("");
      while (creditLines.length < targetLen) creditLines.push("");
      rows.push({
        date: dateText,
        lf,
        particulars,
        debitLines,
        creditLines,
      });
    });
    return rows;
  };

  const fetchGeneratedJournals = async (override = {}) => {
    const resolvedStart =
      typeof override.startDate !== "undefined" ? override.startDate : reportRangeStart || undefined;
    const resolvedEnd = typeof override.endDate !== "undefined" ? override.endDate : reportRangeEnd || undefined;
    const ignoreDate = resolvedStart || resolvedEnd ? undefined : "1";
    const params = {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      ignoreDate,
      companyName: reportFilterCompanyName || undefined,
      partyName: reportFilterCustomerName || undefined,
      itemId: reportFilterProductId || undefined,
      itemName: reportFilterProductLabel || undefined,
      voucherType: reportFilterVoucherType || undefined,
      bookType: reportFilterBookType && reportFilterBookType !== "ALL" ? reportFilterBookType : undefined,
      voucherNo: reportFilterVoucherNo || undefined,
      range: "custom",
      ...override,
    };
    const res = await api.get("/accounting/journal", { params });
    return res.data?.data || [];
  };

    const applyJournalGenerateFilters = () => {
      const range = journalGenerateRange;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      let nextStart = "";
      let nextEnd = "";
    if (range === "all") {
      nextStart = "";
      nextEnd = "";
    } else if (range === "day" || range === "particular") {
      const base = journalGenerateDate ? new Date(journalGenerateDate) : now;
      const y = base.getFullYear();
      const m = pad(base.getMonth() + 1);
      const d = pad(base.getDate());
      nextStart = `${y}-${m}-${d}`;
      nextEnd = `${y}-${m}-${d}`;
    } else if (range === "month") {
      const base = journalGenerateDate ? new Date(`${journalGenerateDate}-01`) : now;
      const y = base.getFullYear();
      const m = base.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      nextStart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      nextEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    } else if (range === "year") {
      const y = Number(journalGenerateDate) || now.getFullYear();
      nextStart = `${y}-01-01`;
      nextEnd = `${y}-12-31`;
    } else if (range === "custom") {
      nextStart = journalGenerateStart || "";
      nextEnd = journalGenerateEnd || "";
    }
      const baseName = String(journalGenerateName || "").trim() || getSuggestedJournalName();
      const finalName = baseName.includes(" By ") ? baseName : `${baseName} ${getShortByStamp()}`;
      setReportRangeStart(nextStart);
      setReportRangeEnd(nextEnd);
      setJournalGenerateOpen(false);
      loadGeneratedJournalsWithOverride({
        startDate: nextStart,
        endDate: nextEnd,
        companyName: reportFilterCompanyName || undefined,
        partyName: reportFilterCustomerName || undefined,
        itemId: reportFilterProductId || undefined,
        voucherType: reportFilterVoucherType || undefined,
      })
        .then((data) => {
          const filtered = filterJournalsBy(data || [], {
            startDate: nextStart,
            endDate: nextEnd,
            companyName: reportFilterCompanyName || "",
            partyName: reportFilterCustomerName || "",
            itemId: reportFilterProductId || "",
            itemName: reportFilterProductLabel || "",
            voucherType: reportFilterVoucherType || "",
          });
          if (!filtered.length) {
            toast.error("No journals found for the selected filters.");
            setJournalInfoDialog({ open: true, message: "Empty journal cannot be generated." });
            return;
          }
          return api
            .post("/accounting/generated-journals", {
              name: finalName,
              range: journalGenerateRange,
              rangeDate: journalGenerateDate,
              startDate: nextStart,
              endDate: nextEnd,
              companyId: "",
              companyName: reportFilterCompanyName || "",
              partyName: reportFilterCustomerName || "",
              itemId: reportFilterProductId || "",
              itemName: reportFilterProductLabel || "",
              voucherType: reportFilterVoucherType || "",
              reportKey: "journal",
            })
            .then((res) => {
              const created = res.data?.data;
              if (created?._id) setActiveGeneratedJournalId(String(created._id));
              return loadGeneratedJournalList();
            });
        })
        .catch(() => {});
    };

  const applyJournalFiltersOnly = (override = {}) => {
    const range = override.range || journalGenerateRange;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    let nextStart = "";
    let nextEnd = "";
    if (range === "all") {
      nextStart = "";
      nextEnd = "";
    } else if (range === "day" || range === "particular") {
      const dateVal = override.date || journalGenerateDate;
      const base = dateVal ? new Date(dateVal) : now;
      const y = base.getFullYear();
      const m = pad(base.getMonth() + 1);
      const d = pad(base.getDate());
      nextStart = `${y}-${m}-${d}`;
      nextEnd = `${y}-${m}-${d}`;
    } else if (range === "month") {
      const dateVal = override.date || journalGenerateDate;
      const base = dateVal ? new Date(`${dateVal}-01`) : now;
      const y = base.getFullYear();
      const m = base.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      nextStart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      nextEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    } else if (range === "year") {
      const dateVal = override.date || journalGenerateDate;
      const y = Number(dateVal) || now.getFullYear();
      nextStart = `${y}-01-01`;
      nextEnd = `${y}-12-31`;
    } else if (range === "custom") {
      nextStart = override.start ?? journalGenerateStart ?? "";
      nextEnd = override.end ?? journalGenerateEnd ?? "";
    }
    setReportRangeStart(nextStart);
    setReportRangeEnd(nextEnd);
    setActiveGeneratedJournalId("");
      loadGeneratedJournalsWithOverride({
        startDate: nextStart,
        endDate: nextEnd,
        companyName: journalFilterCompanyName || undefined,
        partyName: journalFilterCustomerName || undefined,
        itemId: journalFilterProductId || undefined,
        voucherType: journalFilterVoucherType || undefined,
      }).catch(() => {});
      setReportFilterCompanyName(journalFilterCompanyName || "");
    setReportFilterCustomerName(journalFilterCustomerName || "");
    setReportFilterProductId(journalFilterProductId || "");
    setReportFilterVoucherType(journalFilterVoucherType || "");
  };

  const buildLedgerPreviewRows = (rows = []) => {
    const debits = (rows || []).filter((r) => round2(n0(r.debit)) > 0);
    const credits = (rows || []).filter((r) => round2(n0(r.credit)) > 0);
    const max = Math.max(debits.length, credits.length, 1);
    return Array.from({ length: max }).map((_, i) => {
      const d = debits[i];
      const c = credits[i];
      return {
        drDate: d?.date ? `${formatYear(d.date)}\n${formatMonthDay(d.date)}` : "",
        drRef: (() => {
          const text = ensureAccountSuffix(d?.references || d?.account || d?.description || "");
          return text ? `To ${text}` : "";
        })(),
        drJr: shortVoucherSeq(d?.voucherNo || d?.journalEntryId || ""),
        drAmount: d ? `Rs. ${String(round2(n0(d.debit)))}` : "",
        crDate: c?.date ? `${formatYear(c.date)}\n${formatMonthDay(c.date)}` : "",
        crRef: (() => {
          const text = ensureAccountSuffix(c?.references || c?.account || c?.description || "");
          return text ? `By ${text}` : "";
        })(),
        crJr: shortVoucherSeq(c?.voucherNo || c?.journalEntryId || ""),
        crAmount: c ? `Rs. ${String(round2(n0(c.credit)))}` : "",
      };
    });
  };

  const fetchLedgerPreview = async (override = {}) => {
    const resolvedStart =
      typeof override.startDate !== "undefined" ? override.startDate : ledgerGenerateStart || undefined;
    const resolvedEnd =
      typeof override.endDate !== "undefined" ? override.endDate : ledgerGenerateEnd || undefined;
    const ignoreDate = resolvedStart || resolvedEnd ? undefined : "1";
    const params = {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      ignoreDate,
      range: "custom",
      accountId: ledgerFilterAccountId || undefined,
      companyId: ledgerFilterCompanyId || undefined,
      companyName: ledgerFilterCompanyName || undefined,
      party: ledgerFilterPartyName || undefined,
      ...override,
    };
    const res = await api.get("/accounting/ledger", { params });
    return res.data?.data || [];
  };

  const getSuggestedLedgerName = (opts = {}) => {
    const accountId = opts.accountId || ledgerFilterAccountId || "";
    const acc = accountOptions.find((a) => String(a.id) === String(accountId));
    const accName = String(acc?.name || acc?.label || "").trim();
    const companyLabel = String(opts.companyName || ledgerFilterCompanyName || "").trim();
    const customerLabel = String(opts.partyName || ledgerFilterPartyName || "").trim();
    const rangeLabel = buildJournalRangeLabel({
      range: opts.range || ledgerGenerateRange,
      date: opts.date || ledgerGenerateDate,
      start: opts.start || ledgerGenerateStart,
      end: opts.end || ledgerGenerateEnd,
    });
    const parts = ["Ledger", accName, companyLabel || customerLabel, rangeLabel].filter(Boolean);
    return parts.join(" - ");
  };

  const applyLedgerFiltersOnly = async (override = {}) => {
    const range = override.range || ledgerGenerateRange;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    let nextStart = "";
    let nextEnd = "";
    if (range === "all") {
      nextStart = "";
      nextEnd = "";
    } else if (range === "day" || range === "particular") {
      const dateVal = override.date || ledgerGenerateDate;
      const base = dateVal ? new Date(dateVal) : now;
      const y = base.getFullYear();
      const m = pad(base.getMonth() + 1);
      const d = pad(base.getDate());
      nextStart = `${y}-${m}-${d}`;
      nextEnd = `${y}-${m}-${d}`;
    } else if (range === "month") {
      const dateVal = override.date || ledgerGenerateDate;
      const base = dateVal ? new Date(`${dateVal}-01`) : now;
      const y = base.getFullYear();
      const m = base.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      nextStart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      nextEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    } else if (range === "year") {
      const dateVal = override.date || ledgerGenerateDate;
      const y = Number(dateVal) || now.getFullYear();
      nextStart = `${y}-01-01`;
      nextEnd = `${y}-12-31`;
    } else if (range === "custom") {
      nextStart = override.start ?? ledgerGenerateStart ?? "";
      nextEnd = override.end ?? ledgerGenerateEnd ?? "";
    }
    setLedgerGenerateStart(nextStart);
    setLedgerGenerateEnd(nextEnd);
    const data = await fetchLedgerPreview({ startDate: nextStart, endDate: nextEnd });
    setLedgerPreviewRows(buildLedgerPreviewRows(data));
  };

  const fetchLedgerByFilters = async (filters = {}) => {
    const resolvedStart = typeof filters.startDate !== "undefined" ? filters.startDate : "";
    const resolvedEnd = typeof filters.endDate !== "undefined" ? filters.endDate : "";
    const ignoreDate = resolvedStart || resolvedEnd ? undefined : "1";
    const params = {
      startDate: resolvedStart || undefined,
      endDate: resolvedEnd || undefined,
      ignoreDate,
      range: "custom",
      accountId: filters.accountId || undefined,
      companyId: filters.companyId || undefined,
      companyName: filters.companyName || undefined,
      party: filters.partyName || undefined,
    };
    const res = await api.get("/accounting/ledger", { params });
    return res.data?.data || [];
  };

  const loadGeneratedLedgerList = async () => {
    const res = await api.get("/accounting/generated-journals", {
      params: { reportKey: "ledger" },
    });
    setGeneratedLedgerList(res.data?.data || []);
  };

  const applyLedgerGenerateFilters = async () => {
    const range = ledgerGenerateRange;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    let nextStart = "";
    let nextEnd = "";
    if (range === "all") {
      nextStart = "";
      nextEnd = "";
    } else if (range === "day" || range === "particular") {
      const base = ledgerGenerateDate ? new Date(ledgerGenerateDate) : now;
      const y = base.getFullYear();
      const m = pad(base.getMonth() + 1);
      const d = pad(base.getDate());
      nextStart = `${y}-${m}-${d}`;
      nextEnd = `${y}-${m}-${d}`;
    } else if (range === "month") {
      const base = ledgerGenerateDate ? new Date(`${ledgerGenerateDate}-01`) : now;
      const y = base.getFullYear();
      const m = base.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      nextStart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      nextEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    } else if (range === "year") {
      const y = Number(ledgerGenerateDate) || now.getFullYear();
      nextStart = `${y}-01-01`;
      nextEnd = `${y}-12-31`;
    } else if (range === "custom") {
      nextStart = ledgerGenerateStart || "";
      nextEnd = ledgerGenerateEnd || "";
    }
    const account = accountOptions.find((a) => String(a.id) === String(ledgerFilterAccountId || ""));
    const company = companyOptions.find((c) => String(c.id) === String(ledgerFilterCompanyId || ""));
    const finalName = String(ledgerGenerateName || "").trim() || getSuggestedLedgerName();
    const payload = {
      name: finalName,
      range: ledgerGenerateRange,
      rangeDate: ledgerGenerateDate,
      startDate: nextStart,
      endDate: nextEnd,
      companyId: ledgerFilterCompanyId || "",
      companyName: ledgerFilterCompanyName || company?.name || "",
      accountId: ledgerFilterAccountId || "",
      accountName: account?.name || account?.label || "",
      partyName: ledgerFilterPartyName || "",
      reportKey: "ledger",
    };
    const data = await fetchLedgerByFilters(payload);
    if (!data.length) {
      toast.error("No ledger rows found for the selected filters.");
      return;
    }
    await api.post("/accounting/generated-journals", payload);
    await loadGeneratedLedgerList();
    setActiveGeneratedLedgerId("");
    setLedgerGenerateOpen(false);
    setLedgerGenerateStart(nextStart);
    setLedgerGenerateEnd(nextEnd);
    setLedgerPreviewRows(buildLedgerPreviewRows(data));
  };

  const handleViewGeneratedLedger = async (j) => {
    if (!j) return;
    setActiveGeneratedLedgerId(String(j._id || j.id || ""));
    setLedgerFilterAccountId(j.accountId || "");
    setLedgerFilterCompanyId(j.companyId || "");
    setLedgerFilterCompanyName(j.companyName || "");
    setLedgerFilterPartyName(j.partyName || "");
    setLedgerGenerateRange(j.range || "all");
    setLedgerGenerateDate(j.rangeDate || "");
    setLedgerGenerateStart(j.startDate || "");
    setLedgerGenerateEnd(j.endDate || "");
    const data = await fetchLedgerByFilters({
      startDate: j.startDate || "",
      endDate: j.endDate || "",
      companyId: j.companyId || "",
      companyName: j.companyName || "",
      accountId: j.accountId || "",
      partyName: j.partyName || "",
    });
    setLedgerPreviewRows(buildLedgerPreviewRows(data));
    setLedgerPreviewOpen(true);
  };

  const handleDownloadGeneratedLedger = async (j) => {
    if (!j) return;
    try {
      setLoading(true);
      const data = await fetchLedgerByFilters({
        startDate: j.startDate || "",
        endDate: j.endDate || "",
        companyId: j.companyId || "",
        companyName: j.companyName || "",
        accountId: j.accountId || "",
        partyName: j.partyName || "",
      });
      const rows = buildLedgerPreviewRows(data);
      if (!rows.length) {
        toast.error("No ledger rows found for the selected filters.");
        return;
      }
      const doc = new jsPDF("l", "pt", "a4");
      doc.setFont("times", "normal");
      const headerTitle = j.accountName ? `${j.accountName}` : "Ledger";
      const entityLine = String(j.companyName || j.partyName || "").trim();
      let headerY = 24;
      doc.setFontSize(12);
      doc.text(headerTitle, doc.internal.pageSize.getWidth() / 2, headerY, { align: "center" });
      if (entityLine) {
        headerY += 14;
        doc.setFontSize(10);
        doc.text(entityLine, doc.internal.pageSize.getWidth() / 2, headerY, { align: "center" });
      }
      const startY = headerY + 16;
      doc.setFontSize(10);
      doc.text("Dr.", 40, startY - 6);
      doc.text("Cr.", doc.internal.pageSize.getWidth() - 40, startY - 6, { align: "right" });
      autoTable(doc, {
        head: [["Date", "References", "J.R.", "Amount Rs.", "Date", "References", "J.R.", "Amount Rs."]],
        body: rows.map((r) => [
          r.drDate,
          r.drRef,
          r.drJr,
          r.drAmount,
          r.crDate,
          r.crRef,
          r.crJr,
          r.crAmount,
        ]),
        startY,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 3: { halign: "right" }, 7: { halign: "right" } },
      });
      doc.save(`${String(j.name || "ledger").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download ledger.");
    } finally {
      setLoading(false);
    }
  };

    const handleViewGeneratedJournal = async (j) => {
      if (!j) return;
      setActiveGeneratedJournalId(String(j._id || j.id || ""));
      setReportRangeStart(j.startDate || "");
      setReportRangeEnd(j.endDate || "");
      setReportFilterCompanyName(j.companyName || "");
      setReportFilterCustomerName(j.partyName || "");
      setReportFilterProductId(j.itemId || "");
      setReportFilterVoucherType(j.voucherType || "");
      setJournalGenerateRange(j.range || "all");
      setJournalGenerateDate(j.rangeDate || "");
      setJournalGenerateStart(j.startDate || "");
      setJournalGenerateEnd(j.endDate || "");
      const data = await loadGeneratedJournalsWithOverride({
        startDate: j.startDate || undefined,
        endDate: j.endDate || undefined,
        companyName: j.companyName || undefined,
        partyName: j.partyName || undefined,
        itemId: j.itemId || undefined,
        voucherType: j.voucherType || undefined,
      });
      const filtered = filterJournalsBy(data || [], {
        startDate: j.startDate || "",
        endDate: j.endDate || "",
        companyName: j.companyName || "",
        partyName: j.partyName || "",
        itemId: j.itemId || "",
        itemName: j.itemName || "",
        voucherType: j.voucherType || "",
      });
      const rows = buildReportRowsFromJournals(filtered);
      setJournalPreviewEntries(rows);
      setJournalPreviewMeta({
        title: String(j.name || "Journal Entries"),
        rangeLabel: buildJournalRangeLabel({
          range: j.range || "all",
          date: j.rangeDate || "",
          start: j.startDate || "",
          end: j.endDate || "",
        }),
        companyName: j.companyName || "",
        customerName: j.partyName || "",
        productName: j.itemName || "",
      });
      setJournalPreviewOpen(false);
      setJournalReportPreviewOpen(true);
    };

    const handleDownloadGeneratedJournal = async (j) => {
      if (!j) return;
      try {
        setLoading(true);
        const filterPayload = {
          startDate: j.startDate || reportRangeStart || "",
          endDate: j.endDate || reportRangeEnd || "",
          companyName: j.companyName || reportFilterCompanyName || "",
          partyName: j.partyName || reportFilterCustomerName || "",
          itemId: j.itemId || reportFilterProductId || "",
          itemName: j.itemName || reportFilterProductLabel || "",
          voucherType: j.voucherType || reportFilterVoucherType || "",
        };
        const data = await fetchGeneratedJournals({
          startDate: filterPayload.startDate || undefined,
          endDate: filterPayload.endDate || undefined,
          companyName: filterPayload.companyName || undefined,
          partyName: filterPayload.partyName || undefined,
          itemId: filterPayload.itemId || undefined,
          itemName: filterPayload.itemName || undefined,
          voucherType: filterPayload.voucherType || undefined,
        });
        const filtered = filterJournalsBy(data || [], filterPayload);
        if (!filtered.length) {
          toast.error("No journals found for the selected filters.");
          return;
        }
        const groupedBody = buildGroupedJournalRows(filtered);
        const doc = new jsPDF();
        const baseRangeLabel = buildJournalRangeLabel({
          range: j.range || "all",
          date: j.rangeDate || "",
          start: filterPayload.startDate || "",
          end: filterPayload.endDate || "",
        });
        const rangeLabel =
          j.range === "month" && baseRangeLabel ? `the month of ${baseRangeLabel}` : baseRangeLabel;
        const title = "JOURNAL ENTRIES";
        doc.setFont("times", "normal");
        const centerX = doc.internal.pageSize.getWidth() / 2;
        let headerY = 10;
        const businessName = String(printSettings?.businessName || printSettings?.companyName || "").trim();
        if (businessName) {
          doc.setFontSize(11);
          doc.text(businessName, centerX, headerY, { align: "center" });
          headerY += 5;
        }
        const entityName = String(filterPayload.partyName || filterPayload.companyName || "").trim();
        if (entityName) {
          doc.setFontSize(10);
          doc.text(entityName, centerX, headerY, { align: "center" });
          headerY += 5;
        }
        doc.setFontSize(10);
        doc.text(title, centerX, headerY, { align: "center" });
        headerY += 4;
        doc.setFontSize(9);
        doc.text(rangeLabel ? `For ${rangeLabel}` : "", centerX, headerY, { align: "center" });
        const startY = headerY + 8;

        const groupedTable = groupedBody.map((row) => ({
          date: row.date,
          particularsText: "",
          lf: row.lf || "",
          debit: "",
          credit: "",
          _particularsLines: row.particulars,
          _debitLines: row.debitLines,
          _creditLines: row.creditLines,
        }));

        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 14;
        const usableWidth = pageWidth - marginX * 2;
        const measureLines = (lines = []) =>
          lines.reduce((m, t) => Math.max(m, doc.getTextWidth(String(t || ""))), 0);
        const maxDate = Math.max(
          22,
          ...groupedTable.map((r) => doc.getTextWidth(String(r.date || "").split("\n")[0] || ""))
        );
        const maxLf = Math.max(18, doc.getTextWidth("L.F.") + 6);
        const maxDebit = Math.max(24, ...groupedBody.map((r) => measureLines(r._debitLines)));
        const maxCredit = Math.max(24, ...groupedBody.map((r) => measureLines(r._creditLines)));
        const fixed = maxDate + maxLf + maxDebit + maxCredit + 8;
        const particularsWidth = Math.max(50, usableWidth - fixed);

        autoTable(doc, {
          startY,
          head: [["Date", "Particulars", "L.F.", "Debit Amount (Rs.)", "Credit Amount (Rs.)"]],
          body: groupedTable,
          columns: [
            { header: "Date", dataKey: "date" },
            { header: "Particulars", dataKey: "particularsText" },
            { header: "L.F.", dataKey: "lf" },
            { header: "Debit Amount (Rs.)", dataKey: "debit" },
            { header: "Credit Amount (Rs.)", dataKey: "credit" },
          ],
          styles: {
            fontSize: 9,
            cellPadding: 2,
            lineColor: [90, 90, 90],
            lineWidth: 0.1,
            textColor: [30, 30, 30],
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [20, 20, 20],
            lineColor: [90, 90, 90],
            lineWidth: 0.2,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { cellWidth: maxDate },
            1: { cellWidth: particularsWidth },
            2: { cellWidth: maxLf },
            3: { cellWidth: maxDebit, halign: "right" },
            4: { cellWidth: maxCredit, halign: "right" },
          },
          theme: "grid",
          didParseCell: (data) => {
            if (data.section !== "body") return;
            if (data.column.dataKey === "particularsText" || data.column.dataKey === "debit" || data.column.dataKey === "credit") {
              data.cell.text = "";
            }
            const row = data.row?.raw || {};
            const maxLines = Math.max(
              (row._particularsLines || []).length,
              (row._debitLines || []).length,
              (row._creditLines || []).length,
              1
            );
            const lineHeight = 4;
            data.cell.styles.minCellHeight = Math.max(data.cell.styles.minCellHeight || 0, maxLines * lineHeight + 2);
          },
          didDrawCell: (data) => {
            if (data.section !== "body") return;
            const row = data.row?.raw || {};
            const lineHeight = 4;
            const baseX = data.cell.x + 2;
            let baseY = data.cell.y + 4;
            if (data.column.dataKey === "particularsText") {
              const parts = row._particularsLines || [];
              parts.forEach((p) => {
                const indent = p.indent ? 4 : 0;
                if (p.style === "italic") {
                  doc.setFont("times", "italic");
                  doc.setTextColor(120, 120, 120);
                } else {
                  doc.setFont("times", "normal");
                  doc.setTextColor(30, 30, 30);
                }
                doc.text(String(p.text || ""), baseX + indent, baseY);
                baseY += lineHeight;
              });
              doc.setFont("times", "normal");
              doc.setTextColor(30, 30, 30);
            }
            if (data.column.dataKey === "debit") {
              const lines = row._debitLines || [];
              lines.forEach((txt) => {
                if (txt) doc.text(String(txt), data.cell.x + data.cell.width - 2, baseY, { align: "right" });
                baseY += lineHeight;
              });
            }
            if (data.column.dataKey === "credit") {
              const lines = row._creditLines || [];
              lines.forEach((txt) => {
                if (txt) doc.text(String(txt), data.cell.x + data.cell.width - 2, baseY, { align: "right" });
                baseY += lineHeight;
              });
            }
          },
        });
      doc.save(`${String(j.name || "journal").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download journal.");
      } finally {
        setLoading(false);
      }
    };

    const handleDownloadGeneratedJournalExcel = async (j) => {
      if (!j) return;
      try {
        setLoading(true);
        const filterPayload = {
          startDate: j.startDate || reportRangeStart || "",
          endDate: j.endDate || reportRangeEnd || "",
          companyName: j.companyName || reportFilterCompanyName || "",
          partyName: j.partyName || reportFilterCustomerName || "",
          itemId: j.itemId || reportFilterProductId || "",
          itemName: j.itemName || reportFilterProductLabel || "",
          voucherType: j.voucherType || reportFilterVoucherType || "",
        };
        const data = await fetchGeneratedJournals({
          startDate: filterPayload.startDate || undefined,
          endDate: filterPayload.endDate || undefined,
          companyName: filterPayload.companyName || undefined,
          partyName: filterPayload.partyName || undefined,
          itemId: filterPayload.itemId || undefined,
          itemName: filterPayload.itemName || undefined,
          voucherType: filterPayload.voucherType || undefined,
        });
        const filtered = filterJournalsBy(data || [], filterPayload);
        const grouped = buildGroupedJournalRows(filtered);
        const baseRangeLabel = buildJournalRangeLabel({
          range: j.range || "all",
          date: j.rangeDate || "",
          start: filterPayload.startDate || "",
          end: filterPayload.endDate || "",
        });
        const rangeLabel =
          j.range === "month" && baseRangeLabel ? `For the month of ${baseRangeLabel}` : baseRangeLabel
            ? `For ${baseRangeLabel}`
            : "";
        const headerRows = [
          [String(printSettings?.businessName || printSettings?.companyName || j.companyName || "")],
          ["JOURNAL ENTRIES"],
          [rangeLabel],
          [],
          ["Date", "Particulars", "L.F.", "Debit Amount (Rs.)", "Credit Amount (Rs.)"],
        ];
        const bodyRows = [];
        grouped.forEach((r) => {
          const lineCount = Math.max(r.particulars.length, r.debitLines.length, r.creditLines.length, 1);
          for (let i = 0; i < lineCount; i += 1) {
            const part = r.particulars[i];
            const partText = part ? `${" ".repeat(part.indent ? 2 : 0)}${part.text}` : "";
            bodyRows.push([
              i === 0 ? r.date : "",
              partText,
              "",
              r.debitLines[i] || "",
              r.creditLines[i] ? `  ${r.creditLines[i]}` : "",
            ]);
          }
        });
        const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...bodyRows]);
        ws["!merges"] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
          { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
        ];
        ws["!cols"] = [
          { wch: 14 },
          { wch: 60 },
          { wch: 6 },
          { wch: 18 },
          { wch: 18 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Journal");
        XLSX.writeFile(wb, `${j.name || "journal"}.xlsx`);
      } catch (err) {
        toast.error(err?.response?.data?.message || err?.message || "Failed to download Excel.");
      } finally {
        setLoading(false);
      }
    };

  const getSuggestedJournalName = (opts = {}) => {
    const now = new Date();
    const range = opts.range || journalGenerateRange;
    const dateVal = opts.date || journalGenerateDate;
    const start = opts.start || journalGenerateStart;
    const end = opts.end || journalGenerateEnd;
    const company = (opts.companyName || reportFilterCompanyName || "").trim();
    const customer = (opts.customerName || reportFilterCustomerName || "").trim();
    const product = (opts.productName || "").trim();

    let rangeLabel = "";
    if (range === "day" || range === "particular") {
      const d = dateVal ? new Date(dateVal) : now;
      rangeLabel = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" });
    } else if (range === "month") {
      const d = dateVal ? new Date(`${dateVal}-01`) : now;
      rangeLabel = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    } else if (range === "year") {
      const y = Number(dateVal) || now.getFullYear();
      rangeLabel = String(y);
    } else if (range === "custom") {
      rangeLabel = [start, end].filter(Boolean).join(" to ");
    } else if (range === "all") {
      rangeLabel = "All Dates";
    } else {
      rangeLabel = now.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    }

      const parts = ["Journal", rangeLabel].filter(Boolean);
      if (company) parts.push(company);
      if (customer) parts.push(customer);
      if (product) parts.push(product);
      const base = parts.join(" - ");
      return `${base} ${getShortByStamp()}`;
    };

    const handleFilterCompany = (value) => {
    const v = String(value || "").trim();
    if (!v) {
      setFilterCompanyId("");
      setFilterCompanyName("");
      return;
    }
    const match = companyOptions.find((c) => String(c.id) === String(v));
    if (match) {
      setFilterCompanyId(String(match.id));
      setFilterCompanyName(match.name || "");
      return;
    }
    setFilterCompanyId(v);
    setFilterCompanyName(v);
  };

    const handleReportFilterCompany = (value) => {
      const v = String(value || "").trim();
      if (!v) {
        setReportFilterCompanyId("");
        setReportFilterCompanyName("");
        return;
      }
      const match = companyOptions.find((c) => String(c.id) === String(v));
      setReportFilterCompanyId("");
      setReportFilterCompanyName(match?.name || v);
    };

    const handleJournalFilterCompanyDraft = (value) => {
      const v = String(value || "").trim();
      if (!v) {
        setJournalFilterCompanyName("");
        return;
      }
      const match = companyOptions.find((c) => String(c.id) === String(v));
      setJournalFilterCompanyName(match?.name || v);
    };

  const accountLabel = (id) => {
    const a = accountOptions.find((x) => String(x.id) === String(id));
    const raw = a?.label || a?.name || "";
    if (!raw) return "";
    if (/\bA\/c\b/i.test(raw) || /\bAccount\b/i.test(raw)) return raw;
    return `${raw} A/c`;
  };

  const ensureAccountSuffix = (name) => {
    const raw = String(name || "").trim();
    if (!raw) return "";
    if (/\bA\/c\b/i.test(raw) || /\bAccount\b/i.test(raw)) return raw;
    return `${raw} A/c`;
  };

  const shortVoucherSeq = (value) => {
    const raw = String(value || "").replace(/\D/g, "");
    if (!raw) return "";
    return raw.slice(-4);
  };

  const withBeing = (text) => {
    const t = String(text || "").trim();
    if (!t) return "";
    return t;
  };

  const previewEntries = useMemo(() => {
    const rows = [];
    const sortedEntries = [...(entries || [])].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    sortedEntries.forEach((e) => {
      const date = e.date;
      const narration = String(e.narration || "").trim();
      const lf = shortVoucherSeq(editingVoucherNo || "");
      const debitItems = (e.lines || []).filter((l) => round2(n0(l.debitAmount)) > 0 && l.debitAccountId);
      const creditItems = (e.lines || []).filter((l) => round2(n0(l.creditAmount)) > 0 && l.creditAccountId);
      let dateShown = false;
      const groupRows = [];

      debitItems.forEach((l) => {
        const debitAmt = round2(n0(l.debitAmount));
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "debit",
          account: accountLabel(l.debitAccountId),
          amount: debitAmt,
          narration,
          isNarrationRow: false,
          lf,
        });
        dateShown = true;
      });

      creditItems.forEach((l) => {
        const creditAmt = round2(n0(l.creditAmount));
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "credit",
          account: accountLabel(l.creditAccountId),
          amount: creditAmt,
          narration,
          isNarrationRow: false,
          lf,
        });
        dateShown = true;
      });

      if (narration) {
        groupRows.push({
          date,
          showDate: false,
          side: "narration",
          account: "",
          amount: 0,
          narration,
          isNarrationRow: true,
        });
      }

      groupRows.forEach((r, idx) => {
        rows.push({
          ...r,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === groupRows.length - 1,
        });
      });
    });
    return rows;
  }, [entries, accountOptions]);

  const reportPreviewEntries = useMemo(() => {
    const rows = [];
    const selected = activeGeneratedJournalId
      ? generatedJournalList.find((x) => String(x._id || x.id) === String(activeGeneratedJournalId))
      : null;
    const productName = reportFilterProductLabel || "";
    const filterBase = selected || {
      startDate: reportRangeStart || "",
      endDate: reportRangeEnd || "",
      companyName: reportFilterCompanyName || "",
      partyName: reportFilterCustomerName || "",
      itemId: reportFilterProductId || "",
      voucherType: reportFilterVoucherType || "",
      productName,
    };
    const hasFilter = (j) => {
      if (!filterBase) return true;
      const d = j?.date ? new Date(j.date) : null;
      const inRange =
        (!filterBase.startDate || (d && d >= new Date(filterBase.startDate))) &&
        (!filterBase.endDate || (d && d <= new Date(`${filterBase.endDate}T23:59:59.999`)));
      const companyFilter = normalizeText(filterBase.companyName || filterBase.companyId || "");
      const byCompany = !companyFilter
        ? true
        : [String(j?.companyId || ""), String(j?.companyName || "")]
            .map((v) => normalizeText(v))
            .some((v) => v === companyFilter || v.includes(companyFilter));
      const byType = !filterBase.voucherType
        ? true
        : normalizeText(j?.voucherType || "").includes(normalizeText(filterBase.voucherType || ""));
      if (!byType) return false;
      const lines = j?.lines || [];
      const partyFilter = normalizeText(filterBase.partyName || "");
      const byParty = !partyFilter
        ? true
        : lines.some((l) => normalizeText(l.partyName || "").includes(partyFilter)) ||
          normalizeText(j?.customerName || "").includes(partyFilter);
      const byItemId = !filterBase.itemId || lines.some((l) => String(l.itemId || "") === String(filterBase.itemId || ""));
      const itemNameFilter = normalizeText(filterBase.productName || "");
      const byItemName = !itemNameFilter || lines.some((l) => normalizeText(l.itemName || "").includes(itemNameFilter));
      return inRange && byCompany && byParty && byItemId && byItemName;
    };
    const journals = [...(generatedJournals || [])]
      .filter(hasFilter)
      .sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
    journals.forEach((j) => {
      const date = j?.date;
      const narration = String(j?.description || j?.narration || "").trim();
      const debits = (j?.lines || []).filter((l) => round2(n0(l.debit)) > 0);
      const credits = (j?.lines || []).filter((l) => round2(n0(l.credit)) > 0);
      let dateShown = false;
      const groupRows = [];

      debits.forEach((l) => {
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "debit",
          account: ensureAccountSuffix(String(l.accountName || l.accountCode || "Account")),
          amount: round2(n0(l.debit)),
          narration,
          isNarrationRow: false,
          lf: shortVoucherSeq(j?.voucherNo || j?._id || ""),
          entryId: String(j?._id || ""),
        });
        dateShown = true;
      });

      credits.forEach((l) => {
        groupRows.push({
          date,
          showDate: !dateShown,
          side: "credit",
          account: ensureAccountSuffix(String(l.accountName || l.accountCode || "Account")),
          amount: round2(n0(l.credit)),
          narration,
          isNarrationRow: false,
          lf: shortVoucherSeq(j?.voucherNo || j?._id || ""),
          entryId: String(j?._id || ""),
        });
        dateShown = true;
      });

      if (narration) {
        groupRows.push({
          date,
          showDate: false,
          side: "narration",
          account: "",
          amount: 0,
          narration,
          isNarrationRow: true,
        });
      }

      groupRows.forEach((r, idx) => {
        rows.push({
          ...r,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === groupRows.length - 1,
        });
      });
    });
    return rows;
  }, [
    generatedJournals,
    activeGeneratedJournalId,
    generatedJournalList,
    reportFilterCompanyName,
    reportFilterCustomerName,
    reportFilterProductId,
    reportRangeStart,
    reportRangeEnd,
    productTypes,
  ]);

  const amountClass = (line) => {
    if (!submitAttempted) return "border-gray-300";
    const debitAmt = n0(line.debitAmount);
    const creditAmt = n0(line.creditAmount);
    const amt = debitAmt > 0 ? debitAmt : creditAmt;
    const hasAccounts = !!line.debitAccountId || !!line.creditAccountId;
    if (!hasAccounts && amt <= 0) return "border-gray-300";
    if (hasAccounts && amt <= 0) return "border-red-300 bg-red-50";
    if (debitAmt > 0 && creditAmt > 0) return "border-red-300 bg-red-50";
    return "border-emerald-300 bg-emerald-50";
  };

  const narrationClass = (missing) => {
    if (!submitAttempted) return "border-gray-300";
    if (missing) return "border-red-300 bg-red-50";
    return "border-emerald-300 bg-emerald-50";
  };



  const journalRowsForEntry = (entry) => {
    const debits = (entry?.lines || []).filter((l) => round2(n0(l.debit)) > 0);
    const credits = (entry?.lines || []).filter((l) => round2(n0(l.credit)) > 0);
    const rows = [];
    let dateShown = false;

    const addLine = ({ side, line, amount }) => {
        const acc = ensureAccountSuffix(line.accountName || line.accountCode || "Account");
      const extra = [String(line.partyName || "").trim(), String(line.itemName || "").trim()].filter(Boolean).join(" | ");
      rows.push({
        date: entry.date,
        showDate: !dateShown,
        side,
        details: side === "credit" ? `To ${acc}` : acc,
        extra,
        debit: side === "debit" ? amount : "",
        credit: side === "credit" ? amount : "",
      });
      dateShown = true;
    };

    debits.forEach((l) => addLine({ side: "debit", line: l, amount: round2(n0(l.debit)).toFixed(2) }));
    credits.forEach((l) => addLine({ side: "credit", line: l, amount: round2(n0(l.credit)).toFixed(2) }));

    const narration = withBeing(String(entry.description || entry.narration || "").trim());
    if (narration) {
      rows.push({
        date: entry.date,
        showDate: false,
        side: "narration",
        details: `(${narration})`,
        extra: "",
        debit: "",
        credit: "",
      });
    }
    return rows;
  };

  const printEntry = (entry) => {
    if (!entry) return;
    const dateYear = formatYear(entry.date);
    const dateMonthDay = formatMonthDay(entry.date);

    const rows = journalRowsForEntry(entry);
    const linesHtml = rows
      .map((r) => {
        const isCredit = r.side === "credit";
        const isNarration = r.side === "narration";
        const detailsHtml = r.extra ? `${r.details}<div class="extra">${r.extra}</div>` : r.details;
        return `
          <tr class="${isNarration ? "narration-row" : "entry-row"}">
            <td class="date-cell">
              ${r.showDate ? `<div>${dateYear}</div><div>${dateMonthDay}</div>` : ""}
            </td>
            <td class="details-cell ${isNarration ? "narration" : isCredit ? "credit" : "debit"}">${detailsHtml}</td>
            <td class="lf-cell"></td>
            <td class="amt-cell">${r.debit}</td>
            <td class="amt-cell">${r.credit}</td>
          </tr>
        `;
      })
      .join("");

      const printHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Journal Print</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: "Times New Roman", serif; color: #111; padding: 24px; }
              .print-header { text-align: center; margin-bottom: 10px; }
              .print-header { margin-bottom: 4px; line-height: 1.1; }
              .print-header img { max-height: 144px; margin: 0; display: inline-block; }
              .print-header .name { font-weight: 700; font-size: 14px; margin: 0; }
              .print-header .line { font-size: 11px; color: #333; margin: 0; }
              .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
              .title { font-size: 18px; font-weight: 700; text-transform: uppercase; }
              .meta { font-size: 12px; color: #333; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; font-size: 12px; }
            th { text-align: center; font-weight: 700; }
            .date-cell { width: 90px; text-align: center; }
            .details-cell { width: 55%; }
            .details-cell.credit { padding-left: 18px; }
            .details-cell.debit { padding-left: 4px; }
            .details-cell.narration { padding-left: 8px; font-style: italic; }
            .details-cell .extra { margin-top: 2px; font-size: 10px; color: #333; }
            .lf-cell { width: 60px; text-align: center; }
            .amt-cell { width: 90px; text-align: right; }
            .entry-row .date-cell > div { line-height: 1.2; }
            .narration-row td { border-top: 0; }
          </style>
          </head>
          <body>
            <div class="print-header">
              ${resolvePrintHeader().logoUrl ? `<img src="${resolvePrintHeader().logoUrl}" alt="logo" />` : ""}
              ${resolvePrintHeader().name ? `<div class="name">${resolvePrintHeader().name}</div>` : ""}
              ${resolvePrintHeader().address ? `<div class="line">${resolvePrintHeader().address}</div>` : ""}
              ${resolvePrintHeader().email ? `<div class="line">${resolvePrintHeader().email}</div>` : ""}
            </div>
            <div class="header">
              <div class="title">Journal</div>
              <div class="meta">Voucher: ${entry.voucherNo || "-"}</div>
            </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>References</th>
                <th>J.R.</th>
                <th>Amount (Dr.)</th>
                <th>Amount (Cr.)</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Popup blocked. Please allow popups to print.");
      return;
    }
    w.document.open();
    w.document.write(printHtml);
    w.document.close();
    w.focus();
    w.print();
  };

  const fetchVoucher = async (id) => {
    const res = await api.get(`/accounting/vouchers/${id}`);
    return res.data?.data;
  };

  const handlePrintVoucher = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      printEntry(entry);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to print voucher.");
    } finally {
      setLoading(false);
    }
  };

    const handleDownloadPdf = async (id) => {
      try {
        setLoading(true);
        const entry = await fetchVoucher(id);
        if (!entry) throw new Error("Voucher not found.");
        const doc = new jsPDF();
        const title = `Journal: ${entry.voucherNo || "-"}`;
        const subTitle = `Date: ${entry.date ? new Date(entry.date).toLocaleDateString() : "-"}`;
        const startY = addPdfHeader(doc, title, subTitle);

      const rows = journalRowsForEntry(entry);
      const body = rows.map((r) => [
        r.showDate ? `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}` : "",
        r.extra ? `${r.details}\n${r.extra}` : r.details,
        "",
        r.debit,
        r.credit,
      ]);

        autoTable(doc, {
          head: [["Date", "References", "J.R.", "Amount (Dr.)", "Amount (Cr.)"]],
          body,
          startY,
          styles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 80 } },
        });
      doc.save(`${entry.voucherNo || "journal"}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      const rows = journalRowsForEntry(entry).map((r) => ({
        Date: r.showDate ? `${formatYear(entry.date)} ${formatMonthDay(entry.date)}` : "",
        References: r.details,
        Extra: r.extra || "",
        "J.R.": "",
        "Amount (Dr.)": r.debit,
        "Amount (Cr.)": r.credit,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal");
      XLSX.writeFile(wb, `${entry.voucherNo || "journal"}.xlsx`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download Excel.");
    } finally {
      setLoading(false);
    }
  };

  const resolveSelectedEntries = () => {
    const ids = new Set(selectedGeneratedIds);
    return generatedJournals.filter((j) => ids.has(j._id));
  };

    const handleBulkDownloadPdf = () => {
      const entries = resolveSelectedEntries();
      if (!entries.length) {
        toast.error("Select at least one voucher to download.");
        return;
      }
      const doc = new jsPDF();
      const startY = addPdfHeader(doc, "Journal Vouchers", "");
      entries.forEach((entry, index) => {
        if (index > 0) doc.addPage();
        const entryStartY = index === 0 ? startY : addPdfHeader(
          doc,
          `Journal Voucher: ${entry.voucherNo || "-"}`,
          `Date: ${entry.date ? new Date(entry.date).toLocaleDateString() : "-"}`
        );

      const body = [];
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        const details = isDebit
          ? `${l.accountName || l.accountCode || "Account"} Dr.`
          : `${l.accountName || l.accountCode || "Account"}`;
        body.push([
          `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}`,
          details,
          "",
          isDebit ? debit.toFixed(2) : "",
          !isDebit ? credit.toFixed(2) : "",
        ]);
      });
      const narration = withBeing(String(entry.description || entry.narration || "").trim());
      if (narration) {
        body.push(["", `(${narration})`, "", "", ""]);
      }
        autoTable(doc, {
          head: [["Date", "Details", "L.F.", "Amount (Dr.)", "Amount (Cr.)"]],
          body,
          startY: entryStartY,
          styles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 80 } },
        });
      });
    doc.save("journals.pdf");
  };

  const handleBulkDownloadExcel = () => {
    const entries = resolveSelectedEntries();
    if (!entries.length) {
      toast.error("Select at least one voucher to download.");
      return;
    }
    const rows = [];
    entries.forEach((entry) => {
      rows.push({
        Date: "",
        Details: `Voucher: ${entry.voucherNo || "-"} | ${entry.companyName || "-"}`,
        "L.F.": "",
        "Amount (Dr.)": "",
        "Amount (Cr.)": "",
      });
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        rows.push({
          Date: `${formatYear(entry.date)} ${formatMonthDay(entry.date)}`,
          Details: isDebit
            ? `${l.accountName || l.accountCode || "Account"} Dr.`
            : `${l.accountName || l.accountCode || "Account"}`,
          "L.F.": "",
          "Amount (Dr.)": isDebit ? debit.toFixed(2) : "",
          "Amount (Cr.)": !isDebit ? credit.toFixed(2) : "",
        });
      });
      const narration = withBeing(String(entry.description || entry.narration || "").trim());
      if (narration) {
        rows.push({ Date: "", Details: `(${narration})`, "L.F.": "", "Amount (Dr.)": "", "Amount (Cr.)": "" });
      }
      rows.push({ Date: "", Details: "", "L.F.": "", "Amount (Dr.)": "", "Amount (Cr.)": "" });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Journals");
    XLSX.writeFile(wb, "journals.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 border ${
                activeTab === t.key
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-white border-transparent text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {activeTab === "journal-entry" && null}
        </div>
      </div>

      {activeTab === "journal-entry" && showJournalFilters && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 w-full max-w-3xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Filters</div>
              <button
                type="button"
                onClick={() => setShowJournalFilters(false)}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Month</label>
              <input
                type="month"
                value={journalMonth}
                onChange={(e) => handleJournalMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Start</label>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">End</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Company</label>
              <select
                value={filterCompanyId || filterCompanyName}
                onChange={(e) => handleFilterCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All companies</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Customer</label>
              <select
                value={filterCustomerName}
                onChange={(e) => setFilterCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All customers</option>
                {customerOptions.map((c) => (
                  <option key={c._id || c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Book Type</label>
              <select
                value={filterBookType}
                onChange={(e) => setFilterBookType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="ALL">All</option>
                {BOOK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Voucher No</label>
              <input
                value={filterVoucherNo}
                onChange={(e) => setFilterVoucherNo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowJournalFilters(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            >
              Apply
            </button>
          </div>
          </div>
        </div>
      )}

      {activeTab === "journal-report" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJournalReportPreviewOpen((v) => !v)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  title={journalReportPreviewOpen ? "Hide preview" : "Show preview"}
                >
                  <ChevronDown
                    size={16}
                    className={journalReportPreviewOpen ? "transform rotate-180 transition-transform" : "transition-transform"}
                  />
                </button>
                Journal Preview
              </div>
              <div className="flex-1 flex justify-center gap-2 flex-wrap items-center">
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Range</span>
                  <select
                    value={journalGenerateRange}
                    onChange={(e) => {
                      const v = e.target.value;
                      setJournalGenerateRange(v);
                      if (!journalNameTouched) setJournalGenerateName(getSuggestedJournalName({ range: v }));
                      setActiveGeneratedJournalId("");
                      if (v === "day") {
                        const today = new Date().toISOString().slice(0, 10);
                        setJournalGenerateDate(today);
                        applyJournalFiltersOnly({ range: v, date: today });
                        return;
                      }
                      if (v === "particular" && !journalGenerateDate) {
                        const today = new Date().toISOString().slice(0, 10);
                        setJournalGenerateDate(today);
                        applyJournalFiltersOnly({ range: v, date: today });
                        return;
                      }
                      if (v === "month" && !journalGenerateDate) {
                        const now = new Date();
                        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                        setJournalGenerateDate(ym);
                        applyJournalFiltersOnly({ range: v, date: ym });
                        return;
                      }
                      if (v === "year" && !journalGenerateDate) {
                        const y = String(new Date().getFullYear());
                        setJournalGenerateDate(y);
                        applyJournalFiltersOnly({ range: v, date: y });
                        return;
                      }
                      if (v === "custom") {
                        setJournalGenerateStart("");
                        setJournalGenerateEnd("");
                        applyJournalFiltersOnly({ range: v, start: "", end: "" });
                        return;
                      }
                      applyJournalFiltersOnly({ range: v });
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[90px]"
                  >
                    <option value="all">All</option>
                    <option value="day">Today</option>
                    <option value="particular">Date</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="custom">FROM-TO</option>
                  </select>
                </div>
                {(journalGenerateRange === "day" || journalGenerateRange === "particular") && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Date</span>
                    <input
                      type="date"
                      value={journalGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalGenerateDate(v);
                        if (!journalNameTouched) setJournalGenerateName(getSuggestedJournalName({ date: v }));
                        applyJournalFiltersOnly({ range: journalGenerateRange, date: v });
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[100px]"
                    />
                  </div>
                )}
                {journalGenerateRange === "month" && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Month</span>
                    <input
                      type="month"
                      value={journalGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalGenerateDate(v);
                        if (!journalNameTouched) setJournalGenerateName(getSuggestedJournalName({ date: v, range: "month" }));
                        applyJournalFiltersOnly({ range: "month", date: v });
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[90px]"
                    />
                  </div>
                )}
                {journalGenerateRange === "year" && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Year</span>
                    <select
                      value={journalGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalGenerateDate(v);
                        if (!journalNameTouched) setJournalGenerateName(getSuggestedJournalName({ date: v, range: "year" }));
                        applyJournalFiltersOnly({ range: "year", date: v });
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[70px]"
                    >
                      {Array.from({ length: 21 }).map((_, i) => {
                        const y = String(new Date().getFullYear() - 10 + i);
                        return (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                {journalGenerateRange === "custom" && (
                  <>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                      <span className="text-xs text-gray-600">From</span>
                      <input
                        type="date"
                        value={journalGenerateStart}
                        onChange={(e) => {
                          const v = e.target.value;
                          setJournalGenerateStart(v);
                          if (!journalNameTouched)
                            setJournalGenerateName(getSuggestedJournalName({ start: v, end: journalGenerateEnd }));
                          applyJournalFiltersOnly({ range: "custom", start: v, end: journalGenerateEnd });
                        }}
                        className="text-xs bg-transparent focus:outline-none w-[95px]"
                      />
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                      <span className="text-xs text-gray-600">To</span>
                      <input
                        type="date"
                        value={journalGenerateEnd}
                        onChange={(e) => {
                          const v = e.target.value;
                          setJournalGenerateEnd(v);
                          if (!journalNameTouched)
                            setJournalGenerateName(getSuggestedJournalName({ start: journalGenerateStart, end: v }));
                          applyJournalFiltersOnly({ range: "custom", start: journalGenerateStart, end: v });
                        }}
                        className="text-xs bg-transparent focus:outline-none w-[95px]"
                      />
                    </div>
                  </>
                )}
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Company</span>
                  <select
                    value={journalFilterCompanyName}
                    onChange={(e) => {
                      const v = e.target.value;
                      handleJournalFilterCompanyDraft(v);
                      setReportFilterCompanyName(String(v || ""));
                      setActiveGeneratedJournalId("");
                      loadGeneratedJournalsWithOverride({
                        startDate: reportRangeStart || undefined,
                        endDate: reportRangeEnd || undefined,
                        companyName: String(v || "") || undefined,
                        partyName: journalFilterCustomerName || undefined,
                        itemId: reportFilterProductId || undefined,
                        voucherType: journalFilterVoucherType || undefined,
                      }).catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[110px]"
                  >
                    <option value="">All</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Customer</span>
                  <select
                    value={journalFilterCustomerName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setJournalFilterCustomerName(v);
                      setReportFilterCustomerName(v);
                      setActiveGeneratedJournalId("");
                      loadGeneratedJournalsWithOverride({
                        startDate: reportRangeStart || undefined,
                        endDate: reportRangeEnd || undefined,
                        companyName: journalFilterCompanyName || undefined,
                        partyName: v || undefined,
                        itemId: reportFilterProductId || undefined,
                        voucherType: journalFilterVoucherType || undefined,
                      }).catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[110px]"
                  >
                    <option value="">All</option>
                    {customerOptions.map((c) => (
                      <option key={c._id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Voucher</span>
                  <select
                    value={journalFilterVoucherType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setJournalFilterVoucherType(v);
                      setReportFilterVoucherType(v);
                      setActiveGeneratedJournalId("");
                      loadGeneratedJournalsWithOverride({
                        startDate: reportRangeStart || undefined,
                        endDate: reportRangeEnd || undefined,
                        companyName: journalFilterCompanyName || undefined,
                        partyName: journalFilterCustomerName || undefined,
                        itemId: reportFilterProductId || undefined,
                        voucherType: v || undefined,
                      }).catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[90px]"
                  >
                    <option value="">All</option>
                    {VOUCHER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isJournalReportFilterApplied && (
                  <button
                    type="button"
                    onClick={clearJournalFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                      title="Clear Filters"
                    >
                      Clear
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => {
                    const suggested = getSuggestedJournalName();
                  setJournalGenerateName(suggested);
                  setJournalNameTouched(false);
                  setJournalGenerateOpen(true);
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                  <Printer size={16} /> Generate
                </button>
              </div>
            </div>
            {journalReportPreviewOpen && (
            <div className="rounded-xl border border-gray-200 overflow-x-hidden">
              <table className="w-full text-sm border border-gray-200 table-fixed">
                <thead className="bg-gray-50 text-gray-800">
                  <tr>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Date</th>
                    <th className="text-left font-semibold px-2 py-2 w-[260px] border border-gray-200">Details</th>
                    <th className="text-left font-semibold px-2 py-2 w-[50px] border border-gray-200">L.F.</th>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Amount (Dr.)</th>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Amount (Cr.)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportPreviewEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-sm text-gray-500 text-center">
                        No journals found for the selected filters.
                      </td>
                    </tr>
                  )}
                  {reportPreviewEntries.map((entry, idx) => (
                    <React.Fragment key={`${entry.account || entry.narration}-${idx}`}>
                      {entry.isNarrationRow ? (
                        <tr>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate && entry.lf ? (
                              <button
                                type="button"
                                onClick={() => openLedgerFromLf(entry.entryId)}
                                className="text-emerald-700 hover:underline text-xs"
                                title="Open ledger entry"
                              >
                                {entry.lf}
                              </button>
                            ) : (
                              ""
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle italic text-gray-600 border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            ({withBeing(entry.narration)})
                          </td>
                        <td
                          className={`px-3 py-2 align-middle border-x border-gray-200 ${
                            entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                          } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                        ></td>
                        <td
                          className={`px-3 py-2 align-middle border-x border-gray-200 ${
                            entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                          } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                        ></td>
                        <td
                          className={`px-3 py-2 align-middle border-x border-gray-200 ${
                            entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                          } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                        ></td>
                        </tr>
                      ) : (
                        <tr>
                          <td
                            className={`px-3 py-2 align-middle text-center border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate && (
                              <>
                                <div className="text-xs text-gray-700">{formatYear(entry.date)}</div>
                                <div className="text-xs text-gray-700">{formatMonthDay(entry.date)}</div>
                              </>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            <div
                              className={`flex items-center justify-between gap-2 ${
                                entry.side === "credit" ? "pl-4 text-gray-700" : ""
                              }`}
                            >
                              <span className="truncate">
                                {entry.side === "credit" ? "To " : ""}
                                {entry.account}
                              </span>
                              {entry.side === "debit" && <span className="text-xs font-semibold">Dr</span>}
                            </div>
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate && entry.lf ? (
                              <button
                                type="button"
                                onClick={() => openLedgerFromLf(entry.entryId)}
                                className="text-emerald-700 hover:underline text-xs"
                                title="Open ledger entry"
                              >
                                {entry.lf}
                              </button>
                            ) : (
                              ""
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-right border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.side === "debit" ? `Rs. ${String(entry.amount)}` : "-"}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-right border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.side === "credit" ? `Rs. ${String(entry.amount)}` : "-"}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900">Generated Journals</div>
            <div className="rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-[600px] w-full text-sm">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[80px]">Sr. No</th>
                    <th className="text-left font-semibold px-3 py-2">Journal Name</th>
                    <th className="text-left font-semibold px-3 py-2 w-[160px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {generatedJournalList.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                        No generated journals yet.
                      </td>
                    </tr>
                  )}
                    {generatedJournalList.map((j, idx) => (
                      <tr key={j._id || j.id}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">{j.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewGeneratedJournal(j)}
                            className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                            <div className="flex">
                              <button
                                type="button"
                                onClick={() => handleDownloadGeneratedJournal(j)}
                                className="p-2 rounded-l border border-gray-300 text-gray-700 hover:bg-gray-50"
                                title="Download PDF"
                              >
                                <Download size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDownloadMenu({
                                    open: true,
                                    journal: j,
                                    anchor: { x: rect.right, y: rect.bottom + 4 },
                                  });
                                }}
                                className="p-2 rounded-r border border-gray-300 border-l-0 text-gray-700 hover:bg-gray-50"
                                title="Download Options"
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
                          <button
                            type="button"
                            onClick={() =>
                                api
                                  .delete(`/accounting/generated-journals/${j._id || j.id}`)
                                  .then(() => loadGeneratedJournalList())
                                  .catch(() => {})
                              }
                            className="p-2 rounded border border-red-200 text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLedgerPreviewOpen((v) => !v)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  title={ledgerPreviewOpen ? "Hide preview" : "Show preview"}
                >
                  <ChevronDown
                    size={16}
                    className={ledgerPreviewOpen ? "transform rotate-180 transition-transform" : "transition-transform"}
                  />
                </button>
                Ledger Preview
              </div>
              <div className="flex-1 flex justify-center gap-2">
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Range</span>
                  <select
                    value={ledgerGenerateRange}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLedgerGenerateRange(v);
                      const now = new Date();
                      if (v === "day" || v === "particular") {
                        const today = now.toISOString().slice(0, 10);
                        setLedgerGenerateDate(today);
                        applyLedgerFiltersOnly({ range: v, date: today }).catch(() => {});
                      } else if (v === "month") {
                        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                        setLedgerGenerateDate(ym);
                        applyLedgerFiltersOnly({ range: v, date: ym }).catch(() => {});
                      } else if (v === "year") {
                        const y = String(now.getFullYear());
                        setLedgerGenerateDate(y);
                        applyLedgerFiltersOnly({ range: v, date: y }).catch(() => {});
                      } else if (v === "custom") {
                        setLedgerGenerateStart("");
                        setLedgerGenerateEnd("");
                        applyLedgerFiltersOnly({ range: v, start: "", end: "" }).catch(() => {});
                      } else {
                        applyLedgerFiltersOnly({ range: v }).catch(() => {});
                      }
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[90px]"
                  >
                    {RANGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {(ledgerGenerateRange === "day" || ledgerGenerateRange === "particular") && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Date</span>
                    <input
                      type="date"
                      value={ledgerGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLedgerGenerateDate(v);
                        applyLedgerFiltersOnly({ range: ledgerGenerateRange, date: v }).catch(() => {});
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[100px]"
                    />
                  </div>
                )}
                {ledgerGenerateRange === "month" && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Month</span>
                    <input
                      type="month"
                      value={ledgerGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLedgerGenerateDate(v);
                        applyLedgerFiltersOnly({ range: "month", date: v }).catch(() => {});
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[90px]"
                    />
                  </div>
                )}
                {ledgerGenerateRange === "year" && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                    <span className="text-xs text-gray-600">Year</span>
                    <input
                      type="number"
                      value={ledgerGenerateDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLedgerGenerateDate(v);
                        applyLedgerFiltersOnly({ range: "year", date: v }).catch(() => {});
                      }}
                      className="text-xs bg-transparent focus:outline-none w-[70px]"
                    />
                  </div>
                )}
                {ledgerGenerateRange === "custom" && (
                  <>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                      <span className="text-xs text-gray-600">From</span>
                      <input
                        type="date"
                        value={ledgerGenerateStart}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLedgerGenerateStart(v);
                          applyLedgerFiltersOnly({ range: "custom", start: v, end: ledgerGenerateEnd }).catch(() => {});
                        }}
                        className="text-xs bg-transparent focus:outline-none w-[95px]"
                      />
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                      <span className="text-xs text-gray-600">To</span>
                      <input
                        type="date"
                        value={ledgerGenerateEnd}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLedgerGenerateEnd(v);
                          applyLedgerFiltersOnly({ range: "custom", start: ledgerGenerateStart, end: v }).catch(() => {});
                        }}
                        className="text-xs bg-transparent focus:outline-none w-[95px]"
                      />
                    </div>
                  </>
                )}
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Account</span>
                  <select
                    value={ledgerFilterAccountId}
                    onChange={(e) => {
                      setLedgerFilterAccountId(e.target.value);
                      if (!ledgerNameTouched)
                        setLedgerGenerateName(getSuggestedLedgerName({ accountId: e.target.value }));
                      applyLedgerFiltersOnly().catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[120px]"
                  >
                    <option value="">Select account</option>
                    {(accountOptions || []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label || a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Company</span>
                  <select
                    value={ledgerFilterCompanyId || ledgerFilterCompanyName}
                    onChange={(e) => {
                      const v = e.target.value;
                      const match = companyOptions.find((c) => String(c.id) === String(v));
                      setLedgerFilterCompanyId(match ? String(match.id) : "");
                      setLedgerFilterCompanyName(match ? match.name : v);
                      applyLedgerFiltersOnly().catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[110px]"
                  >
                    <option value="">All</option>
                    {(companyOptions || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-300 bg-white text-xs">
                  <span className="text-xs text-gray-600">Customer</span>
                  <select
                    value={ledgerFilterPartyName}
                    onChange={(e) => {
                      setLedgerFilterPartyName(e.target.value);
                      applyLedgerFiltersOnly().catch(() => {});
                    }}
                    className="text-xs bg-transparent focus:outline-none w-[110px]"
                  >
                    <option value="">All</option>
                    {(customerOptions || []).map((c) => (
                      <option key={c._id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLedgerGenerateRange("all");
                    setLedgerGenerateDate("");
                    setLedgerGenerateStart("");
                    setLedgerGenerateEnd("");
                    setLedgerFilterAccountId("");
                    setLedgerFilterCompanyId("");
                    setLedgerFilterCompanyName("");
                    setLedgerFilterPartyName("");
                    setLedgerGenerateName(getSuggestedLedgerName({ range: "all", date: "", start: "", end: "" }));
                    setLedgerNameTouched(false);
                    applyLedgerFiltersOnly({ range: "all", date: "", start: "", end: "" }).catch(() => {});
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  title="Clear Filters"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const suggested = getSuggestedLedgerName();
                    setLedgerGenerateName(suggested);
                    setLedgerNameTouched(false);
                    setLedgerGenerateOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                  <Printer size={16} /> Generate
                </button>
              </div>
            </div>
            {ledgerPreviewOpen && (
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-600">
                  <span>Dr.</span>
                  <span>Cr.</span>
                </div>
                <table className="w-full text-sm border border-gray-200 table-fixed">
                  <thead className="bg-gray-50 text-gray-800">
                    <tr>
                      <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Date</th>
                    <th className="text-left font-semibold px-2 py-2 border border-gray-200">Particular</th>
                      <th className="text-left font-semibold px-2 py-2 w-[50px] border border-gray-200">J.R.</th>
                      <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Amount Rs.</th>
                      <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Date</th>
                      <th className="text-left font-semibold px-2 py-2 border border-gray-200">Particular</th>
                      <th className="text-left font-semibold px-2 py-2 w-[50px] border border-gray-200">J.R.</th>
                      <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Amount Rs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerPreviewRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Apply filters to preview ledger.
                        </td>
                      </tr>
                    )}
                    {ledgerPreviewRows.map((r, idx) => (
                      <tr key={`ledger-row-${idx}`}>
                        <td className="px-2 py-2 border border-gray-200 whitespace-pre-line">{r.drDate}</td>
                        <td className="px-2 py-2 border border-gray-200">{r.drRef}</td>
                        <td className="px-2 py-2 border border-gray-200">{r.drJr}</td>
                        <td className="px-2 py-2 border border-gray-200 text-right">{r.drAmount}</td>
                        <td className="px-2 py-2 border border-gray-200 whitespace-pre-line">{r.crDate}</td>
                        <td className="px-2 py-2 border border-gray-200">{r.crRef}</td>
                        <td className="px-2 py-2 border border-gray-200">{r.crJr}</td>
                        <td className="px-2 py-2 border border-gray-200 text-right">{r.crAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-emerald-900">Generated Ledgers</div>
            <div className="rounded-xl border border-emerald-100 overflow-x-auto">
              <table className="w-full text-sm border border-emerald-100">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[70px] border border-gray-200">Sr No</th>
                    <th className="text-left font-semibold px-3 py-2 border border-gray-200">Ledger Name</th>
                    <th className="text-left font-semibold px-3 py-2 w-[140px] border border-gray-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedLedgerList.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                        No generated ledgers yet.
                      </td>
                    </tr>
                  )}
                  {generatedLedgerList.map((j, idx) => (
                    <tr key={j._id || j.id || idx}>
                      <td className="px-3 py-2 border border-gray-200">{idx + 1}</td>
                      <td className="px-3 py-2 border border-gray-200">{j.name}</td>
                      <td className="px-3 py-2 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewGeneratedLedger(j)}
                            className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadGeneratedLedger(j)}
                            className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            title="Download PDF"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              api
                                .delete(`/accounting/generated-journals/${j._id || j.id}`)
                                .then(() => loadGeneratedLedgerList())
                                .catch(() => {})
                            }
                            className="p-2 rounded border border-red-200 text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Reports
            embedded
            initialTab="ledger"
            allowedTabs={["ledger"]}
            hideFilters
            highlightId={ledgerHighlightId}
          />

          {/* Generated Ledgers list moved to Reports module */}
        </div>
      )}

{["trial", "pl", "balance", "receivables", "payables"].includes(activeTab) && (
        <Reports
          embedded
          initialTab={activeTab}
          allowedTabs={["trial", "pl", "balance", "receivables", "payables"]}
        />
      )}

      {activeTab === "coa" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <DataTable
              title="Chart of Accounts"
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Account Name" },
                { key: "type", label: "Type", filterOptions: ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS"] },
                { key: "subType", label: "Category" },
                {
                  key: "journalSide",
                  label: "Side",
                  render: (v) => {
                    const s = String(v || "BOTH").toUpperCase();
                    if (s === "DEBIT") return "Debit only";
                    if (s === "CREDIT") return "Credit only";
                    return "Both";
                  },
                },
                { key: "isActive", label: "Active", render: (v) => (v === false ? "No" : "Yes") },
                {
                  key: "actions",
                  label: "Actions",
                  sortable: false,
                  render: (_v, row) => (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditAccount(row)}
                        className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleJournalSide(row)}
                        className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                        title="Toggle Side (Both → Debit → Credit)"
                      >
                        Side
                      </button>
                      {row?.isActive === false ? (
                        <button
                          type="button"
                          onClick={() => activateAccount(row._id)}
                          className="px-2 py-1 rounded border border-emerald-200 text-xs text-emerald-800 hover:bg-emerald-50"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => deactivateAccount(row._id)}
                          className="px-2 py-1 rounded border border-red-200 text-xs text-red-700 hover:bg-red-50"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={accounts}
              toolbarActions={
                <button
                  type="button"
                  onClick={openNewAccount}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                  <Plus size={16} /> New Account
                </button>
              }
              showPrint={false}
            />
          </div>

          {accountDialog.open && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
              <div className="w-full max-w-xl bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    {accountDialog.mode === "edit" ? "Edit Account" : "New Account"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAccountDialog((d) => ({ ...d, open: false }))}
                    className="p-2 rounded hover:bg-gray-100"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Type</label>
                    <select
                      value={accountDialog.form.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        const sub = (ACCOUNT_SUBTYPES[type] || ["OTHER"])[0];
                        setAccountDialog((d) => ({ ...d, form: { ...d.form, type, subType: sub } }));
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    >
                      {["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS"].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Category</label>
                    <select
                      value={accountDialog.form.subType || ""}
                      onChange={(e) => setAccountDialog((d) => ({ ...d, form: { ...d.form, subType: e.target.value } }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    >
                      {(ACCOUNT_SUBTYPES[accountDialog.form.type] || ["OTHER"]).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Show In Journal</label>
                    <select
                      value={accountDialog.form.journalSide || "BOTH"}
                      onChange={(e) => setAccountDialog((d) => ({ ...d, form: { ...d.form, journalSide: e.target.value } }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    >
                      <option value="BOTH">Debit &amp; Credit</option>
                      <option value="DEBIT">Debit only</option>
                      <option value="CREDIT">Credit only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Code</label>
                    <div className="flex gap-2">
                      <input
                        value={accountDialog.form.code || ""}
                        readOnly={accountDialog.mode === "create"}
                        onChange={(e) => {
                          if (accountDialog.mode === "create") return;
                          setAccountDialog((d) => ({ ...d, form: { ...d.form, code: e.target.value } }));
                        }}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          accountDialog.mode === "create"
                            ? "bg-gray-100 text-gray-600 border-gray-200"
                            : accountFieldErrors.code
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300"
                        }`}
                        placeholder="e.g. 1100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const type = accountDialog.form.type;
                          const code = nextAccountCode(type);
                          setAccountDialog((d) => ({ ...d, form: { ...d.form, code } }));
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                        title="Auto-generate"
                      >
                        Auto
                      </button>
                    </div>
                    {accountFieldErrors.code && <div className="mt-1 text-xs text-red-600">{accountFieldErrors.code}</div>}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Account Name</label>
                    <input
                      value={accountDialog.form.name || ""}
                      onChange={(e) => setAccountDialog((d) => ({ ...d, form: { ...d.form, name: e.target.value } }))}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        accountFieldErrors.name ? "border-red-300 bg-red-50" : "border-gray-300"
                      }`}
                      placeholder="e.g. Raw Paddy Inventory"
                    />
                    {accountFieldErrors.name && <div className="mt-1 text-xs text-red-600">{accountFieldErrors.name}</div>}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Parent Account (optional)</label>
                    <select
                      value={accountDialog.form.parentAccountId || ""}
                      onChange={(e) =>
                        setAccountDialog((d) => ({ ...d, form: { ...d.form, parentAccountId: e.target.value } }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    >
                      <option value="">(None)</option>
                      {(accounts || []).map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!accountDialog.form.isControl}
                        onChange={(e) =>
                          setAccountDialog((d) => ({ ...d, form: { ...d.form, isControl: e.target.checked } }))
                        }
                      />
                      Control account
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={accountDialog.form.isActive !== false}
                        onChange={(e) =>
                          setAccountDialog((d) => ({ ...d, form: { ...d.form, isActive: e.target.checked } }))
                        }
                      />
                      Active
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  {accountSaveError && (
                    <div className="mr-auto text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {accountSaveError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAccountDialog((d) => ({ ...d, open: false }))}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveAccount}
                    disabled={loading}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "journal-entry" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-gray-900">New Voucher</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500">
                  Totals: Debit <span className="font-semibold">{totals.totalDebit}</span> | Credit{" "}
                  <span className="font-semibold">{totals.totalCredit}</span>{" "}
                  {!totals.balanced && <span className="ml-2 text-red-600 font-semibold">Unbalanced</span>}
                </div>
                {/* Add Entry button moved to bottom actions */}
              </div>
            </div>

            {editingVoucherNo && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Voucher No: <span className="font-semibold">{editingVoucherNo}</span>
              </div>
            )}

            <div className="space-y-4">
              {(entries || []).map((e, entryIdx) => {
                const t = entryTotalsById.get(e.entryId) || { totalDebit: 0, totalCredit: 0, balanced: false };
                const v = submitAttempted ? validation.errorsByEntry.get(e.entryId) : null;
                const fieldErr = v?.fields || {};
                const lineErrMap = v?.lines || new Map();
                const lineErr = (rowId) => lineErrMap.get(String(rowId || "")) || {};
                return (
                  <div key={e.entryId} className="rounded-xl border border-gray-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">Entry {entryIdx + 1}</div>
                      <div className="text-xs text-gray-600">
                        Dr <span className="font-semibold">{t.totalDebit}</span> | Cr{" "}
                        <span className="font-semibold">{t.totalCredit}</span>{" "}
                        {!t.balanced && <span className="ml-2 text-red-600 font-semibold">Unbalanced</span>}
                      </div>
                      {!editingVoucherId && entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteEntry(e.entryId)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-red-200 text-xs text-red-700 hover:bg-red-50"
                          title="Delete entry"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>

                    {submitAttempted && fieldErr.balance && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                        {fieldErr.balance}
                      </div>
                    )}

                    <div className="grid md:grid-cols-6 gap-3 items-start">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={e.date || ""}
                          onChange={(ev) => patchEntry(e.entryId, { date: ev.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            submitAttempted && fieldErr.date ? "border-red-300 bg-red-50" : "border-gray-300"
                          }`}
                        />
                        <div className="mt-1 min-h-[14px] text-xs text-red-600">
                          {submitAttempted && fieldErr.date ? fieldErr.date : ""}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Customer</label>
                        <select
                          value={e.customerId || ""}
                          onChange={(ev) => {
                            const id = ev.target.value;
                            const match = (customerOptions || []).find((c) => String(c._id) === String(id));
                            patchEntry(e.entryId, { customerId: id, customerName: match?.name || "" });
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                        >
                          <option value="">(Optional)</option>
                          {(customerOptions || []).map((c) => (
                            <option key={c._id || c.name} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 min-h-[14px] text-xs text-transparent">.</div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">Company</label>
                        <select
                          value={e.companyId || ""}
                          onChange={(ev) => setEntryCompany(e.entryId, ev.target.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            submitAttempted && fieldErr.companyId ? "border-red-300 bg-red-50" : "border-gray-300"
                          }`}
                        >
                          <option value="">Select company</option>
                          {companyOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 min-h-[14px] text-xs text-red-600">
                          {submitAttempted && fieldErr.companyId ? fieldErr.companyId : ""}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Product</label>
                        <GroupedProductDropdown
                          valueId={e.productTypeId || ""}
                          valueLabel={String(e.productName || "").trim() || "(Optional)"}
                          groups={productTypesByBrand.groups}
                          preferredBrandKey={String(e.companyName || "").trim()}
                          onSelect={({ id }) => {
                            const match = (productTypes || []).find((p) => String(p._id) === String(id));
                            const name = match
                              ? [String(match.brand || "").trim(), String(match.name || "").trim()].filter(Boolean).join(" - ")
                              : "";
                            patchEntry(e.entryId, { productTypeId: id, productName: name });
                          }}
                        />
                        <div className="mt-1 min-h-[14px] text-xs text-transparent">.</div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Voucher Type</label>
                        <select
                          value={e.voucherType || "JOURNAL"}
                          onChange={(ev) => patchEntry(e.entryId, { voucherType: ev.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                        >
                          {VOUCHER_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 min-h-[14px] text-xs text-transparent">.</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 overflow-x-hidden">
                      <table className="w-full text-sm table-fixed">
                        <thead className="bg-emerald-50 text-emerald-900">
                          <tr>
                            <th className="text-left font-semibold px-3 py-2 w-[200px]">Debit Account</th>
                            <th className="text-left font-semibold px-3 py-2 w-[110px]">Debit Amount</th>
                            <th className="text-left font-semibold px-3 py-2 w-[200px]">Credit Account</th>
                            <th className="text-left font-semibold px-3 py-2 w-[110px]">Credit Amount</th>
                            <th className="text-left font-semibold px-3 py-2 w-[45px]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(e.lines || []).map((l) => {
                            const debitDisabled = l.entryType === "credit";
                            const creditDisabled = l.entryType === "debit";
                            const le = lineErr(l.rowId);
                            return (
                              <tr key={l.rowId} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  {debitDisabled ? (
                                    <div className="text-gray-400">-</div>
                                  ) : (
                                    <div>
                                      <select
                                        value={l.debitAccountId || ""}
                                        onChange={(ev) => patchLine(e.entryId, l.rowId, { debitAccountId: ev.target.value })}
                                        className={`w-full px-2 py-1.5 rounded border text-sm ${
                                          submitAttempted && le.debitAccountId ? "border-red-300 bg-red-50" : "border-gray-300"
                                        }`}
                                      >
                                        <option value="">Select debit account</option>
                                        {debitAccountOptions.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.label}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="mt-1 min-h-[14px] text-xs text-red-600">
                                        {submitAttempted && le.debitAccountId ? le.debitAccountId : ""}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {debitDisabled ? (
                                    <div className="text-gray-400">-</div>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          inputMode="decimal"
                                          value={l.debitAmount || ""}
                                          onChange={(ev) =>
                                            patchLine(e.entryId, l.rowId, { debitAmount: ev.target.value.replace(/[^\d.]/g, "") })
                                          }
                                          className={`w-full px-2 py-1.5 rounded border text-sm ${
                                            submitAttempted && le.debitAmount ? "border-red-300 bg-red-50" : "border-gray-300"
                                          }`}
                                          placeholder="0"
                                        />
                                      <button
                                        type="button"
                                        onClick={() => insertLineAfter(e.entryId, l.rowId, "debit")}
                                        className="p-2 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                        title="Add debit row"
                                      >
                                        +
                                      </button>
                                    </div>
                                      <div className="mt-1 min-h-[14px] text-xs text-red-600">
                                        {submitAttempted && le.debitAmount ? le.debitAmount : ""}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {creditDisabled ? (
                                    <div className="text-gray-400">-</div>
                                  ) : (
                                    <div>
                                      <select
                                        value={l.creditAccountId || ""}
                                        onChange={(ev) => patchLine(e.entryId, l.rowId, { creditAccountId: ev.target.value })}
                                        className={`w-full px-2 py-1.5 rounded border text-sm ${
                                          submitAttempted && le.creditAccountId ? "border-red-300 bg-red-50" : "border-gray-300"
                                        }`}
                                      >
                                        <option value="">Select credit account</option>
                                        {creditAccountOptions.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.label}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="mt-1 min-h-[14px] text-xs text-red-600">
                                        {submitAttempted && le.creditAccountId ? le.creditAccountId : ""}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {creditDisabled ? (
                                    <div className="text-gray-400">-</div>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          inputMode="decimal"
                                          value={l.creditAmount || ""}
                                          onChange={(ev) =>
                                            patchLine(e.entryId, l.rowId, { creditAmount: ev.target.value.replace(/[^\d.]/g, "") })
                                          }
                                          className={`w-full px-2 py-1.5 rounded border text-sm ${
                                            submitAttempted && le.creditAmount ? "border-red-300 bg-red-50" : "border-gray-300"
                                          }`}
                                          placeholder="0"
                                        />
                                      <button
                                        type="button"
                                        onClick={() => insertLineAfter(e.entryId, l.rowId, "credit")}
                                        className="p-2 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                        title="Add credit row"
                                      >
                                        +
                                      </button>
                                    </div>
                                      <div className="mt-1 min-h-[14px] text-xs text-red-600">
                                        {submitAttempted && le.creditAmount ? le.creditAmount : ""}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {l.isBase ? (
                                    <div className="text-gray-400 text-xs">-</div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => deleteLine(e.entryId, l.rowId)}
                                      className="p-2 rounded hover:bg-red-50 text-red-600"
                                      title="Delete row"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Narration</label>
                      <input
                        value={e.narration || ""}
                        onChange={(ev) => patchEntry(e.entryId, { narration: ev.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          submitAttempted && fieldErr.narration ? "border-red-300 bg-red-50" : "border-gray-300"
                        }`}
                        placeholder="Narration"
                      />
                      <div className="mt-1 min-h-[14px] text-xs text-red-600">
                        {submitAttempted && fieldErr.narration ? fieldErr.narration : ""}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end gap-2">
                {!editingVoucherId && (
                  <button
                    type="button"
                    onClick={addEntry}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Plus size={16} /> Add Entry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => saveVoucher({ andNew: false, autoPrint: false })}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={16} /> {editingVoucherId ? "Update" : "Save All"}
                </button>
              </div>
            </div>

            {/*
            <div className="rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Date</th>
                    <th className="text-left font-semibold px-3 py-2 w-[220px]">Debit Account</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Debit Amount</th>
                    <th className="text-left font-semibold px-3 py-2 w-[220px]">Credit Account</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Credit Amount</th>
                    <th className="text-left font-semibold px-3 py-2 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupedLines.map((group) => {
                    const groupNarration =
                      group.items.find((x) => String(x.narration || "").trim())?.narration || "";
                    const groupCustomerId = group.items.find((x) => String(x.customerId || "").trim())?.customerId || "";
                    const groupProductTypeId = group.items.find((x) => String(x.productTypeId || "").trim())?.productTypeId || "";
                    const groupHasAmt = group.items.some((l) => n0(l.debitAmount) > 0 || n0(l.creditAmount) > 0);
                    const missingNarration = groupHasAmt && !String(groupNarration || "").trim();
                    const firstGroupId = groupedLines[0]?.groupId;
                    return group.items.map((l, idx) => {
                      const hasAmt = n0(l.debitAmount) > 0 || n0(l.creditAmount) > 0;
                      const debitAmt = n0(l.debitAmount);
                      const creditAmt = n0(l.creditAmount);
                      const debitDisabled = l.entryType === "credit";
                      const creditDisabled = l.entryType === "debit";
                      const showDateError = submitAttempted && idx === 0 && !l.date;
                      const showDebitAccountError =
                        submitAttempted &&
                        ((debitAmt > 0 && !l.debitAccountId) ||
                          (!hasAnyInput && firstGroupId === group.groupId && idx === 0));
                      const showCreditAccountError =
                        submitAttempted && creditAmt > 0 && !l.creditAccountId;
                      const showDebitAmountError = submitAttempted && l.debitAccountId && debitAmt <= 0;
                      const showCreditAmountError = submitAttempted && l.creditAccountId && creditAmt <= 0;
                      const showNarrationError = submitAttempted && missingNarration;
                      return (
                        <React.Fragment key={l.rowId}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-3 py-2 pb-4 relative">
                              {idx === 0 ? (
                                <>
                                  <input
                                    type="date"
                                    value={l.date}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setLines((prev) =>
                                        prev.map((x) =>
                                          x.groupId === group.groupId ? { ...x, date: v } : x
                                        )
                                      );
                                    }}
                                  className={`w-full px-2 py-1.5 rounded border text-sm ${
                                    showDateError ? "border-red-300 bg-red-50" : "border-gray-300"
                                  }`}
                                  />
                                  {showDateError && (
                                    <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                      Required
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-gray-400">-</div>
                              )}
                            </td>
                            <td className="px-3 py-2 pb-4 relative">
                              {debitDisabled ? (
                                <div className="text-gray-400">-</div>
                              ) : l.debitMode === "input" ? (
                                <div className="flex gap-2">
                                  <input
                                    value={l.debitInput}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setLines((prev) =>
                                        prev.map((x) => (x.rowId === l.rowId ? { ...x, debitInput: v } : x))
                                      );
                                    }}
                                    onBlur={async () => {
                                      if (!l.debitInput.trim()) {
                                        setLines((prev) =>
                                        prev.map((x) =>
                                          x.rowId === l.rowId ? { ...x, debitMode: "list", debitInput: "" } : x
                                        )
                                      );
                                        return;
                                      }
                                      const id = await createAccountByName(l.debitInput);
                                      if (!id) return;
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId
                                          ? { ...x, debitAccountId: id, debitMode: "list", debitInput: "" }
                                          : x
                                      )
                                    );
                                    }}
                                  className={`w-[80%] px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                    showDebitAccountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                  }`}
                                    placeholder="Type debit account"
                                    disabled={debitDisabled}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId ? { ...x, debitMode: "list", debitInput: "" } : x
                                      )
                                    )
                                  }
                                    className="w-[20%] px-2 py-1.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                    title="Back to list"
                                    disabled={debitDisabled}
                                  >
                                    List
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={l.debitAccountId}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "__ADD__") {
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId ? { ...x, debitMode: "input", debitAccountId: "" } : x
                                      )
                                    );
                                      return;
                                    }
                                    setLines((prev) =>
                                      prev.map((x) => (x.rowId === l.rowId ? { ...x, debitAccountId: v } : x))
                                    );
                                  }}
                                  className={`w-full px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                    showDebitAccountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                  }`}
                                  disabled={debitDisabled}
                                >
                                  <option value="">Select debit account</option>
                                  {debitAccountOptions.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.label}
                                    </option>
                                  ))}
                                  <option value="__ADD__">+ Add new account</option>
                                </select>
                              )}
                              {showDebitAccountError && (
                                <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                  Required
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 pb-4 relative">
                              {debitDisabled ? (
                                <div className="text-gray-400">-</div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    inputMode="decimal"
                                    value={l.debitAmount}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d.]/g, "");
                                      setLines((prev) =>
                                        prev.map((x) => (x.rowId === l.rowId ? { ...x, debitAmount: v } : x))
                                      );
                                    }}
                                    className={`w-full px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                      showDebitAmountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                    }`}
                                    placeholder="0"
                                    disabled={debitDisabled}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => insertLineAfter(lines.findIndex((x) => x.rowId === l.rowId), "debit")}
                                    className="p-2 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                    title="Add debit row"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                              {showDebitAmountError && (
                                <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                  Amount required
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 pb-4 relative">
                              {creditDisabled ? (
                                <div className="text-gray-400">-</div>
                              ) : l.creditMode === "input" ? (
                                <div className="flex gap-2">
                                  <input
                                    value={l.creditInput}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setLines((prev) =>
                                        prev.map((x) => (x.rowId === l.rowId ? { ...x, creditInput: v } : x))
                                      );
                                    }}
                                    onBlur={async () => {
                                      if (!l.creditInput.trim()) {
                                        setLines((prev) =>
                                        prev.map((x) =>
                                          x.rowId === l.rowId ? { ...x, creditMode: "list", creditInput: "" } : x
                                        )
                                      );
                                        return;
                                      }
                                      const id = await createAccountByName(l.creditInput);
                                      if (!id) return;
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId
                                          ? { ...x, creditAccountId: id, creditMode: "list", creditInput: "" }
                                          : x
                                      )
                                    );
                                    }}
                                  className={`w-[80%] px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                    showCreditAccountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                  }`}
                                    placeholder="Type credit account"
                                    disabled={creditDisabled}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId ? { ...x, creditMode: "list", creditInput: "" } : x
                                      )
                                    )
                                  }
                                    className="w-[20%] px-2 py-1.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                    title="Back to list"
                                    disabled={creditDisabled}
                                  >
                                    List
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={l.creditAccountId}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "__ADD__") {
                                      setLines((prev) =>
                                      prev.map((x) =>
                                        x.rowId === l.rowId ? { ...x, creditMode: "input", creditAccountId: "" } : x
                                      )
                                    );
                                      return;
                                    }
                                    setLines((prev) =>
                                      prev.map((x) => (x.rowId === l.rowId ? { ...x, creditAccountId: v } : x))
                                    );
                                  }}
                                  className={`w-full px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                    showCreditAccountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                  }`}
                                  disabled={creditDisabled}
                                >
                                  <option value="">Select credit account</option>
                                  {creditAccountOptions.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.label}
                                    </option>
                                  ))}
                                  <option value="__ADD__">+ Add new account</option>
                                </select>
                              )}
                              {showCreditAccountError && (
                                <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                  Required
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 pb-4 relative">
                              {creditDisabled ? (
                                <div className="text-gray-400">-</div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    inputMode="decimal"
                                    value={l.creditAmount}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d.]/g, "");
                                      setLines((prev) =>
                                        prev.map((x) => (x.rowId === l.rowId ? { ...x, creditAmount: v } : x))
                                      );
                                    }}
                                    className={`w-full px-2 py-1.5 rounded border text-sm disabled:bg-gray-100 ${
                                      showCreditAmountError ? "border-red-300 bg-red-50" : "border-gray-300"
                                    }`}
                                    placeholder="0"
                                    disabled={creditDisabled}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => insertLineAfter(lines.findIndex((x) => x.rowId === l.rowId), "credit")}
                                    className="p-2 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                    title="Add credit row"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                              {showCreditAmountError && (
                                <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                  Amount required
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setLines((prev) => prev.filter((x) => x.rowId !== l.rowId))}
                                className="p-2 rounded hover:bg-red-50 text-red-600"
                                title="Delete row"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                          {idx === group.items.length - 1 && (
                            <>
                              <tr className="bg-gray-50/40">
                                <td className="px-3 py-2 pb-4" colSpan={5}>
                                  <div className="grid md:grid-cols-3 gap-3 items-end">
                                    <div>
                                      <label className="block text-[11px] text-gray-600 mb-1">Company</label>
                                      <select
                                        value={header.companyId || filterCompanyId || ""}
                                        onChange={(e) => setCompany(e.target.value)}
                                        className={`w-full px-2 py-1.5 rounded border text-sm ${
                                          submitAttempted && !(header.companyId || filterCompanyId)
                                            ? "border-red-300 bg-red-50"
                                            : "border-gray-300"
                                        }`}
                                      >
                                        <option value="">Select company</option>
                                        {companyOptions.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                      {submitAttempted && !(header.companyId || filterCompanyId) && (
                                        <div className="mt-1 text-xs text-red-600">Company is required.</div>
                                      )}
                                    </div>

                                    <div>
                                      <label className="block text-[11px] text-gray-600 mb-1">Customer (optional)</label>
                                      <select
                                        value={groupCustomerId || ""}
                                        onChange={(e) => {
                                          const id = e.target.value;
                                          const match = (customerOptions || []).find((c) => String(c._id) === String(id));
                                          setLines((prev) =>
                                            prev.map((x) =>
                                              x.groupId === group.groupId
                                                ? { ...x, customerId: id, customerName: match?.name || "" }
                                                : x
                                            )
                                          );
                                        }}
                                        className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                                      >
                                        <option value="">(Optional)</option>
                                        {(customerOptions || []).map((c) => (
                                          <option key={c._id || c.name} value={c._id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[11px] text-gray-600 mb-1">Product (optional)</label>
                                      <select
                                        value={groupProductTypeId || ""}
                                        onChange={(e) => {
                                          const id = e.target.value;
                                          const match = (productTypes || []).find((p) => String(p._id) === String(id));
                                          const name = match
                                            ? [String(match.brand || "").trim(), String(match.name || "").trim()]
                                                .filter(Boolean)
                                                .join(" - ")
                                            : "";
                                          setLines((prev) =>
                                            prev.map((x) =>
                                              x.groupId === group.groupId
                                                ? { ...x, productTypeId: id, productName: name }
                                                : x
                                            )
                                          );
                                        }}
                                        className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                                      >
                                        <option value="">(Optional)</option>
                                        {(productTypes || []).map((p) => (
                                          <option key={p._id} value={p._id}>
                                            {[String(p.brand || "").trim(), String(p.name || "").trim()]
                                              .filter(Boolean)
                                              .join(" - ")}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2"></td>
                              </tr>

                              <tr className="bg-gray-50/40">
                                <td className="px-3 py-2 pb-4 relative" colSpan={5}>
                                  <input
                                    value={groupNarration}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setLines((prev) =>
                                        prev.map((x) => (x.groupId === group.groupId ? { ...x, narration: v } : x))
                                      );
                                    }}
                                    className={`w-full px-2 py-1.5 rounded border text-sm ${narrationClass(
                                      missingNarration
                                    )}`}
                                    placeholder="Narration"
                                  />
                                  {false && showNarrationError && (
                                    <div className="absolute left-0 top-full mt-1 text-[10px] text-red-600">
                                      Narration required
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2"></td>
                              </tr>
                            </>
                          )}
                        </React.Fragment>
                      );
                    });
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-3 py-2 font-semibold">Totals</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 font-semibold">{totals.totalDebit}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 font-semibold">{totals.totalCredit}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveVoucher({ andNew: false })}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Save size={16} /> Save
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            */}

            {submitAttempted && hasValidationErrors && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2">
                Please fix highlighted fields.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {showVoucherFilters && (
              <div className="grid md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-1">
                  <label className="block text-xs text-gray-600 mb-1">Start</label>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs text-gray-600 mb-1">End</label>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Company</label>
                  <select
                    value={filterCompanyId || filterCompanyName}
                    onChange={(e) => handleFilterCompany(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  >
                    <option value="">All companies</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Customer</label>
                  <select
                    value={filterCustomerName}
                    onChange={(e) => setFilterCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  >
                    <option value="">All customers</option>
                    {customerOptions.map((c) => (
                      <option key={c._id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs text-gray-600 mb-1">Product</label>
                  <GroupedProductDropdown
                    valueId={filterProductId || ""}
                    valueLabel={filterProductLabel || ""}
                    groups={productTypesByBrand.groups}
                    preferredBrandKey={filterCompanyName}
                    placeholder="Select product"
                    onSelect={({ id }) => setFilterProductId(id)}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs text-gray-600 mb-1">Voucher Type</label>
                  <select
                    value={filterVoucherType}
                    onChange={(e) => setFilterVoucherType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  >
                    <option value="">All</option>
                    {VOUCHER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-gray-600 mb-1">Account (optional filter)</label>
                  <select
                    value={filterAccountId}
                    onChange={(e) => setFilterAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  >
                    <option value="">All accounts</option>
                    {accountOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadVouchers().catch(() => {})}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                  >
                    <RefreshCcw size={16} /> Apply
                  </button>
                </div>
              </div>
            )}

            <DataTable
              title="Vouchers"
              columns={[
                { key: "voucherNo", label: "Voucher No" },
                { key: "date", label: "Date", render: (v) => (v ? new Date(v).toLocaleDateString() : "-") },
                { key: "voucherType", label: "Type" },
                { key: "companyName", label: "Company" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
                {
                  key: "actions",
                  label: "Actions",
                  sortable: false,
                  render: (_v, row) => (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => editVoucher(row._id)}
                        className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintVoucher(row._id)}
                        className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        title="Print"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => askDeleteVoucher(row._id, row.voucherNo)}
                        className="p-2 rounded border border-red-200 text-red-700 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ),
                },
              ]}
              data={vouchers}
              rowClassName={(row) => (row.status === "REVERSED" ? "opacity-60" : "")}
              showFilters={false}
              showClearFilters={false}
              toolbarActions={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVoucherFilters((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Filter size={16} /> {showVoucherFilters ? "Hide Filters" : "Filters"}
                  </button>
                </div>
              }
              exportColumns={[
                { key: "voucherNo", label: "Voucher No" },
                { key: "date", label: "Date" },
                { key: "voucherType", label: "Type" },
                { key: "companyName", label: "Company" },
                { key: "description", label: "Description" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              exportData={(rows) =>
                rows.map((r) => ({
                  ...r,
                  date: r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
                }))
              }
            />
          </div>

        </div>
      )}

      {deleteDialog.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">Delete Voucher</div>
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false, id: "", voucherNo: "" })}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 text-sm text-gray-700">
              Delete voucher{" "}
              <span className="font-semibold">{deleteDialog.voucherNo || "this voucher"}</span> permanently?
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false, id: "", voucherNo: "" })}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteVoucher}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>

        </div>
      )}

      {journalGenerateOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Generate Journal</div>
              <button
                type="button"
                onClick={() => setJournalGenerateOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Journal Name</label>
              <input
                value={journalGenerateName}
                onChange={(e) => {
                  setJournalGenerateName(e.target.value);
                  setJournalNameTouched(true);
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="e.g. April 2026 Journal"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setJournalGenerateOpen(false)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyJournalGenerateFilters}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {journalFilterOpen && null}

      {ledgerGenerateOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Generate Ledger</div>
              <button
                type="button"
                onClick={() => setLedgerGenerateOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Ledger name</label>
              <input
                value={ledgerGenerateName}
                onChange={(e) => {
                  setLedgerGenerateName(e.target.value);
                  setLedgerNameTouched(true);
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="Ledger name"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLedgerGenerateOpen(false)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyLedgerGenerateFilters}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger filters modal removed */}

      {false && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setJournalPreviewOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-white rounded-xl border border-gray-200 shadow-lg p-4 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Journal Preview</div>
              <button
                type="button"
                onClick={() => setJournalPreviewOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-center space-y-1">
              <div className="text-xs uppercase tracking-wide text-gray-500">Journal Entries</div>
              <div className="text-sm font-semibold text-gray-900">
                For {journalPreviewMeta?.rangeLabel || "All Dates"}
              </div>
              {!!journalPreviewMeta?.companyName && (
                <div className="text-xs text-gray-700">{journalPreviewMeta.companyName}</div>
              )}
              {!!journalPreviewMeta?.customerName && (
                <div className="text-xs text-gray-700">{journalPreviewMeta.customerName}</div>
              )}
              {!!journalPreviewMeta?.productName && (
                <div className="text-xs text-gray-700">{journalPreviewMeta.productName}</div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 overflow-x-hidden">
              <table className="w-full text-sm border border-gray-200 table-fixed">
                <thead className="bg-gray-50 text-gray-800">
                  <tr>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Date</th>
                    <th className="text-left font-semibold px-2 py-2 w-[260px] border border-gray-200">Particulars</th>
                    <th className="text-left font-semibold px-2 py-2 w-[50px] border border-gray-200">L.F.</th>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Debit Amount (Rs.)</th>
                    <th className="text-left font-semibold px-2 py-2 w-[90px] border border-gray-200">Credit Amount (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {journalPreviewEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-sm text-gray-500 text-center">
                        No journals found for the selected filters.
                      </td>
                    </tr>
                  )}
                  {journalPreviewEntries.map((entry, idx) => (
                    <React.Fragment key={`${entry.account || entry.narration}-${idx}`}>
                      {entry.isNarrationRow ? (
                        <tr>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate ? entry.lf || "" : ""}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle italic text-gray-600 border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            ({withBeing(entry.narration)})
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate ? entry.lf || "" : ""}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          ></td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          ></td>
                        </tr>
                      ) : (
                        <tr>
                          <td
                            className={`px-3 py-2 align-middle text-center border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.showDate && (
                              <>
                                <div className="text-xs text-gray-700">{formatYear(entry.date)}</div>
                                <div className="text-xs text-gray-700">{formatMonthDay(entry.date)}</div>
                              </>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            <div
                              className={`flex items-center justify-between gap-2 ${
                                entry.side === "credit" ? "pl-4 text-gray-700" : ""
                              }`}
                            >
                            <span className="truncate">
                              {entry.side === "credit" ? "To " : ""}
                              {entry.account}
                            </span>
                              {entry.side === "debit" && <span className="text-xs font-semibold">Dr</span>}
                            </div>
                          </td>
                          <td
                            className={`px-3 py-2 align-middle border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          ></td>
                          <td
                            className={`px-3 py-2 align-middle text-right border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.side === "debit" ? `Rs. ${String(entry.amount)}` : "-"}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-right border-x border-gray-200 ${
                              entry.isFirstInGroup ? "border-t border-gray-200" : "border-t-0"
                            } ${entry.isLastInGroup ? "border-b border-gray-200" : "border-b-0"}`}
                          >
                            {entry.side === "credit" ? `Rs. ${String(entry.amount)}` : "-"}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {journalInfoDialog.open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-full max-w-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Notice</div>
              <button
                type="button"
                onClick={() => setJournalInfoDialog({ open: false, message: "" })}
                className="p-2 rounded hover:bg-gray-100"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-sm text-gray-700">{journalInfoDialog.message}</div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setJournalInfoDialog({ open: false, message: "" })}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {downloadMenu.open && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setDownloadMenu({ open: false, journal: null, anchor: { x: 0, y: 0 } })}
        >
          <div
            className="absolute bg-white rounded-lg border border-gray-200 shadow-lg py-1 text-sm"
            style={{ top: downloadMenu.anchor.y, left: downloadMenu.anchor.x, transform: "translateX(-100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                const j = downloadMenu.journal;
                setDownloadMenu({ open: false, journal: null, anchor: { x: 0, y: 0 } });
                handleDownloadGeneratedJournal(j);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => {
                const j = downloadMenu.journal;
                setDownloadMenu({ open: false, journal: null, anchor: { x: 0, y: 0 } });
                handleDownloadGeneratedJournalExcel(j);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              Download Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

