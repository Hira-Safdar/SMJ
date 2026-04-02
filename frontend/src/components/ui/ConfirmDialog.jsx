import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Custom confirmation dialog matching app UI (emerald theme).
 * Use instead of window.confirm() for delete and other actions.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger", // "danger" | "warning" | "info"
  loading = false,
}) {
  const variantStyles = {
    danger: "bg-red-500 hover:bg-red-600 focus:ring-red-500/50",
    warning: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-500/50",
    info: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/50",
  };

  const iconBg = {
    danger: "bg-red-100 text-red-600",
    warning: "bg-amber-100 text-amber-600",
    info: "bg-emerald-100 text-emerald-600",
  };

  const handleConfirm = () => {
    onConfirm?.();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "Enter" && !loading) {
        e.preventDefault();
        onConfirm?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-5">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${iconBg[variant]}`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${variantStyles[variant]}`}
          >
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
