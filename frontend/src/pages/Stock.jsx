// src/pages/Stock.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import api from "../services/api";
import { Package, Factory, Filter } from "lucide-react";
import toast from "react-hot-toast";
import DataTable from "../components/ui/DataTable";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#0EA5E9",
  "#22C55E",
  "#A855F7",
  "#F97316",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#10B981",
];

const TABS = [
  {
    value: "RAW",
    label: "Raw Inventory",
    icon: <Package size={16} />,
  },
  {
    value: "PRODUCTION",
    label: "Production Inventory",
    icon: <Factory size={16} />,
  },
];

const isRawRow = (row) => {
  if (row?.category === "PRODUCTION") return false;
  if (row?.category === "RAW") return true;
  const name = String(row?.productTypeName || "").toLowerCase();
  return !row?.productTypeId || /paddy|unprocess/.test(name);
};

const companyOf = (row) =>
  String(row?.companyName || row?.brandName || "").trim() || "Mill Own Stock";

export default function Stock() {
  const [activeTab, setActiveTab] = useState("RAW");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/stock/current");
      setRows(res.data?.data || []);
    } catch {
      toast.error("Failed to load stock data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onChanged = () => loadData();
    window.addEventListener("smj-stock-changed", onChanged);
    window.addEventListener("stock:refresh", onChanged);
    window.addEventListener("product:refresh", onChanged);
    return () => {
      window.removeEventListener("smj-stock-changed", onChanged);
      window.removeEventListener("stock:refresh", onChanged);
      window.removeEventListener("product:refresh", onChanged);
    };
  }, [loadData]);

  // ------------------------------------------------------------------
  // SPLIT INVENTORY
  // ------------------------------------------------------------------
  const rawRows = useMemo(() => rows.filter(isRawRow), [rows]);
  const productionRows = useMemo(() => rows.filter((r) => !isRawRow(r)), [rows]);

  const activeRows = activeTab === "RAW" ? rawRows : productionRows;

  const activeCompanies = useMemo(() => {
    const s = new Set();
    activeRows.forEach((r) => s.add(companyOf(r)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [activeRows]);

  const activeProducts = useMemo(() => {
    const s = new Set();
    activeRows.forEach((r) => {
      const n = String(r.productTypeName || "").trim();
      if (n) s.add(n);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [activeRows]);

  useEffect(() => {
    if (companyFilter !== "ALL" && !activeCompanies.includes(companyFilter)) {
      setCompanyFilter("ALL");
    }
  }, [activeCompanies, companyFilter]);

  useEffect(() => {
    if (productFilter !== "ALL" && !activeProducts.includes(productFilter)) {
      setProductFilter("ALL");
    }
  }, [activeProducts, productFilter]);

  const filteredRows = useMemo(
    () =>
      activeRows.filter((r) => {
        if (companyFilter !== "ALL" && companyOf(r) !== companyFilter) return false;
        if (productFilter !== "ALL" && String(r.productTypeName || "").trim() !== productFilter)
          return false;
        return true;
      }),
    [activeRows, companyFilter, productFilter],
  );

  // ------------------------------------------------------------------
  // TABLE DATA — product rows with per-company kg breakdown
  // ------------------------------------------------------------------
  const productTableData = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((r) => {
      const product = String(r.productTypeName || "").trim() || "Product";
      const comp = companyOf(r);
      const kg = Number(r.balanceKg || 0);
      const existing =
        map.get(product) ||
        { product, totalKg: 0, companyMap: {}, lastUpdated: null };
      existing.totalKg += kg;
      existing.companyMap[comp] = (existing.companyMap[comp] || 0) + kg;
      const lu = r.lastUpdated ? new Date(r.lastUpdated) : null;
      if (lu && (!existing.lastUpdated || lu > new Date(existing.lastUpdated))) {
        existing.lastUpdated = lu.toISOString();
      }
      map.set(product, existing);
    });
    return Array.from(map.values()).map((p) => ({
      __rowId: p.product,
      ...p,
    }));
  }, [filteredRows]);

  const visibleTableData = productTableData;

  // ------------------------------------------------------------------
  // SUMMARY STATS
  // ------------------------------------------------------------------
  const summaryStats = useMemo(() => {
    const companies = new Set();
    let totalKg = 0;
    visibleTableData.forEach((r) => {
      Object.keys(r.companyMap || {}).forEach((c) => companies.add(c));
      totalKg += Number(r.totalKg || 0);
    });
    return {
      companies: companies.size,
      products: visibleTableData.length,
      totalKg: Math.round(totalKg),
    };
  }, [visibleTableData]);

  const donutData = useMemo(() => {
    const map = new Map();
    if (activeTab === "RAW") {
      visibleTableData.forEach((row) => {
        Object.entries(row.companyMap || {}).forEach(([comp, kg]) => {
          map.set(comp, (map.get(comp) || 0) + Number(kg || 0));
        });
      });
    } else {
      visibleTableData.forEach((row) => {
        map.set(row.product, (map.get(row.product) || 0) + Number(row.totalKg || 0));
      });
    }
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value: Math.round(Number(value || 0)),
    }));
  }, [visibleTableData, activeTab]);

  // ------------------------------------------------------------------
  // COLUMNS — product first, then one column per company, then total
  // ------------------------------------------------------------------
  const pivotColumns = useMemo(() => {
    const cols = [{ key: "product", label: "Product" }];
    (activeCompanies || []).forEach((c) => {
      cols.push({
        key: `cmp_${c}`,
        label: c,
        align: "right",
        render: (_v, row) => {
          const q = Math.round(Number(row.companyMap?.[c] || 0));
          return q ? q : "-";
        },
      });
    });
    cols.push({
      key: "totalKg",
      label: "Total (kg)",
      align: "right",
      render: (v) => (
        <span className="font-semibold text-emerald-700">
          {Math.round(Number(v || 0))}
        </span>
      ),
    });
    return cols;
  }, [activeCompanies]);

  const exportColumns = useMemo(() => {
    const cols = [{ key: "product", label: "Product" }];
    (activeCompanies || []).forEach((c) => {
      cols.push({ key: `cmp_${c}`, label: c });
    });
    cols.push({ key: "totalKg", label: "Total (kg)" });
    return cols;
  }, [activeCompanies]);

  const exportData = useCallback(
    (data) =>
      (data || []).map((r) => {
        const row = { product: r.product };
        (activeCompanies || []).forEach((c) => {
          row[`cmp_${c}`] = Math.round(Number(r.companyMap?.[c] || 0)) || "";
        });
        row.totalKg = Math.round(Number(r.totalKg || 0));
        return row;
      }),
    [activeCompanies],
  );

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6 w-full">
      {/* SUB-TABS (gatepass-style) */}
      <div className="border-b border-emerald-200" data-tour="stock-tabs">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const isActive = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-t-lg border-b-2 transition whitespace-nowrap
                  ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
                      : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
                  }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" data-tour="stock-filters">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Filter size={14} />
            Filters
          </span>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
          >
            <option value="ALL">All Companies</option>
            {activeCompanies.map((c, idx) => (
              <option key={`${c}-${idx}`} value={c}>
                {c}
              </option>
            ))}
          </select>
          {activeTab === "PRODUCTION" && (
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
            >
              <option value="ALL">All Products</option>
              {activeProducts.map((p, idx) => (
                <option key={`${p}-${idx}`} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>{summaryStats.companies} Companies</span>
          {activeTab === "PRODUCTION" && (
            <span>{summaryStats.products} Products</span>
          )}
          <span className="font-semibold text-emerald-700">
            {summaryStats.totalKg.toLocaleString()} kg
          </span>
        </div>
      </div>

      {/* TABLE + DONUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white rounded-lg shadow p-4">
           <DataTable
             data-tour="stock-table"
             title={activeTab === "RAW" ? "Raw Inventory" : "Production Inventory"}
            columns={pivotColumns}
            data={loading ? [] : visibleTableData}
            idKey="__rowId"
            emptyMessage={loading ? "Loading..." : "No stock records found."}
            pageSize={10}
            showSearch={false}
            showFilters={false}
            showClearFilters={false}
            exportColumns={exportColumns}
            exportData={exportData}
          />
        </div>

        <div className="lg:col-span-4 bg-white rounded-lg shadow p-4">
          <div className="text-sm font-semibold text-emerald-800 mb-2">
            Stock Distribution
          </div>
          <div className="h-64 min-h-[240px] min-w-[200px]">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={256} minHeight={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={80}
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${Math.round(Number(value) || 0)} kg`} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No data to display
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
