import React, { useEffect, useState } from "react";
import { Edit2, Trash2, Printer, X, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import DataTable from "../ui/DataTable";
import AddOptionModal from "../ui/AddOptionModal";

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
  const [productCatalog, setProductCatalog] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    truckNo: "",
    supplier: "",
    driverName: "",
    driverContact: "",
    freightCharges: "",
  });
  const [items, setItems] = useState([
    {
      brand: "",
      brandMode: "list",
      brandInput: "",
      productName: "",
      productMode: "list",
      productInput: "",
      bagCount: "",
      bagWeightKg: "65",
      emptyBagWeightKg: "",
      netWeightKg: "",
    },
  ]);

  const [errors, setErrors] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [brandModal, setBrandModal] = useState(createBrandModalState);

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
  const truckRegex = /^[A-Z]{2,4}-\d{3,4}$/;
  const contactRegex = /^03\d{2}-\d{7}$/; // 03XX-XXXXXXX

  const setFieldError = (field, msg) =>
    setErrors((p) => ({ ...p, [field]: msg }));
  const clearFieldError = (field) =>
    setErrors((p) => {
      const c = { ...p };
      delete c[field];
      return c;
    });

  // Validation functions
  const validateTruckNo = (v) => {
    if (!v) return "Truck number is required.";
    if (v.length < 6) return "Truck number too short.";
    if (v.length > 12) return "Truck number too long.";
    if (!truckRegex.test(v)) return "Format: ABC-123 or AB-1234";
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

  const validateField = (name, value) => {
    let msg = "";
    if (name === "date") msg = value ? "" : "Date is required.";
    if (name === "truckNo") msg = validateTruckNo(value);
    if (name === "supplier") {
      msg = value ? (nameRegex.test(value) ? "" : "Company Name: letters and spaces only.") : "";
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
    const hasItem = (items || []).some((it) => {
      const name = String(
        it?.productMode === "input"
          ? it?.productInput || ""
          : it?.productName || it?.customName || ""
      ).trim();
      return String(it?.brand || "").trim() && name && Number(it?.netWeightKg || 0) > 0;
    });
    const e2 = needsBrand()
      ? form.supplier || hasItem
        ? ""
        : "Company Name is required."
      : "";
    const e3 = form.driverName ? validateDriverName(form.driverName) : "";
    const e4 = form.driverContact ? validateDriverContact(form.driverContact) : "";
    const e5 = form.freightCharges ? "" : "";

    const newErr = {};
    if (e0) newErr.date = e0;
    if (e1) newErr.truckNo = e1;
    if (e2) newErr.supplier = e2;
    if (e3) newErr.driverName = e3;
    if (e4) newErr.driverContact = e4;
    if (e5) newErr.freightCharges = e5;
    if (!hasItem) newErr.items = "Add at least one item with net weight.";
    setErrors(newErr);
    if (Object.keys(newErr).length > 0) {
      const firstKey = Object.keys(newErr)[0];
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
    let s = raw.toUpperCase();
    s = s.replace(/[^A-Z0-9]/g, "");
    const letters = (s.match(/^[A-Z]*/)[0] || "").slice(0, 4);
    const digits = s.slice(letters.length).replace(/[^0-9]/g, "").slice(0, 4);
    if (!digits) return letters;
    return `${letters}-${digits}`;
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
      const key = normalizeText(clean);
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
    const exists = (brandOptions || []).some((b) => normalizeText(b) === normalizeText(clean));
    if (exists) return clean;
    const nextOptions = Array.from(new Set([...(brandOptions || []), clean])).sort();
    setBrandOptions(nextOptions);
    try {
      await api.put("/settings", { brandOptions: nextOptions });
    } catch {}
    return clean;
  };

  const ensureProductOption = async (brand, name) => {
    const cleanBrand = toTitleCase(String(brand || "").trim());
    const cleanName = toTitleCase(String(name || "").trim());
    if (!cleanBrand || !cleanName) return { brand: cleanBrand, name: cleanName };
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
    if (v.length > 100) return "Company Name must be 100 characters or less";
    return "";
  };

  const getBrandModalName = (modal) =>
    String(
      modal?.value === OTHER_OPTION ? modal?.valueOther || "" : modal?.value || ""
    ).trim();

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

  const sanitizeIntegerText = (value, max = 8) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, max);

  const validateBrandRow = (row = {}) => {
    const errors = {};
    const name = String(row.name || "").trim();
    if (!name) errors.name = "Product name is required";
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
    const brandExists = (brandOptions || []).some(
      (b) => normalizeText(b) === normalizeText(brandName)
    );
    const isNewBrand = String(modal.valueOther || "").trim().length > 0;
    const duplicateBrandError =
      brandExists && isNewBrand ? "Company Name already exists." : "";
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
    if (name === "supplier" && value === OTHER_OPTION) {
      setBrandModal({ ...createBrandModalState(), open: true });
      return;
    }
    if (name === "freightCharges") {
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
    const brandName = getBrandModalName(brandModal);

    const nextOptions = Array.from(
      new Set([...(brandOptions || []), brandName])
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

      setForm((prev) => ({ ...prev, supplier: brandName }));
      clearFieldError("supplier");
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

  const handleItemChange = (idx, field, value) => {
    const updated = [...items];
    const cleanInt = (v, max = 8) => String(v || "").replace(/\D/g, "").slice(0, max);
    const cleanDec2 = (v) => {
      const raw = String(v || "").replace(/[^0-9.]/g, "");
      if (!raw) return "";
      if (!raw.includes(".") && raw.length > 1) {
        const intPart = raw.slice(0, 1);
        const dec = raw.slice(1, 3);
        return `${intPart}.${dec}`;
      }
      const [a, b = ""] = raw.split(".");
      const intPart = (a || "0").slice(0, 3);
      const dec = b.slice(0, 2);
      if (raw.includes(".") && dec === "") return `${intPart}.`;
      return dec ? `${intPart}.${dec}` : intPart;
    };
    const formatDec2 = (v) => {
      const raw = String(v || "").replace(/[^0-9.]/g, "");
      if (!raw) return "";
      const [a, b = ""] = raw.split(".");
      const intPart = (a || "0").slice(0, 3);
      const dec = (b || "").padEnd(2, "0").slice(0, 2);
      return `${intPart}.${dec}`;
    };
    const row = { ...(updated[idx] || {}) };

    if (field === "bagCount") {
      row[field] = cleanInt(value, 6);
    } else if (field === "bagWeightKg") {
      row[field] = cleanInt(value, 6);
    } else if (field === "emptyBagWeightKg") {
      row[field] = cleanDec2(value);
    } else if (field === "emptyBagWeightKgBlur") {
      row.emptyBagWeightKg = formatDec2(value);
    } else if (field === "productName" || field === "brand") {
      row[field] = value;
    }

    const bags = Number(row.bagCount || 0);
    const bagW = Number(row.bagWeightKg || 0);
    const emptyW = Number(row.emptyBagWeightKg || 0);
    const net = Math.max(bags * (bagW - emptyW), 0);
    row.netWeightKg = net ? String(Math.round(net)) : "";

    updated[idx] = row;
    setItems(updated);
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
          return {
            itemType: finalName,
            stockType: "Production",
            brand,
            customItemName: "",
            quantity: Number(it.netWeightKg || 0),
            unit: normalizeUnit("kg"),
            bagCount: Number(it.bagCount || 0),
            bagWeightKg: Number(it.bagWeightKg || 0),
            emptyBagWeightKg: Number(it.emptyBagWeightKg || 0),
            netWeightKg: Number(it.netWeightKg || 0),
          };
        })
    );

    const firstBrand = manualItems.find((it) => String(it?.brand || "").trim() !== "")?.brand || "";

    const payload = {
      ...form,
      date: form.date,
      supplier: String(form.supplier || "").trim() || firstBrand || "",
      type: "IN",
      items: manualItems,
      freightCharges: form.freightCharges
        ? Number(form.freightCharges)
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
        driverName: "",
        driverContact: "",
        freightCharges: "",
      });
      setItems([
                    {
                      brand: "",
                      brandMode: "list",
                      brandInput: "",
                      productName: "",
                      productMode: "list",
                      productInput: "",
                      bagCount: "",
                      bagWeightKg: "65",
                      emptyBagWeightKg: "",
                      netWeightKg: "",
                    },
      ]);
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
      supplier: row.supplier || "",
      driverName: row.driverName || "",
      driverContact: row.driverContact || "",
      freightCharges: row.freightCharges ? String(row.freightCharges) : "",
    });
    const rowItems = (row.items || []).map((it) => {
      const qty = Number(it?.quantity || it?.netWeightKg || 0);
      return {
        brand: String(it.brand || "").trim() || String(row.supplier || "").trim(),
        brandMode: "list",
        brandInput: "",
        productName: String(it.itemType || it.customItemName || "").trim(),
        productMode: "list",
        productInput: "",
        bagCount: it.bagCount != null ? String(it.bagCount) : "",
        bagWeightKg: it.bagWeightKg != null ? String(it.bagWeightKg) : "65",
        emptyBagWeightKg: it.emptyBagWeightKg != null ? String(it.emptyBagWeightKg) : "",
        netWeightKg: qty ? String(Math.round(qty)) : "",
      };
    });
    setItems(
      rowItems.length > 0
        ? rowItems
        : [
            {
              brand: "",
              productName: "",
              bagCount: "",
              bagWeightKg: "65",
              emptyBagWeightKg: "",
              netWeightKg: "",
            },
          ]
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
      }? This will also remove related stock entries. This action cannot be undone.`,
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
          .map((it) => String(it?.brand || row.supplier || "").trim())
          .filter(Boolean),
      ),
    );

    let itemsHtml = "";
    if (row.items && row.items.length > 0) {
      itemsHtml = row.items
        .map((item) => {
          const companyName = String(item?.brand || row.supplier || "").trim();
          const displayName =
            item.itemType === "Other" && item.customItemName
              ? `${item.itemType} (${item.customItemName})`
              : item.itemType || "-";
          const bags = item.bagCount || 0;
          const bagW = item.bagWeightKg || 0;
          const emptyW = item.emptyBagWeightKg || 0;
          const net = item.netWeightKg || item.quantity || 0;
          return `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${companyName || "-"}</td>
          <td style="border:1px solid #ddd;padding:6px;">${displayName}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${bags}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${bagW}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${emptyW}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${Math.round(
            Number(net || 0)
          )}</td>
        </tr>`;
        })
        .join("");
    }

    // Inward gate pass is manual (no invoices).
    const itemsTableHtml = `
      <table>
        <thead><tr><th>Company</th><th>Product</th><th style="text-align:right;">Bags</th><th style="text-align:right;">Bag Wt</th><th style="text-align:right;">Empty Wt</th><th style="text-align:right;">Net (kg)</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;font-weight:700;">
            <td style="border:1px solid #ddd;padding:6px;" colspan="5">Total</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
              (row.items || []).reduce((sum, it) => sum + Number(it.netWeightKg || it.quantity || 0), 0)
            }</td>
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
        <div><span class="label">Truck No:</span><span class="value">${
          row.truckNo || "-"
        }</span></div>
        <div><span class="label">Driver:</span><span class="value">${
          row.driverName || "-"
        }</span></div>
        <div><span class="label">Contact:</span><span class="value">${
          row.driverContact || "-"
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
      key: "companyNames",
      label: "Company",
      render: (_val, row) => {
        const list = (row.items || [])
          .map((it) => String(it.brand || row.supplier || "").trim())
          .filter(Boolean);
        return list.length ? Array.from(new Set(list)).join(", ") : "-";
      },
    },
    { key: "truckNo", label: "Truck" },
    {
      key: "items",
      label: "Items",
      render: (val, row) => {
        const list = (row.items || [])
          .map((it) => {
            const name = it.itemType || it.customItemName || "Item";
            const qty = Math.round(Number(it.netWeightKg || it.quantity || 0));
            return `${name}${qty ? ` (${qty} kg)` : ""}`;
          })
          .filter(Boolean);
        return list.length ? Array.from(new Set(list)).join(", ") : "-";
      },
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
    { key: "companyName", label: "Company" },
    { key: "productName", label: "Product" },
    { key: "bagCount", label: "Bags" },
    { key: "bagWeightKg", label: "Bag Weight (kg)" },
    { key: "emptyBagWeightKg", label: "Empty Bag (kg)" },
    { key: "netWeightKg", label: "Net Weight (kg)" },
    { key: "driverName", label: "Driver" },
    { key: "driverContact", label: "Contact" },
  ];

  const exportData = (rows) =>
    (rows || []).flatMap((row) => {
      const itemsList = Array.isArray(row.items) && row.items.length ? row.items : [{}];
      return itemsList.map((it) => ({
        date: row.date,
        gatePassNo: row.gatePassNo,
        truckNo: row.truckNo,
        companyName: String(it.brand || row.supplier || "").trim(),
        productName: it.itemType || it.customItemName || "",
        bagCount: it.bagCount || "",
        bagWeightKg: it.bagWeightKg || "",
        emptyBagWeightKg: it.emptyBagWeightKg || "",
        netWeightKg: Math.round(Number(it.netWeightKg || it.quantity || 0)),
        driverName: row.driverName || "",
        driverContact: row.driverContact || "",
      }));
    });

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
                onClick={confirmDialog.onConfirm}
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
            {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
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
              placeholder="ABCD-1234"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.truckNo ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.truckNo && (
              <p className="text-xs text-red-500 mt-1">{errors.truckNo}</p>
            )}
          </div>

          {/* Driver Name */}
          <div id="field-driverName">
            <label className="block text-sm font-medium mb-1">
              Driver Name
            </label>
            <input
              name="driverName"
              value={form.driverName}
              onChange={handleChange}
              placeholder="Driver name"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.driverName ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.driverName && (
              <p className="text-xs text-red-500 mt-1">{errors.driverName}</p>
            )}
          </div>

          {/* Driver Contact */}
          <div id="field-driverContact">
            <label className="block text-sm font-medium mb-1">
              Driver Contact
            </label>
            <input
              name="driverContact"
              value={form.driverContact}
              onChange={handleChange}
              placeholder="03XX-XXXXXXX"
              maxLength={12}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.driverContact ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.driverContact && (
              <p className="text-xs text-red-500 mt-1">
                {errors.driverContact}
              </p>
            )}
          </div>

          {/* Freight Charges */}
          <div id="field-freightCharges">
            <label className="block text-sm font-medium mb-1">
              Freight Charges
            </label>
            <input
              name="freightCharges"
              value={form.freightCharges}
              onChange={handleChange}
              placeholder="0"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.freightCharges ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.freightCharges && (
              <p className="text-xs text-red-500 mt-1">{errors.freightCharges}</p>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="border-t pt-4" id="field-items">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Products
          </h3>
          {errors.items && (
            <p className="text-xs text-red-500 mb-2">{errors.items}</p>
          )}
          <div className="p-3 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Add one or more product lines (company-based products, including paddy).
              </div>
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => [
                    ...(prev || []),
                    {
                      brand: "",
                      brandMode: "list",
                      brandInput: "",
                      productName: "",
                      productMode: "list",
                      productInput: "",
                      bagCount: "",
                      bagWeightKg: "65",
                      emptyBagWeightKg: "",
                      netWeightKg: "",
                    },
                  ])
                }
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-3 items-start">
              <div id="field-supplier">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-500">
                    Company Name
                  </label>
                </div>
                {items[0]?.brandMode !== "input" ? (
                  <select
                    value={items[0]?.brand ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === OTHER_OPTION) {
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = { ...updated[0], brandMode: "input", brandInput: "" };
                          return updated;
                        });
                        return;
                      }
                      setItems((prev) => {
                        const updated = [...prev];
                        updated[0] = { ...updated[0], brand: v, productName: "" };
                        return updated;
                      });
                      setForm((prev) => ({ ...prev, supplier: v }));
                      clearFieldError("supplier");
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                      errors.supplier ? "border-red-500 bg-red-50" : "border-gray-300"
                    }`}
                  >
                    <option value="">Select company name</option>
                    {brandOptions.map((b, idx) => (
                      <option key={`${b}-${idx}`} value={b}>
                        {b}
                      </option>
                    ))}
                    <option value={OTHER_OPTION}>Add New</option>
                  </select>
                ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={items[0]?.brandInput ?? ""}
                      onChange={(e) =>
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = {
                            ...updated[0],
                            brandInput: sanitizeBrandText(e.target.value, 100),
                          };
                          return updated;
                        })
                      }
                      placeholder="Enter company name"
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${
                        errors.supplier ? "border-red-500 bg-red-50" : "border-gray-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const name = await ensureBrandOption(items[0]?.brandInput || "");
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = {
                            ...updated[0],
                            brand: name,
                            brandInput: "",
                            brandMode: "list",
                          };
                          return updated;
                        });
                        if (name) {
                          setForm((prev) => ({ ...prev, supplier: name }));
                        }
                      }}
                      className="px-3 py-2 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                    >
                      List
                    </button>
                  </div>
                )}
                {errors.supplier && (
                  <p className="text-xs text-red-500 mt-1">{errors.supplier}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Product Name</label>
                {items[0]?.productMode !== "input" ? (
                  <select
                    value={items[0]?.productName ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === OTHER_OPTION) {
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = { ...updated[0], productMode: "input", productInput: "" };
                          return updated;
                        });
                        return;
                      }
                      handleItemChange(0, "productName", v);
                    }}
                    disabled={!String(items[0]?.brand || "").trim()}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                  >
                    <option value="">
                      {items[0]?.brand ? "Select product" : "Select company first"}
                    </option>
                    {getProductOptionsForBrand(items[0]?.brand).map((name, idx) => (
                      <option key={`${name}-${idx}`} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={OTHER_OPTION}>Add New</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={items[0]?.productInput ?? ""}
                      onChange={(e) =>
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = {
                            ...updated[0],
                            productInput: sanitizeBrandText(e.target.value, 80),
                          };
                          return updated;
                        })
                      }
                      placeholder="Enter product name"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const brand = String(items[0]?.brand || "").trim();
                        const input = items[0]?.productInput || "";
                        const result = await ensureProductOption(brand, input);
                        setItems((prev) => {
                          const updated = [...prev];
                          updated[0] = {
                            ...updated[0],
                            productName: result.name,
                            productInput: "",
                            productMode: "list",
                          };
                          return updated;
                        });
                      }}
                      className="px-3 py-2 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                    >
                      List
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. of Bags</label>
                <input
                  value={items[0]?.bagCount ?? ""}
                  onChange={(e) => handleItemChange(0, "bagCount", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3 items-start mt-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bag Weight (kg)</label>
                <input
                  value={items[0]?.bagWeightKg ?? ""}
                  onChange={(e) => handleItemChange(0, "bagWeightKg", e.target.value)}
                  placeholder="65"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Empty Bag (kg)</label>
                    <input
                      value={items[0]?.emptyBagWeightKg ?? ""}
                      onChange={(e) => handleItemChange(0, "emptyBagWeightKg", e.target.value)}
                      onBlur={(e) =>
                        handleItemChange(0, "emptyBagWeightKgBlur", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Net Weight (kg)</label>
                <input
                  value={items[0]?.netWeightKg ?? ""}
                  readOnly
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300 bg-gray-100"
                />
              </div>
            </div>

            {(items || []).length > 1 && (
              <div className="space-y-2">
                {(items || []).slice(1).map((it, idx) => {
                  const realIdx = idx + 1;
                  return (
                    <div key={`item-${realIdx}`} className="space-y-3">
                      <div className="grid md:grid-cols-3 gap-3 items-end">
                        <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Company Name
                        </label>
                        {it?.brandMode !== "input" ? (
                          <select
                            value={it?.brand ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === OTHER_OPTION) {
                                setItems((prev) => {
                                  const updated = [...prev];
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    brandMode: "input",
                                    brandInput: "",
                                  };
                                  return updated;
                                });
                                return;
                              }
                              setItems((prev) => {
                                const updated = [...prev];
                                updated[realIdx] = { ...updated[realIdx], brand: v, productName: "" };
                                return updated;
                              });
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                              errors.supplier ? "border-red-500 bg-red-50" : "border-gray-300"
                            }`}
                          >
                            <option value="">Select company name</option>
                            {brandOptions.map((b, idx2) => (
                              <option key={`${b}-${idx2}`} value={b}>
                                {b}
                              </option>
                            ))}
                            <option value={OTHER_OPTION}>Add New</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              value={it?.brandInput ?? ""}
                              onChange={(e) =>
                                setItems((prev) => {
                                  const updated = [...prev];
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    brandInput: sanitizeBrandText(e.target.value, 100),
                                  };
                                  return updated;
                                })
                              }
                              placeholder="Enter company name"
                              className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${
                                errors.supplier ? "border-red-500 bg-red-50" : "border-gray-300"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const name = await ensureBrandOption(it?.brandInput || "");
                                setItems((prev) => {
                                  const updated = [...prev];
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    brand: name,
                                    brandInput: "",
                                    brandMode: "list",
                                  };
                                  return updated;
                                });
                              }}
                              className="px-3 py-2 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                            >
                              List
                            </button>
                          </div>
                        )}
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
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    productMode: "input",
                                    productInput: "",
                                  };
                                  return updated;
                                });
                                return;
                              }
                              handleItemChange(realIdx, "productName", v);
                            }}
                            disabled={!String(it?.brand || "").trim()}
                            className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                          >
                            <option value="">
                              {it?.brand ? "Select product" : "Select company first"}
                            </option>
                            {getProductOptionsForBrand(it?.brand).map((name, idx2) => (
                              <option key={`${name}-${idx2}`} value={name}>
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
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    productInput: sanitizeBrandText(e.target.value, 80),
                                  };
                                  return updated;
                                })
                              }
                              placeholder="Enter product name"
                              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const brand = String(it?.brand || "").trim();
                                const input = it?.productInput || "";
                                const result = await ensureProductOption(brand, input);
                                setItems((prev) => {
                                  const updated = [...prev];
                                  updated[realIdx] = {
                                    ...updated[realIdx],
                                    productName: result.name,
                                    productInput: "",
                                    productMode: "list",
                                  };
                                  return updated;
                                });
                              }}
                              className="px-3 py-2 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                            >
                              List
                            </button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">No. of Bags</label>
                        <input
                          value={it?.bagCount ?? ""}
                          onChange={(e) => handleItemChange(realIdx, "bagCount", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                        />
                      </div>
                      </div>
                      <div className="grid md:grid-cols-3 gap-3 items-end">
                        <div>
                        <label className="block text-xs text-gray-500 mb-1">Bag Weight (kg)</label>
                        <input
                          value={it?.bagWeightKg ?? ""}
                          onChange={(e) => handleItemChange(realIdx, "bagWeightKg", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                        />
                        </div>
                        <div>
                        <label className="block text-xs text-gray-500 mb-1">Empty Bag (kg)</label>
                        <input
                          value={it?.emptyBagWeightKg ?? ""}
                          onChange={(e) => handleItemChange(realIdx, "emptyBagWeightKg", e.target.value)}
                          onBlur={(e) =>
                            handleItemChange(realIdx, "emptyBagWeightKgBlur", e.target.value)
                          }
                          placeholder="0.00"
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                        />
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Net Weight (kg)</label>
                          <input
                            value={it?.netWeightKg ?? ""}
                            readOnly
                            className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300 bg-gray-100"
                          />
                          </div>
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_x, i) => i !== realIdx))}
                            className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs hover:bg-rose-50"
                            title="Remove line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
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
                  supplier: "",
                  driverName: "",
                  driverContact: "",
                  freightCharges: "",
                });
                setItems([
                  {
                    brand: "",
                    productName: "",
                    bagCount: "",
                    bagWeightKg: "65",
                    emptyBagWeightKg: "",
                    netWeightKg: "",
                  },
                ]);
                setErrors({});
              }}
              className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <DataTable
        title="Gate Pass IN"
        columns={tableColumns}
        data={rows}
        idKey="_id"
        highlightId={highlightId}
        highlightKey="gatePassNo"
        searchPlaceholder="Search gate passes..."
        emptyMessage={loading ? "Loading..." : "No gate passes found."}
        exportColumns={exportColumns}
        exportData={exportData}
        deleteAll={{
          description: "This will permanently delete ALL Gate Pass IN records from the database.",
          onConfirm: async (adminPin) => {
            const res = await api.post("/admin/purge", {
              adminPin,
              key: "gatePasses",
              filter: { type: "IN" },
            });
            const deleted = res?.data?.data?.deletedCount ?? 0;
            toast.success(`Deleted ${deleted} Gate Pass IN records`);
            fetchRows();
          },
        }}
      />

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
                          const next = sanitizeBrandText(e.target.value, 100);
                          const match = (brandOptions || []).find(
                            (b) => normalizeText(b) === normalizeText(next)
                          );
                          if (match) {
                            return {
                              ...prev,
                              value: match,
                              valueOther: "",
                              productRows: getBrandProducts(match),
                            errors: {
                              ...(prev.errors || {}),
                              value: "Company Name already exists.",
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
                    + Add Product
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



