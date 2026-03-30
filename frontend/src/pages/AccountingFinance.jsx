import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  BookOpen,
  FileText,
  List,
  Plus,
  Save,
  X,
  Pencil,
  Eye,
  Trash2,
  Printer,
  Filter,
  Download,
  RefreshCcw,
} from "lucide-react";
import api from "../services/api";
import DataTable from "../components/ui/DataTable";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const TABS = [
  { key: "journal-entry", label: "Journal Entry", icon: <FileText size={16} /> },
  { key: "vouchers", label: "Voucher List", icon: <List size={16} /> },
  { key: "reports", label: "Reports", icon: <BookOpen size={16} /> },
];

const VOUCHER_TYPES = ["JOURNAL", "PAYMENT", "RECEIPT"];
const BOOK_TYPES = [
  { value: "JOURNAL", label: "Journal Proper (General)" },
  { value: "CASH_BOOK", label: "Cash Book" },
  { value: "PURCHASE_BOOK", label: "Purchase Book" },
  { value: "SALES_BOOK", label: "Sales Book" },
  { value: "PURCHASE_RETURN", label: "Purchase Return" },
  { value: "SALES_RETURN", label: "Sales Return" },
  { value: "BILLS_RECEIVABLE", label: "Bills Receivable" },
  { value: "BILLS_PAYABLE", label: "Bills Payable" },
];

const blankLine = () => ({
  rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  debitAccountId: "",
  creditAccountId: "",
  amount: "",
  remarks: "",
});

const n0 = (v) => (v === "" || v == null ? 0 : Number(v || 0) || 0);
const round2 = (n) => Number((Number(n || 0)).toFixed(2));
const formatMonthDay = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit" });
};
const formatYear = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.getFullYear();
};

export default function AccountingFinance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("journal-entry");
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [gatepassCompanies, setGatepassCompanies] = useState([]);
  const [parties, setParties] = useState([]);

  const [editingVoucherId, setEditingVoucherId] = useState("");
  const [editingVoucherNo, setEditingVoucherNo] = useState("");
  const [header, setHeader] = useState({
    date: new Date().toISOString().slice(0, 10),
    voucherType: "JOURNAL",
    companyId: "",
    companyName: "",
    description: "",
  });
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [journalMonth, setJournalMonth] = useState("");
  const [showJournalFilters, setShowJournalFilters] = useState(false);
  const [filterCompanyName, setFilterCompanyName] = useState("");
  const [filterBookType, setFilterBookType] = useState("ALL");
  const [filterVoucherNo, setFilterVoucherNo] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterVoucherType, setFilterVoucherType] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("");
  const [vouchers, setVouchers] = useState([]);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "", voucherNo: "" });
  const [generatedJournals, setGeneratedJournals] = useState([]);
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState(new Set());

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
    const totalAmount = round2(lines.reduce((s, l) => s + n0(l.amount), 0));
    return { totalDebit: totalAmount, totalCredit: totalAmount, balanced: totalAmount > 0 };
  }, [lines]);

  const companyOptions = useMemo(() => {
    const map = new Map();
    (companies || []).forEach((c) => {
      const name = String(c?.name || "").trim();
      if (!name) return;
      map.set(name.toLowerCase(), { id: String(c._id), name });
    });
    (gatepassCompanies || []).forEach((name) => {
      const clean = String(name || "").trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, { id: clean, name: clean });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, gatepassCompanies]);
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
 

  const loadDropdowns = async () => {
    const [accRes, compRes, partyRes] = await Promise.all([
      api.get("/accounting/accounts"),
      api.get("/accounting/entities"),
      api.get("/accounting/parties"),
    ]);
    setAccounts(accRes.data?.data || []);
    setCompanies(compRes.data?.data || []);
    setParties(partyRes.data?.data || []);
  };

  const loadGatepassCompanies = async () => {
    const res = await api.get("/product-types");
    const rows = res.data?.data || [];
    const names = Array.from(
      new Set(rows.map((r) => String(r.brand || "").trim()).filter(Boolean))
    ).sort();
    setGatepassCompanies(names);
  };

  const loadVouchers = async () => {
    const params = {
      startDate: rangeStart || undefined,
      endDate: rangeEnd || undefined,
      companyId: filterCompanyId || undefined,
      companyName: filterCompanyName || undefined,
      voucherType: filterVoucherType || undefined,
      accountId: filterAccountId || undefined,
      partyId: filterPartyId || undefined,
      bookType: filterBookType && filterBookType !== "ALL" ? filterBookType : undefined,
      range: "custom",
    };
    const res = await api.get("/accounting/vouchers", { params });
    setVouchers(res.data?.data || []);
  };

  const loadGeneratedJournals = async () => {
    const params = {
      startDate: rangeStart || undefined,
      endDate: rangeEnd || undefined,
      companyId: filterCompanyId || undefined,
      companyName: filterCompanyName || undefined,
      partyId: filterPartyId || undefined,
      bookType: filterBookType && filterBookType !== "ALL" ? filterBookType : undefined,
      voucherNo: filterVoucherNo || undefined,
      voucherType: "JOURNAL",
      range: "custom",
    };
    const res = await api.get("/accounting/journal-entries", { params });
    setGeneratedJournals(res.data?.data || []);
    setSelectedGeneratedIds(new Set());
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadDropdowns(), loadGatepassCompanies()]);
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load accounting master data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onProductRefresh = () => {
      loadGatepassCompanies().catch(() => {});
    };
    window.addEventListener("product:refresh", onProductRefresh);
    return () => window.removeEventListener("product:refresh", onProductRefresh);
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

  useEffect(() => {
    if (activeTab !== "journal-entry") return;
    (async () => {
      try {
        setLoading(true);
        await loadGeneratedJournals();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load journals.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    rangeStart,
    rangeEnd,
    filterCompanyId,
    filterCompanyName,
    filterPartyId,
    filterBookType,
    filterVoucherNo,
  ]);

  const setCompany = (companyId) => {
    const c = companyOptions.find((x) => String(x.id) === String(companyId));
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

    const hasAnyLine = lines.some(
      (l) => l.debitAccountId && l.creditAccountId && n0(l.amount) > 0
    );
    if (!hasAnyLine) errs.push("Add at least 1 valid line (debit + credit + amount).");

    const missingAccount = lines.find(
      (l) => (l.debitAccountId || l.creditAccountId || n0(l.amount) > 0) && (!l.debitAccountId || !l.creditAccountId)
    );
    if (missingAccount) errs.push("Each line must have both Debit and Credit accounts.");

    const emptyAmountRow = lines.find(
      (l) => (l.debitAccountId || l.creditAccountId) && n0(l.amount) === 0
    );
    if (emptyAmountRow) errs.push("Each line must have an Amount.");

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
      description: "",
    });
    setLines([blankLine(), blankLine()]);
    setSubmitAttempted(false);
  };

  const buildPayload = () => {
    const payloadLines = lines
      .flatMap((l) => {
        const amt = round2(n0(l.amount));
        if (!l.debitAccountId || !l.creditAccountId || amt <= 0) return [];
        return [
          {
            accountId: l.debitAccountId,
            debit: amt,
            credit: 0,
            remarks: String(l.remarks || "").trim(),
          },
          {
            accountId: l.creditAccountId,
            debit: 0,
            credit: amt,
            remarks: String(l.remarks || "").trim(),
          },
        ];
      });

    const narration = buildNarration();
    return {
      date: header.date,
      voucherType: header.voucherType,
      companyId: header.companyId,
      companyName: header.companyName,
      description: narration,
      bookType: "JOURNAL",
      lines: payloadLines,
    };
  };

  const saveVoucher = async ({ andNew, autoPrint } = { andNew: false, autoPrint: false }) => {
    try {
      setSubmitAttempted(true);
      const errs = validate();
      if (errs.length) {
        toast.error(errs[0]);
        return;
      }
      setLoading(true);
      const payload = buildPayload();
      let savedId = "";
      if (editingVoucherId) {
        const res = await api.put(`/accounting/vouchers/${editingVoucherId}`, payload);
        setEditingVoucherNo(res.data?.data?.voucherNo || editingVoucherNo || "");
        savedId = res.data?.data?._id || editingVoucherId;
        toast.success("Voucher updated.");
      } else {
        const res = await api.post("/accounting/vouchers", payload);
        toast.success("Voucher saved.");
        setEditingVoucherId(res.data?.data?._id || "");
        setEditingVoucherNo(res.data?.data?.voucherNo || "");
        savedId = res.data?.data?._id || "";
      }
      if (andNew) resetEntry();
      if (activeTab === "vouchers") await loadVouchers();
      if (activeTab === "journal-entry") await loadGeneratedJournals();
      if (autoPrint && savedId) {
        await handlePrintVoucher(savedId);
      }
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
        description: v.description || "",
      });
      const debitLines = (v.lines || []).filter((l) => n0(l.debit) > 0);
      const creditLines = (v.lines || []).filter((l) => n0(l.credit) > 0);
      const maxLen = Math.max(debitLines.length, creditLines.length);
      const paired = [];
      for (let i = 0; i < maxLen; i += 1) {
        const d = debitLines[i];
        const c = creditLines[i];
        const amt = round2(n0(d?.debit || c?.credit));
        paired.push({
          rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          debitAccountId: String(d?.accountId || ""),
          creditAccountId: String(c?.accountId || ""),
          amount: amt ? String(amt) : "",
          remarks: d?.remarks || c?.remarks || "",
        });
      }
      setLines(paired.length ? paired : [blankLine(), blankLine()]);
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
      if (activeTab === "vouchers") await loadVouchers();
      if (activeTab === "journal-entry") await loadGeneratedJournals();
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

  const handleJournalMonth = (value) => {
    setJournalMonth(value);
    if (!value) return;
    const [y, m] = value.split("-").map((v) => Number(v));
    if (!y || !m) return;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const pad = (n) => String(n).padStart(2, "0");
    setRangeStart(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
    setRangeEnd(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
  };

  const handleFilterCompany = (value) => {
    const match = (companies || []).find((c) => String(c._id) === String(value));
    if (match) {
      setFilterCompanyId(String(match._id));
      setFilterCompanyName(match.name || "");
    } else {
      setFilterCompanyId("");
      setFilterCompanyName(value || "");
    }
  };

  const accountLabel = (id) => {
    const a = accountOptions.find((x) => String(x.id) === String(id));
    const raw = a?.label || a?.name || "";
    if (!raw) return "";
    return /\bA\/c\b/i.test(raw) ? raw : `${raw} A/c`;
  };

  const buildNarration = () => {
    const desc = String(header.description || "").trim();
    if (desc) return desc;
    const remarks = lines.map((l) => String(l.remarks || "").trim()).filter(Boolean);
    if (remarks.length) return remarks.join("; ");
    const auto = lines
      .map((l) => {
        const debit = accountLabel(l.debitAccountId);
        const credit = accountLabel(l.creditAccountId);
        if (!debit || !credit) return "";
        return `${debit} to ${credit}`;
      })
      .filter(Boolean);
    return auto.join("; ");
  };

  const previewLines = useMemo(
    () =>
      lines
        .flatMap((l) => {
          const amt = round2(n0(l.amount));
          if (!l.debitAccountId || !l.creditAccountId || amt <= 0) return [];
          return [
            { account: accountLabel(l.debitAccountId), debit: amt, credit: 0 },
            { account: accountLabel(l.creditAccountId), debit: 0, credit: amt },
          ];
        })
        .filter((l) => l.account && (l.debit > 0 || l.credit > 0)),
    [lines, accountOptions]
  );

  const amountClass = (line) => {
    if (!submitAttempted) return "border-gray-300";
    const amt = n0(line.amount);
    if (!line.debitAccountId && !line.creditAccountId && amt <= 0) return "border-gray-300";
    if ((line.debitAccountId || line.creditAccountId) && amt <= 0) return "border-red-300 bg-red-50";
    if (!line.debitAccountId || !line.creditAccountId) return "border-red-300 bg-red-50";
    return "border-emerald-300 bg-emerald-50";
  };


  const printEntry = (entry) => {
    if (!entry) return;
    const dateYear = formatYear(entry.date);
    const dateMonthDay = formatMonthDay(entry.date);
    const linesHtml = (entry.lines || [])
      .map((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        const details = isDebit
          ? `${l.accountName || l.accountCode || "Account"} Dr`
          : `${l.accountName || l.accountCode || "Account"}`;
        return `
          <tr class="entry-row">
            <td class="date-cell">
              <div>${dateYear}</div>
              <div>${dateMonthDay}</div>
            </td>
            <td class="details-cell ${isDebit ? "debit" : "credit"}">${details}</td>
            <td class="lf-cell"></td>
            <td class="amt-cell">${isDebit ? debit.toFixed(2) : ""}</td>
            <td class="amt-cell">${!isDebit ? credit.toFixed(2) : ""}</td>
          </tr>
        `;
      })
      .join("");

    const narration = String(entry.description || entry.narration || "").trim();
    const narrationRow = narration
      ? `
        <tr class="narration-row">
          <td class="date-cell"></td>
          <td class="details-cell narration">(Being ${narration})</td>
          <td class="lf-cell"></td>
          <td class="amt-cell"></td>
          <td class="amt-cell"></td>
        </tr>
      `
      : "";

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Journal Print</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: "Times New Roman", serif; color: #111; padding: 24px; }
            .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
            .title { font-size: 18px; font-weight: 700; text-transform: uppercase; }
            .meta { font-size: 12px; color: #333; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; font-size: 12px; }
            th { text-align: center; font-weight: 700; }
            .date-cell { width: 90px; text-align: center; }
            .details-cell { width: 55%; }
            .details-cell.credit { padding-left: 18px; }
            .details-cell.debit { padding-left: 4px; }
            .details-cell.narration { padding-left: 8px; font-style: italic; }
            .lf-cell { width: 60px; text-align: center; }
            .amt-cell { width: 90px; text-align: right; }
            .entry-row .date-cell > div { line-height: 1.2; }
            .narration-row td { border-top: 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Journal</div>
            <div class="meta">Voucher: ${entry.voucherNo || "-"}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>L.F.</th>
                <th>Amount (Dr.)</th>
                <th>Amount (Cr.)</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
              ${narrationRow}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Popup blocked. Please allow popups to print.");
      return;
    }
    w.document.open();
    w.document.write(printHtml);
    w.document.close();
    w.focus();
    w.print();
  };

  const fetchVoucher = async (id) => {
    const res = await api.get(`/accounting/vouchers/${id}`);
    return res.data?.data;
  };

  const handlePrintVoucher = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      printEntry(entry);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to print voucher.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      const doc = new jsPDF();
      doc.setFontSize(12);
      doc.text(`Journal Voucher: ${entry.voucherNo || "-"}`, 14, 14);
      doc.setFontSize(10);
      doc.text(`Company: ${entry.companyName || "-"}`, 14, 20);
      doc.text(`Date: ${entry.date ? new Date(entry.date).toLocaleDateString() : "-"}`, 14, 26);

      const body = [];
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        const details = isDebit
          ? `${l.accountName || l.accountCode || "Account"} Dr`
          : `${l.accountName || l.accountCode || "Account"}`;
        body.push([
          `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}`,
          details,
          "",
          isDebit ? debit.toFixed(2) : "",
          !isDebit ? credit.toFixed(2) : "",
        ]);
      });
      const narration = String(entry.description || entry.narration || "").trim();
      if (narration) {
        body.push(["", `(Being ${narration})`, "", "", ""]);
      }

      autoTable(doc, {
        head: [["Date", "Details", "L.F.", "Amount (Dr.)", "Amount (Cr.)"]],
        body,
        startY: 32,
        styles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 80 } },
      });
      doc.save(`${entry.voucherNo || "journal"}.pdf`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async (id) => {
    try {
      setLoading(true);
      const entry = await fetchVoucher(id);
      if (!entry) throw new Error("Voucher not found.");
      const rows = [];
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        rows.push({
          Date: `${formatYear(entry.date)} ${formatMonthDay(entry.date)}`,
          Details: isDebit
            ? `${l.accountName || l.accountCode || "Account"} Dr`
            : `${l.accountName || l.accountCode || "Account"}`,
          "L.F.": "",
          "Amount (Dr.)": isDebit ? debit.toFixed(2) : "",
          "Amount (Cr.)": !isDebit ? credit.toFixed(2) : "",
        });
      });
      const narration = String(entry.description || entry.narration || "").trim();
      if (narration) {
        rows.push({ Date: "", Details: `(Being ${narration})`, "L.F.": "", "Amount (Dr.)": "", "Amount (Cr.)": "" });
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal");
      XLSX.writeFile(wb, `${entry.voucherNo || "journal"}.xlsx`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to download Excel.");
    } finally {
      setLoading(false);
    }
  };

  const resolveSelectedEntries = () => {
    const ids = new Set(selectedGeneratedIds);
    return generatedJournals.filter((j) => ids.has(j._id));
  };

  const handleBulkDownloadPdf = () => {
    const entries = resolveSelectedEntries();
    if (!entries.length) {
      toast.error("Select at least one voucher to download.");
      return;
    }
    const doc = new jsPDF();
    entries.forEach((entry, index) => {
      if (index > 0) doc.addPage();
      doc.setFontSize(12);
      doc.text(`Journal Voucher: ${entry.voucherNo || "-"}`, 14, 14);
      doc.setFontSize(10);
      doc.text(`Company: ${entry.companyName || "-"}`, 14, 20);
      doc.text(`Date: ${entry.date ? new Date(entry.date).toLocaleDateString() : "-"}`, 14, 26);

      const body = [];
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        const details = isDebit
          ? `${l.accountName || l.accountCode || "Account"} Dr`
          : `${l.accountName || l.accountCode || "Account"}`;
        body.push([
          `${formatYear(entry.date)}\n${formatMonthDay(entry.date)}`,
          details,
          "",
          isDebit ? debit.toFixed(2) : "",
          !isDebit ? credit.toFixed(2) : "",
        ]);
      });
      const narration = String(entry.description || entry.narration || "").trim();
      if (narration) {
        body.push(["", `(Being ${narration})`, "", "", ""]);
      }
      autoTable(doc, {
        head: [["Date", "Details", "L.F.", "Amount (Dr.)", "Amount (Cr.)"]],
        body,
        startY: 32,
        styles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 80 } },
      });
    });
    doc.save("journals.pdf");
  };

  const handleBulkDownloadExcel = () => {
    const entries = resolveSelectedEntries();
    if (!entries.length) {
      toast.error("Select at least one voucher to download.");
      return;
    }
    const rows = [];
    entries.forEach((entry) => {
      rows.push({
        Date: "",
        Details: `Voucher: ${entry.voucherNo || "-"} | ${entry.companyName || "-"}`,
        "L.F.": "",
        "Amount (Dr.)": "",
        "Amount (Cr.)": "",
      });
      (entry.lines || []).forEach((l) => {
        const debit = round2(n0(l.debit));
        const credit = round2(n0(l.credit));
        const isDebit = debit > 0;
        rows.push({
          Date: `${formatYear(entry.date)} ${formatMonthDay(entry.date)}`,
          Details: isDebit
            ? `${l.accountName || l.accountCode || "Account"} Dr`
            : `${l.accountName || l.accountCode || "Account"}`,
          "L.F.": "",
          "Amount (Dr.)": isDebit ? debit.toFixed(2) : "",
          "Amount (Cr.)": !isDebit ? credit.toFixed(2) : "",
        });
      });
      const narration = String(entry.description || entry.narration || "").trim();
      if (narration) {
        rows.push({ Date: "", Details: `(Being ${narration})`, "L.F.": "", "Amount (Dr.)": "", "Amount (Cr.)": "" });
      }
      rows.push({ Date: "", Details: "", "L.F.": "", "Amount (Dr.)": "", "Amount (Cr.)": "" });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Journals");
    XLSX.writeFile(wb, "journals.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex gap-2">
          {activeTab === "journal-entry" && (
            <button
              type="button"
              onClick={() => setShowJournalFilters((p) => !p)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm ${
                showJournalFilters
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter size={16} /> Filters
            </button>
          )}
        </div>
      </div>

      {activeTab === "journal-entry" && showJournalFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">Month</label>
              <input
                type="month"
                value={journalMonth}
                onChange={(e) => handleJournalMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
            </div>
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
                value={filterCompanyId || filterCompanyName}
                onChange={(e) => handleFilterCompany(e.target.value)}
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
              <label className="block text-xs text-gray-600 mb-1">Customer/Party</label>
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
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Book Type</label>
              <select
                value={filterBookType}
                onChange={(e) => setFilterBookType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                <option value="ALL">All</option>
                {BOOK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Voucher No</label>
              <input
                value={filterVoucherNo}
                onChange={(e) => setFilterVoucherNo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setJournalMonth("");
                setRangeStart("");
                setRangeEnd("");
                setFilterCompanyId("");
                setFilterCompanyName("");
                setFilterPartyId("");
                setFilterBookType("ALL");
                setFilterVoucherNo("");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              <X size={16} /> Clear
            </button>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            Accounting reports are available in the main <span className="font-semibold">Reports</span> module. This
            page focuses on fast voucher entry and voucher management.
          </div>
        </div>
      )}

      {activeTab === "journal-entry" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-gray-900">New Voucher</div>
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

            <div className="grid md:grid-cols-5 gap-3">
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
                <label className="block text-xs text-gray-600 mb-1">Company</label>
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
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[260px]">Debit Account</th>
                    <th className="text-left font-semibold px-3 py-2 w-[260px]">Credit Account</th>
                    <th className="text-left font-semibold px-3 py-2 w-[140px]">Amount</th>
                    <th className="text-left font-semibold px-3 py-2">Remarks</th>
                    <th className="text-left font-semibold px-3 py-2 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, idx) => {
                    const hasAmt = n0(l.amount) > 0;
                    const okAccount = !hasAmt || (!!l.debitAccountId && !!l.creditAccountId);
                    return (
                      <tr key={l.rowId} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <select
                            value={l.debitAccountId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, debitAccountId: v } : x)));
                            }}
                            className={`w-full px-2 py-1.5 rounded border text-sm ${fieldClass(
                              okAccount,
                              !!l.debitAccountId
                            )}`}
                          >
                            <option value="">Select debit account</option>
                            {accountOptions.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={l.creditAccountId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, creditAccountId: v } : x)));
                            }}
                            className={`w-full px-2 py-1.5 rounded border text-sm ${fieldClass(
                              okAccount,
                              !!l.creditAccountId
                            )}`}
                          >
                            <option value="">Select credit account</option>
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
                            value={l.amount}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^\d.]/g, "");
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: v } : x)));
                            }}
                            className={`w-full px-2 py-1.5 rounded border text-sm ${amountClass(l)}`}
                            placeholder="0"
                          />
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
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {submitAttempted && (
              <div className="text-xs text-gray-600">
                Validation: Company required, each line must have both debit and credit accounts, amount must be entered,
                and totals must be balanced.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-gray-900">Journal Preview</div>
              <button
                type="button"
                onClick={() => saveVoucher({ andNew: true, autoPrint: true })}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Printer size={16} /> Generate
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-gray-50 text-gray-800">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[110px]">Date</th>
                    <th className="text-left font-semibold px-3 py-2">Details</th>
                    <th className="text-left font-semibold px-3 py-2 w-[80px]">L.F.</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Amount (Dr.)</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Amount (Cr.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewLines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-sm text-gray-500 text-center">
                        Start entering rows above to preview the journal format here.
                      </td>
                    </tr>
                  )}
                  {previewLines.map((l, idx) => {
                    const isDebit = l.debit > 0;
                    return (
                      <tr key={`${l.account}-${idx}`}>
                        <td className="px-3 py-2">
                          {idx === 0 && (
                            <>
                              <div className="text-xs text-gray-700">{formatYear(header.date)}</div>
                              <div className="text-xs text-gray-700">{formatMonthDay(header.date)}</div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className={`flex items-center ${isDebit ? "justify-between" : "pl-4"} gap-2`}>
                            <span>{l.account}</span>
                            {isDebit && <span className="text-xs font-semibold">Dr</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{isDebit ? l.debit.toFixed(2) : ""}</td>
                        <td className="px-3 py-2 text-right">{!isDebit ? l.credit.toFixed(2) : ""}</td>
                      </tr>
                    );
                  })}
                  {buildNarration() && (
                    <tr>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 italic text-gray-600">(Being {buildNarration()})</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-gray-900">Generated Journals</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selectedGeneratedIds.size === 0}
                  onClick={() => handleBulkDownloadPdf()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download size={16} /> PDF
                </button>
                <button
                  type="button"
                  disabled={selectedGeneratedIds.size === 0}
                  onClick={() => handleBulkDownloadExcel()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download size={16} /> Excel
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-[40px]"></th>
                    <th className="text-left font-semibold px-3 py-2 w-[110px]">Date</th>
                    <th className="text-left font-semibold px-3 py-2">Details</th>
                    <th className="text-left font-semibold px-3 py-2 w-[80px]">L.F.</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Amount (Dr.)</th>
                    <th className="text-left font-semibold px-3 py-2 w-[120px]">Amount (Cr.)</th>
                    <th className="text-left font-semibold px-3 py-2 w-[260px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {generatedJournals.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-sm text-gray-500 text-center">
                        No generated journals yet.
                      </td>
                    </tr>
                  )}
                  {generatedJournals.map((j) => {
                    const lines = (j.lines || []).map((l) => ({
                      account: l.accountName || l.accountCode || "Account",
                      debit: round2(n0(l.debit)),
                      credit: round2(n0(l.credit)),
                    }));
                    const narration = String(j.description || j.narration || "").trim();
                    return (
                      <React.Fragment key={j._id}>
                        <tr className="bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedGeneratedIds.has(j._id)}
                              onChange={(e) => {
                                setSelectedGeneratedIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(j._id);
                                  else next.delete(j._id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {j.date ? new Date(j.date).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-3 py-2 text-sm font-semibold text-gray-900">
                            Voucher: {j.voucherNo || "-"} | {j.companyName || "-"}
                          </td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => editVoucher(j._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil size={14} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => askDeleteVoucher(j._id, j.voucherNo)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-red-200 text-xs text-red-700 hover:bg-red-50"
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintVoucher(j._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <Printer size={14} /> Print
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(j._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <Download size={14} /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadExcel(j._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <Download size={14} /> Excel
                              </button>
                            </div>
                          </td>
                        </tr>
                        {lines.map((l, idx) => {
                          const isDebit = l.debit > 0;
                          return (
                            <tr key={`${j._id}-${idx}`}>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2">
                                {idx === 0 && (
                                  <>
                                    <div className="text-xs text-gray-700">{formatYear(j.date)}</div>
                                    <div className="text-xs text-gray-700">{formatMonthDay(j.date)}</div>
                                  </>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className={`flex items-center ${isDebit ? "justify-between" : "pl-4"} gap-2`}>
                                  <span>{l.account}</span>
                                  {isDebit && <span className="text-xs font-semibold">Dr</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 text-right">{isDebit ? l.debit.toFixed(2) : ""}</td>
                              <td className="px-3 py-2 text-right">{!isDebit ? l.credit.toFixed(2) : ""}</td>
                              <td className="px-3 py-2"></td>
                            </tr>
                          );
                        })}
                        {narration && (
                          <tr>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 italic text-gray-600">(Being {narration})</td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
                value={filterCompanyId || filterCompanyName}
                onChange={(e) => handleFilterCompany(e.target.value)}
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
