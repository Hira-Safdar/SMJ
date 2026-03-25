import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { BookOpen, FileText, List, Plus, Save, X, Pencil, Eye, Trash2, RefreshCcw } from "lucide-react";
import api from "../services/api";
import DataTable from "../components/ui/DataTable";

const TABS = [
  { key: "journal-entry", label: "Journal Entry", icon: <FileText size={16} /> },
  { key: "vouchers", label: "Voucher List", icon: <List size={16} /> },
  { key: "reports", label: "Reports", icon: <BookOpen size={16} /> },
];

const VOUCHER_TYPES = ["JOURNAL", "PAYMENT", "RECEIPT"];

const blankLine = () => ({
  rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  accountId: "",
  debit: "",
  credit: "",
  itemId: "",
  partyId: "",
  remarks: "",
});

const n0 = (v) => (v === "" || v == null ? 0 : Number(v || 0) || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));

export default function AccountingFinance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("journal-entry");
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);

  const [editingVoucherId, setEditingVoucherId] = useState("");
  const [editingVoucherNo, setEditingVoucherNo] = useState("");
  const [header, setHeader] = useState({
    date: new Date().toISOString().slice(0, 10),
    voucherType: "JOURNAL",
    companyId: "",
    companyName: "",
    referenceNo: "",
    description: "",
  });
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterVoucherType, setFilterVoucherType] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("");
  const [vouchers, setVouchers] = useState([]);

  const [createDialog, setCreateDialog] = useState({ open: false, kind: "company", name: "" });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "", voucherNo: "" });

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TABS.some((t) => t.key === tab)) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", activeTab);
      return p;
    });
  }, [activeTab, setSearchParams]);

  const totals = useMemo(() => {
    const totalDebit = round2(lines.reduce((s, l) => s + n0(l.debit), 0));
    const totalCredit = round2(lines.reduce((s, l) => s + n0(l.credit), 0));
    return { totalDebit, totalCredit, balanced: totalDebit > 0 && totalDebit === totalCredit };
  }, [lines]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: String(c._id), name: c.name })),
    [companies]
  );
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.isActive !== false)
        .map((a) => ({ id: String(a._id), label: `${a.code} - ${a.name}`, name: a.name, code: a.code })),
    [accounts]
  );
  const partyOptions = useMemo(
    () => parties.filter((p) => p.isActive !== false).map((p) => ({ id: String(p._id), name: p.name })),
    [parties]
  );
  const productOptions = useMemo(
    () => products.filter((p) => p.isActive !== false).map((p) => ({ id: String(p._id), name: p.name })),
    [products]
  );

  const loadDropdowns = async () => {
    const [accRes, compRes, partyRes, prodRes] = await Promise.all([
      api.get("/accounting/accounts"),
      api.get("/accounting/entities"),
      api.get("/accounting/parties"),
      api.get("/accounting/products"),
    ]);
    setAccounts(accRes.data?.data || []);
    setCompanies(compRes.data?.data || []);
    setParties(partyRes.data?.data || []);
    setProducts(prodRes.data?.data || []);
  };

  const loadVouchers = async () => {
    const params = {
      startDate: rangeStart || undefined,
      endDate: rangeEnd || undefined,
      companyId: filterCompanyId || undefined,
      voucherType: filterVoucherType || undefined,
      accountId: filterAccountId || undefined,
      partyId: filterPartyId || undefined,
      range: "custom",
    };
    const res = await api.get("/accounting/vouchers", { params });
    setVouchers(res.data?.data || []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadDropdowns();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load accounting master data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== "vouchers") return;
    (async () => {
      try {
        setLoading(true);
        await loadVouchers();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load vouchers.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const setCompany = (companyId) => {
    const c = companies.find((x) => String(x._id) === String(companyId));
    setHeader((p) => ({
      ...p,
      companyId: companyId || "",
      companyName: c?.name || "",
    }));
  };

  const validate = () => {
    const errs = [];
    if (!header.date) errs.push("Date is required.");
    if (!header.voucherType) errs.push("Voucher Type is required.");
    if (!header.companyId || !header.companyName) errs.push("Company is required.");

    const hasAnyLine = lines.some((l) => l.accountId && (n0(l.debit) > 0 || n0(l.credit) > 0));
    if (!hasAnyLine) errs.push("Add at least 1 valid line (account + debit/credit).");

    const badRow = lines.find((l) => (n0(l.debit) > 0 || n0(l.credit) > 0) && !l.accountId);
    if (badRow) errs.push("Each amount row must have an Account.");

    const bothDrCr = lines.find((l) => n0(l.debit) > 0 && n0(l.credit) > 0);
    if (bothDrCr) errs.push("A row cannot have both Debit and Credit.");

    if (!totals.balanced) errs.push("Total debit must equal total credit.");
    return errs;
  };

  const resetEntry = () => {
    setEditingVoucherId("");
    setEditingVoucherNo("");
    setHeader({
      date: new Date().toISOString().slice(0, 10),
      voucherType: "JOURNAL",
      companyId: "",
      companyName: "",
      referenceNo: "",
      description: "",
    });
    setLines([blankLine(), blankLine()]);
    setSubmitAttempted(false);
  };

  const buildPayload = () => {
    const payloadLines = lines
      .map((l) => ({
        accountId: l.accountId || "",
        debit: round2(n0(l.debit)),
        credit: round2(n0(l.credit)),
        itemId: l.itemId || null,
        itemName: productOptions.find((p) => p.id === l.itemId)?.name || "",
        partyId: l.partyId || null,
        partyName: partyOptions.find((p) => p.id === l.partyId)?.name || "",
        remarks: String(l.remarks || "").trim(),
      }))
      .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));

    return {
      date: header.date,
      voucherType: header.voucherType,
      companyId: header.companyId,
      companyName: header.companyName,
      referenceNo: header.referenceNo,
      description: header.description,
      lines: payloadLines,
    };
  };

  const saveVoucher = async ({ andNew } = { andNew: false }) => {
    try {
      setSubmitAttempted(true);
      const errs = validate();
      if (errs.length) {
        toast.error(errs[0]);
        return;
      }
      setLoading(true);
      const payload = buildPayload();
      if (editingVoucherId) {
        const res = await api.put(`/accounting/vouchers/${editingVoucherId}`, payload);
        setEditingVoucherNo(res.data?.data?.voucherNo || editingVoucherNo || "");
        toast.success("Voucher updated.");
      } else {
        const res = await api.post("/accounting/vouchers", payload);
        toast.success("Voucher saved.");
        setEditingVoucherId(res.data?.data?._id || "");
        setEditingVoucherNo(res.data?.data?.voucherNo || "");
      }
      if (andNew) resetEntry();
      if (activeTab === "vouchers") await loadVouchers();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save voucher.");
    } finally {
      setLoading(false);
    }
  };

  const editVoucher = async (id) => {
    try {
      setLoading(true);
      await loadDropdowns();
      const res = await api.get(`/accounting/vouchers/${id}`);
      const v = res.data?.data;
      if (!v) throw new Error("Voucher not found.");
      setEditingVoucherId(String(v._id));
      setEditingVoucherNo(v.voucherNo || "");
      setHeader({
        date: v.date ? new Date(v.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherType: v.voucherType || "JOURNAL",
        companyId: v.companyId || "",
        companyName: v.companyName || "",
        referenceNo: v.referenceNo || "",
        description: v.description || "",
      });
      const newLines = (v.lines || []).map((l) => ({
        rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        accountId: String(l.accountId || ""),
        debit: String(l.debit ?? ""),
        credit: String(l.credit ?? ""),
        itemId: l.itemId ? String(l.itemId) : "",
        partyId: l.partyId ? String(l.partyId) : "",
        remarks: l.remarks || "",
      }));
      setLines(newLines.length ? newLines : [blankLine(), blankLine()]);
      setSubmitAttempted(false);
      setActiveTab("journal-entry");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to load voucher.");
    } finally {
      setLoading(false);
    }
  };

  const viewVoucher = async (id) => {
    try {
      setLoading(true);
      const res = await api.get(`/accounting/vouchers/${id}`);
      const v = res.data?.data;
      if (!v) throw new Error("Voucher not found.");

      const details = [
        `Voucher: ${v.voucherNo}`,
        `Date: ${new Date(v.date).toLocaleDateString()}`,
        `Type: ${v.voucherType}`,
        `Company: ${v.companyName}`,
        v.referenceNo ? `Reference: ${v.referenceNo}` : "",
        v.description ? `Description: ${v.description}` : "",
        "",
        `Total Debit: ${v.totalDebit}`,
        `Total Credit: ${v.totalCredit}`,
      ]
        .filter(Boolean)
        .join("\n");

      toast(
        <div className="text-sm whitespace-pre-wrap">
          <div className="font-semibold mb-1">Voucher Details</div>
          {details}
        </div>,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to view voucher.");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = (kind) => setCreateDialog({ open: true, kind, name: "" });

  const submitCreate = async () => {
    const trimmed = String(createDialog.name || "").trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    try {
      setLoading(true);
      if (createDialog.kind === "company") {
        await api.post("/accounting/entities", { name: trimmed });
        toast.success("Company added.");
      } else if (createDialog.kind === "party") {
        await api.post("/accounting/parties", { name: trimmed, partyType: "OTHER" });
        toast.success("Party added.");
      } else {
        await api.post("/accounting/products", { name: trimmed });
        toast.success("Product added.");
      }
      setCreateDialog({ open: false, kind: "company", name: "" });
      await loadDropdowns();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Unable to save.");
    } finally {
      setLoading(false);
    }
  };

  const askDeleteVoucher = (id, voucherNo) => {
    setDeleteDialog({ open: true, id, voucherNo: voucherNo || "" });
  };

  const confirmDeleteVoucher = async () => {
    if (!deleteDialog.id) return;
    try {
      setLoading(true);
      await api.delete(`/accounting/vouchers/${deleteDialog.id}`);
      toast.success("Voucher deleted.");
      setDeleteDialog({ open: false, id: "", voucherNo: "" });
      await loadVouchers();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete voucher.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (ok, hasValue) => {
    if (!submitAttempted) return "border-gray-300";
    if (!hasValue) return "border-red-300 bg-red-50";
    return ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50";
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-2xl font-semibold text-gray-900">Accounting</div>
          <div className="text-sm text-gray-500">Manual vouchers, Excel-like entry, and reports.</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              loadDropdowns().catch(() => {});
              if (activeTab === "vouchers") loadVouchers().catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-2 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 border ${
              activeTab === t.key
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-white border-transparent text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "reports" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            Accounting reports are available in the main <span className="font-semibold">Reports</span> module. This
            page focuses on fast voucher entry and voucher management.
          </div>
        </div>
      )}

      {activeTab === "journal-entry" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-900">
              {editingVoucherId ? "Edit Voucher" : "New Voucher"}
            </div>
            <div className="text-xs text-gray-500">
              Totals: Debit <span className="font-semibold">{totals.totalDebit}</span> | Credit{" "}
              <span className="font-semibold">{totals.totalCredit}</span>{" "}
              {!totals.balanced && <span className="ml-2 text-red-600 font-semibold">Unbalanced</span>}
            </div>
          </div>

          {editingVoucherNo && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Voucher No: <span className="font-semibold">{editingVoucherNo}</span>
            </div>
          )}

          <div className="grid md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={header.date}
                onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${fieldClass(!!header.date, !!header.date)}`}
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <select
                value={header.voucherType}
                onChange={(e) => setHeader((p) => ({ ...p, voucherType: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${fieldClass(
                  !!header.voucherType,
                  !!header.voucherType
                )}`}
              >
                {VOUCHER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="flex items-end justify-between gap-2">
                <label className="block text-xs text-gray-600 mb-1">Company</label>
                <button
                  type="button"
                  onClick={() => openCreateDialog("company")}
                  className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <select
                value={header.companyId}
                onChange={(e) => setCompany(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${fieldClass(
                  !!header.companyId,
                  !!header.companyId
                )}`}
              >
                <option value="">Select company</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Reference No</label>
              <input
                value={header.referenceNo}
                onChange={(e) => setHeader((p) => ({ ...p, referenceNo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="Optional"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Description</label>
              <input
                value={header.description}
                onChange={(e) => setHeader((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-emerald-50 text-emerald-900">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 w-[280px]">Account</th>
                  <th className="text-left font-semibold px-3 py-2 w-[120px]">Debit</th>
                  <th className="text-left font-semibold px-3 py-2 w-[120px]">Credit</th>
                  <th className="text-left font-semibold px-3 py-2 w-[180px]">
                    Product{" "}
                    <button
                      type="button"
                      onClick={() => openCreateDialog("product")}
                      className="ml-1 text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"
                      title="Add product"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </th>
                  <th className="text-left font-semibold px-3 py-2 w-[180px]">
                    Party{" "}
                    <button
                      type="button"
                      onClick={() => openCreateDialog("party")}
                      className="ml-1 text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"
                      title="Add party"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </th>
                  <th className="text-left font-semibold px-3 py-2">Remarks</th>
                  <th className="text-left font-semibold px-3 py-2 w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, idx) => {
                  const hasAmt = n0(l.debit) > 0 || n0(l.credit) > 0;
                  const okAccount = !hasAmt || !!l.accountId;
                  const okDebit = n0(l.credit) > 0 ? n0(l.debit) === 0 : true;
                  const okCredit = n0(l.debit) > 0 ? n0(l.credit) === 0 : true;
                  return (
                    <tr key={l.rowId} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <select
                          value={l.accountId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, accountId: v } : x)));
                          }}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${fieldClass(okAccount, !!l.accountId)}`}
                        >
                          <option value="">Select account</option>
                          {accountOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={l.debit}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.]/g, "");
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, debit: v } : x)));
                          }}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${fieldClass(okDebit, l.debit !== "")}`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={l.credit}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.]/g, "");
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, credit: v } : x)));
                          }}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${fieldClass(okCredit, l.credit !== "")}`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={l.itemId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, itemId: v } : x)));
                          }}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                        >
                          <option value="">Optional</option>
                          {productOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={l.partyId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, partyId: v } : x)));
                          }}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                        >
                          <option value="">Optional</option>
                          {partyOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={l.remarks}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, remarks: v } : x)));
                          }}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                          placeholder="Optional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-2 rounded hover:bg-red-50 text-red-600"
                          title="Delete row"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-3 py-2 font-semibold">Totals</td>
                  <td className="px-3 py-2 font-semibold">{totals.totalDebit}</td>
                  <td className="px-3 py-2 font-semibold">{totals.totalCredit}</td>
                  <td className="px-3 py-2" colSpan={4}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setLines((prev) => [...prev, blankLine()])}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Plus size={16} /> Add Row
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveVoucher({ andNew: false })}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Save size={16} /> Save
                        </button>
                        <button
                          type="button"
                          onClick={() => saveVoucher({ andNew: true })}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 text-sm hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <Save size={16} /> Save & New
                        </button>
                        <button
                          type="button"
                          onClick={resetEntry}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <X size={16} /> Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {submitAttempted && (
            <div className="text-xs text-gray-600">
              Validation: Company required, each amount row must have an account, row cannot have both debit and credit,
              and totals must be balanced.
            </div>
          )}
        </div>
      )}

      {activeTab === "vouchers" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Start</label>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">End</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Company</label>
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All companies</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <select
                value={filterVoucherType}
                onChange={(e) => setFilterVoucherType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All</option>
                {VOUCHER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex gap-2">
              <button
                type="button"
                onClick={() => loadVouchers().catch(() => {})}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                <RefreshCcw size={16} /> Apply
              </button>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Account (optional filter)</label>
              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Party (optional filter)</label>
              <select
                value={filterPartyId}
                onChange={(e) => setFilterPartyId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="">All parties</option>
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            title="Vouchers"
            columns={[
              { key: "voucherNo", label: "Voucher No" },
              { key: "date", label: "Date", render: (v) => (v ? new Date(v).toLocaleDateString() : "-") },
              { key: "voucherType", label: "Type" },
              { key: "companyName", label: "Company" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            data={vouchers}
            rowClassName={(row) => (row.status === "REVERSED" ? "opacity-60" : "")}
            toolbarActions={
              <button
                type="button"
                onClick={() => {
                  resetEntry();
                  setActiveTab("journal-entry");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus size={16} /> New Voucher
              </button>
            }
            exportColumns={[
              { key: "voucherNo", label: "Voucher No" },
              { key: "date", label: "Date" },
              { key: "voucherType", label: "Type" },
              { key: "companyName", label: "Company" },
              { key: "referenceNo", label: "Reference No" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            exportData={(rows) =>
              rows.map((r) => ({
                ...r,
                date: r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
              }))
            }
          />

          <div className="grid md:grid-cols-3 gap-2">
            {vouchers.slice(0, 9).map((v) => (
              <div key={v._id} className="rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{v.voucherNo}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {v.companyName} | {v.voucherType} | {v.date ? new Date(v.date).toLocaleDateString() : "-"}
                  </div>
                  <div className="text-xs text-gray-600 truncate">{v.description || "-"}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => viewVoucher(v._id)}
                    className="p-2 rounded hover:bg-gray-50 text-gray-700"
                    title="View"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => editVoucher(v._id)}
                    className="p-2 rounded hover:bg-gray-50 text-emerald-700"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => askDeleteVoucher(v._id, v.voucherNo)}
                    className="p-2 rounded hover:bg-red-50 text-red-700"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {createDialog.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">
                {createDialog.kind === "company"
                  ? "Add Company"
                  : createDialog.kind === "party"
                    ? "Add Party"
                    : "Add Product"}
              </div>
              <button
                type="button"
                onClick={() => setCreateDialog({ open: false, kind: "company", name: "" })}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-gray-600">Name</label>
              <input
                autoFocus
                value={createDialog.name}
                onChange={(e) => setCreateDialog((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Type name..."
              />
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCreateDialog({ open: false, kind: "company", name: "" })}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteDialog.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">Delete Voucher</div>
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false, id: "", voucherNo: "" })}
                className="p-2 rounded hover:bg-gray-50 text-gray-600"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 text-sm text-gray-700">
              Delete voucher{" "}
              <span className="font-semibold">{deleteDialog.voucherNo || "this voucher"}</span> permanently?
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false, id: "", voucherNo: "" })}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteVoucher}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
