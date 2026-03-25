import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Download, Printer, Filter, X, FileText, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Pin4Input from "../Pin4Input";

const PAGE_SIZES = [5, 10, 25, 50, 100];

/**
 * Reusable data table with:
 * - Pagination
 * - Search
 * - Column filters (dropdowns where columns have filterOptions)
 * - Export to Excel
 * - Print
 * columns: [{ key, label, filterOptions?: string[] }]
 * data: array of row objects
 * idKey: key for row id (default '_id')
 */
export default function DataTable({
  columns = [],
  data = [],
  idKey = "_id",
  title = "Data",
  searchPlaceholder = "Search...",
  emptyMessage = "No records found",
  pageSize: initialPageSize = 10,
  rowClassName,
  showSearch = true,
  showFilters = true,
  showClearFilters = true,
  showExport = true,
  showPrint = true,
  exportData,
  exportColumns,
  enableKeyboard = true,
  onRowAction,
  toolbarActions,
  deleteAll,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const [sort, setSort] = useState({ key: "", dir: "asc" }); // dir: asc|desc
  const [deleteAllDialog, setDeleteAllDialog] = useState({
    open: false,
    pin: "",
    pinError: "",
    confirming: false,
  });

  const filteredData = useMemo(() => {
    let result = [...data];
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(s);
        })
      );
    }
    columns.forEach((col) => {
      if (col.filterOptions && filters[col.key]) {
        result = result.filter((row) => String(row[col.key]) === filters[col.key]);
      }
    });

    if (sort.key) {
      const dir = sort.dir === "desc" ? -1 : 1;
      const key = sort.key;
      result.sort((a, b) => {
        const va = a?.[key];
        const vb = b?.[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        const na = typeof va === "number" ? va : Number(String(va).replace(/,/g, ""));
        const nb = typeof vb === "number" ? vb : Number(String(vb).replace(/,/g, ""));
        const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
        if (bothNum) return (na - nb) * dir;

        const da = va instanceof Date ? va.getTime() : Date.parse(String(va));
        const db = vb instanceof Date ? vb.getTime() : Date.parse(String(vb));
        const bothDate = !Number.isNaN(da) && !Number.isNaN(db);
        if (bothDate) return (da - db) * dir;

        return String(va).localeCompare(String(vb)) * dir;
      });
    }
    return result;
  }, [data, search, columns, filters, sort]);

  useEffect(() => {
    setActiveRowIndex(filteredData.length ? 0 : -1);
  }, [filteredData.length]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageData = filteredData.slice(start, start + pageSize);

  const setFilter = (key, value) => {
    setFilters((prev) => (value ? { ...prev, [key]: value } : { ...prev, [key]: undefined }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = search.trim() || Object.values(filters).some(Boolean);

  const exportCols = exportColumns || columns.filter((c) => !c.skipExport);
  const exportRows = exportData ? exportData(filteredData, exportCols) : filteredData;
  const toText = (value) => {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) return value.map(toText).join(" ");
    if (value?.props?.children) return toText(value.props.children);
    return String(value);
  };

  const exportExcel = () => {
    const headers = exportCols.map((c) => c.label);
    const rows = exportRows.map((row) =>
      exportCols.map((c) =>
        toText(c.render ? c.render(row[c.key], row) : row[c.key] ?? "")
      )
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.replace(/\s/g, "_").slice(0, 31));
    XLSX.writeFile(wb, `${title.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    const headers = exportCols.map((c) => c.label);
    const rows = exportRows.map((row) =>
      exportCols.map((c) =>
        toText(c.render ? c.render(row[c.key], row) : row[c.key] ?? "")
      )
    );
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text(title, 14, 12);
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 18,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [236, 253, 245], textColor: 6 },
    });
    doc.save(`${title.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrint = useCallback(() => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const tableHtml = document.getElementById("data-table-print")?.outerHTML ?? "";
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
            th { background: #ecfdf5; color: #065f46; }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          <p>Printed on ${new Date().toLocaleString()}</p>
          ${tableHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [title, filteredData, exportCols, exportRows, idKey]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        handlePrint();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        exportExcel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePrint]);

  const showToolbar = showSearch || showFilters || showExport || showPrint || toolbarActions;

  return (
    <div className="space-y-3">
      {/* Toolbar: search, filters, export, print */}
      {showToolbar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {showSearch && (
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                data-global-search
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          )}
          {showFilters && (
            <button
              type="button"
              onClick={() => setFiltersOpen((p) => !p)}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm ${
                hasActiveFilters ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Filter size={16} /> Filter
            </button>
          )}
          {showClearFilters && hasActiveFilters && (showSearch || showFilters) && (
            <button
              type="button"
              onClick={clearFilters}
              className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              <X size={16} /> Clear
            </button>
          )}
          {(showExport || showPrint || toolbarActions) && (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {toolbarActions}
              {deleteAll && typeof deleteAll.onConfirm === "function" && (
                <button
                  type="button"
                  onClick={() =>
                    setDeleteAllDialog({ open: true, pin: "", pinError: "", confirming: false })
                  }
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-700 hover:bg-red-50"
                  title="Delete all records"
                >
                  <Trash2 size={16} /> Delete All
                </button>
              )}
              {showExport && (
                <>
                  <button
                    type="button"
                    onClick={exportExcel}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    title="Export Excel (Ctrl+Shift+E)"
                  >
                    <Download size={16} /> Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={exportPdf}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    title="Export PDF"
                  >
                    <FileText size={16} /> Export PDF
                  </button>
                </>
              )}
              {showPrint && (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  title="Print (Ctrl+P)"
                >
                  <Printer size={16} /> Print
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {deleteAllDialog.open && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-700">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Delete All</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {deleteAll?.description ||
                    "This will permanently delete all records for this table."}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-gray-600 mb-2">Enter admin PIN to confirm.</p>
              <Pin4Input
                value={deleteAllDialog.pin}
                onChange={(v) =>
                  setDeleteAllDialog((d) => ({ ...d, pin: v.slice(0, 4), pinError: "" }))
                }
                onComplete={async (pin) => {
                  setDeleteAllDialog((d) => ({ ...d, confirming: true, pinError: "" }));
                  try {
                    await deleteAll.onConfirm(pin);
                    setDeleteAllDialog({ open: false, pin: "", pinError: "", confirming: false });
                  } catch (e) {
                    setDeleteAllDialog((d) => ({
                      ...d,
                      confirming: false,
                      pinError: e?.message || "Failed to delete.",
                    }));
                  }
                }}
                error={!!deleteAllDialog.pinError}
              />
              {deleteAllDialog.pinError && (
                <p className="mt-2 text-xs text-red-600">{deleteAllDialog.pinError}</p>
              )}
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() =>
                  setDeleteAllDialog({ open: false, pin: "", pinError: "", confirming: false })
                }
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                disabled={deleteAllDialog.confirming}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const pin = String(deleteAllDialog.pin || "").slice(0, 4);
                  if (pin.length !== 4) {
                    setDeleteAllDialog((d) => ({ ...d, pinError: "Enter 4-digit PIN" }));
                    return;
                  }
                  setDeleteAllDialog((d) => ({ ...d, confirming: true, pinError: "" }));
                  try {
                    await deleteAll.onConfirm(pin);
                    setDeleteAllDialog({ open: false, pin: "", pinError: "", confirming: false });
                  } catch (e) {
                    setDeleteAllDialog((d) => ({
                      ...d,
                      confirming: false,
                      pinError: e?.message || "Failed to delete.",
                    }));
                  }
                }}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
                disabled={deleteAllDialog.confirming}
              >
                {deleteAllDialog.confirming ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter dropdowns */}
      {showFilters && filtersOpen && (
        <div className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          {columns.map(
            (col) =>
              col.filterOptions?.length > 0 && (
                <div key={col.key}>
                  <label className="block text-xs text-gray-500 mb-1">{col.label}</label>
                  <select
                    value={filters[col.key] ?? ""}
                    onChange={(e) => setFilter(col.key, e.target.value || undefined)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[120px]"
                  >
                    <option value="">All</option>
                    {Array.from(new Set((col.filterOptions || []).map((v) => String(v))))
                      .filter((v) => v.trim() !== "")
                      .map((opt, idx) => (
                        <option key={`${opt}-${idx}`} value={opt}>
                          {opt}
                        </option>
                      ))}
                  </select>
                </div>
              )
          )}
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-x-auto rounded-lg border border-gray-200 focus:outline-none"
        tabIndex={enableKeyboard ? 0 : -1}
        onKeyDown={(e) => {
          if (!enableKeyboard || filteredData.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveRowIndex((i) => Math.min((i < 0 ? 0 : i) + 1, filteredData.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveRowIndex((i) => Math.max((i < 0 ? 0 : i) - 1, 0));
          } else if (e.key === "Enter" && onRowAction && activeRowIndex >= 0) {
            e.preventDefault();
            onRowAction(filteredData[activeRowIndex]);
          }
        }}
      >
        <table className="w-full text-sm">
          <thead className="bg-emerald-50 text-emerald-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`p-2 text-left font-medium whitespace-nowrap ${col.sortable === false ? "" : "cursor-pointer select-none"}`}
                  onClick={() => {
                    if (col.sortable === false) return;
                    setSort((prev) => {
                      if (prev.key !== col.key) return { key: col.key, dir: "asc" };
                      return { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" };
                    });
                    setPage(1);
                  }}
                  title={col.sortable === false ? undefined : "Sort"}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable === false ? null : sort.key === col.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} className="opacity-40" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, idx) => {
              const globalIndex = start + idx;
              const isActive = enableKeyboard && globalIndex === activeRowIndex;
              return (
              <tr
                key={row[idKey] ?? idx}
                onClick={() => setActiveRowIndex(globalIndex)}
                className={`border-t border-gray-100 hover:bg-gray-50 ${isActive ? "bg-emerald-50" : ""} ${rowClassName ? rowClassName(row) : ""}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="p-2">
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            )})}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Hidden table for print (excludes action-only columns) */}
      <table id="data-table-print" className="hidden">
        <thead>
          <tr>
            {exportCols.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exportRows.map((row, idx) => (
            <tr key={row[idKey] ?? idx}>
              {exportCols.map((col) => (
                <td key={`${col.key}-${idx}`}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>
            {start + 1}-{Math.min(start + pageSize, filteredData.length)} of {filteredData.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-2 text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

