import React, { useEffect, useRef, useState } from "react";
import { Edit2, Trash2, Printer, X, Plus, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import DataTable from "../ui/DataTable";
import AddOptionModal from "../ui/AddOptionModal";
import { FilterToggleButton } from "../ui/CollapsibleFilter";
import GatePassFilter, { applyGatePassFilters, gatePassFilterSummary } from "./GatePassFilter";

const UNITS = ["kg", "ton", "bags", "pcs", "mounds"];
const PADDY_UNITS = ["kg", "ton"];
const OTHER_OPTION = "__OTHER__";
const createBrandModalState = () => ({
  open: false,
  value: "",
  valueOther: "",
  deleteValue: "",
  productRows: [],
  draft: {
    nameSelect: "",
    nameOther: "",
    showList: false,
    bagKg: "65",
    tonKg: "1000",
    pricePerKg: "",
  },
  saving: false,
  deleting: false,
  renaming: false,
  errors: { value: "", rows: [], rowsGeneral: "", draft: {} },
});

export default function GatePassIN({ highlightId = "" }) {
  const [brandOptions, setBrandOptions] = useState([]);
  const [senderOptions, setSenderOptions] = useState([]);
  const [productCatalog, setProductCatalog] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    truckNo: "",
    senderName: "",
    freightCharges: "",
  });
  const emptyItem = () => ({
    brand: "",
    brandMode: "list",
    brandInput: "",
    productName: "",
    productMode: "list",
    productInput: "",
    weightOnArrival: "",
    weightAtSmjKg: "",
    emptyBagWeightKg: "",
    netWeightKg: "",
    netWeightManDisplay: "",
    bagWeightEachKg: "65",
    bagCount: "",
  });
  const [items, setItems] = useState([emptyItem()]);

  const [errors, setErrors] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [brandModal, setBrandModal] = useState(createBrandModalState);
  const [stockRows, setStockRows] = useState([]);
  const [openBrandDropdown, setOpenBrandDropdown] = useState(null);
  const [openSenderDropdown, setOpenSenderDropdown] = useState(false);
  const [activeBrandIdx, setActiveBrandIdx] = useState(-1);
  const [activeSenderIdx, setActiveSenderIdx] = useState(-1);
  const brandOptionRefs = useRef({});
  const senderOptionRefs = useRef({});

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    expectedText: "",
  });
  const [confirmInput, setConfirmInput] = useState("");

  // Validation regex
  const nameRegex = /^[A-Za-z\s]+$/;
  const companyNameRegex = /^[A-Za-z0-9\s.,&()\-]+$/;
  const contactRegex = /^03\d{2}-\d{7}$/; // 03XX-XXXXXXX

  const setFieldError = (field, msg) =>
    setErrors((p) => ({ ...p, [field]: msg }));
  const clearFieldError = (field) =>
    setErrors((p) => {
      const c = { ...p };
      delete c[field];
      return c;
    });

  const clearItemFieldError = (idx, field) =>
    setErrors((prev) => {
      const rowErrors = Array.isArray(prev.itemRows) ? [...prev.itemRows] : [];
      if (!rowErrors[idx]?.[field]) return prev;
      rowErrors[idx] = { ...(rowErrors[idx] || {}) };
      delete rowErrors[idx][field];
      return { ...prev, itemRows: rowErrors };
    });

  const renderFieldError = (message) => (
    <p
      className={`mt-1 min-h-[1rem] text-xs ${
        message ? "text-red-500" : "text-transparent"
      }`}
    >
      {message || " "}
    </p>
  );

  // Validation functions
  const validateTruckNo = (v) => {
    const value = String(v || "").trim();
    if (!value) return "Truck number is required.";
    return "";
  };

  const validateDriverName = (v) =>
    !v ? "" : nameRegex.test(v) ? "" : "Driver name: letters and spaces only.";

  const validateDriverContact = (v) => {
    if (!v) return ""; // Optional
    if (!contactRegex.test(v)) return "Format: 03XX-XXXXXXX (11 digits)";
    return "";
  };

  const needsBrand = () => {
    const hasItems = (items || []).some((it) => Number(it?.netWeightKg || 0) > 0);
    return hasItems;
  };

  const getCompanyIdentityKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\b(trade|trades|trader|traders|trading)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const findSimilarBrand = (value) => {
    const base = getCompanyIdentityKey(value);
    if (!base) return "";
    return (
      (brandOptions || []).find((brand) => {
        const current = getCompanyIdentityKey(brand);
        return current && (current === base || current.includes(base) || base.includes(current));
      }) || ""
    );
  };

  const getItemDisplayName = (item = {}) =>
    String(
      item?.productMode === "input"
        ? item?.productInput || ""
        : item?.productName || item?.customName || ""
    ).trim();

  const hasItemContent = (item = {}) =>
    Boolean(
      String(item?.brand || item?.brandInput || "").trim() ||
        getItemDisplayName(item) ||
        String(item?.bagCount || "").trim() ||
        Number(item?.netWeightKg || 0) > 0
    );

  const formatKgToMan = (kg) => {
    const total = Number(kg || 0);
    if (total <= 0) return "";
    const man = Math.floor(total / 40);
    const remainder = Math.round(total % 40);
    if (man === 0) return `${remainder} kg`;
    if (remainder === 0) return `${man} man`;
    return `${man} man ${remainder} kg`;
  };

  const fmtNum = (v) => {
    const n = Number(v || 0);
    if (!n) return "";
    return Number.isInteger(n)
      ? String(n)
      : String(+n.toFixed(2)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  };

  // Correct IN formula:
  // 1. Full bags first: Math.floor(gross / bagWeightEach)
  // 2. Net = gross - totalWeightOfEmptyBags (directly entered by user)
  // 3. Leftover weight = gross - (fullBags * bagWeightEach)
  const computeItemWeights = ({ weightAtSmjKg, emptyBagWeightKg, bagWeightEachKg }) => {
    const gross = Number(weightAtSmjKg || 0);
    const totalEmptyWeight = Number(emptyBagWeightKg || 0);
    const bagW = Number(bagWeightEachKg || 0);
    if (gross <= 0) return { netKg: 0, fullBags: 0, looseKg: 0, bagsDisplay: "" };
    if (bagW <= 0) {
      return { netKg: gross, fullBags: 0, looseKg: gross, bagsDisplay: `${fmtNum(gross)}kg` };
    }
    const fullBags = Math.floor(gross / bagW);
    const looseKg = +(gross - fullBags * bagW).toFixed(2);
    const netKg = +Math.max(gross - totalEmptyWeight, 0).toFixed(2);
    const bagsLabel = fullBags > 0 ? `${fullBags} bags` : "";
    const looseLabel = looseKg > 0 ? `${fmtNum(looseKg)}kg` : "";
    const bagsDisplay = [bagsLabel, looseLabel].filter(Boolean).join(" ") || "";
    return { netKg, fullBags, looseKg, bagsDisplay };
  };

  const validateItemRow = (item = {}) => {
    const rowErrors = {};
    if (!String(item?.brand || "").trim()) rowErrors.brand = "Select company name.";
    if (!getItemDisplayName(item)) rowErrors.productName = "Select product name.";
    if (Number(item?.weightAtSmjKg || 0) <= 0) rowErrors.weightAtSmjKg = "Weight at SMJ is required.";
    if (Number(item?.netWeightKg || 0) <= 0) rowErrors.netWeightKg = "Net weight is required.";
    if (!String(item?.bagWeightEachKg || "").trim() || Number(item?.bagWeightEachKg || 0) <= 0) {
      rowErrors.bagWeightEachKg = "Bag weight is required.";
    }
    return rowErrors;
  };

  const validateField = (name, value) => {
    let msg = "";
    if (name === "date") msg = value ? "" : "Date is required.";
    if (name === "truckNo") msg = validateTruckNo(value);
    if (name === "senderName") {
      msg = value
        ? companyNameRegex.test(value)
          ? ""
          : "Sender Name: invalid characters."
        : "";
    }
    if (name === "driverName") msg = value ? validateDriverName(value) : "";
    if (name === "driverContact") msg = value ? validateDriverContact(value) : "";
    if (name === "freightCharges") msg = value ? "" : "";
    if (msg) setFieldError(name, msg);
    else clearFieldError(name);
  };

  const validateForm = () => {
    const e0 = form.date ? "" : "Date is required.";
    const e1 = validateTruckNo(form.truckNo);
    const itemRows = (items || []).map((it) => validateItemRow(it));
    const hasItem = (items || []).some(
      (it) =>
        String(it?.brand || "").trim() &&
        getItemDisplayName(it) &&
        Number(it?.weightAtSmjKg || 0) > 0 &&
        Number(it?.netWeightKg || 0) > 0
    );
    const e2 = needsBrand()
      ? form.senderName || hasItem
        ? ""
        : "Sender Name is required."
      : "";

    const newErr = {};
    if (e0) newErr.date = e0;
    if (e1) newErr.truckNo = e1;
    if (e2) newErr.senderName = e2;
    if (itemRows.some((row) => Object.keys(row).length > 0)) newErr.itemRows = itemRows;
    else if (!hasItem) newErr.items = "Add at least one item with net weight.";
    setErrors(newErr);
    if (Object.keys(newErr).length > 0) {
      const firstKey = Object.keys(newErr)[0] === "itemRows" ? "items" : Object.keys(newErr)[0];
      setTimeout(() => {
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
      return false;
    }
    return true;
  };

  // Format truck input
  const formatTruckInput = (raw) => {
    return String(raw || "").toUpperCase();
  };

  // Format contact input: 03XX-XXXXXXX
  const formatContactInput = (raw) => {
    let s = raw.replace(/[^\d]/g, ""); // Only digits
    if (s.length <= 4) return s;
    return `${s.slice(0, 4)}-${s.slice(4, 11)}`;
  };

  const normalizeCompanyName = (value) =>
    toTitleCase(String(value || "").trim().replace(/\s+/g, " "));

  const mergeOptionsCaseInsensitive = (...lists) => {
    const map = new Map();
    lists.flat().forEach((value) => {
      const clean = normalizeCompanyName(value);
      if (!clean) return;
      const key = String(clean)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\b(trade|trades|trader|traders|trading)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!map.has(key)) map.set(key, clean);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  };

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get("/settings");
        if (res.data && res.data.success !== false) {
          const s = res.data.data || res.data;
          setSettings(s);
          if (Array.isArray(s.brandOptions)) {
            setBrandOptions((prev) =>
              mergeOptionsCaseInsensitive(prev || [], s.brandOptions || [])
            );
          }
          if (Array.isArray(s.senderOptions)) {
            setSenderOptions((prev) =>
              mergeOptionsCaseInsensitive(prev || [], s.senderOptions || [])
            );
          }
        }
      } catch {}
    };
    loadSettings();
  }, []);

  // Load company name list for paddy ownership
  useEffect(() => {
    const loadBrands = async () => {
      try {
        const res = await api.get("/product-types");
        const rows = res.data?.data || [];
        setProductCatalog(rows);
        const brands = Array.from(
          new Set(rows.map((r) => normalizeCompanyName(r.brand)).filter(Boolean))
        ).sort();
        setBrandOptions((prev) =>
          mergeOptionsCaseInsensitive(prev || [], brands || [])
        );
      } catch {}
    };
    loadBrands();
  }, []);

  useEffect(() => {
    const onProductRefresh = () => {
      // Reuse the same loader to keep product + brand lists in sync.
      const loadBrands = async () => {
        try {
          const res = await api.get("/product-types");
          const rows = res.data?.data || [];
          setProductCatalog(rows);
          const brands = Array.from(
            new Set(rows.map((r) => normalizeCompanyName(r.brand)).filter(Boolean))
          ).sort();
          setBrandOptions((prev) =>
            mergeOptionsCaseInsensitive(prev || [], brands || [])
          );
        } catch {}
      };
      loadBrands();
    };
    window.addEventListener("product:refresh", onProductRefresh);
    return () => window.removeEventListener("product:refresh", onProductRefresh);
  }, []);

  const loadStock = async () => {
    try {
      const res = await api.get("/stock/current");
      setStockRows(res.data?.data || []);
    } catch {}
  };

  useEffect(() => {
    loadStock();
    const onRefresh = () => loadStock();
    window.addEventListener("stock:refresh", onRefresh);
    return () => window.removeEventListener("stock:refresh", onRefresh);
  }, []);

  useEffect(() => {
    const stockBrands = Array.from(
      new Set(
        (stockRows || [])
          .map((r) => normalizeCompanyName(getStockBrand(r)))
          .filter(Boolean)
      )
    ).sort();
    if (stockBrands.length) {
      setBrandOptions((prev) =>
        mergeOptionsCaseInsensitive(prev || [], stockBrands)
      );
    }
  }, [stockRows]);


  // Fetch rows
  const fetchRows = async () => {
    try {
      setLoading(true);
      const params = {
        page: 1,
        limit: 1000,
        type: "IN",
      };
      const res = await api.get("/gatepasses", { params });
      if (res.data && res.data.success === false)
        throw new Error(res.data.message || "Failed");
      setRows(res.data.data || []);
    } catch (err) {
      toast.error(err.message || "Unable to fetch gate passes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line
  }, []);
  const productNameOptions = Array.from(
    new Map(
      (productCatalog || [])
        .map((p) => String(p.name || "").trim())
        .filter(Boolean)
        .map((name) => [normalizeText(name), name])
    ).values()
  ).sort();


  const getProductOptionsForBrand = () => {
    const list = (productCatalog || [])
      .map((p) => String(p.name || "").trim())
      .filter(Boolean)
      .map((name) => [normalizeText(name), name]);
    return Array.from(new Map(list).values()).sort();
  };

  const ensureBrandOption = async (name) => {
    const clean = toTitleCase(String(name || "").trim());
    if (!clean) return "";
    const existing = findSimilarBrand(clean);
    if (existing) {
      if (normalizeText(existing) !== normalizeText(clean)) {
        toast.error(`Similar company already exists: "${existing}".`);
      }
      return existing;
    }
    const nextOptions = Array.from(
      new Map(
        [...(brandOptions || []), clean].map((value) => [
          normalizeText(value),
          toTitleCase(value),
        ])
      ).values()
    ).sort();
    setBrandOptions(nextOptions);
    try {
      await api.put("/settings", { brandOptions: nextOptions });
    } catch {}
    return clean;
  };

  const ensureSenderOption = async (name) => {
    const clean = toTitleCase(String(name || "").trim());
    if (!clean) return "";
    const existing = (senderOptions || []).find(
      (s) => normalizeText(s) === normalizeText(clean)
    );
    if (existing) {
      if (normalizeText(existing) !== normalizeText(clean)) {
        toast.error(`Similar sender already exists: "${existing}".`);
      }
      return existing;
    }
    const nextOptions = Array.from(
      new Map(
        [...(senderOptions || []), clean].map((value) => [
          normalizeText(value),
          toTitleCase(value),
        ])
      ).values()
    ).sort();
    setSenderOptions(nextOptions);
    try {
      await api.put("/settings", { senderOptions: nextOptions });
    } catch {}
    return clean;
  };

  const ensureProductOption = async (brand, name) => {
    const cleanBrand = toTitleCase(String(brand || "").trim());
    const cleanName = toTitleCase(String(name || "").trim());
    if (!cleanBrand || !cleanName) return { brand: cleanBrand, name: cleanName };
    if (cleanName.length < 2 || cleanName.length > 50) {
      return { brand: cleanBrand, name: cleanName };
    }
    if (cleanBrand.length > 80) {
      return { brand: cleanBrand, name: cleanName };
    }
    const exists = (productCatalog || []).some(
      (p) => normalizeText(p.brand) === normalizeText(cleanBrand) && normalizeText(p.name) === normalizeText(cleanName)
    );
    if (exists) return { brand: cleanBrand, name: cleanName };
    const bagKg = Number(settings?.defaultBagWeightKg || 65);
    const payload = {
      name: cleanName,
      brand: cleanBrand,
      baseUnit: "KG",
      allowableSaleUnits: ["Bag", "Ton", "KG"],
      conversionFactors: { KG: 1, Bag: bagKg, Ton: 1000 },
      pricePerKg: 0,
      pricePerBag: 0,
      pricePerTon: 0,
    };
    try {
      await api.post("/product-types", payload);
      const pRes = await api.get("/product-types");
      setProductCatalog(pRes.data?.data || []);
      window.dispatchEvent(new Event("product:refresh"));
    } catch {}
    return { brand: cleanBrand, name: cleanName };
  };

  function normalizeText(v) {
    return String(v || "").trim().toLowerCase();
  }

  const getStockBrand = (row) =>
    String(row?.brandName || row?.companyName || row?.brand || "").trim();

  const companyStockTotals = React.useMemo(() => {
    const map = new Map();
    (stockRows || []).forEach((row) => {
      const brand = getStockBrand(row);
      if (!brand) return;
      const qty = Number(row.balanceKg || 0);
      const key = normalizeText(brand);
      map.set(key, (map.get(key) || 0) + qty);
    });
    return map;
  }, [stockRows]);

  const isBrandDeletable = (brand) =>
    Number(companyStockTotals.get(normalizeText(brand)) || 0) <= 0;

  const makeProductRow = (name, template = null) => {
    const bag = Number(template?.conversionFactors?.Bag || 65);
    const ton = Number(template?.conversionFactors?.Ton || 1000);
    const kgPrice = Number(template?.pricePerKg || 0);
    return {
      name: String(name || "").trim(),
      bagKg: String(bag || 65),
      tonKg: String(ton || 1000),
      pricePerKg: String(Math.round(kgPrice || 0)),
      pricePerBag: String(
        Math.round(Number(template?.pricePerBag ?? kgPrice * bag) || 0)
      ),
      pricePerTon: String(
        Math.round(Number(template?.pricePerTon ?? kgPrice * ton) || 0)
      ),
    };
  };

  const validateBrandValue = (value) => {
    const v = String(value || "").trim();
    if (!v) return "Company Name is required";
    if (v.length > 80) return "Company Name must be 80 characters or less";
    return "";
  };

  const getBrandModalName = (modal) =>
    String(
      modal?.value === OTHER_OPTION ? modal?.valueOther || "" : modal?.value || ""
    ).trim();

  const sanitizeBrandText = (value, max = 80) =>
    String(value || "")
      .replace(/[^a-zA-Z0-9\s.,&()\-]/g, "")
      .slice(0, max);

  const toTitleCase = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const sanitizeIntegerText = (value, max = 8) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, max);

  const validateBrandRow = (row = {}) => {
    const errors = {};
    const name = String(row.name || "").trim();
    if (!name) errors.name = "Product name is required";
    else if (name.length < 2) errors.name = "Product name must be at least 2 characters";
    else if (name.length > 50) errors.name = "Product name must not exceed 50 characters";
    if (!String(row.bagKg || "").trim()) errors.bagKg = "Required";
    if (!String(row.tonKg || "").trim()) errors.tonKg = "Required";
    if (!String(row.pricePerKg || "").trim()) errors.pricePerKg = "Required";
    if (!errors.bagKg && Number(row.bagKg) <= 0) errors.bagKg = "Must be greater than 0";
    if (!errors.tonKg && Number(row.tonKg) <= 0) errors.tonKg = "Must be greater than 0";
    return errors;
  };

  const validateBrandModalBeforeSave = (modal) => {
    const valueError = validateBrandValue(getBrandModalName(modal));
    const brandName = getBrandModalName(modal);
    const existingBrand = findSimilarBrand(brandName);
    const isNewBrand = String(modal.valueOther || "").trim().length > 0;
    const duplicateBrandError =
      existingBrand && isNewBrand
        ? `Similar company already exists: "${existingBrand}".`
        : "";
    const rows = Array.isArray(modal.productRows) ? modal.productRows : [];
    const rowErrors = rows.map((row) => validateBrandRow(row));
    const hasRowErrors = rowErrors.some((e) => Object.keys(e).length > 0);
    const cleanedNames = rows
      .map((r) => String(r.name || "").trim().toLowerCase())
      .filter(Boolean);
    const duplicateName =
      cleanedNames.length !== new Set(cleanedNames).size
        ? "Duplicate product names are not allowed."
        : "";
    const rowsGeneral =
      rows.length === 0
        ? "Add at least one product row."
        : duplicateName || "";

    return {
      isValid: !valueError && !duplicateBrandError && !hasRowErrors && !rowsGeneral,
      errors: { value: valueError || duplicateBrandError, rows: rowErrors, rowsGeneral },
    };
  };

  const getDraftProductName = () =>
    String(brandModal.draft?.nameOther || "").trim();

  const getBrandProducts = (brandName) =>
    (productCatalog || [])
      .filter((p) => normalizeText(p.brand) === normalizeText(brandName))
      .map((p) => ({
        name: String(p.name || "").trim(),
        bagKg: String(Number(p?.conversionFactors?.Bag || 65)),
        tonKg: String(Number(p?.conversionFactors?.Ton || 1000)),
        pricePerKg: String(Math.round(Number(p?.pricePerKg || 0))),
        pricePerBag: String(Math.round(Number(p?.pricePerBag || 0))),
        pricePerTon: String(Math.round(Number(p?.pricePerTon || 0))),
      }));

  const handleBrandDraftChange = (field, rawValue) => {
    setBrandModal((prev) => {
      const draft = { ...(prev.draft || {}) };
      if (field === "nameSelect") {
        draft.nameSelect = rawValue;
        if (rawValue !== OTHER_OPTION) draft.nameOther = "";
        const template = (productCatalog || []).find(
          (p) =>
            normalizeText(p.brand) === normalizeText(prev.value) &&
            normalizeText(p.name) === normalizeText(rawValue)
        );
        if (template) {
          draft.bagKg = String(Number(template?.conversionFactors?.Bag || 65));
          draft.tonKg = String(Number(template?.conversionFactors?.Ton || 1000));
          draft.pricePerKg = String(Math.round(Number(template?.pricePerKg || 0)));
        }
      } else if (field === "nameOther") {
        draft.nameOther = sanitizeBrandText(rawValue, 80);
        draft.showList = false;
      } else if (field === "toggleProductList") {
        draft.showList = !draft.showList;
      } else if (field === "bagKg" || field === "tonKg") {
        draft[field] = sanitizeIntegerText(rawValue, 5);
      } else {
        draft[field] = sanitizeIntegerText(rawValue, 8);
      }
      return {
        ...prev,
        draft,
        errors: { ...(prev.errors || {}), draft: {}, rowsGeneral: "" },
      };
    });
  };

  const addDraftProductRow = () => {
    const name = getDraftProductName();
    const row = {
      name,
      bagKg: String(brandModal.draft?.bagKg || "").trim(),
      tonKg: String(brandModal.draft?.tonKg || "").trim(),
      pricePerKg: String(brandModal.draft?.pricePerKg || "").trim(),
    };
    const rowError = validateBrandRow(row);
    if (Object.keys(rowError).length > 0) {
      setBrandModal((prev) => ({
        ...prev,
        errors: { ...(prev.errors || {}), draft: rowError },
      }));
      return;
    }
    const duplicate = (brandModal.productRows || []).some(
      (r) => normalizeText(r.name) === normalizeText(name)
    );
    if (duplicate) {
      toast.error("Product already exists in this company list.");
      return;
    }
    setBrandModal((prev) => ({
      ...prev,
      productRows: [
        ...(prev.productRows || []),
        {
          ...row,
          pricePerBag: String(
            Math.round(Number(row.pricePerKg || 0) * Number(row.bagKg || 0))
          ),
          pricePerTon: String(
            Math.round(Number(row.pricePerKg || 0) * Number(row.tonKg || 0))
          ),
        },
      ],
      draft: {
        nameSelect: "",
        nameOther: "",
        bagKg: prev.draft?.bagKg || "65",
        tonKg: prev.draft?.tonKg || "1000",
        pricePerKg: "",
      },
      errors: { ...(prev.errors || {}), draft: {}, rowsGeneral: "" },
    }));
  };

  const selectedBrandName = getBrandModalName(brandModal);
  // Handlers
  const handleChange = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "truckNo") {
      v = formatTruckInput(value);
    }
    if (name === "driverName") {
      if (value !== "Other") {
        v = value.replace(/[^A-Za-z\s]/g, "");
      }
      v = v.replace(/\s+/g, " ");
    }
    if (name === "driverContact") {
      v = formatContactInput(value);
    }
    if (name === "freightCharges" || name === "weightOnArrival") {
      v = value.replace(/[^\d.]/g, "");
    }
    setForm((prev) => ({ ...prev, [name]: v }));
    validateField(name, v);
  };


  const saveBrandFromModal = async () => {
    const validation = validateBrandModalBeforeSave(brandModal);
    setBrandModal((prev) => ({ ...prev, errors: validation.errors }));
    if (!validation.isValid) {
      toast.error("Please fix company name form errors.");
      return;
    }
    const brandName = findSimilarBrand(getBrandModalName(brandModal)) || getBrandModalName(brandModal);

    const nextOptions = Array.from(
      new Map(
        [...(brandOptions || []), brandName].map((value) => [
          getCompanyIdentityKey(value),
          toTitleCase(value),
        ])
      ).values()
    ).sort();
    setBrandModal((prev) => ({ ...prev, saving: true }));
    try {
      await api.put("/settings", { brandOptions: nextOptions });
      setBrandOptions(nextOptions);
      const rows = (brandModal.productRows || []).filter(
        (r) => String(r.name || "").trim() !== ""
      );
      let changedCount = 0;
      for (const row of rows) {
        const name = String(row.name || "").trim();
        const bagKg = Math.max(1, Number(row.bagKg || 65));
        const tonKg = Math.max(1, Number(row.tonKg || 1000));
        const priceKg = Math.max(0, Number(row.pricePerKg || 0));
        const priceBag = Math.max(
          0,
          Number(row.pricePerBag || Math.round(priceKg * bagKg) || 0)
        );
        const priceTon = Math.max(
          0,
          Number(row.pricePerTon || Math.round(priceKg * tonKg) || 0)
        );

        const existing = (productCatalog || []).find(
          (p) =>
            String(p.brand || "").trim().toLowerCase() === brandName.toLowerCase() &&
            String(p.name || "").trim().toLowerCase() === name.toLowerCase()
        );
        const payload = {
          name,
          brand: brandName,
          baseUnit: "KG",
          allowableSaleUnits: ["Bag", "Ton", "KG"],
          conversionFactors: { KG: 1, Bag: bagKg, Ton: tonKg },
          pricePerKg: Math.round(priceKg),
          pricePerBag: Math.round(priceBag),
          pricePerTon: Math.round(priceTon),
        };
        try {
          if (existing?._id) {
            await api.put(`/product-types/${existing._id}`, payload);
          } else {
            await api.post("/product-types", payload);
          }
          changedCount += 1;
        } catch {
          // continue remaining rows
        }
      }

      const pRes = await api.get("/product-types");
      setProductCatalog(pRes.data?.data || []);

      setBrandModal(createBrandModalState());
      toast.success(
        changedCount > 0
          ? `Company Name saved with ${changedCount} product row(s).`
          : "Company Name added."
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to add company name");
      setBrandModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // deleteBrandOption removed — company deletion is now managed
  // from Stock page → Manage Companies (PIN-protected).

  const handleItemChange = (idx, field, value) => {
    const updated = [...items];
    const cleanInt = (v, max = 8) => String(v || "").replace(/\D/g, "").slice(0, max);
    const row = { ...(updated[idx] || {}) };

    if (field === "bagWeightEachKg") {
      const cleanDec = (v) => {
        const raw = String(v || "");
        const cleaned = raw.replace(/[^0-9.]/g, "");
        if (!cleaned) return "";
        const parts = cleaned.split(".");
        if (parts.length > 2) {
          return parts[0] + "." + parts.slice(1).join("");
        }
        const intPart = parts[0].slice(0, 6);
        const decPart = parts[1] ? parts[1].slice(0, 2) : "";
        if (cleaned.endsWith(".")) {
          return intPart + ".";
        }
        return decPart ? `${intPart}.${decPart}` : intPart;
      };
      row[field] = cleanDec(value);
    } else if (field === "weightOnArrival") {
      row[field] = cleanInt(value, 8);
    } else if (field === "weightAtSmjKg") {
      row[field] = cleanInt(value, 8);
    } else if (field === "emptyBagWeightKg") {
      const cleanDec = (v) => {
        const raw = String(v || "");
        // Remove everything except digits and decimal point
        const cleaned = raw.replace(/[^0-9.]/g, "");
        if (!cleaned) return "";
        // Only allow one decimal point
        const parts = cleaned.split(".");
        if (parts.length > 2) {
          return parts[0] + "." + parts.slice(1).join("");
        }
        // Limit integer part to 8 digits and decimal part to 2 digits
        const intPart = parts[0].slice(0, 8);
        const decPart = parts[1] ? parts[1].slice(0, 2) : "";
        // If user just typed decimal point or decimal point with no digits after, keep it
        if (cleaned.endsWith(".")) {
          return intPart + ".";
        }
        return decPart ? `${intPart}.${decPart}` : intPart;
      };
      row[field] = cleanDec(value);
    } else if (field === "productName" || field === "brand") {
      row[field] = value;
    }

    // Calculations: net = gross − total weight of empty bags
    const { netKg, bagsDisplay } = computeItemWeights(row);
    row.netWeightKg = netKg ? fmtNum(netKg) : "";
    row.netWeightManDisplay = netKg ? formatKgToMan(netKg) : "";
    row.bagCount = bagsDisplay;

    updated[idx] = row;
    setItems(updated);
    if (field === "brand" || field === "productName") {
      clearItemFieldError(idx, field);
    }
    if (field === "weightAtSmjKg" || field === "emptyBagWeightKg" || field === "bagWeightEachKg") {
      clearItemFieldError(idx, "netWeightKg");
      clearItemFieldError(idx, "weightAtSmjKg");
      clearItemFieldError(idx, "bagWeightEachKg");
    }
  };

  useEffect(() => {
    if (activeBrandIdx < 0) return;
    const el = brandOptionRefs.current?.[activeBrandIdx];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeBrandIdx]);

  useEffect(() => {
    if (activeSenderIdx < 0) return;
    const el = senderOptionRefs.current?.[activeSenderIdx];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeSenderIdx]);

  const getFilteredBrands = (selectedLabel = "") =>
    (brandOptions || []).filter(
      (brand) => !selectedLabel || normalizeText(brand).includes(normalizeText(selectedLabel))
    );

  const getFilteredSenders = (selectedLabel = "") =>
    (allSenderOptions || []).filter(
      (sender) => !selectedLabel || normalizeText(sender).includes(normalizeText(selectedLabel))
    );

  const handleBrandKeyDown = (e, idx, list) => {
    if (!openBrandDropdown || openBrandDropdown !== idx) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveBrandIdx(0);
        setOpenBrandDropdown(idx);
      }
      return;
    }
    const count = list.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveBrandIdx((p) => (count ? (p < 0 ? 0 : (p + 1) % count) : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveBrandIdx((p) => (count ? (p <= 0 ? count - 1 : p - 1) : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeBrandIdx >= 0 && list[activeBrandIdx]) {
        const brand = list[activeBrandIdx];
        setItems((prev) => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], brand, productName: "" };
          return updated;
        });
        clearItemFieldError(idx, "brand");
        setOpenBrandDropdown(null);
      }
    } else if (e.key === "Escape") {
      setOpenBrandDropdown(null);
    }
  };

  const handleSenderKeyDown = (e, list) => {
    if (!openSenderDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSenderIdx(0);
        setOpenSenderDropdown(true);
      }
      return;
    }
    const count = list.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSenderIdx((p) => (count ? (p < 0 ? 0 : (p + 1) % count) : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSenderIdx((p) => (count ? (p <= 0 ? count - 1 : p - 1) : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSenderIdx >= 0 && list[activeSenderIdx]) {
        setForm((prev) => ({ ...prev, senderName: list[activeSenderIdx] }));
        clearFieldError("senderName");
        setOpenSenderDropdown(false);
      }
    } else if (e.key === "Escape") {
      setOpenSenderDropdown(false);
    }
  };

  const renderBrandDropdown = (item, idx) => {
    const selectedLabel = String(item?.brand || "");
    const errorMessage = errors.itemRows?.[idx]?.brand || "";
    const filteredBrands = getFilteredBrands(selectedLabel);
    return (
      <div className="relative">
        <div className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none ${
            errorMessage ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"
          }`}>
          <input
            value={selectedLabel}
            onFocus={() => {
              setActiveBrandIdx(-1);
              setOpenBrandDropdown(idx);
            }}
            onKeyDown={(e) => handleBrandKeyDown(e, idx, filteredBrands)}
            onChange={(e) => {
              const next = sanitizeBrandText(e.target.value, 80);
              setItems((prev) => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], brand: next, productName: "" };
                return updated;
              });
              clearItemFieldError(idx, "brand");
              setActiveBrandIdx(-1);
              setOpenBrandDropdown(idx);
            }}
            onBlur={async () => {
              const typed = String(item?.brand || "").trim();
              if (typed) {
                const resolved = await ensureBrandOption(typed);
                setItems((prev) => {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], brand: resolved || typed };
                  return updated;
                });
              }
              setTimeout(() => setOpenBrandDropdown(null), 120);
            }}
            placeholder="Type company name"
            className="flex-1 bg-transparent outline-none"
          />
          <ChevronDown size={16} className="text-gray-400" />
        </div>
        {openBrandDropdown === idx ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filteredBrands.map((brand, optionIdx) => {
              return (
                <div
                  key={`${brand}-${optionIdx}`}
                  className="flex items-center gap-2 border-t border-gray-100 px-3 py-2"
                >
                  <button
                    type="button"
                    onMouseDown={() => {
                      setItems((prev) => {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], brand, productName: "" };
                        return updated;
                      });
                      clearItemFieldError(idx, "brand");
                      setOpenBrandDropdown(null);
                    }}
                    onMouseEnter={() => setActiveBrandIdx(optionIdx)}
                    ref={(el) => {
                      brandOptionRefs.current[optionIdx] = el;
                    }}
                    className={`flex-1 text-left text-sm ${
                      activeBrandIdx === optionIdx
                        ? "text-emerald-700 bg-emerald-50 font-medium"
                        : "text-gray-700 hover:text-emerald-700"
                    }`}
                  >
                    {brand}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSenderDropdown = () => {
    const selectedLabel = String(form.senderName || "");
    const errorMessage = errors.senderName || "";
    const filteredSenders = getFilteredSenders(selectedLabel);
    return (
      <div className="relative">
        <div className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none ${
            errorMessage ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"
          }`}>
          <input
            value={selectedLabel}
            onFocus={() => {
              setActiveSenderIdx(-1);
              setOpenSenderDropdown(true);
            }}
            onKeyDown={(e) => handleSenderKeyDown(e, filteredSenders)}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, senderName: e.target.value }));
              clearFieldError("senderName");
              setActiveSenderIdx(-1);
              setOpenSenderDropdown(true);
            }}
            onBlur={async () => {
              const typed = String(form.senderName || "").trim();
              if (typed) {
                const resolved = await ensureSenderOption(typed);
                setForm((prev) => ({ ...prev, senderName: resolved || typed }));
              }
              validateField("senderName", String(form.senderName || "").trim());
              setTimeout(() => setOpenSenderDropdown(false), 120);
            }}
            placeholder="Type or select sender name"
            className="flex-1 bg-transparent outline-none"
          />
          <ChevronDown size={16} className="text-gray-400" />
        </div>
        {openSenderDropdown ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filteredSenders.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No matching senders</div>
            ) : (
              filteredSenders.map((sender, optionIdx) => {
                return (
                  <div
                    key={`${sender}-${optionIdx}`}
                    className="flex items-center gap-2 border-t border-gray-100 px-3 py-2"
                  >
                    <button
                      type="button"
                      onMouseDown={() => {
                        setForm((prev) => ({ ...prev, senderName: sender }));
                        clearFieldError("senderName");
                        setOpenSenderDropdown(false);
                      }}
                      onMouseEnter={() => setActiveSenderIdx(optionIdx)}
                      ref={(el) => {
                        senderOptionRefs.current[optionIdx] = el;
                      }}
                      className={`flex-1 text-left text-sm ${
                        activeSenderIdx === optionIdx
                          ? "text-emerald-700 bg-emerald-50 font-medium"
                          : "text-gray-700 hover:text-emerald-700"
                      }`}
                    >
                      {sender}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const normalizeUnit = (unit) => {
      const u = String(unit || "").toLowerCase().trim();
      if (u === "nos" || u === "no" || u === "nos.") return "pcs";
      if (u === "pcs" || u === "pc") return "pcs";
      if (u === "kg" || u === "ton" || u === "bags" || u === "mounds") return u;
      return "pcs";
    };

    const manualItems = await Promise.all(
      items
        .filter((it) => {
          const name = String(
            it?.productMode === "input"
              ? it?.productInput || ""
              : it?.productName || it?.customName || ""
          ).trim();
          return String(it?.brand || "").trim() && name && Number(it?.netWeightKg || 0) > 0;
        })
        .map(async (it) => {
          const rawName = String(
            it?.productMode === "input"
              ? it?.productInput || ""
              : it?.productName || it?.customName || ""
          ).trim();
          const brand = String(it.brand || "").trim();
          let finalName = rawName;
          const exists = (productCatalog || []).some(
            (p) =>
              normalizeText(p.brand) === normalizeText(brand) &&
              normalizeText(p.name) === normalizeText(rawName)
          );
          if (!exists && rawName) {
            const created = await ensureProductOption(brand, rawName);
            finalName = created?.name || rawName;
          }
          const computed = computeItemWeights({
            weightAtSmjKg: it.weightAtSmjKg,
            emptyBagWeightKg: it.emptyBagWeightKg,
            bagWeightEachKg: it.bagWeightEachKg,
          });
          return {
            itemType: finalName,
            stockType: "Production",
            brand,
            customItemName: "",
            quantity: Number(it.netWeightKg || 0),
            unit: normalizeUnit("kg"),
            bagCount: computed.fullBags,
            bagWeightEachKg: Number(it.bagWeightEachKg || 0),
            emptyBagWeightKg: Number(it.emptyBagWeightKg || 0),
            netWeightKg: Number(it.netWeightKg || 0),
            weightAtSmjKg: Number(it.weightAtSmjKg || 0),
            weightOnArrival: Number(it.weightOnArrival || 0),
          };
        })
    );

    const firstBrand = manualItems.find((it) => String(it?.brand || "").trim() !== "")?.brand || "";

    const payload = {
      ...form,
      date: form.date,
      senderName: String(form.senderName || "").trim() || "",
      type: "IN",
      items: manualItems,
      freightCharges: form.freightCharges
        ? Number(form.freightCharges)
        : undefined,
      weightOnArrival: form.weightOnArrival
        ? Number(form.weightOnArrival)
        : undefined,
    };

    try {
      const url = editingId ? `/gatepasses/${editingId}` : "/gatepasses";
      const method = editingId ? "put" : "post";
      const res = await api[method](url, payload);
      if (res.data && res.data.success === false)
        throw new Error(res.data.message || "Save failed");
      toast.success(editingId ? "Gate pass updated." : "Gate pass created.");

      // Reset form
      setForm({
        date: new Date().toISOString().slice(0, 10),
        truckNo: "",
        supplier: "",
        weightOnArrival: "",
        freightCharges: "",
      });
      setItems([emptyItem()]);
      setEditingId(null);
      setErrors({});
      fetchRows();
      window.dispatchEvent(new Event("stock:refresh"));
    } catch (err) {
      toast.error(err.message || "Unable to save.");
      document.getElementById("gatepass-in-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleEdit = (row) => {
    setForm({
      date: row.date ? String(row.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      truckNo: row.truckNo || "",
      senderName: row.supplier || row.senderName || "",
      weightOnArrival: row.weightOnArrival ? String(row.weightOnArrival) : "",
      freightCharges: row.freightCharges ? String(row.freightCharges) : "",
    });
    const rowItems = (row.items || []).map((it) => {
      const qty = Number(it?.quantity || it?.netWeightKg || 0);
      const wSmj = Number(it?.weightAtSmjKg || 0);
      const bagW = Number(it?.bagWeightEachKg || it?.bagWeightKg || 0);
      const computed = computeItemWeights({
        weightAtSmjKg: wSmj,
        emptyBagWeightKg: it?.emptyBagWeightKg,
        bagWeightEachKg: bagW,
      });
      const netKg = wSmj > 0 ? computed.netKg : qty;
      const bagsDisplay = wSmj > 0 ? computed.bagsDisplay : "";
      return {
        brand: String(it.brand || "").trim(),
        brandMode: "list",
        brandInput: "",
        productName: String(it.itemType || it.customItemName || "").trim(),
        productMode: "list",
        productInput: "",
        weightOnArrival: it.weightOnArrival != null ? String(it.weightOnArrival) : "",
        weightAtSmjKg: wSmj ? String(wSmj) : "",
        emptyBagWeightKg: it.emptyBagWeightKg != null ? String(it.emptyBagWeightKg) : "",
        netWeightKg: netKg ? fmtNum(netKg) : "",
        netWeightManDisplay: netKg ? formatKgToMan(netKg) : "",
        bagWeightEachKg: it.bagWeightEachKg != null ? String(it.bagWeightEachKg) : (it.bagWeightKg != null ? String(it.bagWeightKg) : "65"),
        bagCount: bagsDisplay || (it.bagCount != null ? String(it.bagCount) : ""),
      };
    });
    setItems(
      rowItems.length > 0
        ? rowItems
        : [emptyItem()]
    );

    setEditingId(row._id);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (row) => {
    setConfirmDialog({
      open: true,
      title: "Delete Gate Pass",
      message: `Are you sure you want to delete Gate Pass ${
        row.gatePassNo || ""
      }? Stock entries will remain. This action cannot be undone.`,
      onConfirm: async () => {
        if (confirmDialog.expectedText && confirmInput !== confirmDialog.expectedText) {
          toast.error("Please type the gate pass number to confirm.");
          return;
        }
        try {
          const res = await api.delete(`/gatepasses/${row._id}`);
          if (res.data && res.data.success === false)
            throw new Error(res.data.message || "Delete failed");
          toast.success("Gate pass deleted.");
          fetchRows();
        } catch (err) {
          toast.error(err.message || "Unable to delete");
        } finally {
          setConfirmDialog({
            open: false,
            title: "",
            message: "",
            onConfirm: null,
            expectedText: "",
          });
          setConfirmInput("");
        }
      },
      expectedText: row.gatePassNo || "DELETE",
    });
    setConfirmInput("");
  };

  // Print window - A5 size (148mm x 210mm)
  const openPrintWindow = async (row) => {
    const win = window.open("", "_blank", "width=600,height=842");
    if (!win) return;

    const millName = settings?.companyName || settings?.name || "Rice Mill";
    const millAddress = settings?.companyAddress || settings?.address || "";
    const apiHost = api.defaults.baseURL.replace(/\/api\/?$/, "");
    const logo =
      settings?.logoUrl ||
      settings?.logo ||
      settings?.logoPath ||
      `${apiHost}/uploads/logo.png`;

    const logoHtml = logo
      ? `<img src="${logo}" style="height:96px;margin-right:10px;" alt="logo" />`
      : `<div style="width:50px;height:50px;background:#d1fae5;color:#047857;display:inline-flex;align-items:center;justify-content:center;font-weight:700;margin-right:12px;border-radius:8px;font-size:20px;">GP</div>`;

    const paddyBrands = Array.from(
      new Set(
        (row.items || [])
          .filter((it) => String(it?.itemType || "").toLowerCase() === "paddy")
          .map((it) => String(it?.brand || "").trim())
          .filter(Boolean),
      ),
    );

    let itemsHtml = "";
    if (row.items && row.items.length > 0) {
      itemsHtml = row.items
        .map((item) => {
          const companyName = String(item?.brand || "").trim();
          const displayName =
            item.itemType === "Other" && item.customItemName
              ? `${item.itemType} (${item.customItemName})`
              : item.itemType || "-";
          const net = item.netWeightKg || item.quantity || 0;
          const bagW = item.bagWeightEachKg || item.bagWeightKg || 0;
          const emptyW = item.emptyBagWeightKg || 0;
          const weightAtSmj = item.weightAtSmjKg || 0;
          const weightOnArrival = item.weightOnArrival || 0;

          // Format bags (whole count) + leftover weight
          const bagsDisplay = computeItemWeights({
            weightAtSmjKg: weightAtSmj,
            emptyBagWeightKg: emptyW,
            bagWeightEachKg: bagW,
          }).bagsDisplay;

          return `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${companyName || "-"}</td>
          <td style="border:1px solid #ddd;padding:6px;">${displayName}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(weightOnArrival)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(weightAtSmj)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(emptyW)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(bagW)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(net)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${formatKgToMan(net)}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${bagsDisplay}</td>
        </tr>`;
        })
        .join("");
    }

    // Inward gate pass is manual (no invoices).
    const totalNetKg = (row.items || []).reduce(
      (sum, it) => sum + Number(it.netWeightKg || it.quantity || 0),
      0
    );
    const itemsTableHtml = `
      <table>
        <thead><tr><th>Company</th><th>Product</th><th style="text-align:right;">Wt on Arrival</th><th style="text-align:right;">Wt at SMJ</th><th style="text-align:right;">Total Empty Bags</th><th style="text-align:right;">Bag Wt Each</th><th style="text-align:right;">Net (kg)</th><th style="text-align:right;">Net (man/kg)</th><th style="text-align:right;">Bags</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;font-weight:700;">
            <td style="border:1px solid #ddd;padding:6px;" colspan="6">Total</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(totalNetKg)}</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${formatKgToMan(totalNetKg)}</td>
            <td style="border:1px solid #ddd;padding:6px;"></td>
          </tr>
        </tfoot>
      </table>
    `;

    const html = `
      <html><head><title>Gate Pass ${row.gatePassNo || ""}</title>
      <style>
        @media print { @page { size: A5; margin: 10mm; } }
        body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;margin:0;padding:12mm;width:148mm;min-height:210mm;box-sizing:border-box;}
        .header{display:flex;flex-direction:row;align-items:center;gap:10px;border-bottom:2px solid #047857;padding-bottom:4px;margin-bottom:4px;line-height:1;}
        .header img{margin:0;display:block;}
        .header .title{margin-top:0;text-align:left;}
        .title{font-weight:700;color:#047857;font-size:18px;line-height:1.2;}
        .addr{font-size:11px;color:#6b7280;margin-top:2px;}
        .tag{display:inline-block;margin-top:4px;padding:3px 8px;border-radius:4px;background:#d1fae5;color:#047857;font-weight:600;font-size:11px;}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin:12px 0;}
        .info div{display:flex;justify-content:space-between;padding:4px 0;}
        .label{color:#6b7280;font-weight:500;}
        .value{color:#111;font-weight:600;}
        table{width:100%;border-collapse:collapse;margin:12px 0;font-size:11px;}
        th{background:#f0fdf4;color:#065f46;padding:6px;border:1px solid #ddd;text-align:left;}
        .remarks{display:none;}
        .footer{margin-top:20px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px;}
      </style></head><body>
      <div class="header">
        ${logoHtml}
        <div style="flex:1;">
          <div class="title">${millName}</div>
          <div class="addr">${millAddress}</div>
          <div class="tag">INWARD GATE PASS</div>
        </div>
      </div>
      
      <div class="info">
        <div><span class="label">Gate Pass No:</span><span class="value">${
          row.gatePassNo || "-"
        }</span></div>
        <div><span class="label">Date:</span><span class="value">${
          row.date
            ? new Date(row.date).toLocaleDateString()
            : (row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-")
        }</span></div>
        <div><span class="label">Sender Name:</span><span class="value">${
          row.supplier || row.senderName || "-"
        }</span></div>
        <div><span class="label">Truck No:</span><span class="value">${
          row.truckNo || "-"
        }</span></div>
        <div><span class="label">Freight Charges:</span><span class="value">${
          row.freightCharges != null && Number(row.freightCharges) > 0
            ? fmtNum(row.freightCharges)
            : "-"
        }</span></div>
      </div>

      ${itemsTableHtml}

      <div class="footer">
        <div>Authorized Signature: _________________</div>
        <div style="margin-top:4px;">Printed on ${new Date().toLocaleString()}</div>
      </div>
      
      <button onclick="window.print()" style="margin-top:12px;padding:6px 10px;border:1px solid #ddd;border-radius:4px;background:#047857;color:#fff;font-size:12px;">Print</button>
      </body></html>
    `;
    win.document.write(html);
    win.document.close();
  };

  const itemListText = (row, getter) => {
    const list = (row.items || []).map(getter).filter(Boolean);
    return list.length ? Array.from(new Set(list)).join(", ") : "-";
  };

  const tableColumns = [
    {
      key: "date",
      label: "Date",
      render: (_val, row) =>
        row?.date
          ? new Date(row.date).toLocaleDateString()
          : row?.createdAt
            ? new Date(row.createdAt).toLocaleDateString()
            : "-",
    },
    { key: "gatePassNo", label: "GP No" },
    {
      key: "senderName",
      label: "Sender Name",
      render: (_val, row) => row.supplier || row.senderName || "-",
    },
    {
      key: "companyNames",
      label: "Company",
      render: (_val, row) => itemListText(row, (it) => String(it.brand || "").trim()),
    },
    { key: "truckNo", label: "Truck" },
    {
      key: "items",
      label: "Product Name",
      render: (_val, row) =>
        itemListText(row, (it) =>
          String(
            it.itemType === "Other" && it.customItemName
              ? it.customItemName
              : it.itemType || "Item"
          ).trim()
        ),
    },
    {
      key: "weightOnArrival",
      label: "Wt on Arrival (kg)",
      render: (_val, row) => itemListText(row, (it) => fmtNum(it.weightOnArrival)),
    },
    {
      key: "weightAtSmjKg",
      label: "Wt at SMJ (kg)",
      render: (_val, row) => itemListText(row, (it) => fmtNum(it.weightAtSmjKg)),
    },
    {
      key: "emptyBagWeightKg",
      label: "Weight of Empty Bags (kg)",
      render: (_val, row) => itemListText(row, (it) => fmtNum(it.emptyBagWeightKg)),
    },
    {
      key: "netWeightKg",
      label: "Net Weight (kg)",
      render: (_val, row) => itemListText(row, (it) => fmtNum(it.netWeightKg || it.quantity)),
    },
    {
      key: "netWeightMan",
      label: "Net Weight (man/kg)",
      render: (_val, row) => itemListText(row, (it) => formatKgToMan(it.netWeightKg || it.quantity)),
    },
    {
      key: "bagWeightEachKg",
      label: "Bag Wt Each (kg)",
      render: (_val, row) =>
        itemListText(row, (it) => fmtNum(it.bagWeightEachKg || it.bagWeightKg)),
    },
    {
      key: "bagCount",
      label: "No. of Bags",
      render: (_val, row) =>
        itemListText(row, (it) =>
          computeItemWeights({
            weightAtSmjKg: it.weightAtSmjKg,
            emptyBagWeightKg: it.emptyBagWeightKg,
            bagWeightEachKg: it.bagWeightEachKg || it.bagWeightKg,
          }).bagsDisplay || String(it.bagCount || "").trim()
        ),
    },
    {
      key: "freightCharges",
      label: "Freight",
      render: (val) => (val != null && Number(val) > 0 ? fmtNum(val) : "-"),
    },
    {
      key: "actions",
      label: "Actions",
      align: "center",
      skipExport: true,
      render: (_, row) => (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="p-1 rounded hover:bg-emerald-50"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={() => handleDelete(row)}
            className="p-1 rounded hover:bg-red-50"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
          <button
            onClick={() => openPrintWindow(row)}
            className="p-1 rounded hover:bg-gray-100"
            title="Print"
          >
            <Printer className="w-4 h-4 text-gray-700" />
          </button>
        </div>
      ),
    },
  ];

  const exportColumns = [
    { key: "date", label: "Date", render: (val) => (val ? new Date(val).toLocaleDateString() : "-") },
    { key: "gatePassNo", label: "GP No" },
    { key: "truckNo", label: "Truck" },
    { key: "senderName", label: "Sender Name" },
    { key: "companyName", label: "Company" },
    { key: "productName", label: "Product" },
    { key: "weightOnArrival", label: "Weight on Arrival (kg)" },
    { key: "weightAtSmjKg", label: "Weight at SMJ (kg)" },
    { key: "emptyBagWeightKg", label: "Weight of Empty Bags (kg)" },
    { key: "netWeightKg", label: "Net Weight (kg)" },
    { key: "bagWeightEachKg", label: "Bag Weight Each (kg)" },
    { key: "bagCount", label: "Bags" },
    { key: "freightCharges", label: "Freight" },
  ];

  const exportData = (rows) =>
    (rows || []).flatMap((row) => {
      const itemsList = Array.isArray(row.items) && row.items.length ? row.items : [{}];
      return itemsList.map((it) => {
        const netKg = Number(it.netWeightKg || it.quantity || 0);
        const bagW = Number(it.bagWeightEachKg || it.bagWeightKg || 0);
        const computed = computeItemWeights({
          weightAtSmjKg: it.weightAtSmjKg,
          emptyBagWeightKg: it.emptyBagWeightKg,
          bagWeightEachKg: bagW,
        });
        let bagCountDisplay = it.bagCount || "";
        if (computed.bagsDisplay) bagCountDisplay = computed.bagsDisplay;
        return {
          date: row.date,
          gatePassNo: row.gatePassNo,
          truckNo: row.truckNo,
          senderName: row.supplier || row.senderName || "",
          companyName: String(it.brand || "").trim(),
          productName: it.itemType || it.customItemName || "",
          weightOnArrival: it.weightOnArrival || "",
          weightAtSmjKg: it.weightAtSmjKg || "",
          emptyBagWeightKg: it.emptyBagWeightKg || "",
          netWeightKg: Number(netKg.toFixed(2)),
          bagWeightEachKg: it.bagWeightEachKg || it.bagWeightKg || "",
          bagCount: bagCountDisplay,
          freightCharges: row.freightCharges != null ? row.freightCharges : "",
        };
      });
    });

  const filteredRows = React.useMemo(
    () => applyGatePassFilters(rows, filterCriteria, { senderKeys: ["supplier", "senderName"] }),
    [rows, filterCriteria]
  );

  const allSenderOptions = React.useMemo(() => {
    const map = new Map();
    (senderOptions || []).forEach((name) => {
      const clean = String(name || "").trim();
      if (clean) map.set(normalizeText(clean), clean);
    });
    (rows || []).forEach((r) => {
      const name = String(r?.supplier || r?.senderName || "").trim();
      if (name) map.set(normalizeText(name), name);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [senderOptions, rows]);

  const reportLines = React.useMemo(
    () => gatePassFilterSummary(filterCriteria, "Sender"),
    [filterCriteria]
  );

  return (
    <div className="space-y-4">
      {/* Confirmation Dialog */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {confirmDialog.title}
              </h3>
              <button
                onClick={() =>
                  setConfirmDialog({
                    open: false,
                    title: "",
                    message: "",
                    onConfirm: null,
                  })
                }
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {confirmDialog.message}
            </p>
            {confirmDialog.expectedText && (
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Type {confirmDialog.expectedText} to confirm
                </label>
                <input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                  placeholder={confirmDialog.expectedText}
                />
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setConfirmDialog({
                    open: false,
                    title: "",
                    message: "",
                    onConfirm: null,
                    expectedText: "",
                  })
                }
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await confirmDialog.onConfirm?.();
                  setConfirmDialog({
                    open: false,
                    title: "",
                    message: "",
                    onConfirm: null,
                    expectedText: "",
                  });
                  setConfirmInput("");
                }}
                disabled={
                  confirmDialog.expectedText &&
                  confirmInput !== confirmDialog.expectedText
                }
                className={`px-4 py-2 rounded-lg text-sm ${
                  confirmDialog.expectedText &&
                  confirmInput !== confirmDialog.expectedText
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Form */}
<form
  id="gatepass-in-form"
  data-tour="gatepass-in"
  onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-4 space-y-4"
      >
        <h2 className="text-lg font-semibold text-emerald-700">
          Inward Gate Pass
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Date */}
          <div id="field-date">
            <label className="block text-sm font-medium mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.date ? "border-red-500" : "border-gray-300"
              }`}
            />
            {renderFieldError(errors.date)}
          </div>

          {/* Truck No */}
          <div id="field-truckNo">
            <label className="block text-sm font-medium mb-1">
              Truck No <span className="text-red-500">*</span>
            </label>
            <input
              name="truckNo"
              value={form.truckNo}
              onChange={handleChange}
              placeholder="Enter truck number"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.truckNo ? "border-red-500" : "border-gray-300"
              }`}
            />
            {renderFieldError(errors.truckNo)}
          </div>

          {/* Sender Name */}
          <div id="field-senderName" data-tour="gatepass-in-sender">
            <label className="block text-sm font-medium mb-1">
              Sender Name <span className="text-red-500">*</span>
            </label>
            {renderSenderDropdown()}
            {renderFieldError(errors.senderName)}
          </div>
        </div>

        {/* Items */}
        <div className="border-t pt-4" id="field-items" data-tour="gatepass-in-items">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Products
          </h3>
          <div className="mb-2">{renderFieldError(errors.items)}</div>
          <div className="p-3 bg-gray-50 rounded-lg space-y-3">
            {(items || []).map((it, idx) => (
              <div key={`in-item-${idx}`} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Product {idx + 1}</span>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_x, i) => i !== idx))}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                      title="Remove product"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Row 1: Company, Product, Weight on Arrival */}
                <div className="grid md:grid-cols-3 gap-3 items-start">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-500">
                        Company Name (Product Owner)
                      </label>
                    </div>
                    {renderBrandDropdown(it, idx)}
                    {renderFieldError(errors.itemRows?.[idx]?.brand)}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Product Name</label>
                    {it?.productMode !== "input" ? (
                      <select
                        value={it?.productName ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === OTHER_OPTION) {
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], productMode: "input", productInput: "" };
                              return updated;
                            });
                            return;
                          }
                          handleItemChange(idx, "productName", v);
                          clearItemFieldError(idx, "productName");
                        }}
                        disabled={!String(it?.brand || "").trim()}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                          errors.itemRows?.[idx]?.productName
                            ? "border-red-500 bg-red-50"
                            : "border-gray-300"
                        }`}
                      >
                        <option value="">
                          {it?.brand ? "Select product" : "Select company first"}
                        </option>
                        {getProductOptionsForBrand(it?.brand).map((name, nIdx) => (
                          <option key={`${name}-${nIdx}`} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value={OTHER_OPTION}>Add New</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          value={it?.productInput ?? ""}
                          onChange={(e) =>
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx] = {
                                ...updated[idx],
                                productInput: sanitizeBrandText(e.target.value, 80),
                              };
                              return updated;
                            })
                          }
                          placeholder="Enter product name"
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${
                            errors.itemRows?.[idx]?.productName
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const brand = String(it?.brand || "").trim();
                            const input = it?.productInput || "";
                            const result = await ensureProductOption(brand, input);
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx] = {
                                ...updated[idx],
                                productName: result.name,
                                productInput: "",
                                productMode: "list",
                              };
                              return updated;
                            });
                            clearItemFieldError(idx, "productName");
                          }}
                          className="px-3 py-2 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                        >
                          List
                        </button>
                      </div>
                    )}
                    {renderFieldError(errors.itemRows?.[idx]?.productName)}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weight on Arrival (kg)</label>
                    <input
                      inputMode="numeric"
                      value={it?.weightOnArrival ?? ""}
                      onChange={(e) => handleItemChange(idx, "weightOnArrival", e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
                  </div>
                </div>

                {/* Row 2: Weight at SMJ, Empty Bags Weight, Net Weight (kg) */}
                <div className="grid md:grid-cols-3 gap-3 items-start mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weight at SMJ (kg) <span className="text-red-500">*</span></label>
                    <input
                      value={it?.weightAtSmjKg ?? ""}
                      onChange={(e) => handleItemChange(idx, "weightAtSmjKg", e.target.value)}
                      placeholder="0"
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                        errors.itemRows?.[idx]?.weightAtSmjKg ? "border-red-500 bg-red-50" : "border-gray-300"
                      }`}
                    />
                    {renderFieldError(errors.itemRows?.[idx]?.weightAtSmjKg)}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weight of Empty Bags (kg)</label>
                    <input
                      type="number"
                      step="any"
                      value={it?.emptyBagWeightKg ?? ""}
                      onChange={(e) => handleItemChange(idx, "emptyBagWeightKg", e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Net Weight (kg)</label>
                    <input
                      value={it?.netWeightKg ?? ""}
                      readOnly
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none bg-gray-100 font-semibold ${
                        errors.itemRows?.[idx]?.netWeightKg ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {renderFieldError(errors.itemRows?.[idx]?.netWeightKg)}
                  </div>
                </div>

                {/* Row 3: Net Weight (man/kg), Bag Weight Each, No. of Bags (auto) */}
                <div className="grid md:grid-cols-3 gap-3 items-start mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Net Weight (man / kg)</label>
                    <input
                      value={it?.netWeightManDisplay ?? ""}
                      readOnly
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none bg-emerald-50 text-emerald-700 font-semibold border-gray-300"
                      placeholder="Auto"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bag Weight Each (kg) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      step="any"
                      value={it?.bagWeightEachKg ?? ""}
                      onChange={(e) => handleItemChange(idx, "bagWeightEachKg", e.target.value)}
                      placeholder="65"
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                        errors.itemRows?.[idx]?.bagWeightEachKg ? "border-red-500 bg-red-50" : "border-gray-300"
                      }`}
                    />
                    {renderFieldError(errors.itemRows?.[idx]?.bagWeightEachKg)}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">No. of Bags (auto)</label>
                    <input
                      value={it?.bagCount ?? ""}
                      readOnly
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none bg-gray-100 font-semibold border-gray-300"
                      placeholder="Auto"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Freight Charges */}
            <div className="grid md:grid-cols-1 gap-3 items-start">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Freight Charges</label>
                <input
                  name="freightCharges"
                  value={form.freightCharges}
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                data-tour="gatepass-in-add-row"
                onClick={() => setItems((prev) => [...(prev || []), emptyItem()])}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              data-tour="gatepass-in-submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow hover:bg-emerald-700"
            >
              {editingId ? "Update Gate Pass" : "Generate Gate Pass"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({
                    date: new Date().toISOString().slice(0, 10),
                    truckNo: "",
                    senderName: "",
                    freightCharges: "",
                  });
                  setItems([emptyItem()]);
                  setErrors({});
                }}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </form>

      <div data-tour="gatepass-in-records">
      <DataTable
        title="Gate Pass IN"
        columns={tableColumns}
        data={filteredRows}
        idKey="_id"
        highlightId={highlightId}
        highlightKey={/^[a-f\d]{24}$/i.test(String(highlightId || "")) ? "_id" : "gatePassNo"}
        searchPlaceholder="Search gate passes..."
        emptyMessage={loading ? "Loading..." : "No gate passes found."}
        showSearch={false}
        showFilters={false}
        toolbarActionsInHeader
        toolbarActions={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((o) => !o)}
            title="Filters"
          />
        }
        belowHeader={
          filterOpen ? (
            <GatePassFilter
              rows={rows}
              senderKeys={["supplier", "senderName"]}
              senderLabel="Sender Company"
              onChange={setFilterCriteria}
            />
          ) : null
        }
        exportColumns={exportColumns}
        exportData={exportData}
        reportContextLines={reportLines}
      />
      </div>

      <AddOptionModal
        open={brandModal.open}
        title="Manage Company Names"
        subtitle="Add brand, select products, set conversion and pricing."
        maxWidthClass="max-w-[20cm]"
        onClose={() => setBrandModal(createBrandModalState())}
        onSubmit={saveBrandFromModal}
        submitLabel="Add"
        loading={brandModal.saving}
      >
        <div className="space-y-4">
          <div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6">
                <label className="block text-xs text-gray-600 mb-1">
                  Company Name *
                </label>
                {brandModal.value !== OTHER_OPTION ? (
                  <select
                    className={`w-full border rounded px-3 py-2 text-sm ${
                      brandModal.errors?.value ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                    value={brandModal.value}
                    onChange={(e) =>
                      setBrandModal((prev) => {
                        const nextValue = e.target.value;
                        const nextBrandName =
                          nextValue === OTHER_OPTION ? prev.valueOther : nextValue;
                        return {
                          ...prev,
                          value: nextValue,
                          valueOther: nextValue === OTHER_OPTION ? prev.valueOther : "",
                          productRows:
                            nextValue && nextValue !== OTHER_OPTION
                              ? getBrandProducts(nextValue)
                              : prev.productRows,
                          draft: {
                            ...(prev.draft || {}),
                            nameSelect: "",
                            nameOther: "",
                          },
                          errors: {
                            ...(prev.errors || {}),
                            value: validateBrandValue(nextBrandName),
                            rowsGeneral: "",
                          },
                        };
                      })
                    }
                  >
                    <option value="">Select company name</option>
                    {brandOptions.map((b, idx) => (
                      <option key={`brand-opt-${b}-${idx}`} value={b}>
                        {b}
                      </option>
                    ))}
                    <option value={OTHER_OPTION}>Other</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className={`w-full border rounded px-3 py-2 text-sm ${
                        brandModal.errors?.value ? "border-red-400 bg-red-50" : "border-gray-300"
                      }`}
                      value={brandModal.valueOther || ""}
                      onChange={(e) =>
                        setBrandModal((prev) => {
                          const next = sanitizeBrandText(e.target.value, 80);
                          const match = findSimilarBrand(next);
                          if (match) {
                            return {
                              ...prev,
                              value: match,
                              valueOther: "",
                              productRows: getBrandProducts(match),
                            errors: {
                              ...(prev.errors || {}),
                              value: `Similar company already exists: "${match}".`,
                            },
                            };
                          }
                          return {
                            ...prev,
                            valueOther: next,
                            errors: { ...(prev.errors || {}), value: validateBrandValue(next) },
                          };
                        })
                      }
                      onBlur={() =>
                        setBrandModal((prev) => ({
                          ...prev,
                          valueOther: toTitleCase(prev.valueOther || ""),
                        }))
                      }
                      placeholder="Enter company name"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBrandModal((prev) => ({
                          ...prev,
                          value: "",
                          valueOther: "",
                          errors: { ...(prev.errors || {}), value: "" },
                        }))
                      }
                      className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      List
                    </button>
                  </div>
                )}
                {brandModal.errors?.value ? (
                  <p className="mt-1 text-xs text-red-500">{brandModal.errors.value}</p>
                ) : null}
              </div>
              <div className="col-span-12 md:col-span-6">
                <label className="block text-xs text-gray-600 mb-1">Product Name *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={`w-full border rounded px-3 py-2 text-sm ${
                      brandModal.errors?.draft?.name ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                    value={brandModal.draft?.nameOther || ""}
                    onChange={(e) => handleBrandDraftChange("nameOther", e.target.value)}
                    onBlur={() =>
                      setBrandModal((prev) => ({
                        ...prev,
                        draft: {
                          ...(prev.draft || {}),
                          nameOther: toTitleCase(prev.draft?.nameOther || ""),
                        },
                      }))
                    }
                    placeholder="Enter product name"
                  />
                  <button
                    type="button"
                    onClick={() => handleBrandDraftChange("toggleProductList")}
                    className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    List
                  </button>
                </div>
                {brandModal.draft?.showList && (
                  <select
                    className="w-full border rounded px-3 py-2 text-sm mt-2"
                    value=""
                    onChange={(e) => handleBrandDraftChange("nameOther", e.target.value)}
                  >
                    <option value="">Select product</option>
                    {productNameOptions.map((name, idx) => (
                      <option key={`brand-template-${name}-${idx}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">Base Unit</label>
                <input
                  type="text"
                  value="KG"
                  readOnly
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-100 text-gray-600"
                />
              </div>

              <div className="col-span-12 md:col-span-9">
                <label className="block text-xs text-gray-600 mb-1">Processing Pricing per KG (PKR) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`w-full border rounded px-3 py-2 text-sm ${
                    brandModal.errors?.draft?.pricePerKg ? "border-red-400 bg-red-50" : "border-gray-300"
                  }`}
                  value={brandModal.draft?.pricePerKg || ""}
                  onChange={(e) =>
                    setBrandModal((prev) => {
                      const pricePerKg = sanitizeIntegerText(e.target.value, 8);
                      return {
                        ...prev,
                        draft: {
                          ...(prev.draft || {}),
                          pricePerKg,
                        },
                        errors: { ...(prev.errors || {}), draft: {} },
                      };
                    })
                  }
                  placeholder="Required"
                />
              </div>

              <div className="col-span-12">
                <label className="block text-xs text-gray-600 mb-1">
                  Conversion Factor (1 unit = ? KG) - editable
                </label>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>1 Bag =</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`w-24 border rounded px-2 py-1 ${
                      brandModal.errors?.draft?.bagKg ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                    value={brandModal.draft?.bagKg || ""}
                    onChange={(e) => handleBrandDraftChange("bagKg", e.target.value)}
                  />
                  <span>KG</span>
                  <span>1 Ton =</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`w-24 border rounded px-2 py-1 ${
                      brandModal.errors?.draft?.tonKg ? "border-red-400 bg-red-50" : "border-gray-300"
                    }`}
                    value={brandModal.draft?.tonKg || ""}
                    onChange={(e) => handleBrandDraftChange("tonKg", e.target.value)}
                  />
                  <span>KG</span>
                  <button
                    type="button"
                    onClick={addDraftProductRow}
                    className="ml-auto px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Add Product
                  </button>
                </div>
                {Object.values(brandModal.errors?.draft || {}).length > 0 ? (
                  <p className="mt-1 text-xs text-red-500">Please fill all required product fields.</p>
                ) : null}
              </div>
            </div>
          </div>
          <div>
            <div className="rounded border border-gray-200 p-2 min-h-[44px]">
              {(brandModal.productRows || []).length === 0 ? (
                <div className="text-xs text-gray-400">No products added yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(brandModal.productRows || []).map((row, idx) => (
                    <div key={`brand-product-pill-${idx}`} className="inline-flex items-center px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs">
                      <span>{row.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {brandModal.errors?.rowsGeneral ? (
              <p className="mt-1 text-xs text-red-500">{brandModal.errors.rowsGeneral}</p>
            ) : null}
          </div>
        </div>
      </AddOptionModal>
    </div>
  );
}



