// src/pages/Dashboard.jsx
import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import toast from "react-hot-toast";
import { Truck, Box, Coins, AlertTriangle, Info, DatabaseBackup, RotateCcw } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import "react-datepicker/dist/react-datepicker.css";
import api from "../services/api";

const leftAccent = {
  teal: "border-teal-400",
  blue: "border-sky-400",
  amber: "border-amber-400",
  red: "border-rose-400",
};

const DONUT_COLORS = ["#16a34a", "#2563eb", "#eab308", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"];
const RAW_COLORS = ["#16a34a", "#2563eb", "#eab308", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"];
const PRODUCTION_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#7c3aed", "#eab308", "#ea580c", "#0891b2"];

export default function Dashboard() {
  const [date, setDate] = useState(new Date());
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [stats, setStats] = useState({
    cashInHand: 0,
    bagsInward: 0,
    bagsOutward: 0,
    pendingPayments: 0,
  });
  const [activities, setActivities] = useState([]);
  const [pendingBreakdown, setPendingBreakdown] = useState({
    gatePassOut: 0,
    total: 0,
  });
  const [showPendingInfo, setShowPendingInfo] = useState(false);
  const [pendingDetails, setPendingDetails] = useState([]);
  const [stockSummary, setStockSummary] = useState({
    productionKg: 0,
    rawKg: 0,
  });
  const [stockBreakdown, setStockBreakdown] = useState({
    production: [],
    raw: [],
  });
  // fetch live dashboard data

  const fetchDashboardData = async () => {
    try {
      const res = await api.get("/dashboard");
      const data = res.data.data || {};

      setStats({
        cashInHand: data.cashInHand || 0,
        bagsInward: data.bagsInward || 0,
        bagsOutward: data.bagsOutward || 0,
        pendingPayments: data.pendingPayments || 0,
      });
      setPendingBreakdown({
        gatePassOut: data.pendingPaymentsBreakdown?.gatePassOut || 0,
        total: data.pendingPaymentsBreakdown?.total || data.pendingPayments || 0,
      });
      setPendingDetails(data.pendingGatePassDetails || []);
      setActivities(data.recentActivities || []);
      setStockSummary({
        productionKg: data.stockSummary?.productionKg || 0,
        rawKg: data.stockSummary?.paddyKg || 0,
      });
      setStockBreakdown({
        production: data.stockSummaryBreakdown?.production || [],
        raw: data.stockSummaryBreakdown?.raw || [],
      });
    } catch (err) {
      console.error("Dashboard data fetch failed:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const cards = [
    {
      title: "Cash in Hand",
      value: `Rs. ${stats.cashInHand.toLocaleString()}`,
      icon: <Coins size={20} />,
      color: "teal",
      subtitle: "From daybook entries",
    },
    {
      title: "Inward Entries",
      value: stats.bagsInward,
      icon: <Truck size={20} />,
      color: "blue",
    },
    {
      title: "Outward Entries",
      value: stats.bagsOutward,
      icon: <Box size={20} />,
      color: "amber",
    },
    {
      title: "Pending Payments",
      value: stats.pendingPayments,
      icon: <AlertTriangle size={20} />,
      color: "red",
      info: true,
    },
  ];

  const activityIcon = (type) => {
    if (type === "GATE_PASS") return <Truck size={16} />;
    if (type === "PAYMENT") return <Coins size={16} />;
    if (type === "PRODUCTION") return <Box size={16} />;
    if (type === "BACKUP") return <DatabaseBackup size={16} />;
    if (type === "RESTORE") return <RotateCcw size={16} />;
    if (type === "BACKUP_ERROR") return <AlertTriangle size={16} />;
    return <Box size={16} />;
  };

  const activityColor = (type) => {
    if (type === "GATE_PASS") return "teal";
    if (type === "PAYMENT") return "blue";
    if (type === "PRODUCTION") return "amber";
    if (type === "BACKUP") return "blue";
    if (type === "RESTORE") return "teal";
    if (type === "BACKUP_ERROR") return "red";
    return "red";
  };

  const formatActivityDateTime = (value) => {
    if (!value) return "Date/time unavailable";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "Date/time unavailable";
    return dt.toLocaleString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const productionDonut =
    stockBreakdown.production.length > 0
      ? stockBreakdown.production
      : [
          { name: "Production", value: Number(stockSummary.productionKg || 0) },
        ];

  const rawDonut =
    stockBreakdown.raw.length > 0
      ? stockBreakdown.raw
      : [{ name: "Raw Inventory", value: Number(stockSummary.rawKg || 0) }];

  const renderStockCard = (title, donut, totalKg, colors) => (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-2">{title}</div>
      <div className="h-28 flex items-center justify-center">
        <PieChart width={180} height={120}>
          <Pie
            data={donut}
            dataKey="value"
            innerRadius={30}
            outerRadius={45}
            paddingAngle={2}
          >
            {donut.map((entry, index) => (
              <Cell
                key={`${entry.name}-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `${Math.round(Number(value || 0))} kg`} />
        </PieChart>
      </div>
      <div className="text-sm font-semibold text-emerald-900 mt-2">
        {Math.round(Number(totalKg || 0))} kg
      </div>
      <div className="mt-2 space-y-1 text-xs text-gray-600">
        {donut.map((entry, index) => (
          <div key={`${entry.name}-legend-${index}`} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded"
              style={{
                backgroundColor: colors[index % colors.length],
              }}
            />
            <span className="flex-1 truncate">{entry.name}</span>
            <span className="font-medium text-gray-700">
              {Math.round(Number(entry.value || 0))} kg
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-emerald-900">
            Welcome back!
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Here's what's happening today
          </p>
        </div>

        {/* calendar badge */}
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="rounded-lg px-4 py-2 bg-gradient-to-r from-emerald-200 to-teal-100 shadow-sm w-full md:w-auto">
            <DatePicker
              selected={date}
              onChange={(d) => setDate(d)}
              dateFormat="EEE, MMM d, yyyy"
              className="bg-transparent border-none outline-none focus:ring-0 hover:border-none text-sm font-medium text-emerald-900 w-full md:w-44 text-center cursor-pointer"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div
            key={i}
            className={`bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition transform hover:-translate-y-1 border-l-4 ${
              leftAccent[c.color]
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-gray-400">{c.title}</div>
                <div className="text-2xl font-semibold text-emerald-900 mt-1">
                  {c.value}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {c.subtitle || "Data from production module"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.info && (
                  <button
                    type="button"
                    onClick={() => setShowPendingInfo(true)}
                    className="text-emerald-700 hover:text-emerald-900"
                    title="Pending payments breakdown"
                  >
                    <Info size={16} />
                  </button>
                )}
                <div className="text-emerald-600">{c.icon}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showPendingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-emerald-900">
                Pending Payments Breakdown
              </h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowPendingInfo(false)}
              >
                ✕
              </button>
            </div>
            <div className="text-xs font-semibold text-gray-600 mb-2">
              Pending by Customer
            </div>
              {pendingDetails.length === 0 ? (
                <div className="text-xs text-gray-400">No pending payments</div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 thin-scrollbar">
                  {pendingDetails.map((p, i) => (
                      <div key={String(p._id || `${p.gatePassNo}-${i}`)} className="rounded border border-gray-100 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-700">{p.customer || "Customer"}</span>
                            <span className="text-[11px] text-gray-400">GP No: {p.gatePassNo || "-"}</span>
                          </div>
                          <span className="font-semibold text-gray-800">
                            Rem: Rs. {Number(p.remainingAmount || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          Paid: Rs. {Number(p.amountPaid || 0).toLocaleString()}
                        </div>
                      </div>
                  ))}
                </div>
              )}
            <div className="flex items-center justify-between border-t pt-2 mt-3 text-sm">
              <span className="font-semibold">Total</span>
              <span className="font-bold">
                Rs. {Number(pendingBreakdown.total || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activities + Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-emerald-700">
              Recent Activities
            </h3>
            <button
              type="button"
              onClick={() => setShowAllActivities((v) => !v)}
              className="px-3 py-1 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition"
            >
              {showAllActivities ? "Show Less" : "View All"}
            </button>
          </div>

          <div
            className={[
              "space-y-3",
              showAllActivities
                ? "max-h-[420px] overflow-y-auto pr-2 thin-scrollbar"
                : "",
            ].join(" ")}
          >
            {(showAllActivities ? activities : activities.slice(0, 8)).map(
              (a, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-md hover:bg-gray-50 transition"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-md flex items-center justify-center text-white`}
                    style={{
                      background:
                        activityColor(a.type) === "teal"
                          ? "#0f766e"
                          : activityColor(a.type) === "red"
                          ? "#be123c"
                          : activityColor(a.type) === "amber"
                            ? "#c2410c"
                            : "#0ea5e9",
                    }}
                  >
                    {activityIcon(a.type)}
                  </div>
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-gray-400 mt-1">{a.meta}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-800">
                    {a.amount ? `Rs. ${Number(a.amount || 0).toLocaleString()}` : "-"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Generated: {formatActivityDateTime(a.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow-sm p-4">
          <h4 className="font-semibold text-emerald-700 mb-4">Stock Summary</h4>
          <div className="grid grid-cols-1 gap-4">
            {renderStockCard("Raw Inventory", rawDonut, stockSummary.rawKg, RAW_COLORS)}
            {renderStockCard("Production", productionDonut, stockSummary.productionKg, PRODUCTION_COLORS)}
          </div>
        </div>
      </div>
    </div>
  );
}





