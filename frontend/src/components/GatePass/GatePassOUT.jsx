import React, { useEffect, useState } from "react";
import { Edit2, Trash2, Printer, X, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import DataTable from "../ui/DataTable";

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
    { itemType: "", customItemName: "", quantity: "", unit: "kg", rate: "", amount: "" },
  ]);
  const [productTypes, setProductTypes] = useState([]);

  const [errors, setErrors] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [settings, setSettings] = useState(null);

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
  const contactRegex = /^03\d{2}-\d{7}$/;

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
    if (name === "customer") msg = value ? (nameRegex.test(value) ? "" : "Customer name: letters and spaces only.") : "";
    if (name === "driverName") msg = validateDriverName(value);
    if (name === "driverContact") msg = validateDriverContact(value);
    if (name === "freightCharges") msg = value ? "" : "Freight charges are required.";
    if (msg) setFieldError(name, msg);
    else clearFieldError(name);
  };

  const validateForm = () => {
    const e0 = form.date ? "" : "Date is required.";
    const e1 = validateTruckNo(form.truckNo);
    const e3 = validateDriverName(form.driverName);
    const e4 = validateDriverContact(form.driverContact);
    const e5 = form.freightCharges ? "" : "Freight charges are required.";
    const e6 = form.customer ? (nameRegex.test(form.customer) ? "" : "Customer name: letters and spaces only.") : "";
    const hasItem = (items || []).some((it) => String(it?.itemType || "").trim() !== "" && Number(it?.quantity || 0) > 0);

    const newErr = {};
    if (e0) newErr.date = e0;
    if (e1) newErr.truckNo = e1;
    if (e3) newErr.driverName = e3;
    if (e4) newErr.driverContact = e4;
    if (e5) newErr.freightCharges = e5;
    if (e6) newErr.customer = e6;
    if (!hasItem) newErr.items = "Add at least one item with quantity.";

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
    const letters = s.match(/^[A-Z]*/)[0] || "";
    const digits = s.slice(letters.length) || "";
    if (!digits) return letters;
    return `${letters}-${digits}`.slice(0, 12);
  };

  // Format contact input
  const formatContactInput = (raw) => {
    let s = raw.replace(/[^\d]/g, "");
    if (s.length <= 4) return s;
    return `${s.slice(0, 4)}-${s.slice(4, 11)}`;
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
    (async () => {
      try {
        const res = await api.get("/product-types");
        setProductTypes(res.data?.data || []);
      } catch {}
    })();
  }, []);

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
  const addRow = () =>
    setItems((prev) => [
      ...prev,
      { itemType: "", customItemName: "", quantity: "", unit: "kg", rate: "", amount: "" },
    ]);
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const payload = {
      ...form,
      type: "OUT",
      date: form.date,
      customer: form.customer,
      items: (items || [])
        .filter((it) => String(it.itemType || "").trim() && Number(it.quantity || 0) > 0)
        .map((it) => ({
          itemType: String(it.itemType || "").trim(),
          stockType: "Production",
          customItemName: it.itemType === "Other" ? String(it.customItemName || "").trim() : "",
          quantity: Number(it.quantity || 0) || 0,
          unit: it.unit || "kg",
          rate: Number(it.rate || 0) || 0,
          amount: Number(it.amount || 0) || 0,
        })),
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
      setItems([{ itemType: "", customItemName: "", quantity: "", unit: "kg", rate: "", amount: "" }]);
      setEditingId(null);
      setErrors({});
      fetchRows();
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
            itemType: it.itemType || "",
            customItemName: it.customItemName || "",
            quantity: it.quantity != null ? String(it.quantity) : "",
            unit: it.unit || "kg",
            rate: it.rate != null ? String(it.rate) : "",
            amount: it.amount != null ? String(it.amount) : "",
          }))
        : [{ itemType: "", customItemName: "", quantity: "", unit: "kg", rate: "", amount: "" }]
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
      ? `<img src="${logo}" style="height:50px;margin-right:12px;" alt="logo" />`
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
          return `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${displayName}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
            item.quantity || 0
          } ${item.unit || ""}</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
            item.rate || 0
          }</td>
          <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
            item.amount || 0
          }</td>
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
        .header{display:flex;align-items:center;border-bottom:2px solid #047857;padding-bottom:10px;margin-bottom:12px;}
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
      </div>

      <table>
        <thead><tr><th>Item Description</th><th style="text-align:right;">Quantity</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;font-weight:700;">
            <td style="border:1px solid #ddd;padding:6px;" colspan="2">Total</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${
              row.totalQuantity || 0
            }</td>
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
    {
      key: "items",
      label: "Items",
      render: (val, row) => {
        const list = (row.items || [])
          .map((it) =>
            it.itemType === "Other" && it.customItemName
              ? it.customItemName
              : it.itemType
          )
          .filter(Boolean);
        return list.length ? Array.from(new Set(list)).join(", ") : "-";
      },
    },
    { key: "driverName", label: "Driver" },
    {
      key: "totalAmount",
      label: "Amount",
      render: (val) => (val != null ? Math.round(Number(val)) : "0"),
    },
    {
      key: "actions",
      label: "Actions",
      skipExport: true,
      render: (_, row) => (
        <div className="flex justify-end gap-2">
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
        id="gatepass-out-form"
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-4 space-y-4"
      >
        <h2 className="text-lg font-semibold text-emerald-700">
          Outward Gate Pass
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Invoice */}
          <div id="field-invoiceId">
            <label className="block text-sm font-medium mb-1">
              Invoice No
            </label>
            <select
              multiple
              value={selectedInvoiceIds}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions || []).map((o) => o.value);
                setSelectedInvoiceIds(values);
                clearFieldError("invoiceId");
              }}
              className="hidden"
            >
              <option value="" disabled>Select one or more invoices</option>
              {filteredInvoices.map((inv) => (
                <option key={inv._id} value={inv._id}>
                  {inv.invoiceNo} — {inv.companyName}
                </option>
              ))}
            </select>
            <div className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${errors.invoiceId ? "border-red-500 bg-red-50" : "border-gray-300"}`}>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredInvoices.map((inv) => {
                  const id = String(inv._id);
                  const checked = selectedInvoiceIds.includes(id);
                  return (
                    <label key={id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedInvoiceIds((prev) =>
                            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                          )
                        }
                      />
                      <span className="text-xs text-gray-700">
                        {inv.invoiceNo} - {inv.companyName}
                        {inv.gatePassUsed && !checked ? " (USED)" : ""}
                      </span>
                    </label>
                  );
                })}
                {filteredInvoices.length === 0 && (
                  <div className="text-xs text-gray-500">No available invoices.</div>
                )}
              </div>
            </div>
            {errors.invoiceId && (
              <p className="text-xs text-red-500 mt-1">{errors.invoiceId}</p>
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
              placeholder="ABC-1234"
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
              Driver Name <span className="text-red-500">*</span>
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
              Driver Contact <span className="text-red-500">*</span>
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
              Freight Charges <span className="text-red-500">*</span>
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

        {/* Invoice Items Preview */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Invoice Items (read only)
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            {selectedInvoiceIds.length ? (
              <ul className="list-disc pl-5 space-y-1">
                {selectedInvoiceIds
                  .map((id) => salesInvoices.find((t) => String(t._id) === String(id)))
                  .filter(Boolean)
                  .flatMap((inv) => inv.items || [])
                  .map(
                  (it, i) => (
                    <li key={i}>
                      {it.productTypeName} — {Math.round(Number(it.netWeightKg || 0))} kg
                    </li>
                  )
                  )}
              </ul>
            ) : (
              <span>Select invoice(s) to see items.</span>
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
                    truckNo: "",
                    driverName: "",
                    driverContact: "",
                    freightCharges: "",
                  });
                setSelectedInvoiceIds([]);
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
