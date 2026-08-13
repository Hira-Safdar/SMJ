import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  Layers,
  Package,
  Printer,
  RefreshCw,
  Scale,
  TrendingUp,
} from "lucide-react";
import { fmtDate } from "../../utils/dateUtils";

const fmtNum = (v, d = 2) => {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
};

const fmtKg = (v) => `${fmtNum(v)} kg`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const STATUS_STYLES = {
  OPEN: "bg-amber-100 text-amber-700",
  READY: "bg-emerald-100 text-emerald-700",
  DONE: "bg-gray-100 text-gray-600",
};

const MOVEMENT_STYLES = {
  INPUT: "bg-emerald-100 text-emerald-700",
  OUTPUT: "bg-sky-100 text-sky-700",
  STATUS: "bg-purple-100 text-purple-700",
};

function ProductionSummaryReport({ api, companies = [] }) {
  const [range, setRange] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { range };
      if (range === "custom") {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      if (companyId) params.companyIds = companyId;
      const res = await api.get("/reports/production-summary", { params });
      const list = res.data?.data || [];
      setData(list);
      setExpanded(new Set(list.map((g) => g._id)));
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load production report.");
    } finally {
      setLoading(false);
    }
  }, [api, range, startDate, endDate, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const t = {
      groups: data.length,
      batches: 0,
      inputKg: 0,
      sourceBags: 0,
      outputKg: 0,
      outputBags: 0,
      remainingKg: 0,
    };
    data.forEach((g) => {
      t.batches += Number(g.inputs?.batchCount || 0);
      t.inputKg += Number(g.totals?.totalInputKg || 0);
      t.sourceBags += Number(g.inputs?.totalSourceBags || 0);
      t.outputKg += Number(g.totals?.totalOutputKg || 0);
      t.outputBags += Number(g.totals?.totalOutputBags || 0);
      t.remainingKg += Number(g.totals?.remainingKg || 0);
    });
    t.recoveryPct = t.inputKg > 0 ? Number(((t.outputKg / t.inputKg) * 100).toFixed(1)) : 0;
    t.remainingPct = t.inputKg > 0 ? Number(((t.remainingKg / t.inputKg) * 100).toFixed(1)) : 0;
    t.lossPct = t.inputKg > 0 ? Number(Math.max(0, 100 - t.recoveryPct - t.remainingPct).toFixed(1)) : 0;
    return t;
  }, [data]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allExpanded = data.length > 0 && expanded.size === data.length;

  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(data.map((g) => g._id)));
  };

  const buildPrintHtml = () => {
    const rows = data.map((g) => {
      const batchRows = (g.batches || [])
        .map(
          (b) =>
            `<tr><td>${esc(b.batchNo)}</td><td>${fmtDate(b.date)}</td><td>${esc(b.rawMaterial)}</td><td class="num">${fmtNum(b.weightKg)}</td><td class="num">${fmtNum(b.sourceBags, 0)}</td><td>${esc(b.statusLabel)}</td><td>${esc(b.ownerType)}</td></tr>`
        )
        .join("");
      const outputRows = (g.outputs || [])
        .map(
          (o) =>
            `<tr><td>${esc(o.productTypeName)}</td><td class="num">${fmtNum(o.weightKg)}</td><td class="num">${fmtNum(o.bags, 0)}</td><td class="num">${fmtNum(o.pctOfInput)}%</td><td class="num">${fmtNum(o.pctOfOutput)}%</td><td>${fmtDate(o.outputDate)}</td></tr>`
        )
        .join("");
      const moveRows = (g.movements || [])
        .map(
          (m) =>
            `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.label)}</td><td>${esc(m.product || "-")}</td><td class="num">${fmtNum(m.weightKg)}</td><td class="num">${fmtNum(m.bags, 0)}</td><td>${esc(m.batchNo || "-")}</td></tr>`
        )
        .join("");
      return `
        <div class="group">
          <h3>${esc(g.groupNo || g.companyName)} — ${esc(g.companyName)} <span class="badge">${esc(g.statusLabel)}</span></h3>
          <p class="muted">Created: ${fmtDate(g.createdDate)}${g.completedDate ? ` · Completed: ${fmtDate(g.completedDate)}` : ""} · Sub-batches: ${fmtNum(g.inputs?.batchCount, 0)}</p>
          <div class="chips">
            <span>Raw material: <b>${esc(g.rawMaterial)}</b></span>
            <span>Input: <b>${fmtNum(g.totals?.totalInputKg)} kg</b></span>
            <span>Source bags: <b>${fmtNum(g.inputs?.totalSourceBags, 0)}</b></span>
            <span>Output: <b>${fmtNum(g.totals?.totalOutputKg)} kg</b> / ${fmtNum(g.totals?.totalOutputBags, 0)} bags</span>
            <span>Recovery: <b>${fmtNum(g.totals?.recoveryPct)}%</b></span>
            <span>Remaining: <b>${fmtNum(g.totals?.remainingKg)} kg</b> (${fmtNum(g.totals?.remainingPct)}%)</span>
            <span>Loss: <b>${fmtNum(g.totals?.lossPct)}%</b></span>
          </div>
          <h4>Sub-batches</h4>
          <table><thead><tr><th>Batch No</th><th>Date</th><th>Raw material</th><th class="num">Weight (kg)</th><th class="num">Bags</th><th>Status</th><th>Owner</th></tr></thead><tbody>${batchRows || '<tr><td colspan="7" class="muted">No sub-batches</td></tr>'}</tbody></table>
          <h4>Products produced</h4>
          <table><thead><tr><th>Product</th><th class="num">Weight (kg)</th><th class="num">Bags</th><th class="num">% of input</th><th class="num">% of output</th><th>Date</th></tr></thead><tbody>${outputRows || '<tr><td colspan="6" class="muted">No products recorded</td></tr>'}</tbody></table>
          <h4>Movements</h4>
          <table><thead><tr><th>Date</th><th>Event</th><th>Product</th><th class="num">Weight (kg)</th><th class="num">Bags</th><th>Ref</th></tr></thead><tbody>${moveRows || '<tr><td colspan="6" class="muted">No movements</td></tr>'}</tbody></table>
        </div>`;
    });

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Production Summary Report</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;color:#333;margin:6px 0 10px}
  .muted{color:#666}
  .summary{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 18px}
  .summary .box{border:1px solid #d6d6d6;border-radius:6px;padding:8px 12px;min-width:120px}
  .summary .box .k{font-size:10px;color:#666} .summary .box .v{font-size:15px;font-weight:bold}
  .group{border:1px solid #d6d6d6;border-radius:8px;padding:12px 14px;margin-bottom:14px;page-break-inside:auto}
  h3{margin:0 0 2px;font-size:14px} .badge{font-size:10px;background:#e7f5ec;color:#047857;border-radius:10px;padding:2px 8px;font-weight:normal}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
  .chips span{background:#f3f4f6;border-radius:4px;padding:2px 8px;font-size:11px}
  h4{font-size:12px;margin:12px 0 4px;color:#333}
  table{border-collapse:collapse;width:100%;margin-bottom:4px}
  th,td{border:1px solid #e2e2e2;padding:4px 8px;text-align:left;font-size:11px}
  th{background:#f1f5f9}
  .num{text-align:right}
  @media print { body{margin:12px} .no-print{display:none} }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:6px 14px;margin-bottom:12px">Print</button></div>
<h1>Production Summary Report</h1>
<h2 class="muted">Generated ${new Date().toLocaleString()}</h2>
<div class="summary">
  <div class="box"><div class="k">Groups</div><div class="v">${fmtNum(totals.groups, 0)}</div></div>
  <div class="box"><div class="k">Total Input</div><div class="v">${fmtNum(totals.inputKg)} kg</div></div>
  <div class="box"><div class="k">Total Output</div><div class="v">${fmtNum(totals.outputKg)} kg</div></div>
  <div class="box"><div class="k">Recovery</div><div class="v">${fmtNum(totals.recoveryPct)}%</div></div>
  <div class="box"><div class="k">Remaining</div><div class="v">${fmtNum(totals.remainingKg)} kg</div></div>
  <div class="box"><div class="k">Loss</div><div class="v">${fmtNum(totals.lossPct)}%</div></div>
</div>
${rows.join("")}
</body></html>`;
    return html;
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(buildPrintHtml());
    w.document.close();
    w.focus();
    w.print();
  };

  const statCards = [
    { label: "Production Groups", value: fmtNum(totals.groups, 0), icon: Layers, color: "text-indigo-600 bg-indigo-50" },
    { label: "Total Raw Material In", value: `${fmtNum(totals.inputKg)} kg`, sub: `${fmtNum(totals.sourceBags, 0)} source bags`, icon: Scale, color: "text-amber-600 bg-amber-50" },
    { label: "Total Products Out", value: `${fmtNum(totals.outputKg)} kg`, sub: `${fmtNum(totals.outputBags, 0)} bags`, icon: Package, color: "text-emerald-600 bg-emerald-50" },
    { label: "Recovery", value: `${fmtNum(totals.recoveryPct)}%`, sub: `${fmtNum(totals.batches, 0)} sub-batches`, icon: TrendingUp, color: "text-sky-600 bg-sky-50" },
    { label: "Remaining Raw Material", value: `${fmtNum(totals.remainingKg)} kg`, sub: `${fmtNum(totals.remainingPct)}% of input`, icon: Activity, color: "text-purple-600 bg-purple-50" },
    { label: "Loss / Unaccounted", value: `${fmtNum(totals.lossPct)}%`, icon: RefreshCw, color: "text-rose-600 bg-rose-50" },
  ];

  return (
    <div className="space-y-4" data-tour="report-data-table">
      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500">Date Range</label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              <option value="all">All Dates</option>
              <option value="custom">From-To Date</option>
            </select>
          </div>
          {range === "custom" && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-gray-500">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-500">Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">All Companies</option>
              {companies.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={data.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Printer size={14} /> Print Report
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${s.color}`}>
              <s.icon size={16} />
            </div>
            <div className="mt-2 text-lg font-bold text-gray-900">{s.value}</div>
            <div className="text-[11px] font-medium text-gray-500">{s.label}</div>
            {s.sub && <div className="text-[10px] text-gray-400">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Group cards */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading production report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No production found for the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((g) => {
            const isOpen = expanded.has(g._id);
            const t = g.totals || {};
            return (
              <div key={g._id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(g._id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[g.status] || "bg-gray-100 text-gray-600"}`}>
                      {g.statusLabel}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{g.groupNo || g.companyName}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {g.companyName} · {g.inputs?.batchCount || 0} sub-batch(es) · Created {fmtDate(g.createdDate)}
                        {g.completedDate ? ` · Done ${fmtDate(g.completedDate)}` : ""}
                      </div>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {/* Chips */}
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] text-gray-700">
                        Raw material: <b>{g.rawMaterial}</b>
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
                        Input: <b>{fmtKg(t.totalInputKg)}</b> · {fmtNum(g.inputs?.totalSourceBags, 0)} bags
                      </span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700">
                        Output: <b>{fmtKg(t.totalOutputKg)}</b> · {fmtNum(t.totalOutputBags, 0)} bags
                      </span>
                      <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] text-sky-700">
                        Recovery: <b>{fmtNum(t.recoveryPct)}%</b>
                      </span>
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] text-purple-700">
                        Remaining: <b>{fmtKg(t.remainingKg)}</b> ({fmtNum(t.remainingPct)}%)
                      </span>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] text-rose-700">
                        Loss: <b>{fmtNum(t.lossPct)}%</b>
                      </span>
                    </div>

                    {/* Sub-batches */}
                    <div>
                      <div className="mb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Sub-batches</div>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-[640px] w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Batch No</th>
                              <th className="px-3 py-2 text-left font-medium">Date</th>
                              <th className="px-3 py-2 text-left font-medium">Raw Material</th>
                              <th className="px-3 py-2 text-right font-medium">Weight (kg)</th>
                              <th className="px-3 py-2 text-right font-medium">Bags</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Owner</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.batches?.length === 0 && (
                              <tr><td colSpan={7} className="px-3 py-3 text-sm text-gray-400">No sub-batches</td></tr>
                            )}
                            {g.batches?.map((b) => (
                              <tr key={b.batchNo}>
                                <td className="px-3 py-2 font-mono text-xs">{b.batchNo}</td>
                                <td className="px-3 py-2">{fmtDate(b.date)}</td>
                                <td className="px-3 py-2">{b.rawMaterial}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(b.weightKg)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(b.sourceBags, 0)}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                    {b.statusLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{b.ownerType}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Products produced */}
                    <div>
                      <div className="mb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Products Produced</div>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-[560px] w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Product</th>
                              <th className="px-3 py-2 text-right font-medium">Weight (kg)</th>
                              <th className="px-3 py-2 text-right font-medium">Bags</th>
                              <th className="px-3 py-2 text-right font-medium">% of Input</th>
                              <th className="px-3 py-2 text-right font-medium">% of Output</th>
                              <th className="px-3 py-2 text-left font-medium">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.outputs?.length === 0 && (
                              <tr><td colSpan={6} className="px-3 py-3 text-sm text-gray-400">No products recorded yet</td></tr>
                            )}
                            {g.outputs?.map((o, i) => (
                              <tr key={`${o.productTypeName}-${i}`}>
                                <td className="px-3 py-2 font-medium text-gray-800">{o.productTypeName}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(o.weightKg)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(o.bags, 0)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(o.pctOfInput)}%</td>
                                <td className="px-3 py-2 text-right">{fmtNum(o.pctOfOutput)}%</td>
                                <td className="px-3 py-2">{fmtDate(o.outputDate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Remaining */}
                    <div className="rounded-lg border border-purple-100 bg-purple-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-medium text-purple-700">Remaining Raw Material</div>
                        <div className="text-xs text-purple-600/80">
                          Stays as remaining (not returned to stock) when the group is finalized.
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-800">{fmtKg(t.remainingKg)}</div>
                        <div className="text-[11px] text-purple-600">{fmtNum(t.remainingPct)}% of input</div>
                      </div>
                    </div>

                    {/* Movements */}
                    <div>
                      <div className="mb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Movements</div>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-[560px] w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Date</th>
                              <th className="px-3 py-2 text-left font-medium">Event</th>
                              <th className="px-3 py-2 text-left font-medium">Product</th>
                              <th className="px-3 py-2 text-right font-medium">Weight (kg)</th>
                              <th className="px-3 py-2 text-right font-medium">Bags</th>
                              <th className="px-3 py-2 text-left font-medium">Reference</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.movements?.length === 0 && (
                              <tr><td colSpan={6} className="px-3 py-3 text-sm text-gray-400">No movements</td></tr>
                            )}
                            {g.movements?.map((m, i) => (
                              <tr key={`${m.batchNo}-${i}`}>
                                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(m.date)}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MOVEMENT_STYLES[m.type] || "bg-gray-100 text-gray-600"}`}>
                                    {m.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{m.product || "-"}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(m.weightKg)}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(m.bags, 0)}</td>
                                <td className="px-3 py-2 font-mono text-xs">{m.batchNo || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ProductionSummaryReport;
