// src/pages/Production.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import {
  Factory,
  Activity,
  Info,
  Trash2,
  Plus,
  Printer,
  X,
  Box,
  Edit2,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Package,
  Layers,
  RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";

const OTHER_OPTION = "__OTHER__";

const createEmptyOutputForm = () => ({
  productMode: "list",
  productInput: "",
  productTypeId: "",
  weightKg: "",
  bagWeightEachKg: "",
  numBags: "",
  emptyBagWeightKg: "",
  netWeightKg: "",
});

function todayISODate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString() : "-";
}

const intClean = (v) =>
  String(v).replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");

const decClean = (v) => {
  const s = String(v).replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) return parts[0] + "." + parts.slice(1).join("");
  return s;
};

const fmtKg = (n) => Math.round(Number(n || 0)).toLocaleString();

export default function Production() {
  const [searchParams] = useSearchParams();
  const requestedBatchNo = searchParams.get("batchNo") || "";

  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState({
    totalOutputWeightKg: 0,
    batchCount: 0,
    productWiseOutput: [],
  });
  const [paddyStockKg, setPaddyStockKg] = useState(0);
  const [paddyByCompany, setPaddyByCompany] = useState([]);
  const [products, setProducts] = useState([]);

  const [activeTab, setActiveTab] = useState("OPEN");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const [creating, setCreating] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [working, setWorking] = useState(false);

  const [batchForm, setBatchForm] = useState({
    date: todayISODate(),
    sourceCompanyName: "",
    paddyWeightKg: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const [outputForm, setOutputForm] = useState(createEmptyOutputForm());
  const [outputFormOpen, setOutputFormOpen] = useState(false);

  const [editingBatchId, setEditingBatchId] = useState(null);
  const [editBatchForm, setEditBatchForm] = useState({ date: "", paddyWeightKg: "" });

  const [editingOutputId, setEditingOutputId] = useState(null);
  const [editOutputForm, setEditOutputForm] = useState({
    weightKg: "",
    bagWeightEachKg: "",
    numBags: "",
    emptyBagWeightKg: "",
    productTypeId: "",
  });

  // Confirm dialogs
  const [confirmState, setConfirmState] = useState(null); // {type, payload}

  const [printGroup, setPrintGroup] = useState(null);
  const [showSlip, setShowSlip] = useState(false);
  const [paddyInfoOpen, setPaddyInfoOpen] = useState(false);

  const detailRef = useRef(null);

  const [settings, setSettings] = useState({ defaultBagWeightKg: 65 });
  const [millInfo, setMillInfo] = useState({
    name: "SMJ Rice Mill",
    address: "",
    phone: "",
    logoUrl: "",
  });

  const uniqueProducts = useMemo(() => {
    const byName = new Map();
    (products || []).forEach((p) => {
      const name = String(p?.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, p);
    });
    return Array.from(byName.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [products]);

  const loadMeta = useCallback(async () => {
    try {
      const pRes = await api.get("/product-types");
      setProducts(pRes.data.data || []);
    } catch {
      toast.error("Failed to load product types.");
    }
  }, []);

  const loadMillInfo = useCallback(async () => {
    try {
      const res = await api.get("/settings");
      const data = res.data?.data || {};
      const general = data.general || data.generalSettings || data;
      setSettings((prev) => ({
        ...prev,
        defaultBagWeightKg: data.defaultBagWeightKg ?? 65,
      }));
      setMillInfo((prev) => ({
        ...prev,
        name: general.companyName || general.millName || prev.name,
        address: general.address || general.fullAddress || prev.address,
        phone: general.phone || "",
        logoUrl: data.logoUrl || "",
      }));
    } catch {
      /* silent */
    }
  }, []);

  const loadPaddyStock = useCallback(async () => {
    try {
      const res = await api.get("/stock/current");
      const rows = res.data?.data || [];
      const paddyRows = rows
        .filter((r) => {
          const n = String(r.productTypeName || "").toLowerCase();
          return n === "paddy" || n === "unprocessed paddy";
        })
        .map((r) => ({
          companyName: r.companyName || "",
          balanceKg: Number(r.balanceKg || 0),
          gatepassInKg: (r.sources || [])
            .filter(
              (s) =>
                String(s.direction || "").toUpperCase() === "IN" &&
                /gate\s?pass/i.test(String(s.sourceType || ""))
            )
            .reduce((sum, s) => sum + (Number(s.qtyKg) || 0), 0),
        }));
      setPaddyByCompany(paddyRows);
      setPaddyStockKg(paddyRows.reduce((s, r) => s + Number(r.balanceKg || 0), 0));
    } catch {
      setPaddyByCompany([]);
      setPaddyStockKg(0);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setLoadingData(true);
      const res = await api.get("/production/overview");
      if (res.data?.success) {
        setGroups(res.data.data || []);
        const first = (res.data.data || [])[0];
        setSelectedGroupId((prev) => {
          if (prev && (res.data.data || []).some((g) => g._id === prev)) return prev;
          return first?._id || null;
        });
      }
    } catch {
      toast.error("Failed to load production data.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get("/production/summary/today");
      if (res.data?.success) setSummary(res.data.data || summary);
    } catch {
      /* silent */
    }
  }, [summary]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadPaddyStock(), loadSummary()]);
  }, [loadOverview, loadPaddyStock, loadSummary]);

  useEffect(() => {
    loadOverview();
    loadPaddyStock();
    loadMeta();
    loadSummary();
    loadMillInfo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (requestedBatchNo) {
      const g = groups.find((grp) =>
        (grp.batches || []).some((b) => String(b.batchNo || "") === requestedBatchNo)
      );
      if (g) {
        setSelectedGroupId(g._id);
        setExpandedGroups((prev) => new Set(prev).add(g._id));
        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
      }
    }
  }, [requestedBatchNo, groups]);

  useEffect(() => {
    const onProductRefresh = () => loadMeta();
    window.addEventListener("product:refresh", onProductRefresh);
    return () => window.removeEventListener("product:refresh", onProductRefresh);
  }, [loadMeta]);

  const paddyCompanyOptions = Array.from(
    new Set((paddyByCompany || []).map((r) => r.companyName).filter(Boolean))
  ).sort();
  const selectedSourcePaddyKg = Number(
    paddyByCompany.find((r) => r.companyName === batchForm.sourceCompanyName)
      ?.balanceKg || 0
  );

  const selectedGroup =
    groups.find((g) => g._id === selectedGroupId) || null;

  const selectedGroupAvailableKg = Number(
    paddyByCompany.find(
      (r) =>
        r.companyName &&
        selectedGroup &&
        String(r.companyName).toLowerCase() ===
          String(selectedGroup.sourceCompanyName).toLowerCase()
    )?.balanceKg || 0
  );

  const selectedGroupGatepassInKg = Number(
    paddyByCompany.find(
      (r) =>
        r.companyName &&
        selectedGroup &&
        String(r.companyName).toLowerCase() ===
          String(selectedGroup.sourceCompanyName).toLowerCase()
    )?.gatepassInKg || 0
  );

  const paddyRowFor = (companyName) =>
    paddyByCompany.find(
      (r) =>
        r.companyName &&
        companyName &&
        String(r.companyName).toLowerCase() === String(companyName).toLowerCase()
    );

  const tabGroups = useMemo(
    () =>
      groups.filter((g) => {
        if (activeTab === "ALL") return true;
        return g.status === activeTab;
      }),
    [groups, activeTab]
  );

  const toggleExpand = (id) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------
  // BATCH ACTIONS
  // ---------------------------------------------------------------
  async function handleCreateBatch() {
    const err = {};
    if (!batchForm.date) err.date = "Select batch date.";
    if (!batchForm.sourceCompanyName) err.sourceCompanyName = "Select paddy resource.";
    if (!batchForm.paddyWeightKg) err.paddyWeightKg = "Enter paddy weight (kg).";
    else {
      const reqKg = Math.floor(Number(batchForm.paddyWeightKg));
      if (reqKg > selectedSourcePaddyKg) {
        err.paddyWeightKg = `Exceeds available stock for ${batchForm.sourceCompanyName} (${fmtKg(selectedSourcePaddyKg)} kg).`;
      }
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setFieldErrors({});
    setCreating(true);
    try {
      const res = await api.post("/production/batches", {
        date: batchForm.date,
        sourceCompanyName: batchForm.sourceCompanyName,
        paddyWeightKg: Math.floor(Number(batchForm.paddyWeightKg)),
      });
      if (!res.data?.success) {
        toast.error(res.data?.message || "Failed to create batch.");
      } else {
        toast.success("Batch created.");
        setBatchForm({ date: todayISODate(), sourceCompanyName: "", paddyWeightKg: "" });
        const g = groups.find(
          (x) => String(x.sourceCompanyName || "").toLowerCase() ===
            String(batchForm.sourceCompanyName).toLowerCase()
        );
        await refreshAll();
        if (g?._id) {
          setSelectedGroupId(g._id);
          setExpandedGroups((prev) => new Set(prev).add(g._id));
        } else {
          setSelectedGroupId(res.data.data.groupId);
        }
        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to create batch.");
    }
    setCreating(false);
  }

  async function handleCompleteBatch(batchId) {
    setWorking(true);
    try {
      const res = await api.post(`/production/batches/${batchId}/complete`);
      if (!res.data?.success) toast.error(res.data?.message || "Failed to complete batch.");
      else {
        toast.success("Batch completed.");
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to complete batch.");
    }
    setWorking(false);
  }

  async function handleReopenBatch(batchId) {
    setWorking(true);
    try {
      const res = await api.post(`/production/batches/${batchId}/reopen`);
      if (!res.data?.success) toast.error(res.data?.message || "Failed to reopen batch.");
      else {
        toast.success("Batch reopened.");
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to reopen batch.");
    }
    setWorking(false);
  }

  async function handleDeleteBatch(batchId) {
    setWorking(true);
    try {
      const res = await api.delete(`/production/batches/${batchId}`);
      if (!res.data?.success) toast.error(res.data?.message || "Failed to delete batch.");
      else {
        toast.success("Batch deleted, paddy returned to stock.");
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to delete batch.");
    }
    setWorking(false);
  }

  async function handleSaveBatchInfo(batchId) {
    if (!editBatchForm.paddyWeightKg) {
      setFieldErrors((e) => ({ ...e, editPaddyWeightKg: "Enter paddy weight (kg)." }));
      return;
    }
    setWorking(true);
    try {
      const res = await api.put(`/production/batches/${batchId}`, {
        date: editBatchForm.date,
        paddyWeightKg: Math.floor(Number(editBatchForm.paddyWeightKg)),
      });
      if (!res.data?.success) toast.error(res.data?.message || "Failed to update batch.");
      else {
        toast.success("Batch updated.");
        setEditingBatchId(null);
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to update batch.");
    }
    setWorking(false);
  }

  function startEditBatch(b) {
    setEditingBatchId(b._id);
    setEditingOutputId(null);
    setEditBatchForm({
      date: b.date ? new Date(b.date).toISOString().slice(0, 10) : todayISODate(),
      paddyWeightKg: String(Math.floor(Number(b.paddyWeightKg) || 0)),
    });
  }

  // ---------------------------------------------------------------
  // OUTPUT ACTIONS
  // ---------------------------------------------------------------
  // Auto-calc like gatepass: bags = floor(weight / bagWeight), net = weight - bags*emptyBag
  const outputBagsAndNet = useMemo(() => {
    const weight = Number(outputForm.weightKg) || 0;
    const bagW = Number(outputForm.bagWeightEachKg) || 0;
    const empty = Number(outputForm.emptyBagWeightKg) || 0;
    const bags = weight > 0 && bagW > 0 ? Math.floor(weight / bagW) : 0;
    const extraKg =
      weight > 0 && bagW > 0 ? +(weight - bags * bagW).toFixed(3) : 0;
    const net = +(Math.max(weight - bags * empty, 0)).toFixed(3);
    return { bags, extraKg, net };
  }, [outputForm.weightKg, outputForm.bagWeightEachKg, outputForm.emptyBagWeightKg]);

  const addProductByName = useCallback(
    async (rawName) => {
      const name = String(rawName || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (!name) {
        toast.error("Enter product name.");
        return "";
      }
      const existing = (products || []).find(
        (p) => String(p.name || "").toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        setOutputForm((f) => ({
          ...f,
          productTypeId: existing._id,
          productMode: "list",
          productInput: "",
        }));
        return existing._id;
      }
      try {
        const bagKg = Number(settings.defaultBagWeightKg || 65);
        const res = await api.post("/product-types", {
          name,
          brand: "",
          pricePerKg: 0,
          pricePerBag: 0,
          pricePerTon: 0,
          conversionFactors: { KG: 1, Bag: bagKg, Ton: 1000 },
        });
        const created = res.data?.data || res.data;
        await loadMeta();
        window.dispatchEvent(new Event("product:refresh"));
        setOutputForm((f) => ({
          ...f,
          productTypeId: created._id || "",
          productMode: "list",
          productInput: "",
        }));
        return created._id || "";
      } catch {
        toast.error("Failed to add product.");
        return "";
      }
    },
    [products, settings.defaultBagWeightKg, loadMeta]
  );

  async function handleAddOutput() {
    if (!selectedGroup || !selectedGroup._id) return;
    const err = {};
    let productTypeId = outputForm.productTypeId;
    if (!productTypeId && outputForm.productMode === "input" && outputForm.productInput) {
      productTypeId = await addProductByName(outputForm.productInput);
    }
    if (!productTypeId) err.outputProduct = "Select product.";
    if (!outputForm.weightKg) err.outputWeight = "Enter weight (kg).";
    if (!outputForm.bagWeightEachKg || Number(outputForm.bagWeightEachKg) <= 0)
      err.outputBagWeight = "Enter weight of bag (kg).";
    if (outputForm.emptyBagWeightKg === "") err.outputEmptyBag = "Enter empty bag weight.";
    else {
      const { bags, net } = outputBagsAndNet;
      if (net <= 0) err.outputNet = "Net weight must be greater than 0.";
      else if (net > (Number(selectedGroup.remainingPaddyKg) || 0)) {
        err.outputNet = `Maximum product weight remaining: ${fmtKg(selectedGroup.remainingPaddyKg)} kg.`;
      } else if (bags < 1) {
        err.outputNet = "Weight is less than bag weight, so no full bags can be counted.";
      }
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setFieldErrors({});
    setWorking(true);
    try {
      const res = await api.post(`/production/groups/${selectedGroup._id}/outputs`, {
        productTypeId,
        productTypeName:
          (products || []).find((p) => p._id === productTypeId)?.name || "",
        weightKg: Number(outputForm.weightKg),
        bagWeightEachKg: Number(outputForm.bagWeightEachKg),
        emptyBagWeightKg: Number(outputForm.emptyBagWeightKg),
      });
      if (!res.data?.success) toast.error(res.data?.message || "Failed to add product.");
      else {
        toast.success("Product added to stock.");
        setOutputForm(createEmptyOutputForm());
        setOutputFormOpen(false);
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to add product.");
    }
    setWorking(false);
  }

  function startEditOutput(o) {
    setEditingOutputId(o._id);
    setEditingBatchId(null);
    setEditOutputForm({
      productTypeId: o.productTypeId || "",
      weightKg: String(Number(o.weightKg) || 0),
      bagWeightEachKg: String(Number(o.bagWeightEachKg) || 0),
      numBags: String(Number(o.numBags) || 0),
      emptyBagWeightKg: String(Number(o.emptyBagWeightKg) || 0),
    });
  }

  async function handleSaveOutput(outputId) {
    if (!selectedGroup || !selectedGroup._id) return;
    const weight = Number(editOutputForm.weightKg) || 0;
    const bagW = Number(editOutputForm.bagWeightEachKg) || 0;
    const empty = Number(editOutputForm.emptyBagWeightKg) || 0;
    const bags = weight > 0 && bagW > 0 ? Math.floor(weight / bagW) : 0;
    const net = +(Math.max(weight - bags * empty, 0)).toFixed(3);
    if (net <= 0) {
      setFieldErrors((e) => ({ ...e, editOutputNet: "Net weight must be greater than 0." }));
      return;
    }
    setWorking(true);
    try {
      const product = products.find((p) => p._id === editOutputForm.productTypeId);
      const res = await api.patch(
        `/production/groups/${selectedGroup._id}/outputs/${outputId}`,
        {
          productTypeId: editOutputForm.productTypeId || undefined,
          productTypeName: product?.name || undefined,
          weightKg: weight,
          bagWeightEachKg: bagW,
          emptyBagWeightKg: empty,
        }
      );
      if (!res.data?.success) toast.error(res.data?.message || "Failed to update product.");
      else {
        toast.success("Product updated.");
        setEditingOutputId(null);
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to update product.");
    }
    setWorking(false);
  }

  async function handleDeleteOutput(outputId) {
    if (!selectedGroup || !selectedGroup._id) return;
    setWorking(true);
    try {
      const res = await api.delete(`/production/groups/${selectedGroup._id}/outputs/${outputId}`);
      if (!res.data?.success) toast.error(res.data?.message || "Failed to delete product.");
      else {
        toast.success("Product removed.");
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to delete product.");
    }
    setWorking(false);
  }

  async function handleFinalizeGroup() {
    if (!selectedGroup || !selectedGroup._id) return;
    setWorking(true);
    try {
      const res = await api.post(`/production/groups/${selectedGroup._id}/done`);
      if (!res.data?.success) toast.error(res.data?.message || "Failed to finalize group.");
      else {
        toast.success("Group finalized. Remaining paddy returned to stock.");
        await refreshAll();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to finalize group.");
    }
    setWorking(false);
  }

  const paddyDistributionRows = useMemo(
    () =>
      (paddyByCompany || [])
        .filter((r) => Number(r.balanceKg || 0) > 0)
        .sort((a, b) => Number(b.balanceKg || 0) - Number(a.balanceKg || 0)),
    [paddyByCompany]
  );

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  const statusBadge = (g) => {
    if (g.status === "DONE")
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Done</span>;
    if (g.status === "READY")
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Ready</span>;
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In-Process</span>;
  };

  const batchStatusChip = (status) =>
    status === "COMPLETED" ? (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Done</span>
    ) : (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">In-Process</span>
    );

  return (
    <div className="space-y-5" data-tour="production">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl shadow border-l-4 border-amber-400">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                Unprocessed Paddy Stock
                <button type="button" onClick={() => setPaddyInfoOpen(true)} className="text-amber-600 hover:text-amber-800" title="Paddy distribution">
                  <Info size={13} />
                </button>
              </div>
              <div className="text-xl font-bold text-amber-800">{fmtKg(paddyStockKg)} kg</div>
            </div>
            <div className="bg-amber-100 p-2 rounded-full"><Box className="text-amber-700" size={16} /></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl shadow border-l-4 border-violet-200">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500">Batches Today</div>
              <div className="text-xl font-bold text-violet-800">{summary.batchCount ?? 0}</div>
            </div>
            <div className="bg-violet-100 p-2 rounded-full"><Factory className="text-violet-700" size={16} /></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl shadow border-l-4 border-emerald-300">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500">Production Output (Today)</div>
              <div className="text-xl font-bold text-emerald-800">{fmtKg(summary.totalOutputWeightKg)} kg</div>
            </div>
            <div className="bg-emerald-100 p-2 rounded-full"><Layers className="text-emerald-700" size={16} /></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl shadow border-l-4 border-teal-300">
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500 mb-1">Output Today (Product-wise)</div>
              <div className="text-xs font-medium text-teal-800 space-y-0.5 max-h-14 overflow-y-auto">
                {(summary.productWiseOutput || []).length > 0 ? (
                  (summary.productWiseOutput || []).map((p) => (
                    <div key={p.productTypeName}>{p.productTypeName}: {fmtKg(p.totalKg)} kg</div>
                  ))
                ) : (
                  <span className="text-gray-400">No output yet</span>
                )}
              </div>
            </div>
            <div className="bg-teal-100 p-2 rounded-full shrink-0"><Activity className="text-teal-700" size={16} /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* LEFT: groups + batches */}
        <div className="bg-white rounded-xl shadow border flex flex-col min-h-[500px]">
          <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-gray-700">Paddy Sources / Batches</div>
            <div className="flex gap-3 text-xs">
              {[
                { key: "OPEN", label: "In-Process" },
                { key: "READY", label: "Ready" },
                { key: "DONE", label: "Done" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`pb-0.5 ${
                    activeTab === t.key
                      ? "text-emerald-700 font-semibold border-b-2 border-emerald-700"
                      : "text-gray-500"
                  }`}
                >
                  {t.label} ({groups.filter((g) => g.status === t.key).length})
                </button>
              ))}
            </div>
          </div>

          {/* Quick create: Date first, then paddy resource */}
          <div className="p-3 border-b bg-gray-50 grid grid-cols-12 gap-2 text-xs items-end">
            <div className="col-span-3">
              <label className="block text-[10px] text-gray-500 mb-0.5">Date</label>
              <input
                type="date"
                value={batchForm.date}
                onChange={(e) => setBatchForm((f) => ({ ...f, date: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBatch(); } }}
                className={`border rounded px-2 py-1.5 w-full ${fieldErrors.date ? "border-red-500 bg-red-50" : ""}`}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] text-gray-500 mb-0.5">Paddy Source</label>
              <select
                value={batchForm.sourceCompanyName}
                onChange={(e) => setBatchForm((f) => ({ ...f, sourceCompanyName: e.target.value }))}
                className={`border rounded px-2 py-1.5 w-full ${fieldErrors.sourceCompanyName ? "border-red-500 bg-red-50" : ""}`}
              >
                <option value="">Company</option>
                {paddyCompanyOptions.map((name, idx) => (
                  <option key={`${name}-${idx}`} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] text-gray-500 mb-0.5">Paddy Weight (kg)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={batchForm.paddyWeightKg}
                  onChange={(e) => setBatchForm((f) => ({ ...f, paddyWeightKg: intClean(e.target.value) }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBatch(); } }}
                  placeholder="e.g. 1000"
                  className={`flex-1 min-w-0 border rounded px-2 py-1.5 ${fieldErrors.paddyWeightKg ? "border-red-500 bg-red-50" : ""}`}
                />
                <span className="w-[52px] shrink-0 text-right text-[10px] font-medium text-amber-700 whitespace-nowrap overflow-hidden">
                  {batchForm.sourceCompanyName && selectedSourcePaddyKg > 0
                    ? `${fmtKg(selectedSourcePaddyKg)} kg`
                    : ""}
                </span>
              </div>
            </div>
            <div className="col-span-3">
              <button
                type="button"
                onClick={handleCreateBatch}
                disabled={creating}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-60"
              >
                <Plus size={13} />
                {creating ? "..." : "New Batch"}
              </button>
            </div>
            {fieldErrors.paddyStock && (
              <p className="col-span-12 text-[10px] text-red-600">{fieldErrors.paddyStock}</p>
            )}
          </div>

          {/* Group list */}
          <div className="flex-1 overflow-y-auto">
            {loadingData ? (
              <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
            ) : tabGroups.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No production groups here. Create a batch to start.</div>
            ) : (
              <div className="divide-y">
                {tabGroups.map((g) => {
                  const isOpen = expandedGroups.has(g._id);
                  const isSelected = selectedGroupId === g._id;
                  const pRow = paddyRowFor(g.sourceCompanyName);
                  return (
                    <div key={g._id || g.sourceCompanyName}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isSelected ? "bg-emerald-50" : "hover:bg-gray-50"}`}
                        onClick={() => {
                          setSelectedGroupId(g._id);
                          toggleExpand(g._id);
                        }}
                      >
                        <button
                          type="button"
                          className="text-gray-400"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(g._id); }}
                        >
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800">{g.sourceCompanyName}</span>
                            {statusBadge(g)}
                            {g.groupNo && <span className="text-[10px] text-gray-400">{g.groupNo}</span>}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {(g.batches || []).length} batches · Total {fmtKg(pRow?.gatepassInKg || 0)} kg · Output {fmtKg(g.totalOutputWeightKg)} kg · Remaining {fmtKg(pRow?.balanceKg || 0)} kg
                          </div>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="bg-gray-50/70 px-3 pb-2">
                          {(g.batches || []).map((b) => (
                            <div
                              key={b._id}
                              className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-100 last:border-0"
                            >
                              <span className="text-gray-400 font-mono">{b.batchNo}</span>
                              <span className="text-gray-600">{fmtDate(b.date)}</span>
                              <span className="text-gray-700 font-semibold">{fmtKg(b.paddyWeightKg)} kg</span>
                              {batchStatusChip(b.status)}
                              <span className="ml-auto flex items-center gap-1">
                                {b.status === "IN_PROCESS" && (
                                  <>
                                    <button
                                      type="button"
                                      title="Edit"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedGroupId(g._id);
                                        setExpandedGroups((prev) => new Set(prev).add(g._id));
                                        startEditBatch(b);
                                        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
                                      }}
                                      disabled={working}
                                      className="p-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Complete"
                                      onClick={(e) => { e.stopPropagation(); handleCompleteBatch(b._id); }}
                                      disabled={working}
                                      className="p-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    >
                                      <CheckCircle2 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete"
                                      onClick={(e) => { e.stopPropagation(); setConfirmState({ type: "DELETE_BATCH", batch: b, group: g }); }}
                                      disabled={working}
                                      className="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                                {b.status === "COMPLETED" && (
                                  <button
                                    type="button"
                                    title="Reopen"
                                    onClick={(e) => { e.stopPropagation(); setConfirmState({ type: "REOPEN_BATCH", batch: b, group: g }); }}
                                    disabled={working}
                                    className="p-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: selected group detail */}
        <div ref={detailRef} className="min-h-[500px] flex flex-col">
          {selectedGroup ? (
            <div className="bg-white rounded-xl shadow border p-4 space-y-4 flex-1 overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs text-gray-500">Selected Paddy Source</div>
                  <div className="text-lg font-semibold text-emerald-800">{selectedGroup.sourceCompanyName}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    {selectedGroup.groupNo && <span>{selectedGroup.groupNo}</span>}
                    {statusBadge(selectedGroup)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPrintGroup(selectedGroup); setShowSlip(true); }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border text-emerald-700 hover:bg-emerald-50"
                >
                  <Printer size={14} />
                  Preview Slip
                </button>
              </div>

              {/* Totals strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Total (gatepass in)</div>
                  <div className="text-lg font-bold text-emerald-800">{fmtKg(selectedGroupGatepassInKg)} kg</div>
                </div>
                <div className="bg-teal-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Products Made</div>
                  <div className="text-lg font-bold text-teal-800">{fmtKg(selectedGroup.totalOutputWeightKg)} kg</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Remaining (stock)</div>
                  <div className="text-lg font-bold text-amber-800">{fmtKg(selectedGroupAvailableKg)} kg</div>
                </div>
              </div>

              {/* Batches */}
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">Batches (daily runs)</div>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Batch No</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-right">Paddy (kg)</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 w-20 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGroup.batches || []).map((b) => (
                        <tr key={b._id} className="border-t">
                          <td className="p-2 font-mono">{b.batchNo}</td>
                          <td className="p-2">{fmtDate(b.date)}</td>
                          <td className="p-2 text-right font-semibold">{fmtKg(b.paddyWeightKg)}</td>
                          <td className="p-2">{batchStatusChip(b.status)}</td>
                          <td className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              {b.status === "IN_PROCESS" && (
                                <>
                                  <button type="button" onClick={() => startEditBatch(b)} className="px-1.5 py-0.5 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 flex items-center gap-0.5">
                                    <Edit2 size={11} />
                                    <span>Edit</span>
                                  </button>
                                  <button type="button" onClick={() => setConfirmState({ type: "COMPLETE_BATCH", batch: b, group: selectedGroup })} disabled={working} className="px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-0.5">
                                    <CheckCircle2 size={11} />
                                    <span>Complete</span>
                                  </button>
                                </>
                              )}
                              {b.status === "COMPLETED" && (
                                <button type="button" title="Reopen" onClick={() => setConfirmState({ type: "REOPEN_BATCH", batch: b, group: selectedGroup })} disabled={working} className="p-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-50">
                                  <RotateCcw size={12} />
                                </button>
                              )}
                              <button type="button" title="Delete" onClick={() => setConfirmState({ type: "DELETE_BATCH", batch: b, group: selectedGroup })} disabled={working} className="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {editingBatchId && (
                        <tr className="border-t bg-amber-50/60">
                          <td className="p-2 font-mono">Edit</td>
                          <td className="p-2">
                            <input
                              type="date"
                              value={editBatchForm.date}
                              onChange={(e) => setEditBatchForm((f) => ({ ...f, date: e.target.value }))}
                              className="border rounded px-1 py-0.5 text-[11px] w-full"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={editBatchForm.paddyWeightKg}
                              onChange={(e) => setEditBatchForm((f) => ({ ...f, paddyWeightKg: intClean(e.target.value) }))}
                              className={`border rounded px-1 py-0.5 text-[11px] w-24 text-right ${fieldErrors.editPaddyWeightKg ? "border-red-500" : ""}`}
                            />
                          </td>
                          <td className="p-2 text-[10px] text-gray-500">IN_PROCESS</td>
                          <td className="p-2">
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => handleSaveBatchInfo(editingBatchId)} disabled={working} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                Save
                              </button>
                              <button type="button" onClick={() => { setEditingBatchId(null); setFieldErrors((e) => ({ ...e, editPaddyWeightKg: "" })); }} className="text-[10px] text-gray-500 hover:underline">
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {(!selectedGroup.batches || selectedGroup.batches.length === 0) && !editingBatchId && (
                        <tr><td colSpan={5} className="p-3 text-center text-gray-400">No batches yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Products */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">Products</div>
                  {selectedGroup.status === "READY" && (
                    <button
                      type="button"
                      onClick={() => { setOutputFormOpen((v) => !v); setFieldErrors({}); }}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Plus size={14} />
                      {outputFormOpen ? "Close" : "Add Output"}
                    </button>
                  )}
                </div>

                {selectedGroup.status !== "READY" && selectedGroup.status !== "DONE" && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    Products can be added once all batches of this source are completed.
                  </p>
                )}

                {/* Add output form (top) */}
                {outputFormOpen && selectedGroup.status === "READY" && (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 mb-2">
                    <div className="grid grid-cols-12 gap-2 text-xs items-end">
                      <div className="col-span-12 sm:col-span-6">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Company (source)</label>
                        <input type="text" readOnly value={selectedGroup.sourceCompanyName} className="border rounded px-2 py-1.5 w-full bg-gray-100 cursor-not-allowed" />
                      </div>
                      {outputForm.productMode === "list" ? (
                        <div className="col-span-12 sm:col-span-6">
                          <label className="block text-[10px] text-gray-500 mb-0.5">Product Name</label>
                          <select
                            value={outputForm.productTypeId}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === OTHER_OPTION) {
                                setOutputForm((f) => ({ ...f, productMode: "input", productInput: "", productTypeId: "" }));
                                return;
                              }
                              setOutputForm((f) => ({ ...f, productTypeId: v, productInput: "" }));
                              setFieldErrors((e) => ({ ...e, outputProduct: "" }));
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                            className={`border rounded px-2 py-1.5 w-full ${fieldErrors.outputProduct ? "border-red-500 bg-red-50" : ""}`}
                          >
                            <option value="">Select product</option>
                            {uniqueProducts.map((p) => (
                              <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                            <option value={OTHER_OPTION}>+ Add New Product</option>
                          </select>
                        </div>
                      ) : (
                        <div className="col-span-12 sm:col-span-6 flex items-end gap-1">
                          <div className="flex-1">
                            <label className="block text-[10px] text-gray-500 mb-0.5">New Product Name</label>
                            <input
                              value={outputForm.productInput || ""}
                              onChange={(e) => setOutputForm((f) => ({ ...f, productInput: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProductByName(outputForm.productInput); } }}
                              placeholder="Enter product name"
                              className={`border rounded px-2 py-1.5 w-full ${fieldErrors.outputProduct ? "border-red-500 bg-red-50" : ""}`}
                            />
                          </div>
                          <button type="button" onClick={async () => { if (String(outputForm.productInput || "").trim()) await addProductByName(outputForm.productInput); else setOutputForm((f) => ({ ...f, productMode: "list" })); }} className="px-2 py-1.5 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50 whitespace-nowrap">
                            List
                          </button>
                        </div>
                      )}
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Weight (kg)</label>
                        <input
                          type="number"
                          value={outputForm.weightKg}
                          onChange={(e) => setOutputForm((f) => ({ ...f, weightKg: intClean(e.target.value) }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                          placeholder="e.g. 700"
                          className={`border rounded px-2 py-1.5 w-full ${fieldErrors.outputWeight ? "border-red-500 bg-red-50" : ""}`}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Weight of Bag (kg)</label>
                        <input
                          type="number"
                          value={outputForm.bagWeightEachKg}
                          onChange={(e) => setOutputForm((f) => ({ ...f, bagWeightEachKg: decClean(e.target.value) }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                          placeholder="e.g. 50"
                          className={`border rounded px-2 py-1.5 w-full ${fieldErrors.outputBagWeight ? "border-red-500 bg-red-50" : ""}`}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">Empty Bag Wt (kg)</label>
                        <input
                          type="number"
                          step="any"
                          value={outputForm.emptyBagWeightKg}
                          onChange={(e) => setOutputForm((f) => ({ ...f, emptyBagWeightKg: decClean(e.target.value) }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                          placeholder="e.g. 0.5"
                          className={`border rounded px-2 py-1.5 w-full ${fieldErrors.outputEmptyBag ? "border-red-500 bg-red-50" : ""}`}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">No of Bags (auto)</label>
                        <input
                          type="text"
                          readOnly
                          value={outputBagsAndNet.bags > 0
                            ? `${outputBagsAndNet.bags} bag${outputBagsAndNet.bags > 1 ? "s" : ""}${outputBagsAndNet.extraKg > 0 ? ` + ${fmtKg(outputBagsAndNet.extraKg)} kg` : ""}`
                            : "-"}
                          className="border rounded px-2 py-1.5 w-full bg-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="col-span-12 flex items-end justify-between gap-2 flex-wrap">
                        <div className="text-xs">
                          <span className="text-gray-500">Net Weight: </span>
                          <span className={`font-bold ${outputBagsAndNet.net > 0 ? "text-emerald-700" : "text-gray-700"}`}>
                            {outputBagsAndNet.net > 0 ? fmtKg(outputBagsAndNet.net) : "-"} kg
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddOutput}
                          disabled={working}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Plus size={13} />
                          Add Output
                        </button>
                      </div>
                      {(fieldErrors.outputNet || fieldErrors.outputProduct || fieldErrors.outputWeight || fieldErrors.outputBagWeight || fieldErrors.outputEmptyBag) && (
                        <p className="col-span-12 text-[10px] text-red-600">
                          {[fieldErrors.outputProduct, fieldErrors.outputWeight, fieldErrors.outputBagWeight, fieldErrors.outputEmptyBag, fieldErrors.outputNet].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Outputs table (bottom) */}
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-right">Weight (kg)</th>
                        <th className="p-2 text-right">Bag Wt (kg)</th>
                        <th className="p-2 text-right">Bags</th>
                        <th className="p-2 text-right">Empty Bag (kg)</th>
                        <th className="p-2 text-right">Net (kg)</th>
                        {selectedGroup.status !== "DONE" && <th className="p-2 w-16" />}
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGroup.outputs || []).map((o) => (
                        <tr key={o._id} className="border-t">
                          {editingOutputId === o._id ? (
                            <>
                              <td className="p-2">
                                <select
                                  value={editOutputForm.productTypeId || o.productTypeId}
                                  onChange={(e) => setEditOutputForm((f) => ({ ...f, productTypeId: e.target.value }))}
                                  className="border rounded px-1 py-0.5 text-[11px] w-full"
                                >
                                  <option value="">Select product</option>
                                  {uniqueProducts.map((p) => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2">
                                <input type="number" value={editOutputForm.weightKg} onChange={(e) => setEditOutputForm((f) => ({ ...f, weightKg: intClean(e.target.value) }))} className="border rounded px-1 py-0.5 text-[11px] w-20 text-right" />
                              </td>
                              <td className="p-2">
                                <input type="number" value={editOutputForm.bagWeightEachKg} onChange={(e) => setEditOutputForm((f) => ({ ...f, bagWeightEachKg: decClean(e.target.value) }))} className="border rounded px-1 py-0.5 text-[11px] w-16 text-right" />
                              </td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const w = Number(editOutputForm.weightKg) || 0;
                                  const bw = Number(editOutputForm.bagWeightEachKg) || 0;
                                  return w > 0 && bw > 0 ? String(Math.floor(w / bw)) : "0";
                                })()}
                              </td>
                              <td className="p-2">
                                <input type="number" step="any" value={editOutputForm.emptyBagWeightKg} onChange={(e) => setEditOutputForm((f) => ({ ...f, emptyBagWeightKg: decClean(e.target.value) }))} className="border rounded px-1 py-0.5 text-[11px] w-16 text-right" />
                              </td>
                              <td className="p-2 text-right font-semibold">
                                {(() => {
                                  const w = Number(editOutputForm.weightKg) || 0;
                                  const bw = Number(editOutputForm.bagWeightEachKg) || 0;
                                  const eb = Number(editOutputForm.emptyBagWeightKg) || 0;
                                  const bg = w > 0 && bw > 0 ? Math.floor(w / bw) : 0;
                                  return fmtKg(Math.max(w - bg * eb, 0));
                                })()}
                              </td>
                              <td className="p-2">
                                <div className="flex justify-end gap-1">
                                  <button type="button" onClick={() => handleSaveOutput(o._id)} disabled={working} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Save</button>
                                  <button type="button" onClick={() => { setEditingOutputId(null); setFieldErrors((e) => ({ ...e, editOutputNet: "" })); }} className="text-[10px] text-gray-500 hover:underline">Cancel</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-2">{o.productTypeName}</td>
                              <td className="p-2 text-right">{fmtKg(o.weightKg)}</td>
                              <td className="p-2 text-right">{Number(o.bagWeightEachKg) || 0}</td>
                              <td className="p-2 text-right">{o.numBags}</td>
                              <td className="p-2 text-right">{Number(o.emptyBagWeightKg) || 0}</td>
                              <td className="p-2 text-right font-semibold text-emerald-700">{fmtKg(o.netWeightKg)}</td>
                              {selectedGroup.status !== "DONE" && (
                                <td className="p-2">
                                  <div className="flex justify-end gap-1">
                                    <button type="button" title="Edit" onClick={() => startEditOutput(o)} className="p-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"><Edit2 size={12} /></button>
                                    <button type="button" title="Delete" onClick={() => setConfirmState({ type: "DELETE_OUTPUT", output: o, group: selectedGroup })} disabled={working} className="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50"><Trash2 size={12} /></button>
                                  </div>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                      {(!selectedGroup.outputs || selectedGroup.outputs.length === 0) && (
                        <tr><td colSpan={7} className="p-3 text-center text-gray-400">No products yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Finalize group */}
              {selectedGroup.status === "READY" && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-gray-500">
                    Remaining paddy <span className="font-semibold text-amber-700">{fmtKg(selectedGroup.remainingPaddyKg)} kg</span> will be returned to stock.
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmState({ type: "FINALIZE_GROUP", group: selectedGroup })}
                    disabled={working}
                    className="px-3 py-1.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Finalize Group
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow border p-8 flex items-center justify-center text-gray-500 text-sm">
              Select a paddy source from the list.
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirmState?.type === "COMPLETE_BATCH" && (
        <ConfirmModal
          title="Complete Batch"
          message={`Mark batch ${confirmState.batch.batchNo} as completed? Products can be added once all batches of this source are done.`}
          confirmLabel="Complete"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { handleCompleteBatch(confirmState.batch._id); setConfirmState(null); }}
        />
      )}
      {confirmState?.type === "REOPEN_BATCH" && (
        <ConfirmModal
          title="Reopen Batch"
          message={`Move batch ${confirmState.batch.batchNo} back to in-process? This will set the source group back to In-Process.`}
          confirmLabel="Reopen"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { handleReopenBatch(confirmState.batch._id); setConfirmState(null); }}
        />
      )}
      {confirmState?.type === "DELETE_BATCH" && (
        <ConfirmModal
          title="Delete Batch"
          message={`Delete batch ${confirmState.batch.batchNo}? Its paddy (${fmtKg(confirmState.batch.paddyWeightKg)} kg) will be returned to stock.`}
          confirmLabel="Delete Batch"
          danger
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { handleDeleteBatch(confirmState.batch._id); setConfirmState(null); }}
        />
      )}
      {confirmState?.type === "DELETE_OUTPUT" && (
        <ConfirmModal
          title="Delete Product"
          message={`Remove ${confirmState.output.productTypeName} (${fmtKg(confirmState.output.netWeightKg)} kg) from this source's products? Its stock will be reversed.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { handleDeleteOutput(confirmState.output._id); setConfirmState(null); }}
        />
      )}
      {confirmState?.type === "FINALIZE_GROUP" && (
        <ConfirmModal
          title="Finalize Group"
          message={`Finalize ${confirmState.group.sourceCompanyName}? Remaining paddy (${fmtKg(confirmState.group.remainingPaddyKg)} kg) will be returned to stock.`}
          confirmLabel="Finalize"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { handleFinalizeGroup(); setConfirmState(null); }}
        />
      )}

      {/* Slip modal */}
      {showSlip && printGroup && (
        <GroupSlipModal
          group={printGroup}
          millInfo={millInfo}
          stockInfo={paddyRowFor(printGroup.sourceCompanyName)}
          onClose={() => { setShowSlip(false); setPrintGroup(null); }}
        />
      )}

      {/* Paddy distribution modal */}
      {paddyInfoOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Unprocessed Paddy Distribution</h3>
              <button onClick={() => setPaddyInfoOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="overflow-auto border rounded">
              {paddyDistributionRows.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No paddy stock available.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-amber-50 text-amber-800 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Company</th>
                      <th className="p-2 text-right">Kg</th>
                      <th className="p-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddyDistributionRows.map((r, idx) => {
                      const kg = Number(r.balanceKg || 0);
                      const share = paddyStockKg > 0 ? (kg / paddyStockKg) * 100 : 0;
                      return (
                        <tr key={`${r.companyName}-${idx}`} className="border-t">
                          <td className="p-2">{r.companyName || "-"}</td>
                          <td className="p-2 text-right">{fmtKg(kg)}</td>
                          <td className="p-2 text-right">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Confirm modal ========== */
function ConfirmModal({ title, message, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== Group Slip modal ========== */
function GroupSlipModal({ group, millInfo, stockInfo, onClose }) {
  const statusLabel = {
    OPEN: { text: "IN PROCESS", cls: "bg-amber-100 text-amber-800" },
    READY: { text: "READY", cls: "bg-sky-100 text-sky-800" },
    DONE: { text: "COMPLETED", cls: "bg-emerald-100 text-emerald-800" },
  }[group.status] || { text: group.status || "", cls: "bg-gray-100 text-gray-700" };

  function handlePrint() {
    const printContents = document.getElementById("group-slip-card")?.innerHTML;
    if (!printContents) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Production Slip - ${group.groupNo}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; }
            .card { width: 380px; border-radius: 12px; border: 1px solid #e5e7eb; padding: 16px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 12px; }
            .title { font-size: 16px; font-weight: 700; color: #065f46; }
            .sub { font-size: 11px; color: #6b7280; }
            table { width: 100%; font-size: 11px; border-collapse: collapse; margin-top: 8px; }
            th, td { padding: 4px; border-bottom: 1px solid #e5e7eb; text-align: left; }
            th { background: #ecfdf5; }
            .label { font-size: 11px; color: #6b7280; }
            .value { font-size: 11px; font-weight: 600; color: #111827; }
          </style>
        </head>
        <body>
          <div class="card">${printContents}</div>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold text-emerald-800">Production Slip Preview</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col items-center">
          <div id="group-slip-card" className="w-[380px] border rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              {millInfo.logoUrl && <img src={millInfo.logoUrl} alt="Logo" className="w-10 h-10 object-contain" />}
              <div>
                <div className="text-sm font-bold text-emerald-800 uppercase">{millInfo.name}</div>
                <div className="text-[10px] text-gray-500">{millInfo.address}</div>
              </div>
            </div>
            <div className="border-b mb-2" />
            <div className="flex justify-between text-[11px] mb-1">
              <div>
                <div className="text-gray-500">Source Company</div>
                <div className="font-semibold">{group.sourceCompanyName}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">Group No</div>
                <div className="font-semibold">{group.groupNo}</div>
              </div>
            </div>
            <div className="flex justify-center mb-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusLabel.cls}`}>{statusLabel.text}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px] mb-2">
              <div>
                <div className="text-gray-500">Total (In)</div>
                <div className="font-semibold">{fmtKg(stockInfo?.gatepassInKg || 0)} kg</div>
              </div>
              <div>
                <div className="text-gray-500">Output</div>
                <div className="font-semibold">{fmtKg(group.totalOutputWeightKg)} kg</div>
              </div>
              <div>
                <div className="text-gray-500">Remaining (Stock)</div>
                <div className="font-semibold">{fmtKg(stockInfo?.balanceKg || 0)} kg</div>
              </div>
            </div>
            <div className="text-[11px] font-semibold text-gray-700 mt-1">Products</div>
            <table className="w-full text-[10px] mt-1">
              <thead>
                <tr>
                  <th className="text-left">Product</th>
                  <th className="text-right">Bags</th>
                  <th className="text-right">Net (kg)</th>
                </tr>
              </thead>
              <tbody>
                {(group.outputs || []).map((o, idx) => (
                  <tr key={o._id || idx}>
                    <td>{o.productTypeName}</td>
                    <td className="text-right">{o.numBags}</td>
                    <td className="text-right">{fmtKg(o.netWeightKg)}</td>
                  </tr>
                ))}
                {(!group.outputs || group.outputs.length === 0) && (
                  <tr><td colSpan={3} className="text-center text-gray-400">No products</td></tr>
                )}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between text-[10px] text-gray-500">
              <div>__________________</div>
              <div>__________________</div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500">
              <div>Shift Incharge</div>
              <div>Manager</div>
            </div>
          </div>
          <button onClick={handlePrint} className="mt-4 flex items-center gap-2 px-4 py-2 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-800">
            <Printer size={16} />
            Print Slip
          </button>
        </div>
      </div>
    </div>
  );
}
