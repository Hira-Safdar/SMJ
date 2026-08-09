import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Package,
  Factory,
  Truck,
  TrendingUp,
  Scale,
  Landmark,
  BookOpen,
  BookCopy,
  FileText,
  UserRound,
  Filter,
  Download,
  X,
  Trash2,
  ChevronDown,
} from "lucide-react";
import DataTable from "../components/ui/DataTable";
import api, { toAbsoluteUrl } from "../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { fmtDate } from "../utils/dateUtils";

const REPORT_TABS = [
  { key: "gatepass", label: "Gatepass Reports", icon: <Truck size={16} /> },
  { key: "stock-reports", label: "Stock Reports", icon: <Package size={16} /> },
  { key: "production-summary", label: "Production Summary", icon: <Factory size={16} /> },
  { key: "acc-reports", label: "Accounting and Finance Reports", icon: <BookOpen size={16} /> },
];

const REPORT_TAB_MAP = new Map(REPORT_TABS.map((t) => [t.key, t]));
const REPORT_GROUPS = [
  {
    label: "Gate Pass",
    tabs: ["gatepass"],
  },
  {
    label: "Stock",
    tabs: ["stock-reports"],
  },
  {
    label: "Production",
    tabs: ["production-summary"],
  },
  {
    label: "Accounting",
    tabs: ["acc-reports"],
  },
];

const normalizeReportTabKey = (tab) => {
  if (tab === "stock" || tab === "stock-movement") return "stock-reports";
  return tab;
};

const RANGE_OPTIONS = [
  { value: "day", label: "Day (Today)" },
  { value: "particular", label: "Particular Date" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "From-To Date" },
];

const num = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
};
const fmt = (v) => `Rs ${num(v)}`;
const shortEntryId = (value) => {
  const raw = String(value || "").replace(/\D/g, "");
  if (!raw) return "";
  return raw.slice(-4);
};
const normalizePaymentStatus = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Unpaid/Pending";
  if (raw.includes("unpaid") || raw.includes("pending")) return "Unpaid/Pending";
  if (raw.includes("partial")) return "Partial Paid";
  if (raw.includes("paid")) return "Paid";
  return "Unpaid/Pending";
};
const formatMonthDay = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit" });
};
const formatYear = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.getFullYear();
};
const withBeing = (text) => {
  const t = String(text || "").trim();
  if (!t) return "";
  return t;
};
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const n0 = (v) => (v === "" || v == null ? 0 : Number(v || 0) || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));
const ensureAccountSuffix = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\bA\/C\b/i.test(text)) return text;
  return `${text} A/C`;
};

const gpFmtNum = (v) => {
  const n = Number(v || 0);
  if (!n) return "";
  return Number.isInteger(n)
    ? String(n)
    : String(+n.toFixed(2)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};
const gpFormatKgToMan = (kg) => {
  const total = Number(kg || 0);
  if (total <= 0) return "";
  const man = Math.floor(total / 40);
  const remainder = +(total - man * 40).toFixed(2);
  const w = (value) =>
    Number.isInteger(value) ? String(value) : String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (man === 0) return `${w(remainder)} kg`;
  if (remainder === 0) return `${man} man`;
  return `${man} man ${w(remainder)} kg`;
};
const gpComputeBags = (item = {}) => {
  const gross = Number(item?.weightAtSmjKg || 0);
  const emptyPerBag = Number(item?.emptyBagWeightKg || 0);
  const bagW = Number(item?.bagWeightEachKg || item?.bagWeightKg || 0);
  if (gross <= 0) return "";
  if (bagW <= 0) return `${gpFmtNum(gross)}kg`;
  const fullBags = Math.floor(gross / bagW);
  const looseKg = +(gross - fullBags * bagW).toFixed(2);
  const bagsLabel = fullBags > 0 ? `${fullBags} bag${fullBags > 1 ? "s" : ""}` : "";
  const looseLabel = looseKg > 0 ? `${gpFmtNum(looseKg)}kg` : "";
  return [bagsLabel, looseLabel].filter(Boolean).join(" ") || "";
};
const gpItemListText = (row, getter) => {
  const list = (row?.items || []).map(getter).filter(Boolean);
  return list.length ? Array.from(new Set(list)).join(", ") : "-";
};
const gpItemBrand = (it = {}) => String(it?.brand || it?.brandName || it?.companyName || "").trim();
const gpItemName = (it = {}) =>
  String(it?.itemType === "Other" && it?.customItemName ? it?.customItemName : it?.itemType || "Item").trim();

const gatePassInReportColumns = [
  { key: "date", label: "Date", render: (v) => fmtDate(v) },
  { key: "gatePassNo", label: "GP No" },
  { key: "senderName", label: "Sender Name" },
  {
    key: "companyNames",
    label: "Company",
    render: (_v, row) => gpItemListText(row, (it) => gpItemBrand(it)),
  },
  {
    key: "truckNo",
    label: "Truck",
    render: (v) => (v && v !== "IN-0000" ? v : "-"),
  },
  {
    key: "productNames",
    label: "Product Name",
    render: (_v, row) => gpItemListText(row, (it) => gpItemName(it)),
  },
  {
    key: "weightOnArrival",
    label: "Wt on Arrival (kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFmtNum(it?.weightOnArrival)),
  },
  {
    key: "bagsOnArrival",
    label: "Bags on Arrival",
    render: (_v, row) =>
      gpItemListText(row, (it) => (Number(it?.bagsOnArrival) > 0 ? gpFmtNum(it?.bagsOnArrival) : "")),
  },
  {
    key: "weightAtSmjKg",
    label: "Wt at SMJ (kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFmtNum(it?.weightAtSmjKg)),
  },
  {
    key: "emptyBagWeightKg",
    label: "Empty Bag Wt (kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFmtNum(it?.emptyBagWeightKg)),
  },
  {
    key: "netWeightKg",
    label: "Net Weight (kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFmtNum(it?.netWeightKg || it?.quantity)),
  },
  {
    key: "netWeightMan",
    label: "Net Weight (man/kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFormatKgToMan(it?.netWeightKg || it?.quantity)),
  },
  {
    key: "bagWeightEachKg",
    label: "Bag Wt Each (kg)",
    render: (_v, row) => gpItemListText(row, (it) => gpFmtNum(it?.bagWeightEachKg || it?.bagWeightKg)),
  },
  {
    key: "bagCount",
    label: "No. of Bags",
    render: (_v, row) => gpItemListText(row, (it) => gpComputeBags(it)),
  },
  {
    key: "freightCharges",
    label: "Freight",
    render: (v) => (v != null && Number(v) > 0 ? gpFmtNum(v) : "-"),
  },
];

const gatePassOutReportColumns = [
  { key: "date", label: "Date", render: (v) => fmtDate(v) },
  { key: "gatePassNo", label: "GP No" },
  { key: "partyName", label: "Company Name (Send To)" },
  {
    key: "truckNo",
    label: "Truck No",
    render: (v) => (v && v !== "OUT-0000" ? v : "-"),
  },
  {
    key: "companyNames",
    label: "Company Name (Product Owner)",
    render: (_v, row) => gpItemListText(row, (it) => gpItemBrand(it)),
  },
  {
    key: "productNames",
    label: "Product Name",
    render: (_v, row) => {
      const list = (row?.items || [])
        .map((it) => {
          const name = it?.itemType === "Other" && it?.customItemName ? it?.customItemName : it?.itemType;
          const qty = gpFmtNum(it?.netWeightKg || it?.quantity || 0);
          return `${name}${qty ? ` (${qty} kg)` : ""}`;
        })
        .filter(Boolean);
      return list.length ? Array.from(new Set(list)).join(", ") : "-";
    },
  },
  {
    key: "bagCount",
    label: "No. of Bags",
    render: (_v, row) => gpItemListText(row, (it) => String(it?.bagCount || "").trim()),
  },
  {
    key: "bagWeightEachKg",
    label: "Weight Per Bag (kg)",
    render: (_v, row) =>
      gpItemListText(row, (it) => {
        const w = gpFmtNum(it?.bagWeightEachKg || it?.bagWeightKg || 0);
        return w ? `${w} kg` : "";
      }),
  },
  {
    key: "totalWeightKg",
    label: "Total Weight",
    render: (_v, row) =>
      gpItemListText(row, (it) => {
        const total = gpFmtNum(it?.grossWeightKg || it?.totalWeightKg || 0);
        return total ? `${total} kg` : "";
      }),
  },
  {
    key: "emptyBagWeightKg",
    label: "Weight of Empty Bags (kg)",
    render: (_v, row) =>
      gpItemListText(row, (it) => {
        const w = gpFmtNum(it?.emptyBagWeightKg || 0);
        return w ? `${w} kg` : "";
      }),
  },
  {
    key: "netWeightKg",
    label: "Net Weight",
    render: (_v, row) =>
      gpItemListText(row, (it) => {
        const net = gpFmtNum(it?.netWeightKg || it?.quantity || 0);
        return net ? `${net} kg` : "";
      }),
  },
];

const mapStockRows = (payload = {}) => {
  const production = (payload?.production || []).map((r, idx) => ({
    id: `p-${idx}`,
    entryDate: r.lastEntryDate || "",
    stockType: "Production",
    item: r.productTypeName || "-",
    party: r.companyName || "-",
    balance: num(r.balanceKg),
    valuePKR: round2(r.valuePKR || 0),
    companyId: r.companyId || "",
    productTypeId: r.productTypeId || "",
  }));
  return [...production];
};

const mapStockMovementRows = (payload = []) =>
  (payload || []).map((r) => ({
    id: r._id,
    ...r,
  }));

const dedupeByName = (items = []) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = String(item?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildStockProducts = (payload = {}, fallback = []) => {
  const source = (payload?.production || [])
    .map((row) => ({
      _id: String(row.productTypeId || row.productTypeName || "").trim(),
      name: String(row.productTypeName || "").trim(),
    }))
    .filter((row) => row._id && row.name);
  return dedupeByName(source.length ? source : fallback);
};

function computeTotalsFromItems({ earnings, deductionsItems }) {
  const e = Array.isArray(earnings) ? earnings : [];
  const d = Array.isArray(deductionsItems) ? deductionsItems : [];
  const totalEarnings = round2(e.reduce((s, it) => s + n0(it?.amount), 0));
  const totalDeductions = round2(d.reduce((s, it) => s + n0(it?.amount), 0));
  const netPay = Math.max(0, round2(totalEarnings - totalDeductions));
  return { totalEarnings, totalDeductions, netPay };
}

function defaultEarningsFromBasic(basicSalary) {
  const base = round2(Number(basicSalary || 0));
  return [
    { key: "basic", title: "Basic", amount: base },
    { key: "incentive", title: "Incentive", amount: 0 },
    { key: "overtime", title: "Overtime", amount: 0 },
    { key: "bonus", title: "Bonus", amount: 0 },
    { key: "other", title: "Other", amount: 0 },
  ];
}

function defaultDeductions() {
  return [
    { key: "advance", title: "Advance / Loan", amount: 0 },
    { key: "pf", title: "Provident Fund", amount: 0 },
    { key: "tax", title: "Professional Tax", amount: 0 },
    { key: "other", title: "Other Deduction", amount: 0 },
  ];
}

export default function Reports({ embedded = false, initialTab = "", allowedTabs = null, hideFilters = false, highlightId = "" }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthValue = new Date().toISOString().slice(0, 7);
  const currentYearValue = String(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState(() =>
    embedded && initialTab ? initialTab : "acc-reports"
  );
  const [range, setRange] = useState("month");
  const [particularDate, setParticularDate] = useState(todayIso);
  const [weekDate, setWeekDate] = useState(todayIso);
  const [monthValue, setMonthValue] = useState(currentMonthValue);
  const [yearValue, setYearValue] = useState(currentYearValue);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stockRows, setStockRows] = useState([]);
  const [stockMovementRows, setStockMovementRows] = useState([]);

  // Accounting filters (manual-entry reports)
  const [accCompanies, setAccCompanies] = useState([]);
  const [accAccounts, setAccAccounts] = useState([]);
  const [accCustomers, setAccCustomers] = useState([]);

  const [accCompanyId, setAccCompanyId] = useState("");
  const [accVoucherTypes, setAccVoucherTypes] = useState([]);
  const [accAccountIds, setAccAccountIds] = useState([]);
  const [accCustomerNames, setAccCustomerNames] = useState([]);
  const [accProductName, setAccProductName] = useState("");

  const [filterTemplates, setFilterTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDialog, setTemplateDialog] = useState({ open: false, name: "" });
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    kind: "",
    item: null,
    label: "",
  });
  const [generatedJournalList, setGeneratedJournalList] = useState([]);
  const [generatedLedgerList, setGeneratedLedgerList] = useState([]);
  const [generatedTrialList, setGeneratedTrialList] = useState([]);
  const [generatedPlList, setGeneratedPlList] = useState([]);
  const [generatedBalanceList, setGeneratedBalanceList] = useState([]);
  const [generatedLoading, setGeneratedLoading] = useState(false);
  const [ledgerRecordsOpen, setLedgerRecordsOpen] = useState(false);

  // Stock / Production filters
  const [invCompanies, setInvCompanies] = useState([]); // Company (party) list
  const [invProducts, setInvProducts] = useState([]); // ProductType list
  const [invCompanyIds, setInvCompanyIds] = useState([]);
  const [invProductTypeIds, setInvProductTypeIds] = useState([]);
  const [stockFilterOpen, setStockFilterOpen] = useState(false);

  // Gatepass report cards + generated reports
  const [gpSenders, setGpSenders] = useState([]);
  const [gpCustomers, setGpCustomers] = useState([]);
  const [gpStock, setGpStock] = useState([]);
  const [gpStockAll, setGpStockAll] = useState([]);
  const [gpExpandedOutCompany, setGpExpandedOutCompany] = useState("");
  const [gpGeneratedList, setGpGeneratedList] = useState([]);
  const [gpGeneratedLoading, setGpGeneratedLoading] = useState(false);
  const [gpExpandedCompany, setGpExpandedCompany] = useState("");
  const [gpInCriteria, setGpInCriteria] = useState({
    range: "all",
    startDate: "",
    endDate: "",
    sender: "",
    company: "",
    product: "",
  });
  const [gpOutCriteria, setGpOutCriteria] = useState({
    range: "all",
    startDate: "",
    endDate: "",
    customer: "",
    company: "",
    product: "",
  });

  // Drill-down modal
  const [drill, setDrill] = useState({ open: false, kind: "", title: "", loading: false, rows: [], columns: [] });
  const [settings, setSettings] = useState({});
  const [printLogoDataUrl, setPrintLogoDataUrl] = useState("");

  const filterInputClass =
    "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
  const filterLabelClass = "block text-xs font-medium text-gray-600 mb-1";

  const toAbsoluteLogoUrl = (value) => toAbsoluteUrl(value);

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
    const name = String(settings.companyName || settings.shortName || "").trim();
    const address = String(settings.address || "").trim();
    const email = String(settings.email || "").trim();
    const logoUrl = toAbsoluteLogoUrl(settings.logoUrl || settings.logo || "");
    return { name, address, email, logoUrl, logoDataUrl: printLogoDataUrl };
  };

  const addPdfHeader = (doc, title, subTitle) => {
    const { name, address, email, logoDataUrl } = resolvePrintHeader();
    // revert to legacy: no custom header
    return 32;
  };

  const openHtmlWindow = (html, { title = "Preview", autoPrint = false } = {}) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`);
    w.document.close();
    if (autoPrint) {
      w.focus();
      w.print();
    }
  };

  const clearStockFilters = () => {
    setRange("month");
    setParticularDate(todayIso);
    setWeekDate(todayIso);
    setMonthValue(currentMonthValue);
    setYearValue(currentYearValue);
    setStartDate("");
    setEndDate("");
    setInvCompanyIds([]);
    setInvProductTypeIds([]);
  };

  const refreshInventoryFilterOptions = async () => {
    try {
      const [companyRes, productRes] = await Promise.all([api.get("/companies"), api.get("/product-types")]);
      const companyList = dedupeByName(companyRes.data?.data || []);
      const productList = dedupeByName(productRes.data?.data || []);
      setInvCompanies((prev) => dedupeByName([...(prev || []), ...companyList]));
      setInvProducts((prev) => dedupeByName([...(prev || []), ...productList]));
    } catch {
      // ignore; existing filter options can still be used
    }
  };

  const openStockFilterPopup = async () => {
    await refreshInventoryFilterOptions();
    setStockFilterOpen(true);
  };

  const renderMovementReference = (row) => {
    const label = String(row?.reference || "").trim();
    const targetPath = String(row?.referenceTarget?.path || "").trim();
    if (!label) return "-";
    if (!targetPath) return label;
    return (
      <button
        type="button"
        onClick={() => navigate(targetPath)}
        className="text-emerald-700 hover:underline"
      >
        {label}
      </button>
    );
  };

  const stockAsOfDateLabel = useMemo(() => {
    if (range === "custom" && startDate && endDate) return `${fmtDate(startDate)} to ${fmtDate(endDate)}`;
    if (range === "particular" && particularDate) return fmtDate(particularDate);
    if (range === "week" && weekDate) return `Week of ${fmtDate(weekDate)}`;
    if (range === "month" && monthValue) {
      const [y, m] = monthValue.split("-").map(Number);
      return `${MONTHS[(m || 1) - 1]} ${y || ""}`.trim();
    }
    if (range === "year" && yearValue) return String(yearValue);
    if (range === "custom" && startDate) return `From ${fmtDate(startDate)}`;
    if (range === "custom" && endDate) return fmtDate(endDate);
    if (range === "day") return "Today";
    if (range === "week") return "Selected week";
    if (range === "month") return "Selected month";
    if (range === "year") return "Selected year";
    return "All dates";
  }, [endDate, monthValue, particularDate, range, startDate, weekDate, yearValue]);

  const stockRangeSummary = useMemo(() => {
    if (range === "particular" && particularDate) return `Stock as of ${fmtDate(particularDate)}`;
    if (range === "custom" && startDate && endDate) return `Stock as of ${fmtDate(endDate)} for ${fmtDate(startDate)} to ${fmtDate(endDate)}`;
    if (range === "custom" && endDate) return `Stock as of ${fmtDate(endDate)}`;
    if (range === "year") return "Year-end stock snapshot";
    if (range === "month") return "Month-end stock snapshot";
    if (range === "week") return "Week-end stock snapshot";
    if (range === "day") return "Today stock snapshot";
    return "Stock snapshot";
  }, [endDate, particularDate, range, startDate]);

  const stockFilterSummary = useMemo(() => {
    const bits = [stockRangeSummary];
    if (invCompanyIds[0]) {
      const company = (invCompanies || []).find((c) => String(c._id) === String(invCompanyIds[0]));
      if (company?.name) bits.push(`Company: ${company.name}`);
    }
    if (invProductTypeIds[0]) {
      const product = (invProducts || []).find((p) => String(p._id) === String(invProductTypeIds[0]));
      if (product?.name) bits.push(`Product: ${product.name}`);
    }
    return bits.join(" | ");
  }, [invCompanies, invCompanyIds, invProducts, invProductTypeIds, stockRangeSummary]);

  const stockReportContextLines = useMemo(() => {
    const lines = [];
    const company = invCompanyIds[0]
      ? (invCompanies || []).find((c) => String(c._id) === String(invCompanyIds[0]))?.name || "Selected Company"
      : "All Companies";
    const product = invProductTypeIds[0]
      ? (invProducts || []).find((p) => String(p._id) === String(invProductTypeIds[0]))?.name || "Selected Product"
      : "All Products";
    lines.push(`Company: ${company}`);
    lines.push(`Product: ${product}`);
    lines.push(`Date: ${stockAsOfDateLabel}`);
    return lines;
  }, [invCompanies, invCompanyIds, invProducts, invProductTypeIds, stockAsOfDateLabel]);

  const gpStockCompanies = useMemo(() => {
    const set = new Set();
    (gpStock || []).forEach((r) => {
      const c = String(r.companyName || r.brandName || "").trim();
      if (c && c !== "Mill Own Stock") set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [gpStock]);

  const gpProductsForCompany = useCallback(
    (company) => {
      const set = new Set();
      (gpStock || []).forEach((r) => {
        if (String(r.companyName || r.brandName || "").trim() === company) {
          const p = String(r.productTypeName || "").trim();
          if (p) set.add(p);
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
    [gpStock]
  );

  const gpOutStockCompanies = useMemo(() => {
    const companiesWithStock = new Set(
      (gpStock || []).map((r) => String(r.companyName || r.brandName || "").trim()).filter(Boolean)
    );
    const set = new Set();
    (gpStockAll || []).forEach((r) => {
      const c = String(r.companyName || r.brandName || "").trim();
      if (c && c !== "Mill Own Stock" && !companiesWithStock.has(c)) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [gpStock, gpStockAll]);

  const gpOutProductsForCompany = useCallback(
    (company) => {
      const set = new Set();
      (gpStockAll || []).forEach((r) => {
        if (String(r.companyName || r.brandName || "").trim() === company) {
          const p = String(r.productTypeName || "").trim();
          if (p) set.add(p);
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
    [gpStockAll]
  );

  const visibleTabs = useMemo(() => {
    if (!Array.isArray(allowedTabs) || !allowedTabs.length) return REPORT_TABS;
    const normalizedAllowedTabs = allowedTabs.map(normalizeReportTabKey);
    return REPORT_TABS.filter((t) => normalizedAllowedTabs.includes(t.key));
  }, [allowedTabs, embedded]);

  const visibleTabMap = useMemo(() => new Map(visibleTabs.map((t) => [t.key, t])), [visibleTabs]);

  const visibleGroups = useMemo(() => {
    return REPORT_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter((k) => visibleTabMap.has(k)),
    })).filter((g) => g.tabs.length);
  }, [visibleTabMap]);

  useEffect(() => {
    if (embedded) {
      const normalizedInitialTab = normalizeReportTabKey(initialTab);
      if (normalizedInitialTab && visibleTabMap.has(normalizedInitialTab)) {
        setActiveTab(normalizedInitialTab);
      } else if (visibleTabs.length) {
        setActiveTab(visibleTabs[0].key);
      }
      return;
    }
    const tab = searchParams.get("tab");
    const normalizedTab = normalizeReportTabKey(tab);
    if (normalizedTab !== tab) {
      setSearchParams({ tab: "stock-reports" }, { replace: true });
      setActiveTab("stock-reports");
      return;
    }
    if (normalizedTab && visibleTabMap.has(normalizedTab)) {
      setActiveTab(normalizedTab);
    } else if (visibleTabs.length) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [searchParams, embedded, initialTab, visibleTabs, visibleTabMap]);

  const loadPrintSettings = async () => {
    const res = await api.get("/settings");
    const data = res.data?.data || res.data || {};
    const general = data.general || data.generalSettings || data;
    setSettings(general || {});
    const rawLogo = general?.logoUrl || general?.logo || "";
    if (String(rawLogo || "").startsWith("data:")) {
      setPrintLogoDataUrl(String(rawLogo));
      return;
    }
    const logoUrl = toAbsoluteLogoUrl(rawLogo);
    const dataUrl = await fetchLogoAsDataUrl(logoUrl);
    setPrintLogoDataUrl(dataUrl);
  };

  useEffect(() => {
    loadPrintSettings().catch(() => {});
  }, []);

  useEffect(() => {
    const onSettingsUpdated = () => {
      loadPrintSettings().catch(() => {});
    };
    window.addEventListener("smj-settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("smj-settings-updated", onSettingsUpdated);
  }, []);

  const params = useMemo(() => {
    const p = { range };
    if (range === "particular" && particularDate) p.date = particularDate;
    if (range === "week" && weekDate) p.anchorDate = weekDate;
    if (range === "month" && monthValue) p.monthValue = monthValue;
    if (range === "year" && yearValue) p.yearValue = yearValue;
    if (range === "custom") {
      if (startDate) p.startDate = startDate;
      if (endDate) p.endDate = endDate;
    }

    const isAccountingReport = [
      "trial",
      "pl",
      "balance",
      "ledger",
    ].includes(activeTab);

    if (isAccountingReport) {
      if (accCompanyId) p.companyId = accCompanyId;
      if (accVoucherTypes.length) p.voucherTypes = accVoucherTypes.join(",");
      if (accAccountIds.length) p.accountIds = accAccountIds.join(",");
      if (accCustomerNames.length) p.partyNames = accCustomerNames.join(",");
      if (accProductName) p.itemName = accProductName;
    }

    const isInventoryReport = [
      "stock-reports",
      "stock",
      "stock-movement",
      "production-summary",
    ].includes(activeTab);
    if (isInventoryReport) {
      if (invCompanyIds.length) p.companyIds = invCompanyIds.join(",");
      if (invProductTypeIds.length) p.productTypeIds = invProductTypeIds.join(",");
    }
    return { params: p };
  }, [
    range,
    particularDate,
    weekDate,
    monthValue,
    yearValue,
    startDate,
    endDate,
    activeTab,
    accCompanyId,
    accVoucherTypes,
    accAccountIds,
    accCustomerNames,
    accProductName,
    invCompanyIds,
    invProductTypeIds,
  ]);

  const loadReport = async () => {
    try {
      setLoading(true);
      if (activeTab === "journal") {
        setRows([]);
        return;
      }
      if (activeTab === "acc-reports") {
        setRows([]);
        return;
      }
      if (activeTab === "customers") {
        setRows([]);
        return;
      }
      if (activeTab === "stock-reports") {
        const [stockRes, movementRes] = await Promise.all([
          api.get("/reports/stock", params),
          api.get("/reports/stock-movement", params),
        ]);
        const stockPayload = stockRes.data?.data || {};
        setStockRows(mapStockRows(stockPayload));
        setStockMovementRows(mapStockMovementRows(movementRes.data?.data || []));
        setInvProducts((prev) => buildStockProducts(stockPayload, prev));
        setRows([]);
        return;
      }
      if (activeTab === "stock") {
        const res = await api.get("/reports/stock", params);
        setRows(mapStockRows(res.data?.data || {}));
        return;
      }
      if (activeTab === "stock-movement") {
        const res = await api.get("/reports/stock-movement", params);
        setRows(mapStockMovementRows(res.data?.data || []));
        return;
      }
      if (activeTab === "production-summary") {
        const res = await api.get("/reports/production-summary", params);
        setRows(
          (res.data?.data || []).map((r) => ({
            id: r._id,
            ...r,
          }))
        );
        return;
      }
      if (activeTab === "gatepass") {
        const res = await api.get("/reports/gatepass", params);
        setRows(
          (res.data?.data || []).map((r) => ({
            id: r._id,
            ...r,
            paymentStatusLabel: normalizePaymentStatus(r.paymentStatus),
          }))
        );
        return;
      }
      if (activeTab === "trial") {
        const res = await api.get("/accounting/trial-balance", params);
        setRows(
          (res.data?.data || []).map((r) => ({
            id: r.accountId || r._id || `${r.code}-${r.account}`,
            ...r,
          }))
        );
        return;
      }
      if (activeTab === "pl") {
        const res = await api.get("/accounting/pl", params);
        const p = res.data?.data || {};
        const income = (p.income || []).map((r) => ({
          id: `inc-${r.accountId}`,
          section: "Income",
          line: r.account,
          amount: num(r.amount),
          accountId: r.accountId,
        }));
        const cogs = (p.cogs || []).map((r) => ({
          id: `cogs-${r.accountId}`,
          section: "COGS",
          line: r.account,
          amount: -num(r.amount),
          accountId: r.accountId,
        }));
        const exp = (p.expenses || []).map((r) => ({
          id: `exp-${r.accountId}`,
          section: "Expenses",
          line: r.account,
          amount: -num(r.amount),
          accountId: r.accountId,
        }));
        const totals = p.totals || {};
        const summary = [
          { id: "sum-income", section: "Summary", line: "Total Income", amount: num(totals.incomeTotal) },
          { id: "sum-cogs", section: "Summary", line: "Total COGS", amount: -num(totals.cogsTotal) },
          { id: "sum-gp", section: "Summary", line: "Gross Profit", amount: num(totals.grossProfit) },
          { id: "sum-exp", section: "Summary", line: "Total Expenses", amount: -num(totals.expenseTotal) },
          { id: "sum-np", section: "Summary", line: "Net Profit / (Loss)", amount: num(totals.profit) },
        ];
        setRows([...income, ...cogs, ...exp, ...summary]);
        return;
      }
      if (activeTab === "balance") {
        const res = await api.get("/accounting/balance", params);
        const b = res.data?.data || {};
        const assets = (b.assets || []).map((r) => ({
          id: `a-${r.accountId}`,
          section: "Assets",
          line: r.account,
          amount: num(r.balance),
          accountId: r.accountId,
        }));
        const liabilities = (b.liabilities || []).map((r) => ({
          id: `l-${r.accountId}`,
          section: "Liabilities",
          line: r.account,
          amount: num(r.balance),
          accountId: r.accountId,
        }));
        const equity = (b.equity || []).map((r) => ({
          id: `e-${r.accountId}`,
          section: "Equity",
          line: r.account,
          amount: num(r.balance),
          accountId: r.accountId,
        }));
        const totals = b.totals || {};
        const summary = [
          { id: "t-a", section: "Summary", line: "Total Assets", amount: num(totals.totalAssets) },
          { id: "t-l", section: "Summary", line: "Total Liabilities", amount: num(totals.totalLiabilities) },
          { id: "t-e", section: "Summary", line: "Total Equity", amount: num(totals.totalEquity) },
          { id: "t-le", section: "Summary", line: "Total L + E", amount: num(totals.totalLE) },
        ];
        setRows([...assets, ...liabilities, ...equity, ...summary]);
        return;
      }
      if (activeTab === "ledger") {
        const res = await api.get("/accounting/ledger", params);
        setRows(
          (res.data?.data || []).map((r, idx) => ({
            id: r.journalLineId || `${idx}-${r.account || ""}`,
            ...r,
          }))
        );
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [compRes, accRes, customerRes, invCompRes, invProdRes] = await Promise.all([
          api.get("/companies"),
          api.get("/accounting/accounts"),
          api.get("/customers"),
          api.get("/companies"),
          api.get("/product-types"),
        ]);
        const companyList = dedupeByName(compRes.data?.data || []);
        const productList = dedupeByName(invProdRes.data?.data || []);
        setAccCompanies(compRes.data?.data || []);
        setAccAccounts(accRes.data?.data || []);
        setAccCustomers(customerRes.data?.data || []);
        setInvCompanies(dedupeByName(invCompRes.data?.data || companyList));
        setInvProducts(productList);
      } catch {
        // ignore; reports can still load without these filters
      }
    })();
  }, []);

  useEffect(() => {
    const onSettingsUpdated = () => {
      refreshInventoryFilterOptions();
    };
    window.addEventListener("smj-settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("smj-settings-updated", onSettingsUpdated);
  }, []);

  useEffect(() => {
    const templateSupported = REPORT_TABS.some((t) => t.key === activeTab) && !["customers"].includes(activeTab);
    if (!templateSupported) {
      setFilterTemplates([]);
      setSelectedTemplateId("");
      return;
    }
    (async () => {
      try {
        const invCompanyForTemplate = invCompanyIds.length === 1 ? invCompanyIds[0] : "";
        const res = await api.get("/reports/templates", {
          params: { reportKey: activeTab, companyId: accCompanyId || invCompanyForTemplate || "" },
        });
        setFilterTemplates(res.data?.data || []);
      } catch {
        setFilterTemplates([]);
      }
    })();
  }, [activeTab, accCompanyId, invCompanyIds]);



  useEffect(() => {
    loadReport();
  }, [activeTab, params]);

  useEffect(() => {
    if (activeTab === "acc-reports" || activeTab === "ledger") {
      loadGeneratedList("ledger", setGeneratedLedgerList);
    }
    if (activeTab === "acc-reports") {
      loadGeneratedList("journal", setGeneratedJournalList);
      loadGeneratedList("trial", setGeneratedTrialList);
      loadGeneratedList("pl", setGeneratedPlList);
      loadGeneratedList("balance", setGeneratedBalanceList);
    }
  }, [activeTab]);



  useEffect(() => {
    const loadPartyBuckets = async () => {
      if (activeTab !== "customers") return;
      try {
        const res = await api.get("/customers");
        const list = res.data?.data || [];
        setRows(
          list.map((c) => ({
            id: c._id,
            name: c.name || "-",
            phone: c.phone || "-",
            email: c.email || "-",
            address: c.address || "-",
            updatedAt: c.updatedAt || c.createdAt,
          }))
        );
      } catch {
        setRows([]);
      }
    };
    loadPartyBuckets();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "gatepass") return;
    let cancelled = false;
    (async () => {
      try {
        const [settingsRes, customersRes, stockRes] = await Promise.all([
          api.get("/settings"),
          api.get("/customers"),
          api.get("/stock/current"),
        ]);
        const settingsData = settingsRes.data?.data || settingsRes.data || {};
        const senderOptions = Array.isArray(settingsData.senderOptions) ? settingsData.senderOptions : [];
        const senderSet = new Set();
        senderOptions.forEach((s) => {
          const t = String(s || "").trim();
          if (t) senderSet.add(t);
        });
        (rows || []).forEach((r) => {
          const t = String(r?.senderName || r?.partyName || "").trim();
          if (t && t !== "-") senderSet.add(t);
        });
        const stockRowsArr = Array.isArray(stockRes.data?.data) ? stockRes.data.data : [];
        if (!cancelled) {
          setGpSenders(Array.from(senderSet).sort((a, b) => a.localeCompare(b)));
          setGpCustomers(
            (customersRes.data?.data || [])
              .map((c) => String(c?.name || "").trim())
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
          );
          setGpStockAll(stockRowsArr);
          setGpStock(stockRowsArr.filter((r) => Number(r?.balanceKg || 0) > 0));
        }
      } catch {
        /* best effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, rows]);

  useEffect(() => {
    if (activeTab !== "gatepass") return;
    loadGatePassGeneratedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function closeDrill() {
    setDrill({ open: false, title: "", loading: false, rows: [], columns: [] });
  }

  async function openLedgerDrill({ accountId, title: t }) {
    if (!accountId) return;
    try {
      setDrill({
        open: true,
        title: t || "Ledger Details",
        kind: "ledger",
        loading: true,
        rows: [],
        columns: [
          { key: "date", label: "Date", render: (v) => fmtDate(v) },
          { key: "references", label: "References" },
          { key: "voucherNo", label: "Voucher No" },
          { key: "description", label: "Description" },
          { key: "debit", label: "Debit", render: (v) => fmt(v) },
          { key: "credit", label: "Credit", render: (v) => fmt(v) },
          { key: "balance", label: "Running Balance", render: (v) => fmt(v) },
        ],
      });
      const res = await api.get("/accounting/ledger", {
        params: { ...(params?.params || {}), accountId },
      });
      setDrill((p) => ({
        ...p,
        loading: false,
        rows: (res.data?.data || []).map((r, idx) => ({ id: r.journalLineId || `${idx}-${r.voucherNo}`, ...r })),
      }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load ledger details.");
      closeDrill();
    }
  }

  async function openVoucherDrill(journalEntryId) {
    if (!journalEntryId) return;
    try {
      setDrill({
        open: true,
        title: "Voucher Details",
        loading: true,
        rows: [],
        columns: [
          { key: "accountName", label: "Account" },
          { key: "debit", label: "Debit", render: (v) => fmt(v) },
          { key: "credit", label: "Credit", render: (v) => fmt(v) },
          { key: "partyName", label: "Party" },
          { key: "itemName", label: "Product" },
          { key: "remarks", label: "Remarks" },
        ],
      });
      const res = await api.get(`/accounting/vouchers/${journalEntryId}`);
      const v = res.data?.data;
      const titleLine = v?.voucherNo ? `${v.voucherNo} | ${fmtDate(v.date)} | ${v.companyName || ""}` : "Voucher Details";
      setDrill((p) => ({
        ...p,
        title: titleLine,
        loading: false,
        rows: (v?.lines || []).map((l, idx) => ({ id: l._id || `${idx}-${l.accountName}`, ...l })),
      }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load voucher.");
      closeDrill();
    }
  }

  const journalRowsForEntry = (entry) => {
    const debits = (entry?.lines || []).filter((l) => round2(n0(l.debit)) > 0);
    const credits = (entry?.lines || []).filter((l) => round2(n0(l.credit)) > 0);
    const rows = [];
    let dateShown = false;

    const addLine = ({ side, line, amount }) => {
      const acc = line.accountName || line.accountCode || "Account";
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
        drJr: shortEntryId(d?.voucherNo || d?.journalEntryId || ""),
        drAmount: d ? `Rs. ${String(round2(n0(d.debit)))}` : "",
        crDate: c?.date ? `${formatYear(c.date)}\n${formatMonthDay(c.date)}` : "",
        crRef: (() => {
          const text = ensureAccountSuffix(c?.references || c?.account || c?.description || "");
          return text ? `By ${text}` : "";
        })(),
        crJr: shortEntryId(c?.voucherNo || c?.journalEntryId || ""),
        crAmount: c ? `Rs. ${String(round2(n0(c.credit)))}` : "",
      };
    });
  };

  const renderJournalEntryHtml = (entry) => {
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

    return `
      <div class="entry-block">
        <div class="header">
          <div class="title">${selectedCompanyName || "Business"}</div>
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
      </div>
    `;
  };

  const renderCombinedJournalHtml = (entries) => {
    const rows = (entries || []).flatMap((e) => journalRowsForEntry(e));
    const linesHtml = rows
      .map((r) => {
        const isCredit = r.side === "credit";
        const isNarration = r.side === "narration";
        const detailsHtml = r.extra ? `${r.details}<div class="extra">${r.extra}</div>` : r.details;
        return `
          <tr class="${isNarration ? "narration-row" : "entry-row"}">
            <td class="date-cell">
              ${r.showDate ? `<div>${formatYear(r.date)}</div><div>${formatMonthDay(r.date)}</div>` : ""}
            </td>
            <td class="details-cell ${isNarration ? "narration" : isCredit ? "credit" : "debit"}">${detailsHtml}</td>
            <td class="lf-cell"></td>
            <td class="amt-cell">${r.debit}</td>
            <td class="amt-cell">${r.credit}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="entry-block">
        <div class="header">
          <div class="title">${selectedCompanyName || "Business"}</div>
          <div class="meta">Journal</div>
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
      </div>
    `;
  };

  const renderLedgerHtml = ({ rows, title, entityLine = "" }) => {
    const body = (rows || [])
      .map(
        (r) => `
        <tr>
          <td>${r.drDate || ""}</td>
          <td>${r.drRef || ""}</td>
          <td>${r.drJr || ""}</td>
          <td style="text-align:right">${r.drAmount || ""}</td>
          <td>${r.crDate || ""}</td>
          <td>${r.crRef || ""}</td>
          <td>${r.crJr || ""}</td>
          <td style="text-align:right">${r.crAmount || ""}</td>
        </tr>
      `
      )
      .join("");
    return `
      <div style="font-family:Times New Roman, serif; font-size:12px;">
        <div style="text-align:center; font-weight:bold; margin-bottom:4px;">${title}</div>
        ${entityLine ? `<div style="text-align:center; margin-bottom:6px;">${entityLine}</div>` : ""}
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Dr.</span><span>Cr.</span>
        </div>
        <table style="width:100%; border-collapse:collapse;" border="1">
          <thead>
            <tr>
              <th>Date</th>
              <th>References</th>
              <th>J.R.</th>
              <th>Amount Rs.</th>
              <th>Date</th>
              <th>References</th>
              <th>J.R.</th>
              <th>Amount Rs.</th>
            </tr>
          </thead>
          <tbody>${body || ""}</tbody>
        </table>
      </div>
    `;
  };


  async function openStockMovementDrill({ companyId, productTypeId, title: t }) {
    try {
      setDrill({
        open: true,
        kind: "stock-movement",
        title: t || "Stock Movement",
        loading: true,
        rows: [],
        columns: [
          { key: "date", label: "Date", render: (v) => fmtDate(v) },
          { key: "stockInKg", label: "In (kg)" },
          { key: "stockOutKg", label: "Out (kg)" },
          { key: "reference", label: "Reference", render: (_v, row) => renderMovementReference(row) },
          { key: "remarks", label: "Remarks" },
        ],
      });
      const res = await api.get("/reports/stock-movement", {
        params: { ...(params?.params || {}), companyId: companyId || "", productTypeId: productTypeId || "" },
      });
      setDrill((p) => ({
        ...p,
        loading: false,
        rows: (res.data?.data || []).map((r) => ({ id: r._id, ...r })),
      }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load stock movement.");
      closeDrill();
    }
  }

  const stockColumns = [
    { key: "entryDate", label: "Created Date", render: (v) => fmtDate(v) },
    { key: "party", label: "Company Name" },
    { key: "item", label: "Product" },
    { key: "balance", label: "Weight (kg)" },
  ];

  const stockSnapshotToolbarActions = (
    <div className="relative">
      <button
        type="button"
        onClick={openStockFilterPopup}
        className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm ${
          invCompanyIds.length || invProductTypeIds.length || range !== "month" || startDate || endDate
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
        title="Filter stock snapshot"
      >
        <Filter size={16} />
        Filter
      </button>
      {stockFilterOpen && (
        <div className="absolute right-0 mt-2 z-20 w-[320px] max-w-[90vw] rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">Stock Filters</div>
            <button
              type="button"
              onClick={() => setStockFilterOpen(false)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <label className={filterLabelClass}>Range</label>
              <select value={range} onChange={(e) => setRange(e.target.value)} className={`${filterInputClass} w-full`}>
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {range === "particular" && (
              <div>
                <label className={filterLabelClass}>Date</label>
                <input
                  type="date"
                  value={particularDate}
                  onChange={(e) => setParticularDate(e.target.value)}
                  className={`${filterInputClass} w-full`}
                />
              </div>
            )}
            {range === "week" && (
              <div>
                <label className={filterLabelClass}>Choose Week</label>
                <input
                  type="date"
                  value={weekDate}
                  onChange={(e) => setWeekDate(e.target.value)}
                  className={`${filterInputClass} w-full`}
                />
              </div>
            )}
            {range === "month" && (
              <div>
                <label className={filterLabelClass}>Choose Month</label>
                <input
                  type="month"
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                  className={`${filterInputClass} w-full`}
                />
              </div>
            )}
            {range === "year" && (
              <div>
                <label className={filterLabelClass}>Choose Year</label>
                <input
                  type="number"
                  min="2000"
                  max="3000"
                  step="1"
                  value={yearValue}
                  onChange={(e) => setYearValue(e.target.value)}
                  className={`${filterInputClass} w-full`}
                  placeholder="2026"
                />
              </div>
            )}
            {range === "custom" && (
              <>
                <div>
                  <label className={filterLabelClass}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`${filterInputClass} w-full`}
                  />
                </div>
                <div>
                  <label className={filterLabelClass}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`${filterInputClass} w-full`}
                  />
                </div>
              </>
            )}
            <div>
              <label className={filterLabelClass}>Company</label>
              <select
                value={invCompanyIds[0] || ""}
                onChange={(e) => setInvCompanyIds(e.target.value ? [e.target.value] : [])}
                className={`${filterInputClass} w-full`}
              >
                <option value="">All Companies</option>
                {(invCompanies || []).map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={filterLabelClass}>Product</label>
              <select
                value={invProductTypeIds[0] || ""}
                onChange={(e) => setInvProductTypeIds(e.target.value ? [e.target.value] : [])}
                className={`${filterInputClass} w-full`}
              >
                <option value="">All Products</option>
                {(invProducts || []).map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={clearStockFilters}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setStockFilterOpen(false)}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-sm text-white hover:bg-emerald-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const stockMovementColumns = [
    { key: "date", label: "Date", render: (v) => fmtDate(v) },
    { key: "companyName", label: "Company Name" },
    { key: "productTypeName", label: "Product" },
    { key: "stockInKg", label: "Stock In (kg)" },
    { key: "stockOutKg", label: "Stock Out (kg)" },
    { key: "reference", label: "Reference", render: (_v, row) => renderMovementReference(row) },
    { key: "remarks", label: "Remarks" },
  ];

  const columns = useMemo(() => {
    if (activeTab === "customers") {
      return [
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        { key: "updatedAt", label: "Updated", render: (v) => fmtDate(v) },
      ];
    }
    if (activeTab === "stock") {
      return stockColumns;
    }
    if (activeTab === "stock-movement") {
      return stockMovementColumns;
    }
    if (activeTab === "production-summary") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        { key: "batchNo", label: "Batch #" },
        { key: "companyName", label: "Company Name" },
        { key: "paddyInputKg", label: "Paddy In (kg)" },
        { key: "riceOutputKg", label: "Rice (kg)" },
        { key: "brokenOutputKg", label: "Broken (kg)" },
        { key: "huskOutputKg", label: "Husk (kg)" },
        { key: "branOutputKg", label: "Bran (kg)" },
        { key: "totalOutputKg", label: "Total Out (kg)" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "gatepass") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        {
          key: "gatePassNo",
          label: "GP No",
          render: (v, row) =>
            row?.targetPath ? (
              <button
                type="button"
                onClick={() => navigate(row.targetPath)}
                className="text-emerald-700 hover:underline"
              >
                {v || "-"}
              </button>
            ) : (
              v || "-"
            ),
        },
        { key: "type", label: "Type" },
        { key: "senderName", label: "Sender" },
        { key: "partyName", label: "Party" },
        { key: "companyNames", label: "Company" },
        { key: "productNames", label: "Products" },
        { key: "truckNo", label: "Truck" },
        { key: "totalBags", label: "Bags" },
        { key: "totalWeightKg", label: "Weight (kg)" },
        { key: "totalAmount", label: "Amount (PKR)", render: (v) => fmt(v) },
        { key: "paymentStatusLabel", label: "Payment" },
      ];
    }
    if (activeTab === "ledger") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        { key: "account", label: "Particular", filterOptions: (accAccounts || []).map((a) => a.name) },
        { key: "voucherNo", label: "J.R.", render: (v) => shortEntryId(v) },
        { key: "description", label: "Description" },
        { key: "debit", label: "Debit (PKR)", render: (v) => fmt(v) },
        { key: "credit", label: "Credit (PKR)", render: (v) => fmt(v) },
        { key: "balance", label: "Balance (PKR)", render: (v) => fmt(v) },
        {
          key: "open",
          label: "Open",
          skipExport: true,
          render: (_v, row) =>
            row?.journalEntryId ? (
              <button
                type="button"
                onClick={() => openVoucherDrill(row.journalEntryId)}
                className="text-emerald-700 hover:underline text-xs"
              >
                Voucher
              </button>
            ) : (
              "-"
            ),
        },
      ];
    }
    if (activeTab === "trial") {
      return [
        { key: "code", label: "Code" },
        { key: "account", label: "Account" },
        { key: "debit", label: "Debit (PKR)", render: (v) => fmt(v) },
        { key: "credit", label: "Credit (PKR)", render: (v) => fmt(v) },
      ];
    }
    if (activeTab === "pl") {
      return [
        { key: "section", label: "Section" },
        { key: "line", label: "Particular" },
        { key: "amount", label: "Amount (PKR)", render: (v) => fmt(v) },
        {
          key: "drill",
          label: "Drill",
          skipExport: true,
          render: (_v, row) =>
            row?.accountId ? (
              <button
                type="button"
                onClick={() => openLedgerDrill({ accountId: row.accountId, title: `${row.line} (Ledger)` })}
                className="text-emerald-700 hover:underline text-xs"
              >
                Ledger
              </button>
            ) : (
              "-"
            ),
        },
      ];
    }
    if (activeTab === "balance") {
      return [
        { key: "section", label: "Section" },
        { key: "line", label: "Particular" },
        { key: "amount", label: "Amount (PKR)", render: (v) => fmt(v) },
        {
          key: "drill",
          label: "Drill",
          skipExport: true,
          render: (_v, row) =>
            row?.accountId ? (
              <button
                type="button"
                onClick={() => openLedgerDrill({ accountId: row.accountId, title: `${row.line} (Ledger)` })}
                className="text-emerald-700 hover:underline text-xs"
              >
                Ledger
              </button>
            ) : (
              "-"
            ),
        },
      ];
    }
    if (activeTab === "daybook") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        { key: "entryNo", label: "Entry No", render: (v, row) => v || row?.voucherNo || "-" },
        { key: "type", label: "Type" },
        { key: "companyName", label: "Company" },
        { key: "cashInHand", label: "Cash in Hand", render: (v) => fmt(v) },
        {
          key: "cashInHandSource",
          label: "Cash Record",
          render: (v, row) =>
            row?.cashInHandEdited || v === "MANUAL_EDIT" ? "Manual edit" : v === "CARRIED" ? "Carried" : "Initial",
        },
        { key: "description", label: "Description" },
        { key: "debit", label: "Debit (PKR)", render: (v) => fmt(v) },
        { key: "credit", label: "Credit (PKR)", render: (v) => fmt(v) },
        { key: "amount", label: "Amount (PKR)", render: (v) => fmt(v) },
        { key: "status", label: "Status" },
        {
          key: "open",
          label: "Open",
          skipExport: true,
          render: (_v, row) =>
            row?.journalEntryId ? (
              <button
                type="button"
                onClick={() => openVoucherDrill(row.journalEntryId)}
                className="text-emerald-700 hover:underline text-xs"
              >
                View
              </button>
            ) : (
              "-"
            ),
        },
      ];
    }
    return [
      { key: "date", label: "Date", render: (v) => fmtDate(v) },
      { key: "account", label: "Account" },
      { key: "description", label: "Description" },
      { key: "debit", label: "Debit (PKR)", render: (v) => fmt(v) },
      { key: "credit", label: "Credit (PKR)", render: (v) => fmt(v) },
      { key: "balance", label: "Balance (PKR)", render: (v) => fmt(v) },
      {
        key: "open",
        label: "Open",
        skipExport: true,
        render: (_v, row) =>
          row?.journalEntryId ? (
            <button
              type="button"
              onClick={() => openVoucherDrill(row.journalEntryId)}
              className="text-emerald-700 hover:underline text-xs"
            >
              Voucher
            </button>
          ) : (
            "-"
          ),
      },
    ];
  }, [
    activeTab,
    navigate,
    openLedgerDrill,
    openVoucherDrill,
    openStockMovementDrill,
  ]);

  const title = visibleTabs.find((t) => t.key === activeTab)?.label || "Report";
  const emptyMessage = `No ${title.toLowerCase()} found.`;

  const fetchVoucher = async (id) => {
    const res = await api.get(`/accounting/vouchers/${id}`);
    return res.data?.data;
  };

  const printSingleVoucher = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
        const content = renderJournalEntryHtml(entry);
        const header = resolvePrintHeader();
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
                table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
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
                ${header.logoUrl ? `<img src="${header.logoUrl}" alt="logo" />` : ""}
                ${header.name ? `<div class="name">${header.name}</div>` : ""}
                ${header.address ? `<div class="line">${header.address}</div>` : ""}
                ${header.email ? `<div class="line">${header.email}</div>` : ""}
              </div>
              ${content}
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
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to print voucher.");
    } finally {
      setLoading(false);
    }
  };

  const downloadSingleVoucherPdf = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
        const doc = new jsPDF();
        const startY = addPdfHeader(
          doc,
          selectedCompanyName || "Business",
          `Voucher: ${entry.voucherNo || "-"} | Date: ${entry.date ? fmtDate(entry.date) : "-"}`
        );

      const rows = journalRowsForEntry(entry);
      const body = rows.map((r) => [
        r.showDate ? `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}` : "",
        r.extra ? `${r.details}\n${r.extra}` : r.details,
        "",
        r.debit,
        r.credit,
      ]);

        autoTable(doc, {
          head: [["Date", "References", "L.F.", "Amount (Dr.)", "Amount (Cr.)"]],
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

  const downloadSingleVoucherExcel = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      const rows = journalRowsForEntry(entry).map((r) => ({
        Date: r.showDate ? `${formatYear(entry.date)} ${formatMonthDay(entry.date)}` : "",
        References: r.details,
        Extra: r.extra || "",
        "L.F.": "",
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

  const reportRowClass = (row) => {
    if (!row) return "";
    if (activeTab === "ledger" && highlightId && String(row.journalEntryId) === String(highlightId)) {
      return "bg-emerald-100 animate-pulse";
    }
    if (activeTab === "ledger" && Number(row.balance || 0) < 0) return "text-red-700";
    if (activeTab === "stock-movement" && Number(row.balanceKg || 0) < 0) return "text-red-700";
    return "";
  };

  const stockMovementRowClass = (row) => {
    if (!row) return "";
    if (Number(row.balanceKg || 0) < 0) return "text-red-700";
    return "";
  };

  const applyTemplate = (templateId) => {
    const t = filterTemplates.find((x) => String(x._id) === String(templateId));
    if (!t) return;
    const f = t.filters || {};
    // Generic fields shared by most reports
    if (f.range) setRange(f.range);
    if (f.particularDate) setParticularDate(f.particularDate);
    if (f.startDate) setStartDate(f.startDate);
    if (f.endDate) setEndDate(f.endDate);

    // Accounting filters
    if (f.accCompanyId != null) setAccCompanyId(String(f.accCompanyId || ""));
    if (Array.isArray(f.voucherTypes)) setAccVoucherTypes(f.voucherTypes);
    if (Array.isArray(f.accountIds)) setAccAccountIds(f.accountIds);
    if (Array.isArray(f.partyNames)) setAccCustomerNames(f.partyNames);
    if (f.itemName != null) setAccProductName(String(f.itemName || ""));

    // Inventory filters
    if (Array.isArray(f.invCompanyIds)) setInvCompanyIds(f.invCompanyIds);
    else if (f.invCompanyId != null) setInvCompanyIds(f.invCompanyId ? [String(f.invCompanyId)] : []);

    if (Array.isArray(f.invProductTypeIds)) setInvProductTypeIds(f.invProductTypeIds);
    else if (f.invProductTypeId != null) setInvProductTypeIds(f.invProductTypeId ? [String(f.invProductTypeId)] : []);
  };

  const openSaveTemplate = () => setTemplateDialog({ open: true, name: "" });

  const asOfDate = useMemo(() => {
    if (range === "custom" && endDate) return endDate;
    if (range === "particular" && particularDate) return particularDate;
    return new Date().toISOString().slice(0, 10);
  }, [range, endDate, particularDate]);

  const selectedCompanyName = useMemo(() => {
    const settingsName = String(settings.companyName || settings.shortName || "").trim();
    if (settingsName) return settingsName;
    const c = (accCompanies || []).find((x) => String(x._id) === String(accCompanyId));
    return c?.name || "Business";
  }, [accCompanies, accCompanyId, settings.companyName, settings.shortName]);

  const fmtAmt = (v) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString();
  };

  const downloadTrialPdf = () => {
    const doc = new jsPDF();
    doc.setFont("times", "normal");
    const startY = addPdfHeader(doc, "TRIAL BALANCE", `as at ${asOfDate}`);

    const body = (rows || []).map((r, idx) => [
      String(idx + 1),
      r.account || r.line || "-",
      String(r.code || ""),
      fmtAmt(r.debit),
      fmtAmt(r.credit),
    ]);

    autoTable(doc, {
      head: [["S. No", "Account Names", "A/c No.", "Debit", "Credit"]],
      body,
      startY,
      styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      theme: "grid",
      columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 22 }, 3: { halign: "right" }, 4: { halign: "right" } },
    });

    doc.save(`trial_balance_${asOfDate}.pdf`);
  };

  const downloadTrialExcel = () => {
    const out = (rows || []).map((r, idx) => ({
      "S. No": idx + 1,
      "Account Names": r.account || r.line || "",
      "A/c No.": r.code || "",
      Debit: r.debit || 0,
      Credit: r.credit || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `trial_balance_${asOfDate}.xlsx`);
  };

  const downloadPlPdf = async () => {
    const res = await api.get("/accounting/pl", params);
    const p = res.data?.data || {};
    const income = p.income || [];
    const cogs = p.cogs || [];
    const expenses = p.expenses || [];
    const totals = p.totals || {};

    const dr = [
      ...cogs.map((r) => ({ label: r.account, amount: num(r.amount) })),
      ...expenses.map((r) => ({ label: r.account, amount: num(r.amount) })),
    ];
    const cr = income.map((r) => ({ label: r.account, amount: num(r.amount) }));

    const max = Math.max(dr.length, cr.length);
    const body = Array.from({ length: max }).map((_, i) => [
      dr[i]?.label || "",
      dr[i] ? fmtAmt(dr[i].amount) : "",
      cr[i]?.label || "",
      cr[i] ? fmtAmt(cr[i].amount) : "",
    ]);

    body.push(["", "", "", ""]);
    body.push(["Gross Profit / (Loss)", fmtAmt(num(totals.grossProfit)), "", ""]);
    body.push(["Net Profit / (Loss)", fmtAmt(num(totals.profit)), "", ""]);

    const doc = new jsPDF();
    doc.setFont("times", "normal");
    const startY = addPdfHeader(doc, "Profit and Loss A/c for the year ended", selectedCompanyName);

    autoTable(doc, {
      head: [["Dr.", "Rs.", "Cr.", "Rs."]],
      body,
      startY,
      styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      theme: "grid",
      columnStyles: { 1: { halign: "right", cellWidth: 28 }, 3: { halign: "right", cellWidth: 28 } },
    });

    doc.save(`profit_loss_${asOfDate}.pdf`);
  };

  const downloadBalancePdf = async () => {
    const res = await api.get("/accounting/balance", params);
    const b = res.data?.data || {};
    const assets = b.assets || [];
    const right = [...(b.liabilities || []), ...(b.equity || [])];
    const totals = b.totals || {};

    const max = Math.max(assets.length, right.length);
    const body = Array.from({ length: max }).map((_, i) => [
      assets[i]?.account || "",
      assets[i] ? fmtAmt(num(assets[i].balance)) : "",
      right[i]?.account || "",
      right[i] ? fmtAmt(num(right[i].balance)) : "",
    ]);

    body.push(["", "", "", ""]);
    body.push(["Total Assets", fmtAmt(num(totals.totalAssets)), "Total L + E", fmtAmt(num(totals.totalLE))]);

    const doc = new jsPDF();
    doc.setFont("times", "normal");
    const startY = addPdfHeader(doc, "Balance Sheet", `as at ${asOfDate}`);

    autoTable(doc, {
      head: [["Assets", "Rs.", "Liabilities and Capital", "Rs."]],
      body,
      startY,
      styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      theme: "grid",
      columnStyles: { 1: { halign: "right", cellWidth: 28 }, 3: { halign: "right", cellWidth: 28 } },
    });

    doc.save(`balance_sheet_${asOfDate}.pdf`);
  };

  const loadGeneratedList = async (reportKey, setter) => {
    try {
      setGeneratedLoading(true);
      const res = await api.get("/accounting/generated-journals", { params: { reportKey } });
      setter(res.data?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load generated list.");
      setter([]);
    } finally {
      setGeneratedLoading(false);
    }
  };

  const fetchGeneratedJournals = async (filters = {}) => {
    const res = await api.get("/accounting/journal", { params: { ...filters } });
    return res.data?.data || [];
  };

  const fetchGeneratedLedger = async (filters = {}) => {
    const res = await api.get("/accounting/ledger", { params: { ...filters } });
    return res.data?.data || [];
  };

  const filterJournalsBy = (entries = [], filters = {}) => {
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    const companyName = String(filters.companyName || "").trim();
    const partyName = String(filters.partyName || "").trim();
    const itemId = String(filters.itemId || "").trim();
    const voucherType = String(filters.voucherType || "").trim();
    return (entries || []).filter((e) => {
      const d = e?.date ? new Date(e.date) : null;
      if (start && d && d < start) return false;
      if (end && d && d > end) return false;
      if (companyName && String(e.companyName || "").trim() !== companyName) return false;
      if (partyName && String(e.partyName || e.customerName || "").trim() !== partyName) return false;
      if (itemId && String(e.itemId || "").trim() !== itemId) return false;
      if (voucherType && String(e.voucherType || "").trim() !== voucherType) return false;
      return true;
    });
  };

  const buildJournalRangeLabel = ({ range = "", date = "", start = "", end = "" }) => {
    if (range === "day" || range === "particular") return date || start || "";
    if (range === "month") {
      const base = date ? new Date(`${date}-01`) : start ? new Date(start) : null;
      return base ? base.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
    }
    if (range === "year") return date || (start ? new Date(start).getFullYear() : "");
    if (range === "custom") {
      if (start && end) return `${start} to ${end}`;
      return start || end || "";
    }
    return "All Dates";
  };

  const handleViewGeneratedJournal = (j) => {
    if (!j) return;
    // Apply filters on-page instead of opening a popup
    const range = j.range || "all";
    setRange(range);
    setParticularDate(j.rangeDate || "");
    setStartDate(j.startDate || "");
    setEndDate(j.endDate || "");
    setAccCompanyId(j.companyId || "");
    setAccCustomerNames(j.partyName ? [j.partyName] : []);
    setAccProductName(j.itemName || "");
    setAccVoucherTypes(j.voucherType ? [j.voucherType] : []);
    setSearchParams({ tab: "journal" });
    setActiveTab("journal");
  };

  const handleDownloadGeneratedJournal = async (j) => {
    if (!j) return;
    try {
      setGeneratedLoading(true);
      const custom = Array.isArray(j.customLayout) ? j.customLayout : [];
      if (custom.length) {
        const groupedBody = custom.map((r) => ({
          date: String(r.date || ""),
          lf: String(r.lf || ""),
          particulars: Array.isArray(r.particulars) ? r.particulars : Array.isArray(r._particularsLines) ? r._particularsLines : [],
          debitLines: Array.isArray(r.debitLines) ? r.debitLines : Array.isArray(r._debitLines) ? r._debitLines : [],
          creditLines: Array.isArray(r.creditLines) ? r.creditLines : Array.isArray(r._creditLines) ? r._creditLines : [],
        }));
        const doc = new jsPDF();
        doc.setFont("times", "normal");
        const centerX = doc.internal.pageSize.getWidth() / 2;
        let headerY = 10;
        doc.setFontSize(11);
        doc.text(selectedCompanyName || "Business", centerX, headerY, { align: "center" });
        headerY += 5;
        const rangeLabel = buildJournalRangeLabel({
          range: j.range || "all",
          date: j.rangeDate || "",
          start: j.startDate || "",
          end: j.endDate || "",
        });
        doc.setFontSize(10);
        doc.text("JOURNAL ENTRIES", centerX, headerY, { align: "center" });
        headerY += 4;
        doc.setFontSize(9);
        doc.text(`For ${rangeLabel || "All Dates"}`, centerX, headerY, { align: "center" });
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
          (lines || []).reduce((m, t) => Math.max(m, doc.getTextWidth(String(t || ""))), 0);
        const maxDate = Math.max(22, ...groupedTable.map((r) => doc.getTextWidth(String(r.date || "").split("\n")[0] || "")));
        const maxLf = Math.max(18, doc.getTextWidth("L.F.") + 6);
        const maxDebit = Math.max(24, ...groupedTable.map((r) => measureLines(r._debitLines)));
        const maxCredit = Math.max(24, ...groupedTable.map((r) => measureLines(r._creditLines)));
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
          styles: { font: "times", fontSize: 9, cellPadding: 2, lineColor: [90, 90, 90], lineWidth: 0.1, textColor: [30, 30, 30] },
          headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], lineColor: [90, 90, 90], lineWidth: 0.2, fontStyle: "bold" },
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
            const maxLines = Math.max((row._particularsLines || []).length, (row._debitLines || []).length, (row._creditLines || []).length, 1);
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
        return;
      }
      const data = await fetchGeneratedJournals({
        range: j.range || "all",
        rangeDate: j.rangeDate || "",
        startDate: j.startDate || "",
        endDate: j.endDate || "",
        companyId: j.companyId || "",
        companyName: j.companyName || "",
        partyName: j.partyName || "",
        itemId: j.itemId || "",
        voucherType: j.voucherType || "",
      });
      const filtered = filterJournalsBy(data, {
        startDate: j.startDate || "",
        endDate: j.endDate || "",
        companyName: j.companyName || "",
        partyName: j.partyName || "",
        itemId: j.itemId || "",
        voucherType: j.voucherType || "",
      });
      if (!filtered.length) {
        toast.error("No journals found for the selected filters.");
        return;
      }
      const doc = new jsPDF();
      doc.setFont("times", "normal");
      const centerX = doc.internal.pageSize.getWidth() / 2;
      let headerY = 10;
      doc.setFontSize(11);
      doc.text(selectedCompanyName || "Business", centerX, headerY, { align: "center" });
      headerY += 5;
      const rangeLabel = buildJournalRangeLabel({
        range: j.range || "all",
        date: j.rangeDate || "",
        start: j.startDate || "",
        end: j.endDate || "",
      });
      doc.setFontSize(10);
      doc.text("JOURNAL ENTRIES", centerX, headerY, { align: "center" });
      headerY += 4;
      doc.setFontSize(9);
      doc.text(`For ${rangeLabel}`, centerX, headerY, { align: "center" });
      const startY = headerY + 6;
      const rows = filtered.flatMap((entry) =>
        journalRowsForEntry(entry).map((r) => [
          r.showDate ? `${formatYear(r.date)}\n${formatMonthDay(r.date)}` : "",
          r.details,
          "",
          r.debit,
          r.credit,
        ])
      );
      autoTable(doc, {
        head: [["Date", "Particulars", "L.F.", "Debit", "Credit"]],
        body: rows,
        startY,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      });
      doc.save(`${String(j.name || "journal").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to download journal.");
    } finally {
      setGeneratedLoading(false);
    }
  };

  const handleDeleteGeneratedJournal = async (j) => {
    if (!j) return;
    try {
      await api.delete(`/accounting/generated-journals/${j._id || j.id}`);
      loadGeneratedList("journal", setGeneratedJournalList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete journal.");
    }
  };

  const handleViewGeneratedLedger = (j) => {
    if (!j) return;
    // Apply filters on-page instead of opening a popup
    const range = j.range || "all";
    setRange(range);
    setParticularDate(j.rangeDate || "");
    setStartDate(j.startDate || "");
    setEndDate(j.endDate || "");
    setAccCompanyId(j.companyId || "");
    setAccAccountIds(j.accountId ? [j.accountId] : []);
    setAccCustomerNames(j.partyName ? [j.partyName] : []);
    setSearchParams({ tab: "ledger" });
    setActiveTab("ledger");
  };

  const handleDownloadGeneratedLedger = async (j) => {
    if (!j) return;
    try {
      setGeneratedLoading(true);
      const custom = Array.isArray(j.customLayout) ? j.customLayout : [];
      const rows = custom.length
        ? custom
        : buildLedgerPreviewRows(
            await fetchGeneratedLedger({
              range: j.range || "all",
              rangeDate: j.rangeDate || "",
              startDate: j.startDate || "",
              endDate: j.endDate || "",
              accountId: j.accountId || "",
              companyId: j.companyId || "",
              companyName: j.companyName || "",
              party: j.partyName || "",
            })
          );
      const doc = new jsPDF();
      doc.setFont("times", "normal");
      const headerTitle = j.accountName ? `${j.accountName} Account in Ledger` : "Account in Ledger";
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
        body: rows.map((r) => [r.drDate, r.drRef, r.drJr, r.drAmount, r.crDate, r.crRef, r.crJr, r.crAmount]),
        startY,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 3: { halign: "right" }, 7: { halign: "right" } },
      });
      doc.save(`${String(j.name || "ledger").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to download ledger.");
    } finally {
      setGeneratedLoading(false);
    }
  };

  const handleDeleteGeneratedLedger = async (j) => {
    if (!j) return;
    try {
      await api.delete(`/accounting/generated-journals/${j._id || j.id}`);
      loadGeneratedList("ledger", setGeneratedLedgerList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete ledger.");
    }
  };

  const handleDownloadGeneratedTrial = async (j) => {
    if (!j) return;
    try {
      setGeneratedLoading(true);
      const custom = Array.isArray(j.customLayout) ? j.customLayout : [];
      let layoutRows = custom;
      let totals = null;
      if (!layoutRows.length) {
        const res = await api.get("/accounting/trial-balance", {
          params: {
            range: "custom",
            startDate: j.startDate || "",
            endDate: j.endDate || "",
          },
        });
        const trialRows = res.data?.data || [];
        totals = res.data?.totals || { totalDebit: 0, totalCredit: 0 };
        if (!trialRows.length) {
          toast.error("No trial balance rows found for the selected range.");
          return;
        }
        layoutRows = trialRows.map((r, idx) => ({
          type: "line",
          srNo: idx + 1,
          account: r.account || r.line || "-",
          code: r.code || "",
          debit: r.debit || 0,
          credit: r.credit || 0,
        }));
        layoutRows.push({
          type: "total",
          srNo: "",
          account: "",
          code: "Total",
          debit: totals.totalDebit,
          credit: totals.totalCredit,
        });
      } else {
        const linesOnly = layoutRows.filter((r) => String(r.type || "") === "line");
        const totalDebit = linesOnly.reduce((s, r) => s + Number(r.debit || 0), 0);
        const totalCredit = linesOnly.reduce((s, r) => s + Number(r.credit || 0), 0);
        totals = { totalDebit, totalCredit };
        if (!layoutRows.some((r) => String(r.type || "") === "total")) {
          layoutRows = [
            ...layoutRows,
            { type: "total", srNo: "", account: "", code: "Total", debit: totalDebit, credit: totalCredit },
          ];
        }
      }

      const asAt = String(j.endDate || "").trim() || new Date().toISOString().slice(0, 10);
      const doc = new jsPDF();
      doc.setFont("times", "normal");
      const startY = addPdfHeader(doc, "TRIAL BALANCE", `as at ${asAt}`);

      const body = layoutRows.map((r, idx) => {
        const type = String(r.type || "");
        if (type === "spacer") return ["", "", "", "", ""];
        if (type === "heading") return ["", String(r.account || ""), "", "", ""];
        if (type === "total")
          return ["", "", "Total", fmtAmt(r.debit ?? totals.totalDebit), fmtAmt(r.credit ?? totals.totalCredit)];
        return [String(r.srNo || idx + 1), r.account || r.line || "-", String(r.code || ""), fmtAmt(r.debit), fmtAmt(r.credit)];
      });

      autoTable(doc, {
        head: [["S. No", "Account Names", "A/c No.", "Debit", "Credit"]],
        body,
        startY,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 22 }, 3: { halign: "right" }, 4: { halign: "right" } },
      });

      doc.save(`${String(j.name || "trial_balance").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to download trial balance.");
    } finally {
      setGeneratedLoading(false);
    }
  };

  const handleDeleteGeneratedTrial = async (j) => {
    if (!j) return;
    try {
      await api.delete(`/accounting/generated-journals/${j._id || j.id}`);
      loadGeneratedList("trial", setGeneratedTrialList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete trial balance.");
    }
  };

  const handleDownloadGeneratedPl = async (j) => {
    if (!j) return;
    try {
      setGeneratedLoading(true);
      const custom = Array.isArray(j.customLayout) ? j.customLayout : [];
      let body = [];
      if (custom.length) {
        body = custom.map((r) => [r.drParticular || "", r.drAmount || "", r.crParticular || "", r.crAmount || ""]);
      } else {
        const res = await api.get("/accounting/pl", {
          params: {
            range: "custom",
            startDate: j.startDate || "",
            endDate: j.endDate || "",
          },
        });
        const p = res.data?.data || {};
        const income = p.income || [];
        const cogs = p.cogs || [];
        const expenses = p.expenses || [];
        const totals = p.totals || {};

        const dr = [
          ...cogs.map((r) => ({ label: r.account, amount: num(r.amount) })),
          ...expenses.map((r) => ({ label: r.account, amount: num(r.amount) })),
        ];
        const cr = income.map((r) => ({ label: r.account, amount: num(r.amount) }));

        const max = Math.max(dr.length, cr.length);
        body = Array.from({ length: max }).map((_, i) => [
          dr[i]?.label || "",
          dr[i] ? fmtAmt(dr[i].amount) : "",
          cr[i]?.label || "",
          cr[i] ? fmtAmt(cr[i].amount) : "",
        ]);

        body.push(["", "", "", ""]);
        body.push(["Gross Profit / (Loss)", fmtAmt(num(totals.grossProfit)), "", ""]);
        body.push(["Net Profit / (Loss)", fmtAmt(num(totals.profit)), "", ""]);
      }

      const doc = new jsPDF();
      doc.setFont("times", "normal");
      const startY = addPdfHeader(doc, "Profit and Loss A/c for the year ended", selectedCompanyName);

      autoTable(doc, {
        head: [["Dr.", "Rs.", "Cr.", "Rs."]],
        body,
        startY,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 1: { halign: "right", cellWidth: 28 }, 3: { halign: "right", cellWidth: 28 } },
      });

      doc.save(`${String(j.name || "profit_loss").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to download profit & loss.");
    } finally {
      setGeneratedLoading(false);
    }
  };

  const handleDeleteGeneratedPl = async (j) => {
    if (!j) return;
    try {
      await api.delete(`/accounting/generated-journals/${j._id || j.id}`);
      loadGeneratedList("pl", setGeneratedPlList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete profit & loss.");
    }
  };

  const handleDownloadGeneratedBalance = async (j) => {
    if (!j) return;
    try {
      setGeneratedLoading(true);
      let finalRows = Array.isArray(j.customLayout) ? j.customLayout : [];
      if (!finalRows.length) {
        const res = await api.get("/accounting/balance", {
          params: {
            range: "custom",
            startDate: j.startDate || "",
            endDate: j.endDate || "",
          },
        });
        const b = res.data?.data || {};
        const assets = Array.isArray(b.assets) ? b.assets : [];
        const liabilities = Array.isArray(b.liabilities) ? b.liabilities : [];
        const equity = Array.isArray(b.equity) ? b.equity : [];
        const totals = b.totals || {};
        const up = (v) => String(v || "").trim().toUpperCase();
        const asMoney = (v) => `Rs. ${String(round2(n0(v)).toLocaleString())}`;
        const left = [];
        const right = [];
        const pushSection = (target, heading, list) => {
          if (!list.length) return;
          target.push({ label: heading, amount: "", isHeading: true });
          list.forEach((r) => target.push({ label: String(r.account || "-"), amount: asMoney(r.balance), isHeading: false }));
        };
        pushSection(left, "Fixed Assets:", assets.filter((r) => up(r.subType) === "FIXED_ASSET"));
        pushSection(left, "Current Assets:", assets.filter((r) => !["FIXED_ASSET", "CASH", "BANK"].includes(up(r.subType))));
        pushSection(left, "Liquid Assets:", assets.filter((r) => ["CASH", "BANK"].includes(up(r.subType))));
        pushSection(right, "Capital:", equity);
        pushSection(right, "Fixed Liabilities:", liabilities.filter((r) => up(r.subType) === "LONG_TERM_LIABILITY"));
        pushSection(right, "Current Liabilities:", liabilities.filter((r) => up(r.subType) !== "LONG_TERM_LIABILITY"));
        const max = Math.max(left.length, right.length, 1);
        finalRows = Array.from({ length: max }).map((_, idx) => ({
          assetLabel: left[idx]?.label || "",
          assetAmount: left[idx]?.amount || "",
          liabilityLabel: right[idx]?.label || "",
          liabilityAmount: right[idx]?.amount || "",
          assetHeading: !!left[idx]?.isHeading,
          liabilityHeading: !!right[idx]?.isHeading,
        }));
        finalRows.push({
          assetLabel: "Total Assets",
          assetAmount: asMoney(totals.totalAssets),
          liabilityLabel: "Total Liabilities and Capital",
          liabilityAmount: asMoney(totals.totalLE),
          isTotal: true,
        });
      }
      if (!finalRows.length) {
        toast.error("No generated balance sheet data found.");
        return;
      }
      const safeName = String(j.name || "balance_sheet").replace(/[\\/:*?\"<>|]/g, "_");
      const doc = new jsPDF();
      doc.setFont("times", "normal");
      const centerX = doc.internal.pageSize.getWidth() / 2;
      doc.setFontSize(12);
      doc.text(String(settings.companyName || settings.shortName || "SMJ"), centerX, 16, { align: "center" });
      doc.setFontSize(11);
      doc.text("Balance Sheet", centerX, 22, { align: "center" });
      doc.setFontSize(9);
      doc.text(`as at ${String(j.endDate || "")}`, centerX, 28, { align: "center" });
      autoTable(doc, {
        head: [["Assets", "Rs.", "Liabilities and Capital", "Rs."]],
        body: finalRows.map((r) => [r.assetLabel || "", r.assetAmount || "", r.liabilityLabel || "", r.liabilityAmount || ""]),
        startY: 34,
        styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        theme: "grid",
        columnStyles: { 1: { halign: "right", cellWidth: 28 }, 3: { halign: "right", cellWidth: 28 } },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const row = finalRows[data.row.index] || {};
          if (row.assetHeading || row.liabilityHeading || row.isTotal) data.cell.styles.fontStyle = "bold";
        },
      });
      doc.save(`${safeName}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to download balance sheet.");
    } finally {
      setGeneratedLoading(false);
    }
  };

  const handleDeleteGeneratedBalance = async (j) => {
    if (!j) return;
    try {
      await api.delete(`/accounting/generated-journals/${j._id || j.id}`);
      loadGeneratedList("balance", setGeneratedBalanceList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete balance sheet.");
    }
  };

  const openDeleteConfirm = (kind, item, label) => {
    setDeleteConfirm({ open: true, kind, item, label: String(label || "").trim() });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ open: false, kind: "", item: null, label: "" });
  };

  const confirmDeleteGenerated = async () => {
    const { kind, item } = deleteConfirm;
    if (!item || !kind) {
      closeDeleteConfirm();
      return;
    }
    if (kind === "journal") await handleDeleteGeneratedJournal(item);
    else if (kind === "ledger") await handleDeleteGeneratedLedger(item);
    else if (kind === "trial") await handleDeleteGeneratedTrial(item);
    else if (kind === "pl") await handleDeleteGeneratedPl(item);
    else if (kind === "balance") await handleDeleteGeneratedBalance(item);
    else if (kind === "gatepass-generated") await handleDeleteGatePassGenerated(item);
    closeDeleteConfirm();
  };

  const downloadLedgerDrillPdf = () => {
    const debits = (drill.rows || []).filter((r) => Number(r.debit || 0) > 0);
    const credits = (drill.rows || []).filter((r) => Number(r.credit || 0) > 0);
    const max = Math.max(debits.length, credits.length);
    const body = Array.from({ length: max }).map((_, i) => {
      const d = debits[i];
      const c = credits[i];
      const dDate = d?.date ? fmtDate(d.date) : "";
      const cDate = c?.date ? fmtDate(c.date) : "";
      return [
        dDate,
        d?.references || d?.description || "",
        "",
        d ? fmtAmt(num(d.debit)) : "",
        cDate,
        c?.references || c?.description || "",
        "",
        c ? fmtAmt(num(c.credit)) : "",
      ];
    });

    const doc = new jsPDF("l", "pt", "a4");
    doc.setFont("times", "normal");
    const headerTitle = drill.title?.replace(/\s*\(Ledger\)\s*$/, "")
      ? `${drill.title.replace(/\s*\(Ledger\)\s*$/, "")} Account in Ledger`
      : "Account in Ledger";
    const startY = addPdfHeader(doc, headerTitle, "");
    doc.text("Dr.", 40, startY - 6);
    doc.text("Cr.", 780, startY - 6);

    autoTable(doc, {
      head: [["Date", "References", "J.R.", "Amount Rs.", "Date", "References", "J.R.", "Amount Rs."]],
      body,
      startY,
      styles: { font: "times", fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      theme: "grid",
      columnStyles: { 3: { halign: "right" }, 7: { halign: "right" } },
    });

    doc.save(`ledger_${asOfDate}.pdf`);
  };

  const loadGatePassGeneratedList = async () => {
    try {
      setGpGeneratedLoading(true);
      const res = await api.get("/gatepass-generated");
      setGpGeneratedList(res.data?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load generated gatepass reports.");
      setGpGeneratedList([]);
    } finally {
      setGpGeneratedLoading(false);
    }
  };

  const gatePassRangeLabel = ({ range: r = "all", startDate: sd = "", endDate: ed = "" }) => {
    if (r === "custom") {
      if (sd && ed) return `${sd} to ${ed}`;
      return sd || ed || "All Dates";
    }
    return "All Dates";
  };

  const gatePassReportCellToText = (col, row) => {
    const v = col.render ? col.render(row[col.key], row) : row[col.key] ?? "";
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object" && v?.props?.children) return String(row[col.key] ?? "");
    return String(v);
  };

  const buildGatePassReport = async ({
    type = "",
    sender = "",
    company = "",
    product = "",
    customer = "",
    range: r = "all",
    startDate: sd = "",
    endDate: ed = "",
  } = {}) => {
    try {
      setLoading(true);
      const reportParams = { range: r };
      if (r === "custom" && sd && ed) {
        reportParams.startDate = sd;
        reportParams.endDate = ed;
      }
      if (type) reportParams.type = type;
      if (sender) reportParams.sender = sender;
      if (company) reportParams.company = company;
      if (product) reportParams.product = product;
      if (customer) reportParams.customer = customer;

      const res = await api.get("/reports/gatepass", { params: reportParams });
      const mapped = (res.data?.data || []).map((r) => ({
        id: r._id,
        ...r,
        paymentStatusLabel: normalizePaymentStatus(r.paymentStatus),
      }));

      const reportColumns = type === "OUT" ? gatePassOutReportColumns : gatePassInReportColumns;
      const titleParts = ["Gate Pass Report"];
      const contextLines = [];
      if (type) {
        titleParts.push(type === "IN" ? "IN" : "OUT");
        contextLines.push(`Type: ${type}`);
      }
      if (sender) {
        titleParts.push(`- ${sender}`);
        contextLines.push(`Sender: ${sender}`);
      }
      if (company) {
        titleParts.push(`- ${company}`);
        contextLines.push(`Company: ${company}`);
      }
      if (product) contextLines.push(`Product: ${product}`);
      if (customer) {
        titleParts.push(`- ${customer}`);
        contextLines.push(`Send To: ${customer}`);
      }
      const title = titleParts.join(" ");
      contextLines.push(`Date Range: ${gatePassRangeLabel({ range: r, startDate: sd, endDate: ed })}`);
      contextLines.push(`Records: ${mapped.length}`);
      const filterLabel = contextLines.join("\n");

      await saveGatePassGeneratedReport({
        title,
        reportKind: "gatepass",
        filterLabel,
        criteria: reportParams,
        columns: reportColumns.map((c) => c.label),
        rows: mapped.map((row) => reportColumns.map((c) => gatePassReportCellToText(c, row))),
      });
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to generate gatepass report.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const saveGatePassGeneratedReport = async ({ title, reportKind, filterLabel, criteria, columns: cols, rows: body }) => {
    try {
      await api.post("/gatepass-generated", {
        name: title,
        reportKind,
        filterLabel,
        criteria,
        columns: cols,
        rows: body,
      });
      toast.success("Report generated and saved.");
      loadGatePassGeneratedList();
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || "Report could not be saved.");
      return false;
    }
  };

  const generateGpListReport = async (kind) => {
    let title = "";
    let cols = [];
    let dataRows = [];
    if (kind === "senders") {
      title = "Sender List";
      cols = [
        { key: "sr", label: "Sr. No" },
        { key: "name", label: "Sender Name" },
      ];
      dataRows = (gpSenders || []).map((s, i) => ({ sr: i + 1, name: s }));
    } else if (kind === "companies") {
      title = "Companies & In-Stock Products";
      cols = [
        { key: "sr", label: "Sr. No" },
        { key: "company", label: "Company" },
        { key: "products", label: "Products (In Stock)" },
      ];
      dataRows = (gpStockCompanies || []).map((c, i) => ({
        sr: i + 1,
        company: c,
        products: gpProductsForCompany(c).join(", "),
      }));
    } else if (kind === "out-stock") {
      title = "Companies & Out-Of-Stock Products";
      cols = [
        { key: "sr", label: "Sr. No" },
        { key: "company", label: "Company" },
        { key: "products", label: "Products (Out Of Stock)" },
      ];
      dataRows = (gpOutStockCompanies || []).map((c, i) => ({
        sr: i + 1,
        company: c,
        products: gpOutProductsForCompany(c).join(", "),
      }));
    } else if (kind === "send-to") {
      title = "Send To Companies List";
      cols = [
        { key: "sr", label: "Sr. No" },
        { key: "name", label: "Company Name" },
      ];
      dataRows = (gpCustomers || []).map((c, i) => ({ sr: i + 1, name: c }));
    } else {
      return false;
    }
    const filterLabel = `Total Records: ${dataRows.length}`;
    return saveGatePassGeneratedReport({
      title,
      reportKind: `gatepass-${kind}`,
      filterLabel,
      criteria: { kind },
      columns: cols.map((c) => c.label),
      rows: dataRows.map((r) => cols.map((c) => String(r[c.key] ?? ""))),
    });
  };

  const downloadGatePassGenerated = (j, format) => {
    if (!j) return;
    const headers = Array.isArray(j.columns) ? j.columns : [];
    const body = Array.isArray(j.rows) ? j.rows : [];
    const title = String(j.name || "Gatepass Report").trim() || "Gatepass Report";
    const createdAt = j.createdAt || new Date().toISOString();
    const safeName = title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
    if (format === "excel") {
      const ws = XLSX.utils.aoa_to_sheet(body.length ? [headers, ...body] : [headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.replace(/\s/g, "_").slice(0, 31));
      XLSX.writeFile(wb, `${safeName}_${new Date(createdAt).toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    const doc = new jsPDF();
    let startY = 18;
    doc.setFontSize(14);
    doc.text(title, 14, startY);
    startY += 7;
    doc.setFontSize(10);
    String(j.filterLabel || "")
      .split("\n")
      .forEach((line) => {
        const t = String(line).trim();
        if (!t) return;
        doc.text(t, 14, startY);
        startY += 5;
      });
    startY += 2;
    autoTable(doc, {
      head: [headers],
      body,
      startY,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [236, 253, 245], textColor: 6 },
    });
    doc.save(`${safeName}_${new Date(createdAt).toISOString().slice(0, 10)}.pdf`);
  };

  const handleDeleteGatePassGenerated = async (j) => {
    try {
      await api.delete(`/gatepass-generated/${j._id}`);
      toast.success("Report deleted.");
      loadGatePassGeneratedList();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete report.");
    }
  };

  const saveTemplate = async (templateName) => {
    const trimmed = String(templateName || "").trim();
    if (!trimmed) return false;
    try {
      const invCompanyForTemplate = invCompanyIds.length === 1 ? invCompanyIds[0] : "";
      await api.post("/reports/templates", {
        name: trimmed,
        reportKey: activeTab,
        companyId: accCompanyId || invCompanyForTemplate || "",
        filters: {
          // common
          voucherTypes: accVoucherTypes,
          accountIds: accAccountIds,
          partyNames: accCustomerNames,
          itemName: accProductName,
          accCompanyId,
          invCompanyIds,
          invProductTypeIds,
          range,
          particularDate,
          startDate,
          endDate,
        },
      });
      toast.success("Template saved.");
      const invCompanyForReload = invCompanyIds.length === 1 ? invCompanyIds[0] : "";
      const res = await api.get("/reports/templates", {
        params: { reportKey: activeTab, companyId: accCompanyId || invCompanyForReload || "" },
      });
      setFilterTemplates(res.data?.data || []);
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save template.");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {/* Accounting placeholder removed */}

      {/* Filters panel removed as requested */}

      <div className="bg-white rounded-lg shadow-sm p-4">
        {!embedded && visibleTabs.length > 0 && (
           <div data-tour="report-tabs" className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setSearchParams({ tab: tab.key });
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  activeTab === tab.key
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-transparent bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === "acc-reports" ? (
          <div className="space-y-4" data-tour="acc-reports">
            <div className="space-y-3">
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
                    {generatedLoading && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Loading generated journals...
                        </td>
                      </tr>
                    )}
                    {!generatedLoading && generatedJournalList.length === 0 && (
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
                              onClick={() => handleDownloadGeneratedJournal(j)}
                              className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteConfirm("journal", j, j.name)}
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

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">Generated Ledgers</div>
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 w-[80px]">Sr. No</th>
                      <th className="text-left font-semibold px-3 py-2">Ledger Name</th>
                      <th className="text-left font-semibold px-3 py-2 w-[160px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {generatedLoading && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Loading generated ledgers...
                        </td>
                      </tr>
                    )}
                    {!generatedLoading && generatedLedgerList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          No generated ledgers yet.
                        </td>
                      </tr>
                    )}
                    {generatedLedgerList.map((j, idx) => (
                      <tr key={j._id || j.id}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{j.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
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
                              onClick={() => openDeleteConfirm("ledger", j, j.name)}
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

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">Generated Trial Balances</div>
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 w-[80px]">Sr. No</th>
                      <th className="text-left font-semibold px-3 py-2">Trial Balance Name</th>
                      <th className="text-left font-semibold px-3 py-2 w-[160px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {generatedLoading && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Loading generated trial balances...
                        </td>
                      </tr>
                    )}
                    {!generatedLoading && generatedTrialList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          No generated trial balances yet.
                        </td>
                      </tr>
                    )}
                    {generatedTrialList.map((j, idx) => (
                      <tr key={j._id || j.id}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{j.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadGeneratedTrial(j)}
                              className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteConfirm("trial", j, j.name)}
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

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">Generated Profit &amp; Loss</div>
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 w-[80px]">Sr. No</th>
                      <th className="text-left font-semibold px-3 py-2">P&amp;L Name</th>
                      <th className="text-left font-semibold px-3 py-2 w-[160px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {generatedLoading && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Loading generated profit &amp; loss...
                        </td>
                      </tr>
                    )}
                    {!generatedLoading && generatedPlList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          No generated profit &amp; loss yet.
                        </td>
                      </tr>
                    )}
                    {generatedPlList.map((j, idx) => (
                      <tr key={j._id || j.id}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{j.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadGeneratedPl(j)}
                              className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteConfirm("pl", j, j.name)}
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

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">Generated Balance Sheets</div>
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 w-[80px]">Sr. No</th>
                      <th className="text-left font-semibold px-3 py-2">Balance Sheet Name</th>
                      <th className="text-left font-semibold px-3 py-2 w-[160px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {generatedLoading && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          Loading generated balance sheets...
                        </td>
                      </tr>
                    )}
                    {!generatedLoading && generatedBalanceList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                          No generated balance sheets yet.
                        </td>
                      </tr>
                    )}
                    {generatedBalanceList.map((j, idx) => (
                      <tr key={j._id || j.id}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{j.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadGeneratedBalance(j)}
                              className="p-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteConfirm("balance", j, j.name)}
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
        ) : (
          <>
            {activeTab === "ledger" && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setLedgerRecordsOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-900"
                >
                  <ChevronDown
                    size={16}
                    className={ledgerRecordsOpen ? "transform rotate-180 transition-transform" : "transition-transform"}
                  />
                  Ledger Records
                </button>
                {ledgerRecordsOpen && (
                  <>
                    {loading ? (
                      <div className="text-sm text-gray-500">Loading ledger records...</div>
                    ) : (
                        <DataTable
                          title="Ledger Records"
                          columns={columns}
                          data={rows}
                          idKey="id"
                          searchPlaceholder="Search ledger..."
                          emptyMessage={emptyMessage}
                          rowClassName={reportRowClass}
                          highlightId={highlightId}
                          highlightKey="journalEntryId"
                          showExport
                          showPrint
                          showRecordCount={!(embedded && activeTab === "ledger")}
                        />
                    )}
                  </>
                )}

                {/* Generated ledgers list removed from ledger records */}
              </div>
            )}

            {activeTab !== "ledger" && (
              <>
                {activeTab === "stock-reports" ? (
                  loading ? (
                    <div className="text-sm text-gray-500">Loading stock reports...</div>
                  ) : (
                    <div className="space-y-6" data-tour="stock-reports">
                      <DataTable
                        title="Stock Snapshot"
                        columns={stockColumns}
                        data={stockRows}
                        idKey="id"
                        emptyMessage="No stock snapshot found."
                        rowClassName={reportRowClass}
                        showSearch={false}
                        showFilters={false}
                        showClearFilters={false}
                        showExport
                        showPrint
                        toolbarActions={stockSnapshotToolbarActions}
                        reportContextLines={stockReportContextLines}
                        showRecordCount={!(embedded && activeTab === "ledger")}
                      />
                      <DataTable
                        title="Stock Movement"
                        columns={stockMovementColumns}
                        data={stockMovementRows}
                        idKey="id"
                        searchPlaceholder="Search stock movement..."
                        emptyMessage="No stock movement found."
                        rowClassName={stockMovementRowClass}
                        showFilters={false}
                        showClearFilters={false}
                        showExport
                        showPrint
                        showRecordCount={!(embedded && activeTab === "ledger")}
                      />
                    </div>
                  )
                ) : activeTab === "gatepass" ? (
                  <div className="space-y-4" data-tour="gatepass-reports">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col h-[380px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Truck size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Sender List</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">All senders recorded in the system</p>
                        <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                          {gpSenders.length === 0 ? (
                            <div className="text-xs text-gray-400">No senders found.</div>
                          ) : (
                            gpSenders.map((s) => (
                              <div key={s} className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                {s}
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => generateGpListReport("senders")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate Senders List
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col h-[380px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Factory size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Companies (Product Owner)</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">Companies with in-stock products</p>
                        <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                          {gpStockCompanies.length === 0 ? (
                            <div className="text-xs text-gray-400">No companies found.</div>
                          ) : (
                            gpStockCompanies.map((c) => (
                              <div key={c} className="overflow-hidden rounded-lg border border-gray-200">
                                <button
                                  type="button"
                                  onClick={() => setGpExpandedCompany(gpExpandedCompany === c ? "" : c)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                                >
                                  <span className="truncate">{c}</span>
                                  <ChevronDown
                                    size={14}
                                    className={`shrink-0 text-gray-400 transition-transform ${gpExpandedCompany === c ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {gpExpandedCompany === c && (
                                  <div className="space-y-1 border-t border-gray-100 bg-gray-50/60 px-2 py-2">
                                    {gpProductsForCompany(c).length === 0 ? (
                                      <div className="px-1 text-[11px] text-gray-400">No in-stock products.</div>
                                    ) : (
                                      gpProductsForCompany(c).map((p) => (
                                        <div key={p} className="rounded-md px-2 py-1.5 text-[11px] text-gray-600">
                                          {p}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => generateGpListReport("companies")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate Companies Report
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col h-[380px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Factory size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Out of Stock Companies</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">Companies with out-of-stock products</p>
                        <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                          {gpOutStockCompanies.length === 0 ? (
                            <div className="text-xs text-gray-400">No companies found.</div>
                          ) : (
                            gpOutStockCompanies.map((c) => (
                              <div key={c} className="overflow-hidden rounded-lg border border-gray-200">
                                <button
                                  type="button"
                                  onClick={() => setGpExpandedOutCompany(gpExpandedOutCompany === c ? "" : c)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                                >
                                  <span className="truncate">{c}</span>
                                  <ChevronDown
                                    size={14}
                                    className={`shrink-0 text-gray-400 transition-transform ${gpExpandedOutCompany === c ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {gpExpandedOutCompany === c && (
                                  <div className="space-y-1 border-t border-gray-100 bg-gray-50/60 px-2 py-2">
                                    {gpOutProductsForCompany(c).length === 0 ? (
                                      <div className="px-1 text-[11px] text-gray-400">No products found.</div>
                                    ) : (
                                      gpOutProductsForCompany(c).map((p) => (
                                        <div key={p} className="rounded-md px-2 py-1.5 text-[11px] text-gray-600">
                                          {p}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => generateGpListReport("out-stock")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate Out Of Stock Report
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col h-[380px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <UserRound size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Send To Companies</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">All companies goods are sent to</p>
                        <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                          {gpCustomers.length === 0 ? (
                            <div className="text-xs text-gray-400">No customers found.</div>
                          ) : (
                            gpCustomers.map((c) => (
                              <div key={c} className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                {c}
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => generateGpListReport("send-to")}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate Send To List
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col min-h-[280px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Truck size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Gate Pass IN Report</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">Apply filters then generate</p>
                        <div className="mt-3 flex-1 space-y-2">
                          <div>
                            <label className={filterLabelClass}>Date Range</label>
                            <select
                              value={gpInCriteria.range}
                              onChange={(e) => setGpInCriteria((p) => ({ ...p, range: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="all">All Dates</option>
                              <option value="custom">From-To Date</option>
                            </select>
                          </div>
                          {gpInCriteria.range === "custom" && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={filterLabelClass}>From</label>
                                <input
                                  type="date"
                                  value={gpInCriteria.startDate}
                                  onChange={(e) => setGpInCriteria((p) => ({ ...p, startDate: e.target.value }))}
                                  className={`${filterInputClass} w-full`}
                                />
                              </div>
                              <div>
                                <label className={filterLabelClass}>To</label>
                                <input
                                  type="date"
                                  value={gpInCriteria.endDate}
                                  onChange={(e) => setGpInCriteria((p) => ({ ...p, endDate: e.target.value }))}
                                  className={`${filterInputClass} w-full`}
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <label className={filterLabelClass}>Sender</label>
                            <select
                              value={gpInCriteria.sender}
                              onChange={(e) => setGpInCriteria((p) => ({ ...p, sender: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Senders</option>
                              {gpSenders.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={filterLabelClass}>Company</label>
                            <select
                              value={gpInCriteria.company}
                              onChange={(e) => setGpInCriteria((p) => ({ ...p, company: e.target.value, product: "" }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Companies</option>
                              {gpStockCompanies.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={filterLabelClass}>Product</label>
                            <select
                              value={gpInCriteria.product}
                              onChange={(e) => setGpInCriteria((p) => ({ ...p, product: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Products</option>
                              {gpProductsForCompany(gpInCriteria.company).map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => buildGatePassReport({ type: "IN", ...gpInCriteria })}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate IN Report
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col min-h-[280px]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Truck size={16} />
                          </div>
                          <div className="text-sm font-semibold text-gray-900">Gate Pass OUT Report</div>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">Apply filters then generate</p>
                        <div className="mt-3 flex-1 space-y-2">
                          <div>
                            <label className={filterLabelClass}>Date Range</label>
                            <select
                              value={gpOutCriteria.range}
                              onChange={(e) => setGpOutCriteria((p) => ({ ...p, range: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="all">All Dates</option>
                              <option value="custom">From-To Date</option>
                            </select>
                          </div>
                          {gpOutCriteria.range === "custom" && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={filterLabelClass}>From</label>
                                <input
                                  type="date"
                                  value={gpOutCriteria.startDate}
                                  onChange={(e) => setGpOutCriteria((p) => ({ ...p, startDate: e.target.value }))}
                                  className={`${filterInputClass} w-full`}
                                />
                              </div>
                              <div>
                                <label className={filterLabelClass}>To</label>
                                <input
                                  type="date"
                                  value={gpOutCriteria.endDate}
                                  onChange={(e) => setGpOutCriteria((p) => ({ ...p, endDate: e.target.value }))}
                                  className={`${filterInputClass} w-full`}
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <label className={filterLabelClass}>Send To</label>
                            <select
                              value={gpOutCriteria.customer}
                              onChange={(e) => setGpOutCriteria((p) => ({ ...p, customer: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Companies</option>
                              {gpCustomers.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={filterLabelClass}>Company</label>
                            <select
                              value={gpOutCriteria.company}
                              onChange={(e) => setGpOutCriteria((p) => ({ ...p, company: e.target.value, product: "" }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Companies</option>
                              {gpStockCompanies.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={filterLabelClass}>Product</label>
                            <select
                              value={gpOutCriteria.product}
                              onChange={(e) => setGpOutCriteria((p) => ({ ...p, product: e.target.value }))}
                              className={`${filterInputClass} w-full`}
                            >
                              <option value="">All Products</option>
                              {gpProductsForCompany(gpOutCriteria.company).map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => buildGatePassReport({ type: "OUT", ...gpOutCriteria })}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <FileText size={14} /> Generate OUT Report
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-gray-900">Generated Reports</div>
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="min-w-[640px] w-full text-sm">
                          <thead className="bg-emerald-50 text-emerald-900">
                            <tr>
                              <th className="w-[60px] px-3 py-2 text-left font-semibold">Sr. No</th>
                              <th className="px-3 py-2 text-left font-semibold">Report Name</th>
                              <th className="w-[190px] px-3 py-2 text-left font-semibold">Generated At</th>
                              <th className="w-[170px] px-3 py-2 text-left font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {gpGeneratedLoading && (
                              <tr>
                                <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                                  Loading generated reports...
                                </td>
                              </tr>
                            )}
                            {!gpGeneratedLoading && gpGeneratedList.length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                                  No generated reports yet.
                                </td>
                              </tr>
                            )}
                            {gpGeneratedList.map((j, idx) => (
                              <tr key={j._id}>
                                <td className="px-3 py-2">{idx + 1}</td>
                                <td className="px-3 py-2">{j.name}</td>
                                <td className="px-3 py-2">
                                  {fmtDate(j.createdAt)}{" "}
                                  <span className="text-gray-400">{new Date(j.createdAt).toLocaleTimeString()}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => downloadGatePassGenerated(j, "pdf")}
                                      className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                      title="Download PDF"
                                    >
                                      <FileText size={13} /> PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => downloadGatePassGenerated(j, "excel")}
                                      className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                      title="Download Excel"
                                    >
                                      <Download size={13} /> Excel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDeleteConfirm("gatepass-generated", j, j.name)}
                                      className="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
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
                ) : loading ? (
                  <div className="text-sm text-gray-500">Loading {title.toLowerCase()}...</div>
                ) : (
                  <DataTable
                    title={title}
                    data-tour="report-data-table"
                    columns={columns}
                    data={rows}
                    idKey="id"
                    searchPlaceholder={`Search ${title.toLowerCase()}...`}
                    emptyMessage={emptyMessage}
                    rowClassName={reportRowClass}
                    showExport={!["trial", "pl", "balance"].includes(activeTab)}
                    showPrint={!["trial", "pl", "balance"].includes(activeTab)}
                    showRecordCount={!(embedded && activeTab === "ledger")}
                    toolbarActions={
                      ["trial", "pl", "balance"].includes(activeTab) ? (
                        <div className="flex flex-wrap gap-2">
                          {activeTab === "trial" && (
                            <>
                              <button
                                type="button"
                                onClick={downloadTrialPdf}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Download size={16} /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={downloadTrialExcel}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Download size={16} /> Excel
                              </button>
                            </>
                          )}
                          {activeTab === "pl" && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadPlPdf().catch((e) => toast.error(e?.response?.data?.message || "Failed to download PDF."))
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Download size={16} /> PDF
                            </button>
                          )}
                          {activeTab === "balance" && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadBalancePdf().catch((e) => toast.error(e?.response?.data?.message || "Failed to download PDF."))
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Download size={16} /> PDF
                            </button>
                          )}
                        </div>
                      ) : null
                    }
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {templateDialog.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Save Filter Template</div>
              <button
                type="button"
                onClick={() => setTemplateDialog({ open: false, name: "" })}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-gray-600">Template name</label>
              <input
                autoFocus
                value={templateDialog.name}
                onChange={(e) => setTemplateDialog((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Monthly Report"
              />
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setTemplateDialog({ open: false, name: "" })}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await saveTemplate(templateDialog.name);
                    if (ok) setTemplateDialog({ open: false, name: "" });
                  }}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4">
            <div className="text-sm font-semibold text-gray-900">Are you sure?</div>
            <div className="mt-2 text-sm text-gray-700">
              {deleteConfirm.label
                ? `Do you want to delete "${deleteConfirm.label}"?`
                : "Do you want to delete this report?"}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={confirmDeleteGenerated}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {drill.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl mx-4 p-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900 truncate">{drill.title}</div>
              <button
                type="button"
                onClick={closeDrill}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 flex-1 overflow-auto">
              {drill.loading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : (
                <DataTable
                  title={drill.title}
                  columns={drill.columns}
                  data={drill.rows}
                  idKey="id"
                  searchPlaceholder="Search..."
                  emptyMessage="No records found."
                  showExport={drill.kind !== "ledger"}
                  showPrint={drill.kind !== "ledger"}
                  toolbarActions={
                    drill.kind === "ledger" ? (
                      <button
                        type="button"
                        onClick={downloadLedgerDrillPdf}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Download size={16} /> PDF
                      </button>
                    ) : null
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
