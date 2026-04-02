import React, { useEffect, useState } from "react";
import { Edit2, Trash2, Printer, X, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import DataTable from "../ui/DataTable";
import AddOptionModal from "../ui/AddOptionModal";

const OTHER_OPTION = "__OTHER__";

export default function GatePassOUT() {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    truckNo: "",
    customer: "",
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
      customName: "",
      bagCount: "",
      bagWeightKg: "65",
      emptyBagWeightKg: "",
      netWeightKg: "",
      rateType: "KG",
      rate: "",
      amount: "",
    },
  ]);
  const [paymentInfo, setPaymentInfo] = useState({
    status: "PAID",
    amountPaid: "",
    remaining: "",
  });

  const totalAmount = (items || []).reduce(
    (sum, it) => sum + Number(it.amount || 0),
    0
  );

  useEffect(() => {
    setPaymentInfo((prev) => {
      if (prev.status === "PAID") {
        return {
          ...prev,
          amountPaid: String(Math.round(totalAmount || 0)),
          remaining: "0",
        };
      }
      if (prev.status === "UNPAID") {
        return {
          ...prev,
          amountPaid: "",
          remaining: String(Math.round(totalAmount || 0)),
        };
      }
      // PARTIAL
      const paid = Number(prev.amountPaid || 0);
      const remaining = Math.max(Math.round(totalAmount || 0) - paid, 0);
      return { ...prev, remaining: String(remaining) };
    });
  }, [paymentInfo.status, paymentInfo.amountPaid, totalAmount]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [productCatalog, setProductCatalog] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerModal, setCustomerModal] = useState({
    open: false,
    loading: false,
    form: { name: "", phone: "", email: "", address: "" },
    errors: {},
  });

  const [errors, setErrors] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

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
  const truckRegex = /^[A-Z]{4}-\d{4}$/;
  const contactRegex = /^03\d{2}-\d{7}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!truckRegex.test(v)) return "Format: ABCD-1234";
    return "";
  };

  const validateDriverName = (v) =>
    !v ? "Driver name is required." : nameRegex.test(v) ? "" : "Driver name: letters and spaces only.";

  const validateDriverContact = (v) => {
    if (!v) return "Driver contact is required.";
    if (!contactRegex.test(v)) return "Format: 03XX-XXXXXXX (11 digits)";
    return "";
  };

  const validateField = (name, value) => {
    let msg = "";
    if (name === "date") msg = value ? "" : "Date is required.";
    if (name === "truckNo") msg = validateTruckNo(value);
    if (name === "customer") msg = value ? (nameRegex.test(value) ? "" : "Customer name: letters and spaces only.") : "Customer name is required.";
    if (name === "driverName") msg = value ? validateDriverName(value) : "";
    if (name === "driverContact") msg = value ? validateDriverContact(value) : "";
    if (name === "freightCharges") msg = value ? "" : "";
    if (msg) setFieldError(name, msg);
    else clearFieldError(name);
  };

  const validateForm = () => {
    setSubmitAttempted(true);
    const e0 = form.date ? "" : "Date is required.";
    const e1 = validateTruckNo(form.truckNo);
    const e3 = form.driverName ? validateDriverName(form.driverName) : "";
    const e4 = form.driverContact ? validateDriverContact(form.driverContact) : "";
    const e5 = form.freightCharges ? "" : "";
    const e6 = form.customer ? (nameRegex.test(form.customer) ? "" : "Customer name: letters and spaces only.") : "Customer name is required.";
    const hasItem = (items || []).some((it) => {
      const name = String(
        it?.productMode === "input"
          ? it?.productInput || ""
          : it?.productName || it?.customName || ""
      ).trim();
      return name !== "" && Number(it?.netWeightKg || 0) > 0;
    });
    const hasMissing = (items || []).some((it) => isItemMissingBagOrRate(it));

    const newErr = {};
    if (e0) newErr.date = e0;
    if (e1) newErr.truckNo = e1;
    if (e3) newErr.driverName = e3;
    if (e4) newErr.driverContact = e4;
    if (e5) newErr.freightCharges = e5;
    if (e6) newErr.customer = e6;
    if (!hasItem) newErr.items = "Add at least one item with net weight.";
    if (hasMissing) newErr.items = "Rate and No. of Bags are required.";

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
    const letters = s.replace(/[^A-Z]/g, "").slice(0, 4);
    const digits = s.replace(/[^0-9]/g, "").slice(0, 4);
    if (!digits && !letters) return "";
    if (letters.length < 4) return letters;
    return `${letters}-${digits}`.slice(0, 9);
  };

  // Format contact input
  const formatContactInput = (raw) => {
    let s = raw.replace(/[^\d]/g, "");
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
          setSettings(res.data.data || res.data);
        }
      } catch {}
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get("/settings");
        if (res.data && res.data.success !== false) {
          const s = res.data.data || res.data;
          if (Array.isArray(s.brandOptions)) {
            setBrandOptions((prev) =>
              mergeOptionsCaseInsensitive(prev || [], s.brandOptions || [])
            );
          }
        }
      } catch {}
    };
    const loadProducts = async () => {
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
    loadSettings();
    loadProducts();
  }, []);

  useEffect(() => {
    const onProductRefresh = () => {
      const loadProducts = async () => {
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
      loadProducts();
    };
    window.addEventListener("product:refresh", onProductRefresh);
    return () => window.removeEventListener("product:refresh", onProductRefresh);
  }, []);

  const normalizeText = (v) => String(v || "").trim().toLowerCase();
  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  };
  const toTitleCase = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const loadCustomers = async () => {
    try {
      const res = await api.get("/customers");
      setCustomerOptions(res.data?.data || []);
    } catch {}
  };

  useEffect(() => {
    loadCustomers();
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

  const setCustomerField = (name, value) => {
    setCustomerModal((prev) => ({
      ...prev,
      form: { ...prev.form, [name]: value },
      errors: { ...prev.errors, [name]: "" },
    }));
  };

  const validateCustomerField = (name, value) => {
    if (name === "name") {
      if (!value.trim()) return "Customer name is required";
      if (/\d/.test(value.trim())) return "Customer name cannot contain numbers";
      if (/[^a-zA-Z\s]/.test(value.trim()))
        return "Customer name cannot contain special characters";
      if (value.trim().length < 2) return "Customer name must be at least 2 characters";
      if (value.trim().length > 100) return "Customer name must not exceed 100 characters";
    }
    if (name === "phone") {
      const digits = value.replace(/\D/g, "");
      if (!digits) return "Phone number is required";
      if (digits.length !== 11) return "Phone number must be 11 digits (03XX-XXXXXXX)";
      if (!digits.startsWith("03")) return "Phone number must start with 03";
    }
    if (name === "email") {
      if (!value.trim()) return "Email is required";
      if (!emailRegex.test(value.trim())) return "Invalid email format";
      if (value.trim().length > 100) return "Email must not exceed 100 characters";
    }
    if (name === "address") {
      if (!value.trim()) return "Address is required";
      if (/[^a-zA-Z0-9\s.,\-]/.test(value.trim()))
        return "Address cannot contain special characters";
      if (value.trim().length < 5) return "Address must be at least 5 characters";
      if (value.trim().length > 200) return "Address must not exceed 200 characters";
    }
    return "";
  };

  const validateCustomerForm = () => {
    const fields = ["name", "phone", "email", "address"];
    const newErrors = {};
    fields.forEach((field) => {
      const msg = validateCustomerField(field, customerModal.form[field] || "");
      if (msg) newErrors[field] = msg;
    });
    if (!newErrors.name) {
      const dup = customerOptions.find(
        (c) => normalizeText(c.name) === normalizeText(customerModal.form.name)
      );
      if (dup) newErrors.name = `Customer already exists: "${dup.name}"`;
    }
    setCustomerModal((prev) => ({ ...prev, errors: newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const submitCustomer = async () => {
    if (!validateCustomerForm()) return;
    setCustomerModal((prev) => ({ ...prev, loading: true }));
    try {
      const payload = {
        name: toTitleCase(customerModal.form.name),
        phone: customerModal.form.phone.trim(),
        email: customerModal.form.email.trim().toLowerCase(),
        address: customerModal.form.address.trim(),
      };
      await api.post("/customers", payload);
      await loadCustomers();
      setForm((prev) => ({ ...prev, customer: payload.name }));
      setCustomerModal({
        open: false,
        loading: false,
        form: { name: "", phone: "", email: "", address: "" },
        errors: {},
      });
    } catch (err) {
      setCustomerModal((prev) => ({
        ...prev,
        loading: false,
        errors: { ...prev.errors, name: err?.response?.data?.message || "Failed to save customer" },
      }));
    }
  };

  const getProductOptionsForBrand = () => {
    const list = (productCatalog || [])
      .map((p) => String(p.name || "").trim())
      .filter(Boolean)
      .map((name) => [normalizeText(name), name]);
    return Array.from(new Map(list).values()).sort();
  };

  const brandByProductName = React.useMemo(() => {
    const map = new Map();
    (productCatalog || []).forEach((p) => {
      if (p?.name) map.set(String(p.name), p.brand || "");
    });
    return map;
  }, [productCatalog]);

  const getStockBrand = (row) => {
    const explicit = String(row.brandName || row.companyName || "").trim();
    if (explicit) return explicit;
    const byName = row.productTypeName
      ? brandByProductName.get(String(row.productTypeName))
      : "";
    return byName || "";
  };

  const stockMap = React.useMemo(() => {
    const map = new Map();
    (stockRows || []).forEach((row) => {
      const name = String(row.productTypeName || "").trim();
      if (!name) return;
      const brand = getStockBrand(row);
      if (!brand) return;
      const qty = Number(row.balanceKg || 0);
      if (qty <= 0) return;
      if (String(name).toLowerCase() === "unprocessed paddy") return;
      const key = `${normalizeText(brand)}::${normalizeText(name)}`;
      map.set(key, qty);
    });
    return map;
  }, [stockRows, brandByProductName]);

  const getAvailableStock = (brand, product) => {
    const key = `${normalizeText(brand)}::${normalizeText(product)}`;
    return stockMap.get(key) || 0;
  };

  const getItemNetWeight = (item) =>
    Number(item?.netWeightKg || 0);

  const isItemExceedingStock = (item) => {
    if (!item?.brand || !item?.productName) return false;
    const available = getAvailableStock(item.brand, item.productName);
    return available > 0 && getItemNetWeight(item) > available;
  };

  const isItemMissingBagOrRate = (item) => {
    const name = String(
      item?.productMode === "input"
        ? item?.productInput || ""
        : item?.productName || item?.customName || ""
    ).trim();
    if (!name) return false;
    const bagsOk = Number(item?.bagCount || 0) > 0;
    const rateOk = Number(item?.rate || 0) > 0;
    return !bagsOk || !rateOk;
  };
  const getProductStockOptionsForBrand = (brand) => {
    const all = getProductOptionsForBrand();
    if (!brand) return [];
    return all.map((name) => ({
      name,
      available: getAvailableStock(brand, name),
    }));
  };

  const brandsInStock = React.useMemo(() => {
    const s = new Set();
    (stockRows || []).forEach((row) => {
      const name = String(row.productTypeName || "").trim();
      if (!name) return;
      if (name.toLowerCase() === "unprocessed paddy") return;
      const brand = getStockBrand(row);
      if (brand && Number(row.balanceKg || 0) > 0) s.add(brand);
    });
    return Array.from(s).sort();
  }, [stockRows, brandByProductName]);



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
    const payload = {
      name: cleanName,
      brand: cleanBrand,
      baseUnit: "KG",
      allowableSaleUnits: ["Bag", "Ton", "KG"],
      conversionFactors: { KG: 1, Bag: 65, Ton: 1000 },
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


  // Fetch rows
  const fetchRows = async () => {
    try {
      setLoading(true);
      const params = {
        page: 1,
        limit: 1000,
        type: "OUT",
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

  // Handlers
  const handleChange = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "truckNo") {
      v = formatTruckInput(value);
    }
    if (name === "driverName") {
      v = value.replace(/[^A-Za-z\s]/g, "");
      v = v.replace(/\s+/g, " ");
    }
    if (name === "driverContact") {
      v = formatContactInput(value);
    }
    if (name === "freightCharges") {
      v = value.replace(/[^\d.]/g, "");
    }
    if (name === "customer") {
      v = value.replace(/[^A-Za-z\s]/g, "");
      v = v.replace(/\s+/g, " ");
    }
    setForm((prev) => ({ ...prev, [name]: v }));
    validateField(name, v);
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    clearFieldError("items");
  };
  const updateItemValue = (idx, field, value) => {
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
    if (["bagCount", "bagWeightKg", "rate"].includes(field)) {
      row[field] = cleanInt(value, 8);
    } else if (field === "emptyBagWeightKg") {
      row[field] = cleanDec2(value);
    } else if (field === "emptyBagWeightKgBlur") {
      row.emptyBagWeightKg = formatDec2(value);
    } else if (
      field === "productName" ||
      field === "rateType" ||
      field === "customName" ||
      field === "brand" ||
      field === "brandInput" ||
      field === "productInput"
    ) {
      row[field] = value;
      if (field === "productName" && value !== "Other") {
        row.customName = "";
      }
    }
    const bags = Number(row.bagCount || 0);
    const bagW = Number(row.bagWeightKg || 0);
    const emptyW = Number(row.emptyBagWeightKg || 0);
    const gross = Math.max(bags * bagW, 0);
    const net = Math.max(bags * (bagW - emptyW), 0);
    row.grossWeightKg = gross ? String(Math.round(gross)) : "";
    row.netWeightKg = net ? String(Math.round(net)) : "";
    const rate = Number(row.rate || 0);
    const amount =
      row.rateType === "BAG" ? rate * bags : rate * (Number(row.netWeightKg || 0) || 0);
    row.amount = amount ? String(Math.round(amount)) : "";
    updated[idx] = row;
    setItems(updated);
  };
  const addRow = () =>
    setItems((prev) => [
      ...prev,
      {
        brand: "",
        brandMode: "list",
        brandInput: "",
        productName: "",
        productMode: "list",
        productInput: "",
        customName: "",
        bagCount: "",
        bagWeightKg: "65",
        emptyBagWeightKg: "",
        grossWeightKg: "",
        netWeightKg: "",
        rateType: "KG",
        rate: "",
        amount: "",
      },
    ]);
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const normalizedItems = await Promise.all(
      (items || [])
        .filter((it) => {
          const name = String(
            it?.productMode === "input"
              ? it?.productInput || ""
              : it?.productName || it?.customName || ""
          ).trim();
          return name && Number(it.netWeightKg || 0) > 0;
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
            quantity: Number(it.netWeightKg || 0) || 0,
            unit: "kg",
            rate: Number(it.rate || 0) || 0,
            amount: Number(it.amount || 0) || 0,
            bagCount: Number(it.bagCount || 0),
            bagWeightKg: Number(it.bagWeightKg || 0),
            emptyBagWeightKg: Number(it.emptyBagWeightKg || 0),
            grossWeightKg: Number(it.grossWeightKg || 0),
            netWeightKg: Number(it.netWeightKg || 0),
          };
        })
    );

    const payload = {
      ...form,
      type: "OUT",
      date: form.date,
      customer: form.customer,
      items: normalizedItems,
      paymentStatus: paymentInfo.status,
      amountPaid: paymentInfo.amountPaid ? Number(paymentInfo.amountPaid) : 0,
      remainingAmount: paymentInfo.remaining ? Number(paymentInfo.remaining) : 0,
      freightCharges: form.freightCharges
        ? Number(form.freightCharges)
        : undefined,
    };

    try {
      const url = editingId ? `/gatepasses/${editingId}` : "/gatepasses";
      const method = editingId ? "put" : "post";
      let res;
      try {
        res = await api[method](url, payload);
      } catch (err) {
        const status = err?.response?.status;
        if (editingId && status === 404) {
          // If the gate pass was deleted elsewhere, create a fresh one
          res = await api.post("/gatepasses", payload);
          setEditingId(null);
        } else {
          throw err;
        }
      }
      if (res.data && res.data.success === false)
        throw new Error(res.data.message || "Save failed");
      toast.success(editingId ? "Gate pass updated." : "Gate pass created.");

      // Reset form
      setForm({
        date: new Date().toISOString().slice(0, 10),
        truckNo: "",
        customer: "",
        driverName: "",
        driverContact: "",
        freightCharges: "",
      });
      setPaymentInfo({ status: "PAID", amountPaid: "", remaining: "" });
      setItems([
        {
          brand: "",
          brandMode: "list",
          brandInput: "",
          productName: "",
          productMode: "list",
          productInput: "",
          customName: "",
          bagCount: "",
          bagWeightKg: "65",
          emptyBagWeightKg: "",
          grossWeightKg: "",
          netWeightKg: "",
          rateType: "KG",
          rate: "",
          amount: "",
        },
      ]);
      setEditingId(null);
      setErrors({});
      setSubmitAttempted(false);
      fetchRows();
      window.dispatchEvent(new Event("stock:refresh"));
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to save.";
      toast.error(msg);
      document.getElementById("gatepass-out-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleEdit = (row) => {
    if (!row || !row._id) {
      toast.error("Gate pass not found.");
      return;
    }
    setForm({
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      truckNo: row.truckNo || "",
      customer: row.customer || "",
      driverName: row.driverName || "",
      driverContact: row.driverContact || "",
      freightCharges: row.freightCharges ? String(row.freightCharges) : "",
    });

    const rowItems = Array.isArray(row.items) && row.items.length ? row.items : [];
      setItems(
        rowItems.length
          ? rowItems.map((it) => ({
              brand: String(it.brand || "").trim(),
              brandMode: "list",
              brandInput: "",
              productName: String(it.itemType || it.customItemName || "").trim(),
              productMode: "list",
              productInput: "",
              customName: String(it.customItemName || "").trim(),
              bagCount: it.bagCount != null ? String(it.bagCount) : "",
              bagWeightKg: it.bagWeightKg != null ? String(it.bagWeightKg) : "65",
              emptyBagWeightKg: it.emptyBagWeightKg != null ? String(it.emptyBagWeightKg) : "",
              grossWeightKg:
                it.grossWeightKg != null
                  ? String(Math.round(it.grossWeightKg))
                  : "",
              netWeightKg:
                it.netWeightKg != null
                  ? String(Math.round(it.netWeightKg))
                  : it.quantity != null
                    ? String(Math.round(it.quantity))
                    : "",
              rateType: it.rateType || "KG",
              rate: it.rate != null ? String(it.rate) : "",
              amount: it.amount != null ? String(it.amount) : "",
            }))
          : [
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
        rateType: "KG",
                rate: "",
                amount: "",
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

  // Print window - A5 size
  const openPrintWindow = (row) => {
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

    const customerName = String(row.customer || "").trim();

    let itemsHtml = "";
    if (row.items && row.items.length > 0) {
      itemsHtml = row.items
        .map((item) => {
          const displayName =
            item.itemType === "Other" && item.customItemName
              ? `${item.itemType} (${item.customItemName})`
              : item.itemType || "-";
          const companyName = String(item.brand || "").trim();
          const bags = item.bagCount || 0;
          const bagW = item.bagWeightKg || 0;
          const emptyW = item.emptyBagWeightKg || 0;
          const gross = item.grossWeightKg || 0;
          const net = item.netWeightKg || item.quantity || 0;
          return `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${companyName || "-"}</td>
          <td style="border:1px solid #ddd;padding:6px;">${displayName}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${bags}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${bagW}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${emptyW}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${gross}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${Math.round(
            Number(net || 0)
          )}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${item.rate || 0}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${item.amount || 0}</td>
        </tr>`;
        })
        .join("");
    }

    // invoice details removed (invoice no longer used)

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
        .tag{display:inline-block;margin-top:4px;padding:3px 8px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:600;font-size:11px;}
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
          <div class="tag">OUTWARD GATE PASS</div>
        </div>
      </div>
      
      <div class="info">
        <div><span class="label">Gate Pass No:</span><span class="value">${
          row.gatePassNo || "-"
        }</span></div>
        <div><span class="label">Date:</span><span class="value">${
          row.date ? new Date(row.date).toLocaleDateString() : "-"
        }</span></div>
        <div><span class="label">Truck No:</span><span class="value">${
          row.truckNo || "-"
        }</span></div>
        <div><span class="label">Customer:</span><span class="value">${
          customerName || "-"
        }</span></div>
        <div><span class="label">Driver:</span><span class="value">${
          row.driverName || "-"
        }</span></div>
        <div><span class="label">Contact:</span><span class="value">${
          row.driverContact || "-"
        }</span></div>
        <div><span class="label">Payment:</span><span class="value">${
          row.paymentStatus || "-"
        }</span></div>
        <div><span class="label">Paid:</span><span class="value">${
          row.amountPaid || 0
        }</span></div>
        <div><span class="label">Remaining:</span><span class="value">${
          row.remainingAmount || 0
        }</span></div>
      </div>

      <table>
        <thead><tr><th>Company</th><th>Product</th><th style="text-align:right;">Bags</th><th style="text-align:right;">Bag Wt</th><th style="text-align:right;">Empty Wt</th><th style="text-align:right;">Gross</th><th style="text-align:right;">Net</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;font-weight:700;">
            <td style="border:1px solid #ddd;padding:6px;" colspan="6">Total</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
              (row.items || []).reduce(
                (sum, it) => sum + Number(it.netWeightKg || it.quantity || 0),
                0
              )
            }</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;"></td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
              row.totalAmount || 0
            }</td>
          </tr>
        </tfoot>
      </table>

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
      render: (val) => (val ? new Date(val).toLocaleDateString() : "-"),
    },
    { key: "gatePassNo", label: "GP No" },
    { key: "truckNo", label: "Truck" },
    { key: "customer", label: "Customer" },
    {
      key: "companyNames",
      label: "Company",
      render: (_val, row) => {
        const list = (row.items || [])
          .map((it) => String(it.brand || "").trim())
          .filter(Boolean);
        return list.length ? Array.from(new Set(list)).join(", ") : "-";
      },
    },
    {
      key: "items",
      label: "Items",
      render: (val, row) => {
        const list = (row.items || [])
          .map((it) => {
            const name =
              it.itemType === "Other" && it.customItemName
                ? it.customItemName
                : it.itemType;
            const qty = Math.round(Number(it.netWeightKg || it.quantity || 0));
            return `${name}${qty ? ` (${qty} kg)` : ""}`;
          })
          .filter(Boolean);
        return list.length ? Array.from(new Set(list)).join(", ") : "-";
      },
    },
    {
      key: "totalAmount",
      label: "Amount",
      render: (val) => (val != null ? Math.round(Number(val)) : "0"),
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
    { key: "customer", label: "Customer" },
    { key: "companyName", label: "Company" },
    { key: "productName", label: "Product" },
    { key: "bagCount", label: "Bags" },
    { key: "bagWeightKg", label: "Bag Weight (kg)" },
    { key: "emptyBagWeightKg", label: "Empty Bag (kg)" },
    { key: "grossWeightKg", label: "Gross Weight (kg)" },
    { key: "netWeightKg", label: "Net Weight (kg)" },
    { key: "rate", label: "Rate" },
    { key: "amount", label: "Amount" },
    { key: "paymentStatus", label: "Payment Status" },
    { key: "amountPaid", label: "Amount Paid" },
    { key: "remainingAmount", label: "Remaining" },
  ];

  const exportData = (rows) =>
    (rows || []).flatMap((row) => {
      const itemsList = Array.isArray(row.items) && row.items.length ? row.items : [{}];
      return itemsList.map((it) => ({
        date: row.date,
        gatePassNo: row.gatePassNo,
        truckNo: row.truckNo,
        customer: row.customer || "",
        companyName: String(it.brand || "").trim(),
        productName: it.itemType || it.customItemName || "",
        bagCount: it.bagCount || "",
        bagWeightKg: it.bagWeightKg || "",
        emptyBagWeightKg: it.emptyBagWeightKg || "",
        grossWeightKg: it.grossWeightKg || "",
        netWeightKg: Math.round(Number(it.netWeightKg || it.quantity || 0)),
        rate: it.rate || "",
        amount: it.amount || "",
        paymentStatus: row.paymentStatus || "",
        amountPaid: row.amountPaid || "",
        remainingAmount: row.remainingAmount || "",
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

      <AddOptionModal
        open={customerModal.open}
        title="Add Customer"
        subtitle="Save customer details for reuse in reports."
        maxWidthClass="max-w-3xl"
        submitLabel="Add Customer"
        loading={customerModal.loading}
        onClose={() =>
          setCustomerModal((prev) => ({
            ...prev,
            open: false,
            errors: {},
            form: { name: "", phone: "", email: "", address: "" },
          }))
        }
        onSubmit={submitCustomer}
      >
        <div className="bg-emerald-50 rounded-lg p-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                value={customerModal.form.name}
                onChange={(e) =>
                  setCustomerField(
                    "name",
                    e.target.value.replace(/[0-9]/g, "").replace(/[^a-zA-Z\s]/g, "")
                  )
                }
                onBlur={(e) => setCustomerField("name", toTitleCase(e.target.value))}
                placeholder="Customer name"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                  customerModal.errors.name ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {customerModal.errors.name && (
                <p className="text-xs text-red-500 mt-1">{customerModal.errors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Phone (03XX-XXXXXXX) <span className="text-red-500">*</span>
              </label>
              <input
                value={customerModal.form.phone}
                onChange={(e) => setCustomerField("phone", formatPhone(e.target.value))}
                placeholder="03XX-XXXXXXX"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                  customerModal.errors.phone ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {customerModal.errors.phone && (
                <p className="text-xs text-red-500 mt-1">{customerModal.errors.phone}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                value={customerModal.form.email}
                onChange={(e) => setCustomerField("email", e.target.value)}
                placeholder="Email"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                  customerModal.errors.email ? "border-red-500 bg-red-50" : "border-gray-300"
                }`}
              />
              {customerModal.errors.email && (
                <p className="text-xs text-red-500 mt-1">{customerModal.errors.email}</p>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-600 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              value={customerModal.form.address}
              onChange={(e) =>
                setCustomerField(
                  "address",
                  e.target.value.replace(/[^a-zA-Z0-9\s.,\-]/g, "")
                )
              }
              placeholder="Address"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                customerModal.errors.address ? "border-red-500 bg-red-50" : "border-gray-300"
              }`}
            />
            {customerModal.errors.address && (
              <p className="text-xs text-red-500 mt-1">{customerModal.errors.address}</p>
            )}
          </div>
        </div>
      </AddOptionModal>

      {/* Form */}
      <form
        id="gatepass-out-form"
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-4 space-y-4"
      >
        <h2 className="text-lg font-semibold text-emerald-700">
          Outward Gate Pass
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
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
            {errors.date && (
              <p className="text-xs text-red-500 mt-1">{errors.date}</p>
            )}
          </div>
          <div id="field-customer">
            <label className="block text-sm font-medium mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <select
              value={form.customer}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER_OPTION) {
                  setForm((prev) => ({ ...prev, customer: "" }));
                  setCustomerModal((prev) => ({ ...prev, open: true }));
                  return;
                }
                setForm((prev) => ({ ...prev, customer: v }));
                clearFieldError("customer");
              }}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                errors.customer ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">Select customer</option>
              {customerOptions.map((c) => (
                <option key={c._id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value={OTHER_OPTION}>Add New</option>
            </select>
            {errors.customer && (
              <p className="text-xs text-red-500 mt-1">{errors.customer}</p>
            )}
          </div>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Products</h3>
          {submitAttempted && errors.items && (
            <p className="text-xs text-red-500 mb-2">{errors.items}</p>
          )}
          <div className="p-3 bg-gray-50 rounded-lg space-y-3">
            {(items || []).map((it, idx) => (
              <div key={`out-item-${idx}`} className="space-y-3">
                <div className="grid md:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Company Name</label>
                    {it.brandMode !== "input" ? (
                      <select
                        value={it.brand || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) => {
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], brand: v, productName: "" };
                            return updated;
                          });
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                      >
                        <option value="">Select company</option>
                        {brandsInStock.map((b, bIdx) => (
                          <option key={`${b}-${bIdx}`} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full rounded-lg border px-3 py-2 text-sm text-gray-500 bg-gray-50">
                        Select company from list
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-500">Product Name</label>
                      {it.brand && it.productName ? (
                        <span className="text-[11px] text-emerald-700">
                          Available: {Math.round(getAvailableStock(it.brand, it.productName))} kg
                        </span>
                      ) : null}
                    </div>
                    {it.productMode !== "input" ? (
                      <select
                        value={it.productName || ""}
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
                          updateItemValue(idx, "productName", v);
                        }}
                        disabled={!String(it.brand || "").trim()}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                      >
                        <option value="">
                          {it.brand ? "Select product" : "Select company first"}
                        </option>
                        {getProductStockOptionsForBrand(it.brand).map((opt, nIdx) => (
                          <option
                            key={`${opt.name}-${nIdx}`}
                            value={opt.name}
                            disabled={opt.available <= 0}
                          >
                            {opt.name}
                            {opt.available <= 0 ? " (Out of stock)" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full rounded-lg border px-3 py-2 text-sm text-gray-500 bg-gray-50">
                        Select product from list
                      </div>
                    )}
                  </div>
                  <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-gray-500">No. of Bags</label>
                      {submitAttempted && isItemMissingBagOrRate(it) && Number(it?.bagCount || 0) <= 0 ? (
                        <span className="text-[11px] text-red-500">Required</span>
                      ) : isItemExceedingStock(it) ? (
                        <span className="text-[11px] text-red-500">Exceeds available</span>
                      ) : null}
                  </div>
                  <input
                    value={it.bagCount || ""}
                    onChange={(e) => updateItemValue(idx, "bagCount", e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                        isItemExceedingStock(it) || (submitAttempted && isItemMissingBagOrRate(it) && Number(it?.bagCount || 0) <= 0)
                          ? "border-red-500 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bag Weight (kg)</label>
                    <input
                      value={it.bagWeightKg || ""}
                      onChange={(e) => updateItemValue(idx, "bagWeightKg", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Empty Bag (kg)</label>
                    <input
                      value={it.emptyBagWeightKg || ""}
                      onChange={(e) => updateItemValue(idx, "emptyBagWeightKg", e.target.value)}
                      onBlur={(e) =>
                        updateItemValue(idx, "emptyBagWeightKgBlur", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Gross Weight (kg)</label>
                    <input
                      value={it.grossWeightKg || ""}
                      readOnly
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300 bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Net Weight (kg)</label>
                    <input
                      value={it.netWeightKg || ""}
                      readOnly
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300 bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Rate Type</label>
                    <select
                      value={it.rateType || "KG"}
                      onChange={(e) => updateItemValue(idx, "rateType", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                    >
                      <option value="KG">Per Kg</option>
                      <option value="BAG">Per Bag</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-500">Rate</label>
                      {submitAttempted && isItemMissingBagOrRate(it) && Number(it?.rate || 0) <= 0 ? (
                        <span className="text-[11px] text-red-500">Required</span>
                      ) : null}
                    </div>
                    <input
                      value={it.rate || ""}
                      onChange={(e) => updateItemValue(idx, "rate", e.target.value)}
                      placeholder="Rate"
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                        submitAttempted && isItemMissingBagOrRate(it) && Number(it?.rate || 0) <= 0
                          ? "border-red-500 bg-red-50"
                          : "border-gray-300"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Amount</label>
                    <input
                      value={it.amount || ""}
                      readOnly
                      placeholder="Amount"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300 bg-gray-100"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Payment (UI only) */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Payment Status
          </h3>
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div className="flex items-center gap-3">
              {["PAID", "UNPAID", "PARTIAL"].map((opt) => (
                <label key={opt} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="gpOutPayment"
                    checked={paymentInfo.status === opt}
                    onChange={() =>
                      setPaymentInfo((p) => ({ ...p, status: opt }))
                    }
                  />
                  {opt === "PAID" ? "Paid" : opt === "UNPAID" ? "Unpaid" : "Partial"}
                </label>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount Paid (Rs)</label>
              <input
                value={paymentInfo.amountPaid}
                onChange={(e) =>
                  setPaymentInfo((p) => {
                    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
                    if (!raw) return { ...p, amountPaid: "" };
                    const maxAllowed = Math.round(totalAmount || 0);
                    const nextVal = Math.min(Number(raw), maxAllowed);
                    return { ...p, amountPaid: String(nextVal) };
                  })
                }
                placeholder="0"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-gray-300"
                disabled={paymentInfo.status !== "PARTIAL"}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Remaining (Rs)</label>
              <input
                value={paymentInfo.remaining}
                placeholder="0"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                  paymentInfo.status !== "UNPAID"
                    ? "border-gray-300 bg-gray-100 text-gray-500"
                    : "border-gray-300"
                }`}
                readOnly={paymentInfo.status !== "UNPAID"}
              />
            </div>
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
                    customer: "",
                    driverName: "",
                    driverContact: "",
                    freightCharges: "",
                  });
                  setPaymentInfo({ status: "PAID", amountPaid: "", remaining: "" });
                  setSubmitAttempted(false);
                  setItems([
                    {
                      brand: "",
                      brandMode: "list",
                      brandInput: "",
                      productName: "",
                      productMode: "list",
                      productInput: "",
                      customName: "",
                      bagCount: "",
                      bagWeightKg: "65",
                      emptyBagWeightKg: "",
                      grossWeightKg: "",
                      netWeightKg: "",
                      rateType: "KG",
                      rate: "",
                      amount: "",
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
        title="Gate Pass OUT"
        columns={tableColumns}
        data={rows}
        idKey="_id"
        searchPlaceholder="Search gate passes..."
        emptyMessage={loading ? "Loading..." : "No gate passes found."}
        exportColumns={exportColumns}
        exportData={exportData}
        deleteAll={{
          description: "This will permanently delete ALL Gate Pass OUT records from the database.",
          onConfirm: async (adminPin) => {
            const res = await api.post("/admin/purge", {
              adminPin,
              key: "gatePasses",
              filter: { type: "OUT" },
            });
            const deleted = res?.data?.data?.deletedCount ?? 0;
            toast.success(`Deleted ${deleted} Gate Pass OUT records`);
            fetchRows();
          },
        }}
      />
    </div>
  );
}
