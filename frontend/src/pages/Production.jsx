// src/pages/Production.jsx
import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import {
  Factory,
  SunMedium,
  Moon,
  Activity,
  Trash2,
  Plus,
  CheckCircle2,
  Printer,
  X,
  Box,
  Lock,
  Edit2,
} from "lucide-react";
import Pin4Input from "../components/Pin4Input";

const OTHER_OPTION = "__OTHER__";

function todayISODate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Production() {
  const [summary, setSummary] = useState({
    dayShiftOutputWeightKg: 0,
    nightShiftOutputWeightKg: 0,
    totalOutputWeightKg: 0,
    batchCount: 0,
    productWiseOutput: [],
  });
  const [paddyStockKg, setPaddyStockKg] = useState(0);
  const [paddyByCompany, setPaddyByCompany] = useState([]);

  const [activeTab, setActiveTab] = useState("IN_PROCESS");
  const [inProcessBatches, setInProcessBatches] = useState([]);
  const [completedBatches, setCompletedBatches] = useState([]);
  const [doneBatches, setDoneBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);

  const [products, setProducts] = useState([]);

  const [creating, setCreating] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [working, setWorking] = useState(false);
  const [savingBatchInfo, setSavingBatchInfo] = useState(false);

  const [batchForm, setBatchForm] = useState({
    date: todayISODate(),
    sourceCompanyName: "",
    paddyWeightKg: "",
    remarks: "",
  });

  const [editBatchForm, setEditBatchForm] = useState({
    date: "",
    sourceCompanyName: "",
    paddyWeightKg: "",
    remarks: "",
  });

  const [outputForm, setOutputForm] = useState({
    productTypeId: "",
    productMode: "list",
    productInput: "",
    numBags: "",
    perBagWeightKg: "",
    netWeightKg: "",
    durationMinutes: "0",
    durationUnit: "min",
  });

  // Delete completed batch confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // Error dialog (no toast/console)
  const [errorDialog, setErrorDialog] = useState({ open: false, message: "" });
  // Admin PIN for editing completed batch
  const [pinDialog, setPinDialog] = useState({ open: false, pin: "", purpose: "", onSuccess: null, pinError: "" });
  const [completedBatchUnlocked, setCompletedBatchUnlocked] = useState(false);
  const [lastEnteredPin, setLastEnteredPin] = useState("");
  const [editingOutputId, setEditingOutputId] = useState(null);
  const [editOutputForm, setEditOutputForm] = useState({ numBags: "", perBagWeightKg: "", durationMinutes: "0", productTypeId: "" });
  const [savingOutputId, setSavingOutputId] = useState(null);
  const [editingBatchInfo, setEditingBatchInfo] = useState(false);
  const [settings, setSettings] = useState({
    defaultBagWeightKg: 65,
    adminPin: "0000",
    additionalStockSettingsEnabled: false,
  });
  const [zeroPaddyConfirm, setZeroPaddyConfirm] = useState(false);
  const [zeroPaddyPin, setZeroPaddyPin] = useState("");
  const [zeroingPaddy, setZeroingPaddy] = useState(false);

  // Slip preview (Print opens with this batch)
  const [printBatch, setPrintBatch] = useState(null);
  const [showSlip, setShowSlip] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [markCompleteConfirmOpen, setMarkCompleteConfirmOpen] = useState(false);
  const [deleteInProcessConfirmOpen, setDeleteInProcessConfirmOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [returnedRemainingBatches, setReturnedRemainingBatches] = useState(() => new Set());
  const detailSectionRef = useRef(null);
  const [millInfo, setMillInfo] = useState({
    name: "SMJ Rice Mill",
    address: "Mirza Virkan Road, Sheikhupura",
    phone: "",
    email: "",
    logoUrl: "",
  });

  useEffect(() => {
    loadSummary();
    loadPaddyStock();
    loadMeta();
    loadBatches();
    loadMillInfo();
  }, []);

  const paddyCompanyOptions = Array.from(
    new Set((paddyByCompany || []).map((r) => r.companyName).filter(Boolean))
  ).sort();
  const paddyBrandOptions = Array.from(
    new Set(
      (paddyByCompany || [])
        .filter((r) => Number(r.balanceKg || 0) > 0)
        .map((r) => r.companyName)
        .filter(Boolean)
    )
  ).sort();
  const selectedSourcePaddyKg = Number(
    paddyByCompany.find((r) => r.companyName === batchForm.sourceCompanyName)
      ?.balanceKg || 0
  );
  const ownBrandName = String(millInfo.name || "SMJ").trim();
  const isOwnedBatch =
    selectedBatch?.sourceCompanyName &&
    String(selectedBatch.sourceCompanyName).trim().toLowerCase() ===
      ownBrandName.toLowerCase();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (pinDialog.open) setPinDialog((p) => ({ ...p, open: false, pin: "", purpose: "", onSuccess: null, pinError: "" }));
        else if (errorDialog.open) setErrorDialog({ open: false, message: "" });
        else if (deleteConfirmOpen) { setDeleteConfirmOpen(false); setDeleteConfirmInput(""); }
        else if (completeConfirmOpen) setCompleteConfirmOpen(false);
        else if (showSlip) { setShowSlip(false); setPrintBatch(null); }
        else if (zeroPaddyConfirm) { setZeroPaddyConfirm(false); setZeroPaddyPin(""); }
      } else if (e.key === "Enter") {
        if (completeConfirmOpen && selectedBatch) { e.preventDefault(); handleCompleteBatch(); }
        else if (deleteInProcessConfirmOpen && selectedBatch) { e.preventDefault(); doDeleteBatch(true); setDeleteInProcessConfirmOpen(false); }
        else if (errorDialog.open) { e.preventDefault(); setErrorDialog({ open: false, message: "" }); }
        else if (deleteConfirmOpen && selectedBatch && deleteConfirmInput.trim() === (selectedBatch.batchNo || "")) { e.preventDefault(); doDeleteBatch(true); }
        else if (pinDialog.open && pinDialog.pin.length === 4) {
          e.preventDefault();
          const entered = pinDialog.pin;
          const expected = settings.adminPin || "0000";
          if (entered === expected) {
            if (pinDialog.onSuccess) pinDialog.onSuccess();
            else setCompletedBatchUnlocked(true);
            setPinDialog({ open: false, pin: "", purpose: "", onSuccess: null, pinError: "" });
          } else {
            setPinDialog((p) => ({ ...p, pinError: "Incorrect PIN." }));
          }
        } else if (zeroPaddyConfirm && zeroPaddyPin.length === 4) {
          e.preventDefault();
          handleZeroPaddyStock();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinDialog.open, pinDialog.pin, pinDialog.onSuccess, errorDialog.open, deleteConfirmOpen, deleteConfirmInput, deleteInProcessConfirmOpen, completeConfirmOpen, showSlip, zeroPaddyConfirm, zeroPaddyPin.length, selectedBatch, settings.adminPin]);

  async function loadPaddyStock() {
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
        }));
      setPaddyByCompany(paddyRows);
      const paddyTotal = paddyRows.reduce(
        (sum, r) => sum + (Number(r.balanceKg) || 0),
        0
      );
      setPaddyStockKg(paddyTotal);
    } catch {
      setPaddyByCompany([]);
      setPaddyStockKg(0);
    }
  }

  // Default perBagWeightKg from settings when empty
  useEffect(() => {
    if (
      (outputForm.perBagWeightKg === "" || outputForm.perBagWeightKg == null) &&
      settings.defaultBagWeightKg
    ) {
      setOutputForm((f) => ({
        ...f,
        perBagWeightKg: String(settings.defaultBagWeightKg),
      }));
    }
  }, [settings.defaultBagWeightKg]);

  // Auto net weight = bags * perBagWeightKg (integer)
  useEffect(() => {
    const bags = Math.floor(Number(outputForm.numBags)) || 0;
    const perBag = Math.floor(Number(outputForm.perBagWeightKg)) || 0;
    const net = bags * perBag;
    setOutputForm((f) => ({
      ...f,
      netWeightKg: net ? String(net) : "",
    }));
  }, [outputForm.numBags, outputForm.perBagWeightKg]);

  useEffect(() => {
    const product = products.find((p) => p._id === outputForm.productTypeId);
    if (product?.conversionFactors?.Bag) {
      setOutputForm((f) => ({
        ...f,
        perBagWeightKg: String(Math.floor(Number(product.conversionFactors.Bag)) || ""),
      }));
    } else if (!outputForm.productTypeId) {
      setOutputForm((f) => ({ ...f, perBagWeightKg: "" }));
    }
  }, [outputForm.productTypeId, products]);

  async function loadMillInfo() {
    try {
      const res = await api.get("/settings");
      const data = res.data?.data || {};
      const general = data.general || data.generalSettings || data;
      const printing = data.printing || data.printingSettings || {};
      setSettings((prev) => ({
        ...prev,
        defaultBagWeightKg: data.defaultBagWeightKg ?? 65,
        adminPin: data.adminPin ?? "0000",
        additionalStockSettingsEnabled: !!data.additionalStockSettingsEnabled,
      }));
      setMillInfo((prev) => ({
        ...prev,
        name: general.companyName || general.millName || prev.name,
        address: general.address || general.fullAddress || prev.address,
        phone: general.phone || "",
        email: general.email || "",
        logoUrl: data.logoUrl || printing.logoPath || "",
      }));
    } catch {
      // silent if settings missing
    }
  }

  async function loadSummary() {
    try {
      setLoadingSummary(true);
      const res = await api.get("/production/summary/today");
      if (res.data?.success) {
        setSummary(res.data.data || summary);
      }
    } catch {
      setErrorDialog({ open: true, message: "Failed to load production summary." });
    }
    setLoadingSummary(false);
  }

  async function loadMeta() {
    try {
      const [pRes] = await Promise.all([api.get("/product-types")]);
      setProducts(pRes.data.data || []);
    } catch {
      setErrorDialog({ open: true, message: "Failed to load company name/product master data." });
    }
  }

  async function loadBatches() {
    try {
      setLoadingBatches(true);
      const [inRes, completedRes] = await Promise.all([
        api.get("/production/batches", {
          params: { status: "IN_PROCESS", limit: 50 },
        }),
        api.get("/production/batches", {
          params: { status: "COMPLETED", limit: 50 },
        }),
      ]);

      const inList = inRes.data.data || [];
      const compList = completedRes.data.data || [];
      const doneList = compList.filter((b) => b.batchDone);
      const remainingCompleted = compList.filter((b) => !b.batchDone);

      setInProcessBatches(inList);
      setCompletedBatches(remainingCompleted);
      setDoneBatches(doneList);

      if (!selectedBatchId) {
        const firstIn = inList[0];
        const firstCompleted = remainingCompleted[0];
        const firstDone = doneList[0];
        const first = firstIn || firstCompleted || firstDone;
        if (first) {
          const tab = firstIn
            ? "IN_PROCESS"
            : firstCompleted
            ? "COMPLETED"
            : "DONE";
          selectBatch(first._id, tab);
        }
      }
    } catch {
      setErrorDialog({ open: true, message: "Failed to load batches." });
    }
    setLoadingBatches(false);
  }

  async function selectBatch(id, tabOverride) {
    setCompletedBatchUnlocked(false);
    setLastEnteredPin("");
    setEditingOutputId(null);
    setEditingBatchInfo(false);
    setFieldErrors({});
    try {
      const res = await api.get(`/production/batches/${id}`);
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: "Failed to load batch details." });
        return;
      }
      const b = res.data.data;
      setSelectedBatchId(id);
      setSelectedBatch(b);
      if (tabOverride) setActiveTab(tabOverride);

      setEditBatchForm({
        date: b.date
          ? new Date(b.date).toISOString().slice(0, 10)
          : todayISODate(),
        sourceCompanyName: b.sourceCompanyName || "",
        paddyWeightKg: b.paddyWeightKg != null ? String(Math.floor(b.paddyWeightKg)) : "",
        remarks: b.remarks || "",
      });
      setTimeout(() => detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    } catch {
      setErrorDialog({ open: true, message: "Failed to load batch details." });
    }
  }

  async function handleCreateBatch() {
    const err = {};
    if (paddyStockKg <= 0 || paddyByCompany.length === 0) {
      err.paddyStock = "No paddy in stock. Add paddy via Gate Pass Inward first.";
    }
    if (!batchForm.sourceCompanyName) err.sourceCompanyName = "Select source company.";
    if (!batchForm.date) err.date = "Select batch date.";
    if (!batchForm.paddyWeightKg) err.paddyWeightKg = "Enter paddy weight (kg).";
    else {
      const reqKg = Math.floor(Number(batchForm.paddyWeightKg));
      if (reqKg > selectedSourcePaddyKg) {
        err.paddyWeightKg = `Exceeds available stock for ${batchForm.sourceCompanyName} (${Math.round(selectedSourcePaddyKg)} kg).`;
      }
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setFieldErrors((e) => ({ ...e, sourceCompanyName: "", date: "", paddyWeightKg: "", paddyStock: "" }));

    setCreating(true);
    try {
      const res = await api.post("/production/batches", {
        date: batchForm.date,
        sourceCompanyName: batchForm.sourceCompanyName,
        paddyWeightKg: Math.floor(Number(batchForm.paddyWeightKg)),
        remarks: batchForm.remarks,
      });
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to create batch." });
      } else {
        setBatchForm({
          date: todayISODate(),
          sourceCompanyName: "",
          paddyWeightKg: "",
          remarks: "",
        });
        await loadBatches();
        await selectBatch(res.data.data._id, "IN_PROCESS");
        await loadSummary();
        await loadPaddyStock();
      }
    } catch (err) {
      setErrorDialog({
        open: true,
        message: err.response?.data?.message || err.message || "Failed to create batch.",
      });
    }
    setCreating(false);
  }

  // Integer only (no decimals) for weight/bags
  function intClean(v) {
    const s = String(v).replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    return s;
  }

  const normalizeText = (value) =>
    String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

  const sanitizeBrandText = (value, max = 100) =>
    String(value || "")
      .replace(/[^a-zA-Z0-9\s.,&()\-]/g, "")
      .slice(0, max);

  const toTitleCase = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const addProductByName = async (rawName) => {
    const name = toTitleCase(String(rawName || ""));
    if (!name) {
      setFieldErrors((e) => ({ ...e, outputProduct: "Enter product name." }));
      return;
    }
    const existing = (products || []).find(
      (p) => normalizeText(p.name) === normalizeText(name)
    );
    if (existing) {
      setOutputForm((f) => ({
        ...f,
        productTypeId: existing._id,
        productMode: "list",
        productInput: "",
      }));
      setFieldErrors((e) => ({ ...e, outputProduct: "" }));
      return;
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
      setOutputForm((f) => ({
        ...f,
        productTypeId: created._id || "",
        productMode: "list",
        productInput: "",
      }));
      setFieldErrors((e) => ({ ...e, outputProduct: "" }));
    } catch {
      setFieldErrors((e) => ({ ...e, outputProduct: "Failed to add product." }));
    }
  };

  async function handleSaveBatchInfo() {
    if (!selectedBatchId || !selectedBatch) return;
    const batchPaddy = Number(selectedBatch.paddyWeightKg ?? selectedBatch.totalRawWeightKg) || 0;
    const availableForSource =
      Number(
        paddyByCompany.find(
          (r) => r.companyName === selectedBatch.sourceCompanyName
        )?.balanceKg || 0
      ) + batchPaddy;
    const err = {};
    if (!editBatchForm.paddyWeightKg) err.editPaddyWeightKg = "Enter paddy weight (kg).";
    else {
      const reqKg = Math.floor(Number(editBatchForm.paddyWeightKg));
      if (reqKg > availableForSource) {
        err.editPaddyWeightKg = `Exceeds available stock for ${selectedBatch.sourceCompanyName || "selected source"} (${Math.round(availableForSource)} kg).`;
      }
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setFieldErrors((e) => ({ ...e, editPaddyWeightKg: "" }));

    setSavingBatchInfo(true);
    try {
      const payload = {
        date: editBatchForm.date,
        paddyWeightKg: Math.floor(Number(editBatchForm.paddyWeightKg)),
        remarks: editBatchForm.remarks,
      };
      if (selectedBatch.status === "COMPLETED") {
        payload.adminPin = settings.adminPin || "0000";
      }
      const res = await api.put(
        `/production/batches/${selectedBatchId}`,
        payload
      );
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to update batch." });
      } else {
        setSelectedBatch(res.data.data);
        await loadBatches();
        await loadSummary();
        await loadPaddyStock();
        setEditingBatchInfo(false);
      }
    } catch {
      setErrorDialog({ open: true, message: "Failed to update batch." });
    }
    setSavingBatchInfo(false);
  }

  async function handleAddOutput() {
    if (!selectedBatchId || !selectedBatch) return;
    const err = {};
    if (!outputForm.productTypeId) err.outputProduct = "Select product.";
    if (!outputForm.numBags) err.outputBags = "Enter bags.";
    if (!outputForm.perBagWeightKg) err.outputPerBag = "Select product to fetch bag weight.";
    const currentOutputsTotal = (selectedBatch.outputs || []).reduce(
      (sum, o) => sum + (o.netWeightKg || 0),
      0
    );
    const newNet =
      (Number(outputForm.numBags) || 0) *
      (Number(outputForm.perBagWeightKg) || 0);
    const newTotal = currentOutputsTotal + newNet;
    if (newTotal > (selectedBatch.paddyWeightKg || 0)) {
      const remainingKg = Math.max(
        0,
        (selectedBatch.paddyWeightKg || 0) - currentOutputsTotal
      );
      const perBag = Number(outputForm.perBagWeightKg) || 0;
      const maxBags = perBag ? Math.floor(remainingKg / perBag) : 0;
      err.outputTotal = perBag
        ? `Maximum: ${maxBags} bags (${Math.round(remainingKg)} kg).`
        : `Maximum: ${Math.round(remainingKg)} kg.`;
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setFieldErrors((e) => ({
      ...e,
      outputProduct: "",
      outputBags: "",
      outputPerBag: "",
      outputTotal: "",
    }));

    const product = products.find((p) => p._id === outputForm.productTypeId);

    const payload = {
      productTypeId: outputForm.productTypeId,
      productTypeName: product?.name || "",
      numBags: Number(outputForm.numBags),
      perBagWeightKg: Number(outputForm.perBagWeightKg),
      durationMinutes: 0,
    };
    if (selectedBatch.status === "COMPLETED" && completedBatchUnlocked) {
      payload.adminPin = lastEnteredPin || settings.adminPin || "0000";
    }

    setWorking(true);
    try {
      const res = await api.post(
        `/production/batches/${selectedBatchId}/outputs`,
        payload
      );
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to add output." });
      } else {
        setSelectedBatch(res.data.data);
        setOutputForm({
          productTypeId: "",
          numBags: "",
          perBagWeightKg: settings.defaultBagWeightKg ? String(settings.defaultBagWeightKg) : "",
          netWeightKg: "",
          durationMinutes: "0",
          durationUnit: "min",
        });
        // keep output form visible
        await loadSummary();
        await loadBatches();
      }
    } catch {
      setErrorDialog({ open: true, message: "Failed to add output." });
    }
    setWorking(false);
  }

  async function handleSaveOutput(outputId) {
    if (!selectedBatchId || !selectedBatch) return;
    const o = (selectedBatch.outputs || []).find((out) => out._id === outputId);
    if (!o) return;
    const err = {};
    const numBags = Math.floor(Number(editOutputForm.numBags)) || 0;
    const perBag = Math.floor(Number(editOutputForm.perBagWeightKg)) || 0;
    const newNet = numBags * perBag;
    const otherTotal = (selectedBatch.outputs || [])
      .filter((out) => out._id !== outputId)
      .reduce((sum, out) => sum + (Number(out.netWeightKg) || 0), 0);
    if (newNet + otherTotal > (selectedBatch.paddyWeightKg || 0)) {
      const excessKg = newNet + otherTotal - (selectedBatch.paddyWeightKg || 0);
      const excessBags = perBag ? Math.ceil(excessKg / perBag) : 0;
      err.editOutputTotal = perBag
        ? `Exceeds by approx ${excessBags} bags (${Math.round(excessKg)} kg).`
        : `Exceeds by ${Math.round(excessKg)} kg.`;
    }
    if (Object.keys(err).length) {
      setFieldErrors((e) => ({ ...e, ...err }));
      return;
    }
    setSavingOutputId(outputId);
    try {
      const product = products.find((p) => p._id === editOutputForm.productTypeId);
      const res = await api.patch(
        `/production/batches/${selectedBatchId}/outputs/${outputId}`,
        {
          productTypeId: editOutputForm.productTypeId || o.productTypeId,
          productTypeName: product?.name || o.productTypeName,
          numBags,
          perBagWeightKg: perBag,
          durationMinutes: Number(editOutputForm.durationMinutes || 0),
        }
      );
      if (res.data?.success) {
        setSelectedBatch(res.data.data);
        setEditingOutputId(null);
      } else {
        setFieldErrors((e) => ({ ...e, editOutputTotal: res.data?.message || "Failed to update output." }));
      }
    } catch (errRes) {
      setFieldErrors((e) => ({ ...e, editOutputTotal: errRes.response?.data?.message || "Failed to update output." }));
    }
    setSavingOutputId(null);
  }

  function openCompleteConfirm() {
    if (!selectedBatchId || !selectedBatch) return;
    if ((selectedBatch.outputs || []).length === 0) {
      setFieldErrors((e) => ({ ...e, completeBatch: "Add at least one output before completing." }));
      return;
    }
    const allDone = (selectedBatch.outputs || []).every(
      (o) => (o.status || "COMPLETED") === "COMPLETED",
    );
    if (!allDone) {
      setFieldErrors((e) => ({ ...e, completeBatch: "Wait for all scheduled outputs to complete." }));
      return;
    }
    setFieldErrors((e) => ({ ...e, completeBatch: "" }));
    setCompleteConfirmOpen(true);
  }

  async function handleMarkBatchCompleted() {
    setMarkCompleteConfirmOpen(false);
    if (!selectedBatchId || !selectedBatch) return;
    setWorking(true);
    try {
      const res = await api.post(`/production/batches/${selectedBatchId}/complete`);
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to complete batch." });
        setWorking(false);
        return;
      }
      setSelectedBatch(res.data.data);
      await loadSummary();
      await loadBatches();
      await loadPaddyStock();
    } catch (e) {
      setErrorDialog({
        open: true,
        message: e?.response?.data?.message || "Failed to complete batch.",
      });
    }
    setWorking(false);
  }

  async function handleCompleteBatch() {
    setCompleteConfirmOpen(false);
    if (!selectedBatchId || !selectedBatch) return;
    setWorking(true);
    try {
      let batchUpdated = selectedBatch;
      if (selectedBatch.status !== "COMPLETED") {
        const res = await api.post(`/production/batches/${selectedBatchId}/complete`);
        if (!res.data?.success) {
          setErrorDialog({ open: true, message: res.data?.message || "Failed to complete batch." });
          setWorking(false);
          return;
        }
        batchUpdated = res.data.data;
      }
      try {
        const remRes = await api.post(`/production/batches/${selectedBatchId}/remaining-paddy/decision`, {
          decision: "RETURN_TO_STOCK",
        });
        if (remRes?.data?.success === false) {
          setErrorDialog({
            open: true,
            message: remRes.data?.message || "Failed to return remaining paddy.",
          });
        }
      } catch (e) {
        setErrorDialog({
          open: true,
          message: e?.response?.data?.message || "Failed to return remaining paddy.",
        });
      }
      setReturnedRemainingBatches((prev) => {
        const next = new Set(prev);
        next.add(selectedBatchId);
        return next;
      });
      setSelectedBatch((prev) =>
        prev ? { ...batchUpdated, batchDone: true } : { ...batchUpdated, batchDone: true }
      );
      await loadSummary();
      await loadBatches();
      await loadPaddyStock();
      setActiveTab("DONE");
    } catch {
      setErrorDialog({ open: true, message: "Failed to finalize batch." });
    }
    setWorking(false);
  }

  async function doDeleteBatch(skipConfirm = false) {
    if (!selectedBatchId || !selectedBatch) {
      setErrorDialog({ open: true, message: "Select a batch first." });
      return;
    }

    const isCompleted = selectedBatch.status === "COMPLETED";
    if (!skipConfirm && !isCompleted) {
      setDeleteInProcessConfirmOpen(true);
      return;
    }

    setWorking(true);
    try {
      const res = await api.delete(`/production/batches/${selectedBatchId}`);
      if (!res.data?.success) {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to delete batch." });
      } else {
        setSelectedBatchId(null);
        setSelectedBatch(null);
        setDeleteConfirmOpen(false);
        setDeleteConfirmInput("");
        setDeleteInProcessConfirmOpen(false);
        await loadSummary();
        await loadPaddyStock();
        await loadBatches();
      }
    } catch {
      setErrorDialog({ open: true, message: "Failed to delete batch." });
    }
    setWorking(false);
  }

  function handleDeleteBatch() {
    doDeleteBatch(false);
  }

  async function handleZeroPaddyStock() {
    if (!zeroPaddyPin.trim()) {
      setErrorDialog({ open: true, message: "Enter admin PIN." });
      return;
    }
    setZeroingPaddy(true);
    try {
      const res = await api.post("/stock/zero-paddy", { adminPin: zeroPaddyPin.trim() });
      if (res.data?.success) {
        setZeroPaddyConfirm(false);
        setZeroPaddyPin("");
        await loadPaddyStock();
      } else {
        setErrorDialog({ open: true, message: res.data?.message || "Failed to zero paddy stock." });
      }
    } catch (err) {
      setErrorDialog({
        open: true,
        message: err.response?.data?.message || err.message || "Failed to zero paddy stock.",
      });
    } finally {
      setZeroingPaddy(false);
    }
  }

  const currentBatchList =
    activeTab === "IN_PROCESS"
      ? inProcessBatches
      : activeTab === "COMPLETED"
      ? completedBatches
      : doneBatches;

  useEffect(() => {
    const list = currentBatchList;
    if (!list || list.length === 0) return;
    const stillVisible = selectedBatchId && list.some((b) => b._id === selectedBatchId);
    if (!stillVisible) {
      selectBatch(list[0]._id, activeTab);
    }
  }, [activeTab, currentBatchList, selectedBatchId]);

  const paddyExceedNew =
    Number(batchForm.paddyWeightKg) > selectedSourcePaddyKg && batchForm.paddyWeightKg !== "";
  const batchPaddyForEdit = selectedBatch ? (Number(selectedBatch.paddyWeightKg ?? selectedBatch.totalRawWeightKg) || 0) : 0;
  const maxEditablePaddyKg =
    (selectedBatch
      ? Number(
          paddyByCompany.find(
            (r) => r.companyName === selectedBatch.sourceCompanyName
          )?.balanceKg || 0
        )
      : 0) + batchPaddyForEdit;
  const paddyExceedEdit =
    editBatchForm.paddyWeightKg !== "" && Number(editBatchForm.paddyWeightKg) > maxEditablePaddyKg;

  const remainingPaddy = (() => {
    if (!selectedBatch || selectedBatch.paddyWeightKg == null) return 0;
    if (selectedBatch.batchDone || returnedRemainingBatches.has(selectedBatch._id)) return 0;
    const plannedOut = (selectedBatch.outputs || []).reduce(
      (sum, o) => sum + (Number(o.netWeightKg) || 0),
      0,
    );
    return Math.max(0, (selectedBatch.paddyWeightKg || 0) - plannedOut);
  })();

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Paddy Stock */}
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-amber-400">
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-gray-500">Unprocessed Paddy Stock</div>
              <div className="text-xl font-bold text-amber-800">
                {typeof paddyStockKg === "number" ? Math.round(paddyStockKg) : "0"} kg
              </div>
              {settings.additionalStockSettingsEnabled && (
                <button
                  type="button"
                  onClick={() => setZeroPaddyConfirm(true)}
                  className="mt-2 text-xs text-amber-700 hover:text-amber-800 underline"
                >
                  Set paddy stock to zero
                </button>
              )}
            </div>
            <div className="bg-amber-100 p-2 rounded-full">
              <Box className="text-amber-700" size={18} />
            </div>
          </div>
        </div>

        {/* 2. Day / Night Shift Production */}
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-emerald-400">
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-gray-500">Day / Night Shift (Today)</div>
              <div className="text-sm font-bold text-emerald-800">
                Day {Math.round(Number(summary.dayShiftOutputWeightKg || 0))} kg
              </div>
              <div className="text-sm font-bold text-sky-700">
                Night {Math.round(Number(summary.nightShiftOutputWeightKg || 0))} kg
              </div>
            </div>
            <div className="flex gap-1">
              <div className="bg-emerald-100 p-2 rounded-full">
                <SunMedium className="text-emerald-700" size={16} />
              </div>
              <div className="bg-sky-100 p-2 rounded-full">
                <Moon className="text-sky-700" size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Batches Today */}
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-violet-200">
          <div className="flex justify-between">
            <div>
              <div className="text-xs text-gray-500">Batches Today</div>
              <div className="text-xl font-bold text-violet-800">
                {summary.batchCount ?? 0}
              </div>
            </div>
            <div className="bg-violet-100 p-2 rounded-full">
              <Factory className="text-violet-700" size={18} />
            </div>
          </div>
        </div>

        {/* 4. Output Product-wise */}
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-teal-300">
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500 mb-1">Output Today (Product-wise)</div>
              <div className="text-xs font-medium text-teal-800 space-y-0.5 max-h-14 overflow-y-auto">
                {(summary.productWiseOutput || []).length > 0 ? (
                  (summary.productWiseOutput || []).map((p) => (
                    <div key={p.productTypeName}>
                      {p.productTypeName}: {Math.round(Number(p.totalKg || 0))} kg
                    </div>
                  ))
                ) : (
                  <span className="text-gray-400">No output yet</span>
                )}
              </div>
            </div>
            <div className="bg-teal-100 p-2 rounded-full shrink-0">
              <Activity className="text-teal-700" size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Batch list (left) + Detail placeholder (right) 50-50 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left: In-Process / Completed list */}
        <div className="bg-white rounded-xl shadow border flex flex-col min-h-[400px] order-1 lg:order-1">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <button
                onClick={() => setActiveTab("IN_PROCESS")}
                className={`pb-1 ${
                  activeTab === "IN_PROCESS"
                    ? "text-emerald-700 font-semibold border-b-2 border-emerald-700"
                    : "text-gray-500"
                }`}
              >
                In-Process ({inProcessBatches.length})
              </button>
              <button
                onClick={() => setActiveTab("COMPLETED")}
                className={`pb-1 ${
                  activeTab === "COMPLETED"
                    ? "text-emerald-700 font-semibold border-b-2 border-emerald-700"
                    : "text-gray-500"
                }`}
              >
                Completed ({completedBatches.length})
              </button>
              <button
                onClick={() => setActiveTab("DONE")}
                className={`pb-1 ${
                  activeTab === "DONE"
                    ? "text-emerald-700 font-semibold border-b-2 border-emerald-700"
                    : "text-gray-500"
                }`}
              >
                Batch Done ({doneBatches.length})
              </button>
            </div>
          </div>

          {/* Quick create: Date, Paddy (kg), New Batch â€” Enter to create */}
          <div className="p-3 border-b bg-gray-50 grid grid-cols-4 gap-2 text-xs items-start">
            <div>
              <select
                value={batchForm.sourceCompanyName}
                onChange={(e) =>
                  setBatchForm((f) => ({ ...f, sourceCompanyName: e.target.value }))
                }
                className={`border rounded px-2 py-1 w-full ${fieldErrors.sourceCompanyName ? "border-red-500 bg-red-50" : ""}`}
              >
                <option value="">Select paddy source company name</option>
                {batchForm.sourceCompanyName &&
                  !paddyCompanyOptions.includes(batchForm.sourceCompanyName) && (
                    <option value={batchForm.sourceCompanyName}>
                      {batchForm.sourceCompanyName}
                    </option>
                  )}
                {paddyBrandOptions.map((name, idx) => (
                  <option key={`${name}-${idx}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {fieldErrors.sourceCompanyName && (
                <p className="text-[10px] text-red-600 mt-0.5">{fieldErrors.sourceCompanyName}</p>
              )}
            </div>
            <div>
              <input
                type="date"
                value={batchForm.date}
                onChange={(e) =>
                  setBatchForm((f) => ({ ...f, date: e.target.value }))
                }
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBatch(); } }}
                className="border rounded px-2 py-1 w-full"
              />
            </div>
            <div>
              <input
                type="number"
                value={batchForm.paddyWeightKg}
                onChange={(e) =>
                  setBatchForm((f) => ({
                    ...f,
                    paddyWeightKg: intClean(e.target.value),
                  }))
                }
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBatch(); } }}
                placeholder="Paddy (kg)"
                className={`border rounded px-2 py-1 w-full ${paddyExceedNew ? "border-red-500 bg-red-50" : ""}`}
              />
              {batchForm.sourceCompanyName && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Available unprocessed: {Math.round(selectedSourcePaddyKg)} kg
                </p>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={handleCreateBatch}
                disabled={creating || paddyStockKg <= 0}
                title={paddyStockKg <= 0 ? "No paddy in stock. Add paddy via Gate Pass Inward." : "Create new batch"}
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                {creating ? "Creating..." : "New Batch"}
              </button>
            </div>
          </div>

          {/* Batch list */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E6F9F0] text-emerald-800">
                <tr>
                  <th className="p-2 text-left">Batch No</th>
                  <th className="p-2 text-left">Source Company</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-right">Paddy (kg)</th>
                  <th className="p-2 text-right">Output (kg)</th>
                  <th className="p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentBatchList.map((b, idx) => (
                  <tr
                    key={b._id}
                    className={`cursor-pointer ${
                      selectedBatchId === b._id
                        ? "bg-emerald-50"
                        : idx % 2
                        ? "bg-white"
                        : "bg-gray-50"
                    }`}
                    onClick={() => selectBatch(b._id, activeTab)}
                  >
                    <td className="p-2">{b.batchNo}</td>
                    <td className="p-2">{b.sourceCompanyName || "-"}</td>
                    <td className="p-2">
                      {new Date(b.date).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-right">
                      {Math.round(Number(b.totalRawWeightKg) || 0)}
                    </td>
                    <td className="p-2 text-right">
                      {Math.round(Number(b.totalOutputWeightKg) || 0)}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBatchId(b._id);
                            setSelectedBatch(b);
                            if (b.status === "COMPLETED") {
                              setPinDialog({
                                open: true,
                                pin: "",
                                purpose: "Delete completed batch (requires PIN)",
                                pinError: "",
                                onSuccess: () => {
                                  setDeleteConfirmOpen(true);
                                  setDeleteConfirmInput("");
                                },
                              });
                            } else {
                              setSelectedBatchId(b._id);
                              setSelectedBatch(b);
                              setDeleteInProcessConfirmOpen(true);
                            }
                          }}
                          className="p-1.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                        {b.status === "COMPLETED" && !b.batchDone && (() => {
                          const remainingKg = Math.max(
                            0,
                            Math.round(Number(b.totalRawWeightKg || 0) - Number(b.totalOutputWeightKg || 0))
                          );
                          const disabled = remainingKg <= 65;
                          return (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (disabled) return;
                              setSelectedBatchId(b._id);
                              setSelectedBatch(b);
                              setPinDialog({
                                open: true,
                                pin: "",
                                purpose: "Reopen completed batch (requires PIN)",
                                pinError: "",
                                onSuccess: async () => {
                                  try {
                                    const res = await api.post(`/production/batches/${b._id}/reopen`);
                                    if (!res.data?.success) {
                                      setErrorDialog({ open: true, message: res.data?.message || "Failed to reopen batch." });
                                      return;
                                    }
                                    setSelectedBatch(res.data.data);
                                    await loadSummary();
                                    await loadBatches();
                                    await loadPaddyStock();
                                    setActiveTab("IN_PROCESS");
                                  } catch (err) {
                                    setErrorDialog({
                                      open: true,
                                      message: err?.response?.data?.message || "Failed to reopen batch.",
                                    });
                                  }
                                },
                              });
                            }}
                            className={`p-1.5 rounded border ${
                              disabled
                                ? "border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed"
                                : "border-amber-200 text-amber-700 hover:bg-amber-50"
                            }`}
                            title={
                              disabled
                                ? "Remaining paddy must be more than 65 kg"
                                : "Reopen (edit)"
                            }
                          >
                            <Edit2 size={14} />
                          </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await api.get(`/production/batches/${b._id}`);
                              if (res.data?.success) {
                                setPrintBatch(res.data.data);
                                setShowSlip(true);
                              } else {
                                setErrorDialog({ open: true, message: "Failed to load batch for print." });
                              }
                            } catch {
                              setErrorDialog({ open: true, message: "Failed to load batch for print." });
                            }
                          }}
                          className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                          title="Print"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {currentBatchList.length === 0 && (
                  <tr>
                    <td className="p-3 text-center text-gray-500" colSpan={6}>
                      {loadingBatches
                        ? "Loading batches..."
                        : "No batches found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Selected batch detail placeholder (completed batch + Add Output) */}
        <div ref={detailSectionRef} className="min-h-[400px] flex flex-col order-2 lg:order-2">
          {selectedBatch ? (
        <div className="bg-white rounded-xl shadow border p-4 space-y-4 flex-1 overflow-y-auto relative">
          <div className="absolute top-3 right-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            Remaining: {Math.round(remainingPaddy)} kg
          </div>
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="text-sm text-gray-500">Selected Batch</div>
              <div className="text-lg font-semibold text-emerald-800">{selectedBatch.batchNo}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                Status:{" "}
                {selectedBatch.status === "IN_PROCESS" ? (
                  <span className="text-yellow-600 font-semibold">In Process</span>
                ) : selectedBatch.batchDone ? (
                  <span className="text-gray-600 font-semibold">Batch Done</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Completed</span>
                )}
              </div>
            </div>
          </div>

          {/* Batch info (open only when user clicks Edit from the batch table) */}
          {editingBatchInfo ? (
            <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-5 gap-3 text-xs items-end">
              <div>
                <label className="block text-[11px] text-gray-500">Source Company</label>
                <input
                  type="text"
                  value={editBatchForm.sourceCompanyName}
                  readOnly
                  className="border rounded px-2 py-1 w-full bg-gray-100 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500">Batch Date</label>
                <input
                  type="date"
                  value={editBatchForm.date}
                  onChange={(e) =>
                    setEditBatchForm((f) => ({ ...f, date: e.target.value }))
                  }
                  onKeyDown={(e) => { if (e.key === "Enter" && (selectedBatch.status === "IN_PROCESS" || completedBatchUnlocked)) { e.preventDefault(); handleSaveBatchInfo(); } }}
                  readOnly={selectedBatch.status === "COMPLETED" && !completedBatchUnlocked}
                  className={`border rounded px-2 py-1 w-full ${selectedBatch.status === "COMPLETED" && !completedBatchUnlocked ? "bg-gray-100 cursor-not-allowed" : ""}`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500">Paddy Weight (kg)</label>
                <input
                  type="number"
                  value={editBatchForm.paddyWeightKg}
                  onChange={(e) => {
                    setEditBatchForm((f) => ({ ...f, paddyWeightKg: intClean(e.target.value) }));
                    setFieldErrors((e) => ({ ...e, editPaddyWeightKg: "" }));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (selectedBatch.status === "IN_PROCESS" || completedBatchUnlocked)) { e.preventDefault(); handleSaveBatchInfo(); } }}
                  readOnly={selectedBatch.status === "COMPLETED" && !completedBatchUnlocked}
                  className={`border rounded px-2 py-1 w-full ${
                    selectedBatch.status === "COMPLETED" && !completedBatchUnlocked
                      ? "bg-gray-100 cursor-not-allowed"
                      : ""
                  } ${paddyExceedEdit || fieldErrors.editPaddyWeightKg ? "border-red-500 bg-red-50" : ""}`}
                />
                {fieldErrors.editPaddyWeightKg && (
                  <p className="text-[10px] text-red-600 mt-0.5">{fieldErrors.editPaddyWeightKg}</p>
                )}
              </div>
              <div className="col-span-5 flex flex-wrap gap-2 items-center">
                {selectedBatch.status === "COMPLETED" && !completedBatchUnlocked && (
                  <button
                    type="button"
                    onClick={() => setPinDialog({ open: true, pin: "", purpose: "Edit completed batch", pinError: "" })}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-amber-500 text-amber-700 hover:bg-amber-50"
                  >
                    <Lock size={14} />
                    Unlock with PIN
                  </button>
                )}
                {selectedBatch.status === "COMPLETED" && completedBatchUnlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedBatchUnlocked(false);
                      setLastEnteredPin("");
                      setEditingOutputId(null);
                    }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    <Lock size={14} />
                    Lock Again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingBatchInfo(false)}
                  className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                {(selectedBatch.status === "IN_PROCESS" || (selectedBatch.status === "COMPLETED" && completedBatchUnlocked)) && (
                  <button
                    onClick={handleSaveBatchInfo}
                    disabled={savingBatchInfo}
                    className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingBatchInfo ? "Saving..." : "Save Batch Info"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPrintBatch(selectedBatch);
                    setShowSlip(true);
                  }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border text-emerald-700 hover:bg-emerald-50"
                >
                  <Printer size={14} />
                  Preview Slip
                </button>
              </div>
            </div>
          ) : null}

          {/* Outputs */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Outputs</div>
            <div className="border rounded-lg overflow-y-auto max-h-60">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Company Name</th>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Completed At</th>
                    <th className="p-2 text-right">Bags</th>
                    <th className="p-2 text-right">Net Wt</th>
                    {(selectedBatch.status === "IN_PROCESS" || selectedBatch.status === "COMPLETED") && (
                      <th className="p-2 w-16" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(selectedBatch.outputs || []).map((o, idx) => (
                    <tr key={o._id || idx} className={idx % 2 ? "bg-white" : "bg-gray-50"}>
                      {editingOutputId === o._id ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={selectedBatch.sourceCompanyName || o.companyName || "-"}
                              readOnly
                              className="border rounded px-1 py-0.5 text-[11px] w-full bg-gray-100 cursor-not-allowed"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={editOutputForm.productTypeId || o.productTypeId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const product = products.find((p) => p._id === nextId);
                                setEditOutputForm((f) => ({
                                  ...f,
                                  productTypeId: nextId,
                                  perBagWeightKg: product?.conversionFactors?.Bag
                                    ? String(Math.floor(Number(product.conversionFactors.Bag)) || "")
                                    : f.perBagWeightKg,
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveOutput(o._id);
                                }
                                if (e.key === "Escape") {
                                  setEditingOutputId(null);
                                  setFieldErrors((f) => ({ ...f, editOutputTotal: "" }));
                                }
                              }}
                              className="border rounded px-1 py-0.5 text-[11px] w-full"
                            >
                              <option value="">Select product</option>
                              {products.map((p) => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={(o.status || "COMPLETED") === "COMPLETED" ? "Completed" : "In process"}
                              readOnly
                              className="border rounded px-1 py-0.5 text-[11px] w-full bg-gray-100 cursor-not-allowed"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={o.completedAt ? new Date(o.completedAt).toLocaleString() : "-"}
                              readOnly
                              className="border rounded px-1 py-0.5 text-[11px] w-full bg-gray-100 cursor-not-allowed"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={editOutputForm.numBags}
                              onChange={(e) => setEditOutputForm((f) => ({ ...f, numBags: intClean(e.target.value) }))}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveOutput(o._id); } if (e.key === "Escape") { setEditingOutputId(null); setFieldErrors((f) => ({ ...f, editOutputTotal: "" })); } }}
                              className="border rounded px-1 py-0.5 text-[11px] w-14 text-right"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={editOutputForm.perBagWeightKg}
                              readOnly
                              className="border rounded px-1 py-0.5 text-[11px] w-14 text-right bg-gray-100 cursor-not-allowed"
                            />
                          </td>
                          <td className="p-2" colSpan={1}>
                            <input
                              type="number"
                              value={editOutputForm.durationMinutes}
                              onChange={(e) =>
                                setEditOutputForm((f) => ({
                                  ...f,
                                  durationMinutes: intClean(e.target.value),
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveOutput(o._id);
                                }
                                if (e.key === "Escape") {
                                  setEditingOutputId(null);
                                  setFieldErrors((f) => ({ ...f, editOutputTotal: "" }));
                                }
                              }}
                              className="border rounded px-1 py-0.5 text-[11px] w-20 text-right"
                              placeholder="Minutes"
                              disabled={(o.status || "COMPLETED") === "COMPLETED"}
                              title="Timer in minutes (only for in-process outputs)"
                            />
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              onClick={() => handleSaveOutput(o._id)}
                              disabled={savingOutputId === o._id}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 mr-1"
                            >
                              {savingOutputId === o._id ? "..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingOutputId(null); setFieldErrors((e) => ({ ...e, editOutputTotal: "" })); }}
                              className="text-[10px] text-gray-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2">{o.companyName || "-"}</td>
                          <td className="p-2">{o.productTypeName}</td>
                          <td className="p-2">
                            {(o.status || "COMPLETED") === "COMPLETED" ? "Completed" : "In process"}
                          </td>
                          <td className="p-2">
                            {o.completedAt ? new Date(o.completedAt).toLocaleString() : "-"}
                          </td>
                          <td className="p-2 text-right">{o.numBags}</td>
                          <td className="p-2 text-right">{Math.round(Number(o.netWeightKg) || 0)}</td>
                          {selectedBatch.status === "COMPLETED" && <td className="p-2"></td>}
                        </>
                      )}
                    </tr>
                  ))}
                      {(!selectedBatch.outputs || selectedBatch.outputs.length === 0) && (
                        <tr>
                          <td className="p-2 text-center text-gray-400" colSpan={7}>No outputs yet.</td>
                        </tr>
                      )}
                </tbody>
              </table>
                </div>
                {fieldErrors.editOutputTotal && (
                  <p className="text-[10px] text-red-600 mt-1">{fieldErrors.editOutputTotal}</p>
                )}

                {(selectedBatch.status === "IN_PROCESS" || (selectedBatch.status === "COMPLETED" && completedBatchUnlocked)) && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600">
                        {selectedBatch.status === "IN_PROCESS"
                          ? "Add output (it will go to stock immediately)."
                          : "Add output to a completed batch (admin unlock)."}{" "}
                      </div>
                      {selectedBatch.status === "IN_PROCESS" && null}
                    </div>

                    {(selectedBatch.status === "IN_PROCESS" || selectedBatch.status === "COMPLETED") && (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <input
                            type="text"
                            value={selectedBatch.sourceCompanyName || "-"}
                            readOnly
                            className="border rounded px-2 py-1 col-span-3 bg-gray-100 cursor-not-allowed"
                            placeholder="Source company"
                          />
                          {outputForm.productMode === "list" ? (
                            <select
                              value={outputForm.productTypeId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === OTHER_OPTION) {
                                  setOutputForm((f) => ({
                                    ...f,
                                    productMode: "input",
                                    productInput: "",
                                    productTypeId: "",
                                  }));
                                  return;
                                }
                                setOutputForm((f) => ({ ...f, productTypeId: v, productInput: "" }));
                                setFieldErrors((e) => ({ ...e, outputProduct: "" }));
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                              className={`border rounded px-2 py-1 col-span-3 ${fieldErrors.outputProduct ? "border-red-500 bg-red-50" : ""}`}
                            >
                              <option value="">Finished Product</option>
                              {products.map((p) => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                              ))}
                              <option value={OTHER_OPTION}>Add New</option>
                            </select>
                          ) : (
                            <div className="col-span-3 flex items-center gap-2">
                              <input
                                value={outputForm.productInput || ""}
                                onChange={(e) =>
                                  setOutputForm((f) => ({ ...f, productInput: sanitizeBrandText(e.target.value, 80) }))
                                }
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProductByName(outputForm.productInput); } }}
                                placeholder="Enter product name"
                                className={`flex-1 border rounded px-2 py-1 ${fieldErrors.outputProduct ? "border-red-500 bg-red-50" : ""}`}
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!String(outputForm.productInput || "").trim()) {
                                    setOutputForm((f) => ({ ...f, productMode: "list" }));
                                    return;
                                  }
                                  await addProductByName(outputForm.productInput);
                                }}
                                className="px-3 py-1 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                              >
                                List
                              </button>
                            </div>
                          )}
                          {fieldErrors.outputProduct && <p className="text-[10px] text-red-600 col-span-3">{fieldErrors.outputProduct}</p>}
                          <input
                            type="number"
                            value={outputForm.numBags}
                            onChange={(e) => {
                              setOutputForm((f) => ({ ...f, numBags: intClean(e.target.value) }));
                              setFieldErrors((e) => ({ ...e, outputBags: "", outputTotal: "" }));
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddOutput(); } }}
                            placeholder="Bags"
                            className={`border rounded px-2 py-1 ${fieldErrors.outputBags ? "border-red-500 bg-red-50" : ""}`}
                          />
                          <input
                            type="number"
                            value={outputForm.perBagWeightKg}
                            readOnly
                            placeholder="Wt/bag (kg)"
                            className="border rounded px-2 py-1 bg-gray-100 cursor-not-allowed"
                          />
                          <input
                            type="number"
                            value={outputForm.netWeightKg}
                            readOnly
                            placeholder="Net (kg)"
                            className="border rounded px-2 py-1 bg-gray-50"
                          />
                          {fieldErrors.outputTotal && <p className="text-[10px] text-red-600 col-span-3">{fieldErrors.outputTotal}</p>}
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={handleAddOutput}
                            disabled={working}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <Plus size={14} />
                            Add Output
                          </button>
                        </div>
                      </>
                    )}
              </div>
            )}
          </div>

          {selectedBatch.status === "COMPLETED" && (
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-gray-500">
                Batch completed. Return any remaining paddy to stock.
              </p>
              <button
                type="button"
                onClick={openCompleteConfirm}
                disabled={
                  !(selectedBatch.outputs || []).length ||
                  selectedBatch.batchDone ||
                  returnedRemainingBatches.has(selectedBatch._id) ||
                  (selectedBatch.outputs || []).some(
                    (o) => (o.status || "COMPLETED") !== "COMPLETED",
                  )
                }
                className="px-3 py-1.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Batch Done
              </button>
            </div>
          )}
          {selectedBatch.status === "IN_PROCESS" && (
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-gray-500">
                When all scheduled outputs are completed, you can finish this batch.
              </p>
              <button
                type="button"
                onClick={() => setMarkCompleteConfirmOpen(true)}
                disabled={
                  !(selectedBatch.outputs || []).length ||
                  (selectedBatch.outputs || []).some(
                    (o) => (o.status || "COMPLETED") !== "COMPLETED",
                  )
                }
                className="px-3 py-1.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Mark Batch Completed
              </button>
            </div>
          )}
          {fieldErrors.completeBatch && (
            <div className="pt-1 text-[11px] text-red-600">{fieldErrors.completeBatch}</div>
          )}
        </div>
          ) : (
            <div className="bg-white rounded-xl shadow border p-8 flex items-center justify-center text-gray-500 text-sm">
              Select a batch from the list (click a row).
            </div>
          )}
        </div>
      </div>

      {/* Batch done confirmation (popup instead of window.confirm) */}
      {completeConfirmOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Batch Done</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will finalize the batch and return any remaining paddy back to stock. Are you sure?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCompleteConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteBatch}
                disabled={working}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-sm"
              >
                {working ? "Completing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {markCompleteConfirmOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Complete Batch</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you don’t want to make more product? Remaining paddy:{" "}
              <span className="font-semibold text-red-600">
                {Math.round(remainingPaddy)} kg
              </span>
              .
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMarkCompleteConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkBatchCompleted}
                disabled={working}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-sm"
              >
                {working ? "Completing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete in-process batch confirmation */}
      {deleteInProcessConfirmOpen && selectedBatch && selectedBatch.status === "IN_PROCESS" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete In-Process Batch</h3>
            <p className="text-sm text-gray-600 mb-4">
              Paddy for this batch will be returned back to stock. Are you sure you want to delete this batch?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteInProcessConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { doDeleteBatch(true); setDeleteInProcessConfirmOpen(false); }}
                disabled={working}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 text-sm"
              >
                {working ? "Deleting..." : "Delete Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete completed batch confirmation */}
      {deleteConfirmOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete Completed Batch
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will reverse paddy and finished stock for this batch. Type the batch number to confirm.
            </p>
            <p className="text-xs text-gray-500 mb-1">
              Batch number: <strong>{selectedBatch.batchNo}</strong>
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && deleteConfirmInput.trim() === (selectedBatch?.batchNo || "") && !working) {
                  e.preventDefault();
                  doDeleteBatch(true);
                }
              }}
              placeholder="Type batch number"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmInput("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => doDeleteBatch(true)}
                disabled={deleteConfirmInput.trim() !== (selectedBatch.batchNo || "") || working}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {working ? "Deleting..." : "Delete Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slip modal (Print uses printBatch; Edit modal uses selectedBatch) */}
      {showSlip && (printBatch || selectedBatch) && (
        <BatchSlipModal
          onClose={() => {
            setShowSlip(false);
            setPrintBatch(null);
          }}
          batch={printBatch || selectedBatch}
          millInfo={millInfo}
        />
      )}

      {/* Zero paddy confirmation - 4 digit PIN */}
      {zeroPaddyConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Set paddy stock to zero</h3>
            <p className="text-sm text-gray-600 mb-3">
              This will remove all paddy ledger entries (from Gate Pass In). Paddy stock will show 0. Batches and other stock are not affected.
            </p>
            <p className="text-xs text-gray-600 mb-2">Admin PIN:</p>
            <Pin4Input
              value={zeroPaddyPin}
              onChange={(v) => setZeroPaddyPin(v.slice(0, 4))}
              className="mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setZeroPaddyConfirm(false); setZeroPaddyPin(""); }}
                disabled={zeroingPaddy}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleZeroPaddyStock}
                disabled={zeroingPaddy || zeroPaddyPin.length !== 4}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {zeroingPaddy ? "Setting..." : "Zero paddy stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error dialog */}
      {errorDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
            <p className="text-sm text-gray-600 mb-4">{errorDialog.message}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorDialog({ open: false, message: "" })}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin PIN dialog (edit completed batch) - 4 digit boxes */}
      {pinDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin PIN</h3>
            <p className="text-sm text-gray-600 mb-3">{pinDialog.purpose}</p>
            <Pin4Input
              value={pinDialog.pin}
              onChange={(v) => setPinDialog((p) => ({ ...p, pin: v.slice(0, 4), pinError: "" }))}
              onComplete={(entered) => {
                const expected = settings.adminPin || "0000";
                if (entered === expected) {
                  if (pinDialog.onSuccess) pinDialog.onSuccess();
                  else setCompletedBatchUnlocked(true);
                  setPinDialog({ open: false, pin: "", purpose: "", onSuccess: null, pinError: "" });
                } else {
                  setPinDialog((p) => ({ ...p, pinError: "Incorrect PIN." }));
                }
              }}
              error={!!pinDialog.pinError}
              className="mb-3"
            />
            {pinDialog.pinError && (
              <p className="text-xs text-red-600 mb-3">{pinDialog.pinError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPinDialog({ open: false, pin: "", purpose: "", onSuccess: null, pinError: "" })}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const entered = pinDialog.pin;
                  const expected = settings.adminPin || "0000";
                  if (entered === expected) {
                    if (pinDialog.onSuccess) pinDialog.onSuccess();
                    else setCompletedBatchUnlocked(true);
                    setPinDialog({ open: false, pin: "", purpose: "", onSuccess: null, pinError: "" });
                  } else {
                    setPinDialog((p) => ({ ...p, pinError: "Incorrect PIN." }));
                  }
                }}
                disabled={pinDialog.pin.length !== 4}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Batch Slip Modal (card-size print) ========== */

function BatchSlipModal({ onClose, batch, millInfo }) {
  const remaining =
    batch && batch.paddyWeightKg != null
      ? Math.max(
          0,
          (batch.paddyWeightKg || 0) - (batch.totalOutputWeightKg || 0)
        )
      : 0;

  function handlePrint() {
    const printContents = document.getElementById("batch-slip-card")?.innerHTML;
    if (!printContents) return;

    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Batch Slip - ${batch.batchNo}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; }
            .card { width: 360px; border-radius: 12px; border: 1px solid #e5e7eb; padding: 16px; margin: 0 auto; }
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
          <div class="card">
            ${printContents}
          </div>
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
          <div className="text-sm font-semibold text-emerald-800">
            Batch Slip Preview
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center">
          {/* Card-sized slip */}
          <div
            id="batch-slip-card"
            className="w-[360px] border rounded-xl p-3 shadow-sm"
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              {millInfo.logoUrl && (
                <img
                  src={millInfo.logoUrl}
                  alt="Logo"
                  className="w-10 h-10 object-contain"
                />
              )}
              <div>
                <div className="text-sm font-bold text-emerald-800 uppercase">
                  {millInfo.name}
                </div>
                <div className="text-[10px] text-gray-500">
                  {millInfo.address}
                </div>
                {millInfo.phone && (
                  <div className="text-[10px] text-gray-500">
                    Ph: {millInfo.phone}
                  </div>
                )}
              </div>
            </div>

            <div className="border-b mb-2" />

            <div className="flex justify-between text-[11px] mb-1">
              <div>
                <div className="text-gray-500">Batch No</div>
                <div className="font-semibold">{batch.batchNo}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">Date</div>
                <div className="font-semibold">
                  {new Date(batch.date).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px] mb-2">
              <div>
                <div className="text-gray-500">Paddy Weight</div>
                <div className="font-semibold">
                  {Math.round(Number(batch.paddyWeightKg) || 0)} kg
                </div>
              </div>
              <div>
                <div className="text-gray-500">Total Output</div>
                <div className="font-semibold">
                  {Math.round(Number(batch.totalOutputWeightKg) || 0)} kg
                </div>
              </div>
              <div>
                <div className="text-gray-500">Remaining Paddy</div>
                <div className="font-semibold">{Math.round(remaining)} kg</div>
              </div>
            </div>

            <div className="text-[11px] font-semibold text-gray-700 mt-1">
              Outputs
            </div>
            <table className="w-full text-[10px] mt-1">
              <thead>
                <tr>
                  <th className="text-left">Company Name</th>
                  <th className="text-left">Product</th>
                  <th className="text-right">Bags</th>
                  <th className="text-right">Net (kg)</th>
                  <th className="text-left">Shift</th>
                </tr>
              </thead>
              <tbody>
                {(batch.outputs || []).map((o, idx) => (
                  <tr key={o._id || idx}>
                    <td>{o.companyName || "-"}</td>
                    <td>{o.productTypeName}</td>
                    <td className="text-right">{o.numBags}</td>
                    <td className="text-right">{Math.round(Number(o.netWeightKg) || 0)}</td>
                    <td>{o.shift === "DAY" ? "Day" : "Night"}</td>
                  </tr>
                ))}
                {(!batch.outputs || batch.outputs.length === 0) && (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400">
                      No outputs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {batch.remarks && (
              <div className="mt-2 text-[10px]">
                <span className="text-gray-500">Remarks: </span>
                <span className="font-medium">{batch.remarks}</span>
              </div>
            )}

            <div className="mt-3 flex justify-between text-[10px] text-gray-500">
              <div>__________________</div>
              <div>__________________</div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500">
              <div>Shift Incharge</div>
              <div>Manager</div>
            </div>
          </div>

          <button
            onClick={handlePrint}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-800"
          >
            <Printer size={16} />
            Print Slip
          </button>
        </div>
      </div>
    </div>
  );
}
