// src/pages/Stock.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import api from "../services/api";
import { Info, X } from "lucide-react";
import toast from "react-hot-toast";
import DataTable from "../components/ui/DataTable";
import { FilterToggleButton } from "../components/ui/CollapsibleFilter";
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

const companyOf = (row) =>
  String(row?.companyName || row?.brandName || "").trim() || "Mill Own Stock";

function StockFilter({ companies = [], products = [], criteria = {}, onChange }) {
  const company = criteria.company || "";
  const product = criteria.product || "";

  const productOptions = products;

  const hasActive = Boolean(company) || Boolean(product);

  const clear = () => onChange({ company: "", product: "" });

  const selectCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Company</label>
          <select
            value={company}
            onChange={(e) => onChange({ company: e.target.value, product: "" })}
            className={`${selectCls} min-w-[180px]`}
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Product</label>
          <select
            value={product}
            onChange={(e) => onChange({ company, product: e.target.value })}
            className={`${selectCls} min-w-[180px]`}
          >
            <option value="">All Products</option>
            {productOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {hasActive && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
};

const sourceBadgeClass = (type) => {
  switch (type) {
    case "Gate Pass":
      return "bg-sky-50 text-sky-700";
    case "Purchase":
      return "bg-amber-50 text-amber-700";
    case "Sale":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-emerald-50 text-emerald-700";
  }
};

export default function Stock() {
  const [viewMode, setViewMode] = useState("KG");
  const [rows, setRows] = useState([]);
  const [productTypesMap, setProductTypesMap] = useState({});
  const [loading, setLoading] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState({});
  const [infoRow, setInfoRow] = useState(null);

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

  const loadProductTypes = useCallback(async () => {
    try {
      const res = await api.get("/product-types");
      const m = {};
      (res.data?.data || []).forEach((p) => {
        m[String(p?.name || "").trim().toLowerCase()] = p;
      });
      setProductTypesMap(m);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
    loadProductTypes();
  }, [loadData, loadProductTypes]);

  useEffect(() => {
    const onChanged = () => {
      loadData();
      loadProductTypes();
    };
    window.addEventListener("smj-stock-changed", onChanged);
    window.addEventListener("stock:refresh", onChanged);
    window.addEventListener("product:refresh", onChanged);
    return () => {
      window.removeEventListener("smj-stock-changed", onChanged);
      window.removeEventListener("stock:refresh", onChanged);
      window.removeEventListener("product:refresh", onChanged);
    };
  }, [loadData, loadProductTypes]);

  // ------------------------------------------------------------------
  // ALL STOCK (paddy + products) ON ONE SCREEN
  // ------------------------------------------------------------------
  const activeRows = rows;

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

  const filteredRows = useMemo(
    () =>
      activeRows.filter((r) => {
        const company = filterCriteria.company || "";
        const product = filterCriteria.product || "";
        if (company && companyOf(r) !== company) return false;
        if (product && String(r.productTypeName || "").trim() !== product) return false;
        return true;
      }),
    [activeRows, filterCriteria],
  );

  // ------------------------------------------------------------------
  // KG / BAGS VIEW HELPERS
  // ------------------------------------------------------------------
  const displayUnit = viewMode === "BAGS" ? "bags" : "kg";

  const bagWeightOf = useCallback(
    (productName) => {
      const p = productTypesMap[String(productName || "").trim().toLowerCase()];
      const bw = Number(p?.conversionFactors?.Bag || 0);
      return bw > 0 ? bw : 65;
    },
    [productTypesMap],
  );

  const qtyValue = useCallback(
    (kg, productName) => {
      const k = Number(kg || 0);
      if (!k) return 0;
      if (viewMode === "BAGS") {
        const bw = bagWeightOf(productName);
        return bw ? k / bw : 0;
      }
      return k;
    },
    [viewMode, bagWeightOf],
  );

  const displayQty = useCallback(
    (kg, productName) => {
      const k = Number(kg || 0);
      if (!k) return "0";
      if (viewMode === "BAGS") {
        const bw = bagWeightOf(productName);
        if (!bw) return String(Math.round(k));
        const bags = Math.floor(k / bw);
        const rem = Math.round(k - bags * bw);
        return rem > 0 ? `${bags} bag ${rem} kg` : `${bags} bag`;
      }
      return String(Math.round(k));
    },
    [viewMode, bagWeightOf],
  );

  const displayQtyWithUnit = useCallback(
    (kg, productName) => {
      if (viewMode === "BAGS") return displayQty(kg, productName);
      return `${displayQty(kg, productName)} kg`;
    },
    [viewMode, displayQty],
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
        { product, totalKg: 0, companyMap: {}, sourcesByCompany: {}, lastUpdated: null };
      existing.totalKg += kg;
      existing.companyMap[comp] = (existing.companyMap[comp] || 0) + kg;
      existing.sourcesByCompany[comp] = [
        ...(existing.sourcesByCompany[comp] || []),
        ...(r.sources || []),
      ];
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
    let totalQty = 0;
    visibleTableData.forEach((r) => {
      Object.keys(r.companyMap || {}).forEach((c) => companies.add(c));
      totalQty += qtyValue(r.totalKg, r.product);
    });
    return {
      companies: companies.size,
      products: visibleTableData.length,
      totalKg: Math.round(totalQty),
    };
  }, [visibleTableData, qtyValue]);

  const donutData = useMemo(() => {
    const map = new Map();
    visibleTableData.forEach((row) => {
      Object.entries(row.companyMap || {}).forEach(([comp, kg]) => {
        map.set(comp, (map.get(comp) || 0) + Number(qtyValue(kg, row.product) || 0));
      });
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value: Math.round(Number(value || 0)),
    }));
  }, [visibleTableData, qtyValue]);

  // ------------------------------------------------------------------
  // COLUMNS — product first, then one column per company, then total
  // ------------------------------------------------------------------
  const pivotColumns = useMemo(() => {
    const cols = [
      {
        key: "_info",
        label: "",
        align: "center",
        sortable: false,
        render: (_v, row) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInfoRow(row);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-700 hover:bg-emerald-50"
            title="View stock source details"
          >
            <Info size={16} />
          </button>
        ),
      },
      { key: "product", label: "Product" },
    ];
    (activeCompanies || []).forEach((c) => {
      cols.push({
        key: `cmp_${c}`,
        label: c,
        align: "right",
        render: (_v, row) => {
          const q = displayQty(row.companyMap?.[c], row.product);
          return q !== "0" ? q : "-";
        },
      });
    });
    cols.push({
      key: "totalKg",
      label: `Total (${displayUnit})`,
      align: "right",
      render: (_v, row) => (
        <span className="font-semibold text-emerald-700">
          {displayQty(row.totalKg, row.product)}
        </span>
      ),
    });
    return cols;
  }, [activeCompanies, displayQty, displayUnit]);

  const exportColumns = useMemo(() => {
    const cols = [{ key: "product", label: "Product" }];
    (activeCompanies || []).forEach((c) => {
      cols.push({ key: `cmp_${c}`, label: c });
    });
    cols.push({ key: "totalKg", label: `Total (${displayUnit})` });
    return cols;
  }, [activeCompanies, displayUnit]);

  const exportData = useCallback(
    (data) =>
      (data || []).map((r) => {
        const row = { product: r.product };
        (activeCompanies || []).forEach((c) => {
          row[`cmp_${c}`] = fmtQty(r.companyMap?.[c], r.product) || "";
        });
        row.totalKg = fmtQty(r.totalKg, r.product);
        return row;
      }),
    [activeCompanies, fmtQty],
  );

  const hasActiveFilters = Boolean(filterCriteria.company || filterCriteria.product);

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6 w-full">
      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" data-tour="stock-filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-emerald-200 bg-white p-0.5" data-tour="stock-view-toggle">
            <button
              type="button"
              onClick={() => setViewMode("KG")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === "KG" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-emerald-700"
              }`}
            >
              Per kg
            </button>
            <button
              type="button"
              onClick={() => setViewMode("BAGS")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === "BAGS" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-emerald-700"
              }`}
            >
              No. of Bags
            </button>
          </div>
          {hasActiveFilters && (
            <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Filters Applied
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>{summaryStats.companies} Companies</span>
          <span>{summaryStats.products} Products</span>
          <span className="font-semibold text-emerald-700">
            {summaryStats.totalKg.toLocaleString()} {displayUnit}
          </span>
        </div>
      </div>

      {/* TABLE + DONUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white rounded-lg shadow p-4">
           <DataTable
             data-tour="stock-table"
             title="Stock Inventory"
            columns={pivotColumns}
            data={loading ? [] : visibleTableData}
            idKey="__rowId"
            emptyMessage={loading ? "Loading..." : "No stock records found."}
            pageSize={10}
            showSearch={false}
            showFilters={false}
            showClearFilters={false}
            toolbarActionsInHeader
            toolbarActions={
              <FilterToggleButton
                open={filterOpen}
                onToggle={() => setFilterOpen((o) => !o)}
                title="Filters"
                dataTour="stock-filter-toggle"
              />
            }
            belowHeader={
              filterOpen ? (
                <StockFilter
                  companies={activeCompanies}
                  products={activeProducts}
                  criteria={filterCriteria}
                  onChange={setFilterCriteria}
                />
              ) : null
            }
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
                  <Tooltip formatter={(value) => `${Math.round(Number(value) || 0)} ${displayUnit}`} />
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

      {/* SOURCE DETAILS MODAL */}
      {infoRow && (
        <div
          className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setInfoRow(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{infoRow.product}</h3>
                <p className="text-xs text-gray-500">
                  Stock Inventory · Total{" "}
                  {fmtQty(infoRow.totalKg, infoRow.product).toLocaleString()} {displayUnit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInfoRow(null)}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
              >
                <X size={18} />
              </button>
            </div>

            {Object.entries(infoRow.sourcesByCompany || {}).length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No source details available for this product.
              </div>
            ) : (
              Object.entries(infoRow.sourcesByCompany || {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([comp, sources]) => {
                  const inTotal = sources
                    .filter((s) => s.direction !== "OUT")
                    .reduce((a, s) => a + (Number(s.qtyKg) > 0 ? Number(s.qtyKg) : 0), 0);
                  const outTotal = sources
                    .filter((s) => s.direction === "OUT")
                    .reduce((a, s) => a + Math.abs(Number(s.qtyKg) || 0), 0);
                  return (
                    <div key={comp} className="mb-4 border border-gray-100 rounded-lg overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50">
                        <span className="text-sm font-semibold text-gray-800">{comp}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            +{fmtQty(inTotal, infoRow.product).toLocaleString()} {displayUnit} in
                          </span>
                          <span className="inline-flex items-center gap-1 font-medium text-red-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            −{fmtQty(outTotal, infoRow.product).toLocaleString()} {displayUnit} out
                          </span>
                          <span className="text-gray-500">
                            Balance {fmtQty(infoRow.companyMap?.[comp], infoRow.product).toLocaleString()} {displayUnit}
                          </span>
                        </div>
                      </div>
                      <ul className="divide-y divide-gray-50">
                        {sources.map((s, i) => {
                          const isOut = s.direction === "OUT";
                          const qty = Math.abs(Number(s.qtyKg || 0));
                          return (
                            <li key={i} className="px-4 py-2.5 flex items-center gap-3">
                              <span
                                className={`w-14 shrink-0 text-center text-[10px] font-bold tracking-wide rounded-md py-1 ${
                                  isOut
                                    ? "bg-red-50 text-red-600 border border-red-100"
                                    : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                }`}
                              >
                                {isOut ? "OUT" : "IN"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadgeClass(
                                      s.sourceType
                                    )}`}
                                  >
                                    {s.sourceType}
                                  </span>
                                  {s.refNo && s.refNo !== "-" && (
                                    <span className="text-xs font-mono text-gray-600">{s.refNo}</span>
                                  )}
                                  <span className="text-xs text-gray-400">{fmtDate(s.date)}</span>
                                </div>
                                {s.remarks && (
                                  <div className="text-[11px] text-gray-400 truncate mt-0.5">{s.remarks}</div>
                                )}
                              </div>
                              <span
                                className={`shrink-0 text-sm font-semibold tabular-nums ${
                                  isOut ? "text-red-600" : "text-emerald-600"
                                }`}
                              >
                                {isOut ? "−" : "+"}{fmtQty(qty, infoRow.product).toLocaleString()} {displayUnit}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
