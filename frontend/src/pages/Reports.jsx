import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Package,
  Factory,
  Building2,
  Boxes,
  TrendingUp,
  Scale,
  Landmark,
  HandCoins,
  BookOpen,
  BookCopy,
  FileText,
  UserRound,
  Activity,
  Filter,
} from "lucide-react";
import DataTable from "../components/ui/DataTable";
import api from "../services/api";

const REPORT_TABS = [
  { key: "daybook", label: "Day Book", icon: <BookOpen size={16} /> },
  { key: "ledger", label: "Ledger", icon: <BookCopy size={16} /> },
  { key: "trial", label: "Trial Balance", icon: <Scale size={16} /> },
  { key: "pl", label: "Profit & Loss", icon: <TrendingUp size={16} /> },
  { key: "balance", label: "Balance Sheet", icon: <Landmark size={16} /> },
  { key: "receivables", label: "Accounts Receivable", icon: <HandCoins size={16} /> },
  { key: "payables", label: "Accounts Payable", icon: <HandCoins size={16} /> },

  { key: "stock", label: "Current Stock", icon: <Package size={16} /> },
  { key: "stock-movement", label: "Stock Movement", icon: <Activity size={16} /> },
  { key: "production-summary", label: "Production Summary", icon: <Factory size={16} /> },
  { key: "by-product", label: "By-Product Report", icon: <Boxes size={16} /> },
  { key: "production", label: "Production Detail", icon: <Factory size={16} /> },

  { key: "companies", label: "Company List", icon: <Building2 size={16} /> },
  { key: "customers", label: "Customer List", icon: <UserRound size={16} /> },
];

const RANGE_OPTIONS = [
  { value: "day", label: "Day (Today)" },
  { value: "particular", label: "Particular Date" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom Range" },
];

const num = (v) => Math.round(Number(v || 0));
const fmt = (v) => `Rs ${num(v)}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "-");
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

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("stock");
  const [range, setRange] = useState("month");
  const [particularDate, setParticularDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Accounting filters (manual-entry reports)
  const [accCompanies, setAccCompanies] = useState([]);
  const [accAccounts, setAccAccounts] = useState([]);
  const [accParties, setAccParties] = useState([]);
  const [accProducts, setAccProducts] = useState([]);

  const [accCompanyId, setAccCompanyId] = useState("");
  const [accVoucherTypes, setAccVoucherTypes] = useState([]);
  const [accAccountIds, setAccAccountIds] = useState([]);
  const [accPartyIds, setAccPartyIds] = useState([]);
  const [accProductIds, setAccProductIds] = useState([]);

  const [filterTemplates, setFilterTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDialog, setTemplateDialog] = useState({ open: false, name: "" });

  // Stock / Production filters
  const [invCompanies, setInvCompanies] = useState([]); // Company (party) list
  const [invProducts, setInvProducts] = useState([]); // ProductType list
  const [invCompanyIds, setInvCompanyIds] = useState([]);
  const [invProductTypeIds, setInvProductTypeIds] = useState([]);

  // Drill-down modal
  const [drill, setDrill] = useState({ open: false, title: "", loading: false, rows: [], columns: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterInputClass =
    "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
  const filterLabelClass = "block text-xs font-medium text-gray-600 mb-1";

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && REPORT_TABS.some((t) => t.key === tab)) setActiveTab(tab);
  }, [searchParams]);

  const params = useMemo(() => {
    const p = { range };
    if (range === "particular" && particularDate) p.date = particularDate;
    if (range === "custom") {
      if (startDate) p.startDate = startDate;
      if (endDate) p.endDate = endDate;
    }

    const isAccountingReport = [
      "trial",
      "pl",
      "balance",
      "receivables",
      "payables",
      "daybook",
      "ledger",
    ].includes(activeTab);

    if (isAccountingReport) {
      if (accCompanyId) p.companyId = accCompanyId;
      if (accVoucherTypes.length) p.voucherTypes = accVoucherTypes.join(",");
      if (accAccountIds.length) p.accountIds = accAccountIds.join(",");
      if (accPartyIds.length) p.partyIds = accPartyIds.join(",");
      if (accProductIds.length) p.productIds = accProductIds.join(",");
    }

    const isInventoryReport = ["stock", "stock-movement", "production-summary", "by-product", "production"].includes(activeTab);
    if (isInventoryReport) {
      if (invCompanyIds.length) p.companyIds = invCompanyIds.join(",");
      if (invProductTypeIds.length) p.productTypeIds = invProductTypeIds.join(",");
    }
    return { params: p };
  }, [
    range,
    particularDate,
    startDate,
    endDate,
    activeTab,
    accCompanyId,
    accVoucherTypes,
    accAccountIds,
    accPartyIds,
    accProductIds,
    invCompanyIds,
    invProductTypeIds,
  ]);

  const loadReport = async () => {
    try {
      setLoading(true);
      if (activeTab === "customers") {
        setRows([]);
        return;
      }
      if (activeTab === "companies") {
        const res = await api.get("/reports/master/companies");
        setRows(
          (res.data?.data || []).map((c) => ({
            id: c._id,
            name: c.name || "-",
            phone: c.phone || "-",
            email: c.email || "-",
            address: c.address || "-",
            products: Array.isArray(c.products) ? c.products : [],
            productCount: Number(c.productCount || 0),
            updatedAt: c.updatedAt || c.createdAt,
          }))
        );
        return;
      }
      if (activeTab === "stock") {
        const res = await api.get("/reports/stock", params);
        const production = (res.data?.data?.production || []).map((r, idx) => ({
          id: `p-${idx}`,
          stockType: "Production",
          item: r.productTypeName || "-",
          party: r.companyName || "-",
          balance: `${num(r.balanceKg)} kg`,
          valuePKR: num(r.valuePKR),
          companyId: r.companyId || "",
          productTypeId: r.productTypeId || "",
        }));
        setRows([...production]);
        return;
      }
      if (activeTab === "stock-movement") {
        const res = await api.get("/reports/stock-movement", params);
        setRows(
          (res.data?.data || []).map((r) => ({
            id: r._id,
            ...r,
          }))
        );
        return;
      }
      if (activeTab === "production") {
        const res = await api.get("/reports/production", params);
        const mapped = (res.data?.data || []).flatMap((b) =>
          (b.outputs?.length ? b.outputs : [{ productTypeName: "-", netWeightKg: 0, outputDate: b.date }]).map((o, idx) => ({
            id: `${b._id}-${idx}`,
            date: fmtDate(o.outputDate || b.date),
            batchNo: b.batchNo || "-",
            company: o.companyName || b.sourceCompanyName || "-",
            product: o.productTypeName || "-",
            outputKg: num(o.netWeightKg),
            status: b.status || "-",
          }))
        );
        setRows(mapped);
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
      if (activeTab === "by-product") {
        const res = await api.get("/reports/by-product", params);
        setRows(
          (res.data?.data || []).map((r, idx) => ({
            id: `${idx}-${r.productTypeName}`,
            ...r,
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
      if (activeTab === "receivables") {
        const res = await api.get("/accounting/outstanding/receivables", params);
        setRows(
          (res.data?.data || []).map((r, idx) => ({
            id: `${idx}-${r.party}`,
            ...r,
          }))
        );
        return;
      }
      if (activeTab === "payables") {
        const res = await api.get("/accounting/outstanding/payables", params);
        setRows(
          (res.data?.data || []).map((r, idx) => ({
            id: `${idx}-${r.party}`,
            ...r,
          }))
        );
        return;
      }
      if (activeTab === "daybook") {
        const res = await api.get("/accounting/daybook", params);
        setRows(
          (res.data?.data || []).map((r, idx) => ({
            id: r.journalEntryId || `${idx}-${r.voucherNo}`,
            ...r,
          }))
        );
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
        const [compRes, accRes, partyRes, prodRes, invCompRes, invProdRes] = await Promise.all([
          api.get("/accounting/entities"),
          api.get("/accounting/accounts"),
          api.get("/accounting/parties"),
          api.get("/accounting/products"),
          api.get("/companies"),
          api.get("/product-types"),
        ]);
        setAccCompanies(compRes.data?.data || []);
        setAccAccounts(accRes.data?.data || []);
        setAccParties(partyRes.data?.data || []);
        setAccProducts(prodRes.data?.data || []);
        setInvCompanies(invCompRes.data?.data || []);
        setInvProducts(invProdRes.data?.data || []);
      } catch {
        // ignore; reports can still load without these filters
      }
    })();
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

  function closeDrill() {
    setDrill({ open: false, title: "", loading: false, rows: [], columns: [] });
  }

  async function openLedgerDrill({ accountId, title: t }) {
    if (!accountId) return;
    try {
      setDrill({
        open: true,
        title: t || "Ledger Details",
        loading: true,
        rows: [],
        columns: [
          { key: "date", label: "Date", render: (v) => fmtDate(v) },
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

  async function openStockMovementDrill({ companyId, productTypeId, title: t }) {
    try {
      setDrill({
        open: true,
        title: t || "Stock Movement",
        loading: true,
        rows: [],
        columns: [
          { key: "date", label: "Date", render: (v) => fmtDate(v) },
          { key: "stockInKg", label: "In (kg)" },
          { key: "stockOutKg", label: "Out (kg)" },
          { key: "balanceKg", label: "Balance (kg)" },
          { key: "reference", label: "Reference" },
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
    if (activeTab === "companies") {
      return [
        { key: "name", label: "Company Name" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        {
          key: "products",
          label: "Products",
          sortable: false,
          render: (v) => {
            const list = Array.isArray(v) ? v : [];
            const text = list.join(", ");
            return (
              <span className="block max-w-[360px] truncate" title={text || "-"}>
                {text || "-"}
              </span>
            );
          },
        },
        { key: "productCount", label: "Total Products" },
        { key: "updatedAt", label: "Updated", render: (v) => fmtDate(v) },
      ];
    }
    if (activeTab === "stock") {
      return [
        { key: "item", label: "Product" },
        { key: "party", label: "Company Name" },
        { key: "balance", label: "Balance" },
        { key: "valuePKR", label: "Value (PKR)", render: (v) => fmt(v) },
        {
          key: "drill",
          label: "Details",
          skipExport: true,
          render: (_v, row) =>
            row?.companyId && row?.productTypeId ? (
              <button
                type="button"
                onClick={() =>
                  openStockMovementDrill({
                    companyId: row.companyId,
                    productTypeId: row.productTypeId,
                    title: `${row.party || ""} - ${row.item || ""} (Movement)`,
                  })
                }
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
    if (activeTab === "stock-movement") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        { key: "companyName", label: "Company Name" },
        { key: "productTypeName", label: "Product" },
        { key: "stockInKg", label: "Stock In (kg)" },
        { key: "stockOutKg", label: "Stock Out (kg)" },
        { key: "balanceKg", label: "Balance (kg)" },
        { key: "reference", label: "Reference" },
        { key: "remarks", label: "Remarks" },
      ];
    }
    if (activeTab === "production") {
      return [
        { key: "date", label: "Date" },
        { key: "batchNo", label: "Batch #" },
        { key: "company", label: "Company Name" },
        { key: "product", label: "Product" },
        { key: "outputKg", label: "Output (kg)" },
        { key: "status", label: "Status" },
      ];
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
    if (activeTab === "by-product") {
      return [
        { key: "productTypeName", label: "Product" },
        { key: "outputKg", label: "Total Output (kg)" },
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
    if (activeTab === "receivables" || activeTab === "payables") {
      return [
        { key: "party", label: "Party" },
        { key: "totalDebit", label: "Total Debit (PKR)", render: (v) => fmt(v) },
        { key: "totalCredit", label: "Total Credit (PKR)", render: (v) => fmt(v) },
        { key: "balance", label: "Balance (PKR)", render: (v) => fmt(v) },
      ];
    }
    if (activeTab === "daybook") {
      return [
        { key: "date", label: "Date", render: (v) => fmtDate(v) },
        { key: "voucherNo", label: "Voucher No" },
        { key: "type", label: "Type" },
        { key: "companyName", label: "Company" },
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
  }, [activeTab, openLedgerDrill, openVoucherDrill, openStockMovementDrill]);

  const title = REPORT_TABS.find((t) => t.key === activeTab)?.label || "Report";

  const reportRowClass = (row) => {
    if (!row) return "";
    if (activeTab === "ledger" && Number(row.balance || 0) < 0) return "text-red-700";
    if (activeTab === "stock-movement" && Number(row.balanceKg || 0) < 0) return "text-red-700";
    if ((activeTab === "receivables" || activeTab === "payables") && Number(row.balance || 0) < 0) return "text-red-700";
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
    if (Array.isArray(f.partyIds)) setAccPartyIds(f.partyIds);
    if (Array.isArray(f.productIds)) setAccProductIds(f.productIds);

    // Inventory filters
    if (Array.isArray(f.invCompanyIds)) setInvCompanyIds(f.invCompanyIds);
    else if (f.invCompanyId != null) setInvCompanyIds(f.invCompanyId ? [String(f.invCompanyId)] : []);

    if (Array.isArray(f.invProductTypeIds)) setInvProductTypeIds(f.invProductTypeIds);
    else if (f.invProductTypeId != null) setInvProductTypeIds(f.invProductTypeId ? [String(f.invProductTypeId)] : []);
  };

  const openSaveTemplate = () => setTemplateDialog({ open: true, name: "" });

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
          partyIds: accPartyIds,
          productIds: accProductIds,
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
      <div className="border-b border-emerald-200">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setSearchParams({ tab: tab.key });
                  }}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-t-lg border-b-2 transition whitespace-nowrap
                  ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
                      : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Report Filters</div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
            filtersOpen ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Filter size={16} />
          {filtersOpen ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {filtersOpen && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="text-sm">
              <span className={filterLabelClass}>Range</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className={`${filterInputClass} w-full`}
              >
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {range === "particular" && (
              <div className="text-sm">
                <span className={filterLabelClass}>Date</span>
                <input
                  type="date"
                  value={particularDate}
                  onChange={(e) => setParticularDate(e.target.value)}
                  className={`${filterInputClass} w-full`}
                />
              </div>
            )}

            {range === "custom" && (
              <>
                <div className="text-sm">
                  <span className={filterLabelClass}>Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`${filterInputClass} w-full`}
                  />
                </div>
                <div className="text-sm">
                  <span className={filterLabelClass}>End Date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`${filterInputClass} w-full`}
                  />
                </div>
              </>
            )}

            {["trial", "pl", "balance", "receivables", "payables", "daybook", "ledger"].includes(activeTab) && (
              <>
                <div className="text-sm">
                  <span className={filterLabelClass}>Company</span>
                  <select
                    value={accCompanyId}
                    onChange={(e) => setAccCompanyId(e.target.value)}
                    className={`${filterInputClass} w-full`}
                  >
                    <option value="">All</option>
                    {(accCompanies || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Templates</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedTemplateId(v);
                        applyTemplate(v);
                      }}
                      className={`${filterInputClass} w-full`}
                    >
                      <option value="">Select template</option>
                      {(filterTemplates || []).map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={openSaveTemplate}
                      className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 text-sm hover:bg-emerald-50"
                    >
                      Save Template
                    </button>
                  </div>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Voucher Types</span>
                  <select
                    multiple
                    size={1}
                    value={accVoucherTypes}
                    onChange={(e) => setAccVoucherTypes(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {["JOURNAL", "PAYMENT", "RECEIPT"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Accounts</span>
                  <select
                    multiple
                    size={1}
                    value={accAccountIds}
                    onChange={(e) => setAccAccountIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {(accAccounts || []).filter((a) => a.isActive !== false).map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Parties</span>
                  <select
                    multiple
                    size={1}
                    value={accPartyIds}
                    onChange={(e) => setAccPartyIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {(accParties || []).filter((p) => p.isActive !== false).map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Products</span>
                  <select
                    multiple
                    size={1}
                    value={accProductIds}
                    onChange={(e) => setAccProductIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {(accProducts || []).filter((p) => p.isActive !== false).map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {["stock", "stock-movement", "production-summary", "by-product", "production"].includes(activeTab) && (
              <>
                <div className="text-sm">
                  <span className={filterLabelClass}>Company</span>
                  <select
                    multiple
                    size={1}
                    value={invCompanyIds}
                    onChange={(e) => setInvCompanyIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {(invCompanies || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Product</span>
                  <select
                    multiple
                    size={1}
                    value={invProductTypeIds}
                    onChange={(e) => setInvProductTypeIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    className={`${filterInputClass} w-full`}
                  >
                    {(invProducts || []).map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <span className={filterLabelClass}>Templates</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedTemplateId(v);
                        applyTemplate(v);
                      }}
                      className={`${filterInputClass} w-full`}
                    >
                      <option value="">Select template</option>
                      {(filterTemplates || []).map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={openSaveTemplate}
                      className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 text-sm hover:bg-emerald-50"
                    >
                      Save Template
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-4">
        {loading ? (
          <div className="text-sm text-gray-500">Loading {title.toLowerCase()}...</div>
        ) : (
          <DataTable
            title={title}
            columns={columns}
            data={rows}
            idKey="id"
            searchPlaceholder={`Search ${title.toLowerCase()}...`}
            emptyMessage={`No ${title.toLowerCase()} found.`}
            rowClassName={reportRowClass}
          />
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
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
