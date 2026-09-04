// src/components/MasterData/SystemSettings.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { toAbsoluteUrl } from "../../services/api";
import {
  UploadCloud,
  Save,
  Eye,
  EyeOff,
  Settings2,
  Shield,
  DatabaseBackup,
  Download,
  RotateCcw,
  Boxes,
  Building2,
  Calculator,
  ReceiptText,
  Truck,
  Factory,
  Warehouse,
  Bot,
  ToggleLeft,
  ToggleRight,
  History,
  Sparkles,
  CheckCircle2,
  Mail,
  X,
  Info,
  Home,
  Sprout,
  Loader2,
  KeyRound,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import Pin4Input from "../Pin4Input";
import ConfirmDialog from "../ui/ConfirmDialog";
import { FilterToggleButton } from "../ui/CollapsibleFilter";

const MODULE_ICONS = {
  settings: Settings2,
  masters: Building2,
  accounting: Calculator,
  transactions: ReceiptText,
  gatepasses: Truck,
  production: Factory,
  stock: Warehouse,
  expenses: Boxes,
  intelligence: Bot,
};

const formatDateTime = (value) => {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const parseDownloadFilename = (headerValue, fallback) => {
  const match = String(headerValue || "").match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
};

const triggerBlobDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const formatCollectionLabel = (value) =>
  String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function SystemSettings() {
  const OTP_RESEND_SECONDS = 45;
  const [settings, setSettings] = useState({
    companyName: "",
    shortName: "",
    address: "",
    phone: "",
    email: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false,
    mailFrom: "",
    defaultCurrency: "PKR",
    logoUrl: "",
    defaultBagWeightKg: 65,
    adminPin: "0000",
    loginPassword: "",
    backupAutomationEnabled: false,
    backupScheduleTime: "02:00",
    backupStorageMode: "local",
    backupLocalFolderPath: "",
  });

  const [activeTab, setActiveTab] = useState("general");
  const [searchParams] = useSearchParams();
  const isElectronDesktop =
    typeof window !== "undefined" && !!window.electronAPI?.getSystemInfo;
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [showSmtpSection, setShowSmtpSection] = useState(false);
  const [backupMeta, setBackupMeta] = useState({
    automationEnabled: false,
    scheduleTime: "02:00",
    lastBackupAt: null,
    lastRestoreAt: null,
    lastScheduledRunAt: null,
    history: [],
  });
  const [backupModules, setBackupModules] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [moduleProgress, setModuleProgress] = useState({});
  const [historyFilterAction, setHistoryFilterAction] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [activeBackupTask, setActiveBackupTask] = useState({
    scope: "",
    label: "Backup system is idle.",
    percent: 0,
    phase: "idle",
    paused: false,
    running: false,
  });
  const [restoreDialog, setRestoreDialog] = useState({
    open: false,
    conflict: "replace",
    localFile: null,
    busy: false,
    error: "",
  });
  const [systemInfo, setSystemInfo] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [otpDialog, setOtpDialog] = useState({
    open: false,
    sent: false,
    verified: false,
    verifying: false,
    channel: "email",
    otp: "",
    newPin: "",
    confirmPin: "",
    expiresIn: 0,
    sending: false,
    resetting: false,
    error: "",
  });
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [emailPasswordDialog, setEmailPasswordDialog] = useState({
    open: false,
    password: "",
    saving: false,
    error: "",
    email: "",
  });
  const [dialog, setDialog] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    confirmLabel: "OK",
    onConfirm: null,
  });
  const restoreLocalFileInputRef = useRef(null);
  const savedGeneralEmailRef = useRef("");
  const pinSectionRef = useRef(null);
  const newPinInputRef = useRef(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return undefined;
    }
    const preview = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("focus") !== "set-pin") return;
    setActiveTab("admin");
    const timer = window.setTimeout(() => {
      pinSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      newPinInputRef.current?.focus();
    }, 120);
    params.delete("focus");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
    return () => window.clearTimeout(timer);
  }, []);

  // Load app version + subscribe to updater events (desktop only)
  useEffect(() => {
    if (!isElectronDesktop) return undefined;
    window.electronAPI
      .getSystemInfo()
      .then((info) => setSystemInfo(info || {}))
      .catch(() => setSystemInfo({}));
    const cleanup = window.electronAPI.onUpdateStatus((s) => {
      setUpdateStatus(s);
      setUpdateBusy(false);
      if (s.type === "error") toast.error(s.message || "Update check failed");
    });
    return cleanup;
  }, [isElectronDesktop]);

  const handleUpdateClick = async () => {
    if (!isElectronDesktop || updateBusy) return;
    setUpdateBusy(true);
    try {
      if (updateStatus?.type === "downloaded") {
        await window.electronAPI.quitAndInstall();
        return;
      }
      if (updateStatus?.type === "available") {
        await window.electronAPI.downloadUpdate();
        return;
      }
      setUpdateStatus({ type: "checking" });
      const res = await window.electronAPI.checkForUpdates();
      if (res && res.ok === false) {
        setUpdateStatus({ type: "error", message: res.error });
        setUpdateBusy(false);
      }
    } catch (err) {
      setUpdateStatus({ type: "error", message: String(err) });
      setUpdateBusy(false);
    }
  };

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "general" || sub === "admin" || sub === "backup" || sub === "about") {
      setActiveTab(sub);
    }
  }, [searchParams]);

  const updateModuleProgress = (key, patch) => {
    setModuleProgress((prev) => ({
      ...prev,
      [key]: {
        phase: "idle",
        percent: 0,
        message: "",
        busy: false,
        ...prev[key],
        ...patch,
      },
    }));
  };

  const showBackupToast = ({ title, detail = "", tone = "default" }) => {
    toast.custom(
      (t) => (
        <div
          className={`pointer-events-auto min-w-[280px] max-w-md rounded-2xl border shadow-lg px-4 py-3 transition-all ${
            t.visible ? "animate-enter" : "animate-leave"
          } ${
            tone === "success"
              ? "border-emerald-200 bg-white"
              : tone === "error"
              ? "border-rose-200 bg-white"
              : "border-emerald-100 bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                tone === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : tone === "error"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {tone === "success" ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">{title}</div>
              {!!detail && <div className="mt-1 text-xs text-gray-600">{detail}</div>}
            </div>
          </div>
        </div>
      ),
      { duration: tone === "default" ? 2200 : 3000 }
    );
  };

  const updateGlobalProgress = ({ scope, label, percent, phase, paused, running }) => {
    setActiveBackupTask((prev) => ({
      scope: scope ?? prev.scope ?? "",
      label: label ?? prev.label ?? "Backup system is idle.",
      percent: percent != null ? Number(percent) : prev.percent ?? 0,
      phase: phase ?? prev.phase ?? "idle",
      paused: paused != null ? !!paused : prev.paused ?? false,
      running: running != null ? !!running : prev.running ?? false,
    }));
  };

  const loadBackupModules = async ({ silent = false } = {}) => {
    if (!silent) setBackupBusy(true);
    try {
      const res = await api.get("/settings/backup/modules");
      const data = res.data?.data || {};
      setBackupMeta({
        automationEnabled: !!data.automationEnabled,
        scheduleTime: data.scheduleTime || "02:00",
        lastBackupAt: data.lastBackupAt || null,
        lastRestoreAt: data.lastRestoreAt || null,
        lastScheduledRunAt: data.lastScheduledRunAt || null,
        history: Array.isArray(data.history) ? data.history : [],
      });
      setBackupModules(Array.isArray(data.modules) ? data.modules : []);
      setSettings((prev) => ({
        ...prev,
        backupAutomationEnabled: !!data.automationEnabled,
        backupScheduleTime: data.scheduleTime || prev.backupScheduleTime || "02:00",
        backupStorageMode: "local",
        backupLocalFolderPath: data.localFolderPath || prev.backupLocalFolderPath || "",
      }));
    } catch (err) {
      if (!silent) toast.error("Failed to load backup center");
    } finally {
      if (!silent) setBackupBusy(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes] = await Promise.all([api.get("/settings"), loadBackupModules({ silent: true })]);
        if (settingsRes.data && settingsRes.data.data) {
          const s = settingsRes.data.data;
          setSettings((prev) => ({
            ...prev,
            ...s,
            logoUrl: toAbsoluteLogoUrl(s.logoUrl || s.logo || s.logoPath || ""),
          }));
          savedGeneralEmailRef.current = String(s.email || "").trim();
        }
      } catch (err) {
        toast.error("Failed to load settings");
      }
    };
    load();
  }, []);

  useEffect(() => {
    const refresh = async () => {
      await loadBackupModules({ silent: true });
      try {
        const settingsRes = await api.get("/settings");
        if (settingsRes.data?.data) {
          const s = settingsRes.data.data;
          setSettings((prev) => ({
            ...prev,
            ...s,
            logoUrl: toAbsoluteLogoUrl(s.logoUrl || s.logo || s.logoPath || ""),
          }));
        }
      } catch (_) {}
    };
    window.addEventListener("smj-settings-updated", refresh);
    const intervalId = window.setInterval(
      () => loadBackupModules({ silent: true }),
      settings.backupAutomationEnabled ? 15000 : 30000
    );
    return () => {
      window.removeEventListener("smj-settings-updated", refresh);
      window.clearInterval(intervalId);
    };
  }, [settings.backupAutomationEnabled]);

  const lastStatusPhaseRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get("/settings/backup/status");
        const s = res.data?.data || {};
        const phase = s.phase || "idle";
        setActiveBackupTask({
          scope: s.scope || "",
          label: s.label || "Backup system is idle.",
          percent: Number(s.percent || 0),
          phase,
          paused: !!s.paused,
          running: !!s.running,
        });
        if (cancelled) return;
        if ((phase === "done" && lastStatusPhaseRef.current !== "done") || (phase === "error" && lastStatusPhaseRef.current !== "error")) {
          loadBackupModules({ silent: true });
        }
        lastStatusPhaseRef.current = phase;
      } catch (_) {
        /* ignore transient polling errors */
      }
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onEsc = () => {
      if (otpDialog.open) resetOtpDialog();
      if (emailPasswordDialog.open) setEmailPasswordDialog({ open: false, password: "", saving: false, error: "", email: "" });
    };
    window.addEventListener("smj-esc", onEsc);
    return () => window.removeEventListener("smj-esc", onEsc);
  }, [otpDialog.open, emailPasswordDialog.open, otpResendIn]);

  const handleChange = (k, v) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const toAbsoluteLogoUrl = (value) => toAbsoluteUrl(value);

  useEffect(() => {
    const generalEmail = String(settings.email || "").trim();
    if (!generalEmail) return;
    setSettings((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!String(prev.smtpUser || "").trim()) {
        next.smtpUser = generalEmail;
        changed = true;
      }
      if (!String(prev.mailFrom || "").trim()) {
        next.mailFrom = generalEmail;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [settings.email]);

  const [generalSaveMsg, setGeneralSaveMsg] = useState("");
  const saveSettings = async (payload) => {
    setLoading(true);
    setGeneralSaveMsg("");
    try {
      await api.put("/settings", payload);
      window.dispatchEvent(new Event("smj-settings-updated"));
      setGeneralSaveMsg("Saved");
      return true;
    } catch (err) {
      setGeneralSaveMsg(err?.response?.data?.message || "Error saving settings");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    const nextEmail = String(settings.email || "").trim();
    const previousEmail = String(savedGeneralEmailRef.current || "").trim();

    const payload = {
      companyName: settings.companyName || "",
      shortName: settings.shortName || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: nextEmail,
      smtpHost: String(settings.smtpHost || "").trim() || "smtp.gmail.com",
      smtpPort: Number(settings.smtpPort) || 587,
      smtpUser: nextEmail,
      smtpPass: String(settings.smtpPass || "").replace(/\s+/g, ""),
      smtpSecure: false,
      mailFrom: nextEmail,
      defaultCurrency: settings.defaultCurrency || "",
      logoUrl: settings.logoUrl || "",
    };
    const saved = await saveSettings(payload);
    if (!saved) return;

    setSettings((prev) => ({
      ...prev,
      email: nextEmail,
      smtpHost: payload.smtpHost,
      smtpPort: payload.smtpPort,
      smtpUser: nextEmail,
      smtpSecure: false,
      mailFrom: nextEmail,
    }));
    savedGeneralEmailRef.current = nextEmail;

    if (previousEmail && nextEmail && previousEmail !== nextEmail) {
      setGeneralSaveMsg("Saved. Update the 16-character app password for the new email.");
      setEmailPasswordDialog({
        open: true,
        password: "",
        saving: false,
        error: "",
        email: nextEmail,
      });
    }
  };

  const pinExists = useMemo(() => {
    const raw = settings?.adminPin;
    return typeof raw === "string" && raw.trim().length > 0;
  }, [settings.adminPin]);

  const handleSavePin = async (mode) => {
    setPinError("");
    const isSet = mode === "set";
    const cur = String(currentPin || "").replace(/\D/g, "").slice(0, 4);
    const nw = String(newPin || "").replace(/\D/g, "").slice(0, 4);
    const cf = String(confirmPin || "").replace(/\D/g, "").slice(0, 4);

    if (!isSet && cur.length !== 4) {
      setDialog({
        open: true,
        title: "Current PIN required",
        message: "Enter your current PIN to verify your identity before resetting it.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: null,
      });
      return;
    }
    if (nw.length !== 4) {
      setDialog({
        open: true,
        title: "New PIN required",
        message: "Enter a new 4-digit PIN.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: null,
      });
      return;
    }
    if (nw !== cf) {
      setDialog({
        open: true,
        title: "PINs do not match",
        message: "New PIN and Confirm PIN must be the same.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: null,
      });
      return;
    }
    const payload = {};
    if (!isSet) payload.adminPin = cur;
    payload.newAdminPin = nw;
    payload.loginPassword = nw;
    setLoading(true);
    try {
      await api.put("/settings", payload);
      toast.success(isSet ? "PIN set successfully" : "PIN reset successfully");
      window.dispatchEvent(new Event("smj-settings-updated"));
      setSettings((prev) => ({ ...prev, adminPin: nw, loginPassword: nw }));
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      if (err.response?.status === 403) {
        setPinError("Current PIN is incorrect");
        toast.error("Current PIN is incorrect");
      } else {
        toast.error("Error saving PIN");
      }
    } finally {
      setLoading(false);
    }
  };

  const maskEmail = (email) => {
    if (!email || !email.includes("@")) return "***";
    const [user, domain] = email.split("@");
    const maskedUser = user.length <= 2 ? `${user[0] || "*"}***` : `${user[0]}***${user[user.length - 1]}`;
    const parts = domain.split(".");
    const maskedDomain = parts.length
      ? `${parts[0][0] || "*"}***.${parts.slice(1).join(".") || "com"}`
      : "***";
    return `${maskedUser}@${maskedDomain}`;
  };

  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const testSmtp = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      await api.put("/settings", {
        smtpHost: String(settings.smtpHost || "").trim() || "smtp.gmail.com",
        smtpPort: Number(settings.smtpPort) || 587,
        smtpUser: settings.email || "",
        smtpPass: String(settings.smtpPass || "").replace(/\s+/g, ""),
        smtpSecure: false,
        mailFrom: settings.email || "",
      });
      const res = await api.post("/settings/smtp/test");
      setSmtpTestResult({ ok: true, message: res?.data?.message || "SMTP connection successful." });
      toast.success("SMTP test passed");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "SMTP test failed.";
      setSmtpTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setSmtpTesting(false);
    }
  };

  const appPasswordLength = String(settings.smtpPass || "").replace(/\s+/g, "").length;
  const appPasswordHint =
    appPasswordLength === 0
      ? "Enter the 16-character Gmail app password."
      : appPasswordLength !== 16
      ? `This password is ${appPasswordLength} characters — Gmail app passwords are exactly 16. It will not be accepted until fixed.`
      : "Looks like a valid 16-character app password.";

  const canSendEmailOtp = !!String(settings.email || "").trim();
  useEffect(() => {
    if (!otpResendIn) return undefined;
    const timer = window.setInterval(() => {
      setOtpResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpResendIn]);

  useEffect(() => {
    if (!otpDialog.expiresIn) return undefined;
    const timer = window.setInterval(() => {
      setOtpDialog((prev) => ({
        ...prev,
        expiresIn: prev.expiresIn > 0 ? prev.expiresIn - 1 : 0,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpDialog.expiresIn]);

  const resetOtpDialog = () => {
    setOtpDialog({
      open: false,
      sent: false,
      verified: false,
      verifying: false,
      channel: "email",
      otp: "",
      newPin: "",
      confirmPin: "",
      expiresIn: 0,
      sending: false,
      resetting: false,
      error: "",
    });
    setOtpResendIn(0);
  };

  const verifyOtp = async () => {
    if (otpDialog.otp.length !== 4) {
      setOtpDialog((prev) => ({ ...prev, error: "Enter the 4-digit OTP from your email." }));
      return;
    }
    setOtpDialog((prev) => ({ ...prev, verifying: true, error: "" }));
    try {
      const res = await api.post("/settings/otp/verify", { otp: otpDialog.otp });
      if (res.data?.success) {
        setOtpDialog((prev) => ({ ...prev, verifying: false, verified: true, error: "" }));
        toast.success("OTP verified. Now set your new PIN.");
      } else {
        setOtpDialog((prev) => ({
          ...prev,
          verifying: false,
          error: res.data?.message || "OTP verification failed",
        }));
      }
    } catch (err) {
      setOtpDialog((prev) => ({
        ...prev,
        verifying: false,
        error: err.response?.data?.message || "OTP verification failed",
      }));
    }
  };

  const resetPinViaOtp = async () => {
    if (otpDialog.newPin.length !== 4) {
      setOtpDialog((prev) => ({ ...prev, error: "Enter a new 4-digit PIN." }));
      return;
    }
    if (otpDialog.newPin !== otpDialog.confirmPin) {
      setOtpDialog((prev) => ({ ...prev, error: "PIN confirmation does not match." }));
      return;
    }
    setOtpDialog((prev) => ({ ...prev, resetting: true, error: "" }));
    try {
      const res = await api.post("/settings/otp/reset-pin", {
        otp: otpDialog.otp,
        newPin: otpDialog.newPin,
      });
      if (res.data?.success) {
        toast.success("New PIN saved. Use it to log in next time.");
        setSettings((prev) => ({ ...prev, adminPin: otpDialog.newPin, loginPassword: otpDialog.newPin }));
        window.dispatchEvent(new Event("smj-settings-updated"));
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        resetOtpDialog();
      } else {
        setOtpDialog((prev) => ({
          ...prev,
          resetting: false,
          error: res.data?.message || "PIN reset failed",
        }));
      }
    } catch (err) {
      setOtpDialog((prev) => ({
        ...prev,
        resetting: false,
        error: err.response?.data?.message || "PIN reset failed",
      }));
    }
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleLogoSelect = (e) => {
    const f = e.target.files[0];
    if (!f) {
      setLogoFile(null);
      return;
    }
    setLogoFile(f);
  };

  const uploadLogo = async () => {
    if (!logoFile) {
      setDialog({
        open: true,
        title: "No file selected",
        message: "Please choose a logo file first.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: null,
      });
      return;
    }
    const form = new FormData();
    form.append("logo", logoFile);
    setLoading(true);
    try {
      const res = await api.post("/settings/logo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data && res.data.logoUrl) {
        handleChange("logoUrl", toAbsoluteLogoUrl(res.data.logoUrl));
        setLogoFile(null);
        window.dispatchEvent(new Event("smj-settings-updated"));
        toast.success("Logo uploaded");
      }
    } catch (err) {
      toast.error("Logo upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupAutomationToggle = async () => {
    const nextValue = !settings.backupAutomationEnabled;
    setBackupBusy(true);
    try {
      await api.put("/settings", {
        backupAutomationEnabled: nextValue,
        backupScheduleTime: settings.backupScheduleTime || "02:00",
      });
      setSettings((prev) => ({ ...prev, backupAutomationEnabled: nextValue }));
      setBackupMeta((prev) => ({ ...prev, automationEnabled: nextValue }));
      window.dispatchEvent(new Event("smj-settings-updated"));
      toast.success(`Daily auto backup ${nextValue ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update auto backup");
    } finally {
      setBackupBusy(false);
    }
  };

  const saveBackupScheduleTime = async () => {
    setBackupBusy(true);
    try {
      await api.put("/settings", {
        backupAutomationEnabled: !!settings.backupAutomationEnabled,
        backupScheduleTime: settings.backupScheduleTime || "02:00",
      });
      setBackupMeta((prev) => ({
        ...prev,
        scheduleTime: settings.backupScheduleTime || "02:00",
      }));
      window.dispatchEvent(new Event("smj-settings-updated"));
      showBackupToast({
        title: "Backup time saved",
        detail: `Daily backup will run at ${settings.backupScheduleTime || "02:00"}.`,
        tone: "success",
      });
      toast.success("Backup schedule updated");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save backup time");
    } finally {
      setBackupBusy(false);
    }
  };

  const makeTimestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const to12hParts = (time24) => {
    const [h, m] = String(time24 || "02:00").split(":").map(Number);
    const hour24 = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 2;
    const minute = Number.isFinite(m) ? m : 0;
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return { hour: hour12, minute, ampm };
  };

  const to24h = (hour12, minute, ampm) => {
    let h = Number(hour12) % 12;
    if (ampm === "PM") h += 12;
    return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const setScheduleTimeParts = (parts) => {
    const current = to12hParts(settings.backupScheduleTime || "02:00");
    const next = to24h(parts.hour ?? current.hour, parts.minute ?? current.minute, parts.ampm ?? current.ampm);
    setSettings((prev) => ({ ...prev, backupScheduleTime: next }));
  };

  const runFullBackup = async () => {
    const picked = await pickBackupFolderNative();
    if (picked === "cancelled") {
      toast.info("Backup cancelled — no folder selected.");
      return;
    }
    if (picked && picked !== "default") {
      setSettings((prev) => ({ ...prev, backupLocalFolderPath: picked }));
      api.put("/settings", {
        backupStorageMode: "local",
        backupLocalFolderPath: picked,
      }).catch(() => {});
    }

    const isBrowser = typeof window === "undefined" || !window.electronAPI?.pickBackupFolder;
    let saveHandle = null;
    if (isBrowser && typeof window.showSaveFilePicker === "function") {
      try {
        saveHandle = await window.showSaveFilePicker({
          suggestedName: `smj-backup-${makeTimestamp()}.json`,
          types: [
            {
              description: "JSON Backup",
              accept: { "application/json": [".json"] },
            },
          ],
        });
      } catch (err) {
        if (err?.name === "AbortError") {
          toast.info("Backup cancelled — no save location chosen.");
          return;
        }
      }
    }

    updateGlobalProgress({
      scope: "all",
      label: "Preparing full system backup...",
      percent: 2,
      phase: "backup",
      running: true,
    });
    try {
      const res = await api.post("/settings/backup/run");
      const fileName = res.data?.data?.fileName;
      if (isBrowser) {
        const url = toAbsoluteUrl(`/api/settings/backup/history/download/${encodeURIComponent(fileName)}`);
        const download = () => {
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };
        if (saveHandle) {
          try {
            const response = await fetch(url);
            const text = await response.text();
            const writable = await saveHandle.createWritable();
            await writable.write(text);
            await writable.close();
            showBackupToast({
              title: "Backup completed",
              detail: `Saved to: ${saveHandle.name}`,
              tone: "success",
            });
          } catch {
            download();
            showBackupToast({
              title: "Backup completed",
              detail: "Backup downloaded — check your Downloads folder.",
              tone: "success",
            });
          }
        } else {
          download();
          showBackupToast({
            title: "Backup completed",
            detail: "Backup downloaded — check your Downloads folder.",
            tone: "success",
          });
        }
      } else {
        showBackupToast({
          title: "Backup completed",
          detail:
            res.data?.data?.localPath ||
            res.data?.message ||
            "Full system backup completed.",
          tone: "success",
        });
      }
      await loadBackupModules({ silent: true });
    } catch (err) {
      updateGlobalProgress({
        scope: "all",
        label: err?.response?.data?.message || "Full backup failed.",
        percent: 0,
        phase: "error",
      });
      showBackupToast({
        title: "Backup failed",
        detail: err?.response?.data?.message || "Full system backup could not be created.",
        tone: "error",
      });
    }
  };

  const pickBackupFolderNative = () =>
    new Promise((resolve) => {
      if (typeof window !== "undefined" && window.electronAPI?.pickBackupFolder) {
        window.electronAPI
          .pickBackupFolder()
          .then((folder) => resolve(folder || null))
          .catch(() => resolve(null));
      } else {
        resolve("default");
      }
    });

  const openRestoreDialog = () => {
    setRestoreDialog({
      open: true,
      conflict: "replace",
      localFile: null,
      busy: false,
      error: "",
    });
  };

  const confirmRestore = async () => {
    const { conflict, localFile } = restoreDialog;
    if (!localFile) {
      setRestoreDialog((prev) => ({ ...prev, error: "Choose a backup JSON file." }));
      return;
    }
    setRestoreDialog((prev) => ({ ...prev, busy: true, error: "" }));
    try {
      const form = new FormData();
      form.append("backup", localFile);
      form.append("mode", conflict);
      const res = await api.post("/settings/restore", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showBackupToast({ title: "Restore completed", detail: res.data?.message || "Restore finished.", tone: "success" });
      setRestoreDialog({ open: false, conflict: "replace", localFile: null, busy: false, error: "" });
      await loadBackupModules({ silent: true });
      setDialog({
        open: true,
        title: "Restore complete",
        message: "Data restored successfully. Reload the app to continue.",
        variant: "info",
        confirmLabel: "Reload",
        onConfirm: () => window.location.reload(),
      });
    } catch (err) {
      setRestoreDialog((prev) => ({
        ...prev,
        busy: false,
        error: err?.response?.data?.message || "Restore failed.",
      }));
    }
  };

  const downloadHistoryBackupFile = async (entry) => {
    const fileName = String(entry?.fileName || "").trim();
    if (!fileName) return;
    try {
      const res = await api.get(`/settings/backup/history/download/${encodeURIComponent(fileName)}`, {
        responseType: "blob",
      });
      const finalName = parseDownloadFilename(res.headers?.["content-disposition"], fileName);
      triggerBlobDownload(res.data, finalName);
      showBackupToast({ title: "Download ready", detail: "Backup file downloaded successfully.", tone: "success" });
    } catch (err) {
      showBackupToast({ title: "Download failed", detail: err?.response?.data?.message || "Could not download backup file.", tone: "error" });
    }
  };

  const backupSummary = useMemo(() => {
    const totalRecords = backupModules.reduce((sum, module) => sum + Number(module.totalRecords || 0), 0);
    const activeJobs = Object.values(moduleProgress).filter((state) => state?.busy).length;
    return {
      totalRecords,
      moduleCount: backupModules.length,
      activeJobs,
    };
  }, [backupModules, moduleProgress]);

  const filteredHistory = useMemo(() => {
    const term = String(historySearch || "").trim().toLowerCase();
    return (backupMeta.history || []).filter((entry) => {
      if (historyFilterAction !== "ALL" && String(entry.action || "") !== historyFilterAction) return false;
      if (!term) return true;
      const haystack = [
        entry.moduleName,
        entry.fileName,
        entry.action,
        entry.trigger,
        entry.scope,
        entry.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [backupMeta.history, historyFilterAction, historySearch]);

  const hasActiveHistoryFilters = historyFilterAction !== "ALL" || Boolean(String(historySearch || "").trim());

  const clearHistoryFilters = () => {
    setHistoryFilterAction("ALL");
    setHistorySearch("");
  };

  const resolveHistoryTrigger = (entry) => {
    const explicit = String(entry?.trigger || "").trim().toUpperCase();
    if (explicit === "AUTO" || explicit === "MANUAL") return explicit;

    const fileName = String(entry?.fileName || "").trim().toLowerCase();
    const moduleName = String(entry?.moduleName || "").trim().toLowerCase();
    if (fileName.startsWith("smj-scheduled-backup-") || moduleName.includes("scheduled")) return "AUTO";
    return "MANUAL";
  };

  const canDownloadHistoryEntry = (entry) => {
    if (String(entry?.action || "").toUpperCase() !== "BACKUP") return false;
    if (String(entry?.status || "SUCCESS").toUpperCase() !== "SUCCESS") return false;
    return !!String(entry?.fileName || "").trim();
  };

  const clearBackupHistory = async () => {
    setLoading(true);
    try {
      const res = await api.delete("/settings/backup/history");
      setBackupMeta((prev) => ({
        ...prev,
        history: Array.isArray(res.data?.data?.history) ? res.data.data.history : [],
      }));
      showBackupToast({ title: "History cleared", detail: "Backup history has been removed.", tone: "success" });
      toast.success("Backup history cleared");
    } catch (err) {
      showBackupToast({ title: "Clear failed", detail: "Backup history could not be cleared.", tone: "error" });
      toast.error(err?.response?.data?.message || "Failed to clear history");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div data-tour="settings-tabs" className="border-b border-emerald-200">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
            activeTab === "general"
              ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
              : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Settings2 size={16} />
          General
        </button>
        <button
          onClick={() => setActiveTab("admin")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
            activeTab === "admin"
              ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
              : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Shield size={16} />
          PIN Setup
        </button>
        <button
          onClick={() => setActiveTab("backup")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
            activeTab === "backup"
              ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
              : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <DatabaseBackup size={16} />
          Backup & Restore
        </button>
        <button
          onClick={() => setActiveTab("about")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
            activeTab === "about"
              ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
              : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Info size={16} />
          About
        </button>
      </div>
      </div>

      {/* Content */}
      <div className="p-4 rounded-lg">
        {/* GENERAL TAB */}
        {activeTab === "general" && (
          <div data-tour="settings-general">
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
              <div ref={pinSectionRef} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Company Name</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.companyName || ""}
                      onChange={(e) => handleChange("companyName", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Address</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.address || ""}
                      onChange={(e) => handleChange("address", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Phone</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.phone || ""}
                      onChange={(e) => handleChange("phone", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Email</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.email || ""}
                      onChange={(e) => handleChange("email", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpSection((s) => !s)}
                      className="mt-1.5 text-xs text-emerald-600 hover:underline"
                    >
                      {showSmtpSection ? "Hide SMTP settings" : "Configure SMTP for email →"}
                    </button>
                  </div>
                </div>

                {showSmtpSection && (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">SMTP Settings</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={testSmtp}
                          disabled={smtpTesting}
                          className="text-xs text-emerald-700 font-medium border border-emerald-300 rounded-lg px-2.5 py-1 bg-white hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {smtpTesting ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange("smtpHost", "smtp.gmail.com");
                            handleChange("smtpPort", 587);
                            handleChange("smtpUser", settings.email || "");
                            handleChange("mailFrom", settings.email || "");
                            handleChange("smtpSecure", false);
                            toast.success("Gmail SMTP applied. Enter your App Password below.");
                          }}
                          className="text-xs text-emerald-700 font-medium border border-emerald-300 rounded-lg px-2.5 py-1 bg-white hover:bg-emerald-100"
                        >
                          Connect Google Account
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Email (auto)</label>
                        <input
                          className="w-full rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-gray-500"
                          value={settings.email || ""}
                          readOnly
                          placeholder="your-email@gmail.com"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          Uses the email above. Host smtp.gmail.com, port 587.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">App Password</label>
                        <input
                          type="password"
                          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                            appPasswordLength > 0 && appPasswordLength !== 16
                              ? "border-rose-300"
                              : "border-emerald-200"
                          }`}
                          value={settings.smtpPass || ""}
                          onChange={(e) => handleChange("smtpPass", e.target.value)}
                          placeholder="16-character app password"
                        />
                        {appPasswordLength > 0 && appPasswordLength !== 16 && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600">
                            {appPasswordLength} characters — must be exactly 16.
                          </p>
                        )}
                      </div>
                    </div>
                    {smtpTestResult && (
                      <div
                        className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                          smtpTestResult.ok
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                      >
                        <span className="font-semibold">{smtpTestResult.ok ? "✓ " : "✗ "}</span>
                        {smtpTestResult.message}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      For Gmail: go to <span className="font-medium">myaccount.google.com → Security → App passwords</span>, generate a 16-character password and paste it here. Host will be <span className="font-medium">smtp.gmail.com</span>, port <span className="font-medium">587</span>.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="text-sm font-semibold text-gray-900">Logo & Branding</div>
                <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center">
                  {logoPreviewUrl || settings.logoUrl ? (
                    <img
                      src={logoPreviewUrl || settings.logoUrl}
                      alt="logo"
                      className="mx-auto h-28 object-contain"
                    />
                  ) : (
                    <div className="h-28 w-full flex items-center justify-center text-sm text-gray-400">
                      Upload logo here
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-800 cursor-pointer hover:bg-emerald-200 transition-colors">
                      Choose
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoSelect}
                        className="sr-only"
                      />
                    </label>
                    {logoFile ? (
                      <span className="flex items-center gap-1.5 min-w-0 text-xs text-gray-700">
                        <span className="truncate">{logoFile.name}</span>
                        <button
                          type="button"
                          onClick={() => setLogoFile(null)}
                          className="shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                          title="Clear selection"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No file chosen</span>
                    )}
                  </div>
                  <button
                    className="w-full rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                    onClick={uploadLogo}
                    type="button"
                    disabled={loading || !logoFile}
                  >
                    <UploadCloud size={15} /> Upload Logo
                  </button>
                </div>
              </div>

            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveGeneral}
                disabled={loading}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save size={16} /> {loading ? "Saving..." : "Save General Settings"}
              </button>
            </div>
          </div>
          </div>
        )}

        {/* PIN SETUP TAB */}
        {activeTab === "admin" && (
          <div className="space-y-4 w-full max-w-none" data-tour="settings-admin">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Shield size={18} />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-gray-900">PIN Setup</div>
                    <div className="text-xs text-gray-500">Master 4-digit PIN — used for login and protected actions.</div>
                  </div>
                </div>
                {pinExists ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 size={12} /> PIN set
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <AlertTriangle size={12} /> PIN not set
                  </span>
                )}
              </div>
            </div>

            {/* STEP 1 — Set PIN (first time) */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">1</span>
                <div className="text-sm font-semibold text-gray-900">Set PIN</div>
                <span className="text-xs text-gray-400">First time only — no current PIN needed.</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative">
                  <input
                    ref={newPinInputRef}
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    disabled={pinExists || loading}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:opacity-60"
                    placeholder="New PIN (4 digits)"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin((s) => !s)}
                    disabled={pinExists}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 disabled:opacity-50"
                  >
                    {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    disabled={pinExists || loading}
                    className={`w-full rounded-xl border bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:opacity-60 ${
                      newPin && confirmPin && newPin !== confirmPin ? "border-rose-400" : "border-emerald-200"
                    }`}
                    placeholder="Confirm PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin((s) => !s)}
                    disabled={pinExists}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 disabled:opacity-50"
                  >
                    {showConfirmPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {newPin && confirmPin && newPin !== confirmPin && (
                <div className="mt-1 text-xs text-rose-600">PINs do not match.</div>
              )}
              {pinExists && (
                <div className="mt-1 text-xs text-gray-400">A PIN is already set — use Reset PIN below to change it.</div>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSavePin("set")}
                  disabled={pinExists || loading}
                  className="flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <KeyRound size={16} /> {loading ? "Saving..." : "Set PIN"}
                </button>
              </div>
            </div>

            {/* STEP 2 — Reset PIN */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">2</span>
                <div className="text-sm font-semibold text-gray-900">Reset PIN</div>
                <span className="text-xs text-gray-400">Current PIN + new PIN + confirm.</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Current PIN</label>
                  <Pin4Input
                    value={currentPin}
                    onChange={(v) => {
                      setCurrentPin(v.slice(0, 4));
                      if (pinError) setPinError("");
                    }}
                    error={!!pinError}
                    disabled={!pinExists || loading}
                  />
                  {pinError && <div className="mt-1 text-sm text-rose-600">{pinError}</div>}
                </div>
                <div className="relative">
                  <label className="mb-1 block text-xs font-medium text-gray-600">New PIN</label>
                  <input
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    disabled={!pinExists || loading}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:opacity-60"
                    placeholder="New PIN (4 digits)"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin((s) => !s)}
                    disabled={!pinExists}
                    className="absolute right-2 top-[38px] -translate-y-1/2 text-gray-500 disabled:opacity-50"
                  >
                    {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Confirm PIN</label>
                  <input
                    type={showConfirmPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    disabled={!pinExists || loading}
                    className={`w-full rounded-xl border bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:opacity-60 ${
                      newPin && confirmPin && newPin !== confirmPin ? "border-rose-400" : "border-emerald-200"
                    }`}
                    placeholder="Confirm New PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin((s) => !s)}
                    disabled={!pinExists}
                    className="absolute right-2 top-[38px] -translate-y-1/2 text-gray-500 disabled:opacity-50"
                  >
                    {showConfirmPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {newPin && confirmPin && newPin !== confirmPin && (
                <div className="mt-1 text-xs text-rose-600">PINs do not match.</div>
              )}
              {!pinExists && (
                <div className="mt-1 text-xs text-gray-400">No PIN set yet — use Set PIN above.</div>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSavePin("reset")}
                  disabled={!pinExists || loading}
                  className="flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} /> {loading ? "Saving..." : "Reset PIN"}
                </button>
              </div>
            </div>

            {/* STEP 3 — Forgot PIN */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">3</span>
                <div className="text-sm font-semibold text-gray-900">Forgot PIN</div>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {settings.email ? `An OTP is sent to ${maskEmail(settings.email)}.` : "No email configured — add one in General Settings first."}
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setOtpDialog({ open: true, sent: false, verified: false, verifying: false, channel: "email", otp: "", newPin: "", confirmPin: "", expiresIn: 0, sending: false, resetting: false, error: "" })
                  }
                  disabled={!settings.email}
                  className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                >
                  <Mail size={16} /> Reset via Email OTP
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BACKUP TAB */}
        {activeTab === "backup" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-3">
                  <div className="text-lg font-semibold text-gray-900">Backup Control Center</div>
                  <p className="text-sm text-gray-600 max-w-2xl">
                    Take a safe system backup, restore an older file when needed, and manage your daily automatic backup time from one place.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Live Records</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{backupSummary.totalRecords}</div>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Last Backup</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(backupMeta.lastBackupAt)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Last Restore</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(backupMeta.lastRestoreAt)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Scheduled Run</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(backupMeta.lastScheduledRunAt)}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-sm space-y-4">
                  <button
                    type="button"
                    onClick={handleBackupAutomationToggle}
                    disabled={backupBusy}
                    className={`w-full rounded-xl border px-4 py-3 flex items-center justify-between text-sm ${
                      settings.backupAutomationEnabled
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {settings.backupAutomationEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      Daily Auto Backup {settings.backupAutomationEnabled ? "On" : "Off"}
                    </span>
                    <span className="text-xs">
                      {settings.backupAutomationEnabled
                        ? (() => {
                            const { hour, minute, ampm } = to12hParts(settings.backupScheduleTime || backupMeta.scheduleTime || "02:00");
                            return `Runs daily at ${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
                          })()
                        : "Set a daily backup time"}
                    </span>
                  </button>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="text-xs font-medium text-emerald-800 mb-2">Daily Backup Time</div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const { hour, minute, ampm } = to12hParts(settings.backupScheduleTime || "02:00");
                        const baseClass = "rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-200";
                        return (
                          <>
                            <select
                              value={hour}
                              onChange={(e) => setScheduleTimeParts({ hour: Number(e.target.value) })}
                              className={`${baseClass} flex-1`}
                            >
                              {[...Array(12)].map((_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                            <span className="text-lg font-semibold text-emerald-800">:</span>
                            <select
                              value={minute}
                              onChange={(e) => setScheduleTimeParts({ minute: Number(e.target.value) })}
                              className={`${baseClass} flex-1`}
                            >
                              {[...Array(60)].map((_, i) => (
                                <option key={i} value={i}>
                                  {String(i).padStart(2, "0")}
                                </option>
                              ))}
                            </select>
                            <select
                              value={ampm}
                              onChange={(e) => setScheduleTimeParts({ ampm: e.target.value })}
                              className={`${baseClass} flex-1`}
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                            <button
                              type="button"
                              onClick={saveBackupScheduleTime}
                              disabled={backupBusy}
                              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              Save
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={runFullBackup}
                      disabled={loading || activeBackupTask.running}
                      className="rounded-lg border border-emerald-600 bg-emerald-600 text-white px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <DatabaseBackup size={15} />
                      {activeBackupTask.running
                        ? `Backing Up... ${activeBackupTask.percent || 0}%`
                        : "Backup Now"}
                    </button>
                    <button
                      type="button"
                      onClick={openRestoreDialog}
                      disabled={loading}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <RotateCcw size={15} /> Restore
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                  <span className="font-medium">
                    {activeBackupTask.phase === "restore"
                      ? "Restore Progress"
                      : activeBackupTask.phase === "backup"
                      ? "Backup Progress"
                      : "System Status"}
                  </span>
                  <span className="flex items-center gap-3">
                    {activeBackupTask.running && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                        <Loader2 size={13} className="animate-spin" />
                        Working...
                      </span>
                    )}
                    <span className="text-lg font-bold text-emerald-700 tabular-nums">
                      {activeBackupTask.percent || 0}%
                    </span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-emerald-50 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      activeBackupTask.phase === "error"
                        ? "bg-rose-500"
                        : activeBackupTask.phase === "done"
                        ? "bg-emerald-500"
                        : "bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500"
                    }`}
                    style={{ width: `${activeBackupTask.percent || 0}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <div className="text-gray-700">
                    {activeBackupTask.label || "Backups keep a complete snapshot of the whole application."}
                  </div>
                  <div className="rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-emerald-700 whitespace-nowrap">
                    {activeBackupTask.scope === "full" ? "Full System" : activeBackupTask.scope || "idle"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-gray-900">
                  <History size={18} className="text-emerald-700" />
                  <div className="text-base font-semibold">Backup History</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterToggleButton
                    open={showHistoryFilters}
                    onToggle={() => setShowHistoryFilters((s) => !s)}
                    title="Filters"
                  />
                  {hasActiveHistoryFilters && (
                    <button
                      type="button"
                      onClick={clearHistoryFilters}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <X size={14} /> Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({
                        open: true,
                        title: "Clear backup history?",
                        message: "This will remove all backup and restore history entries from the system.",
                        variant: "warning",
                        confirmLabel: "Clear History",
                        onConfirm: clearBackupHistory,
                      })
                    }
                    disabled={loading || (backupMeta.history || []).length === 0}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Clear History
                  </button>
                </div>
              </div>
              {showHistoryFilters && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Action</label>
                      <select
                        value={historyFilterAction}
                        onChange={(e) => setHistoryFilterAction(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-w-[140px]"
                      >
                        <option value="ALL">All Actions</option>
                        <option value="BACKUP">Backup</option>
                        <option value="RESTORE">Restore</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="block text-xs text-gray-500 mb-1">Search</label>
                      <input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search file or action..."
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/60">
                {filteredHistory.length === 0 && (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center bg-white">
                    No history matches the selected filters.
                  </div>
                )}
                {filteredHistory.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-emerald-50 text-emerald-900">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">Date</th>
                          <th className="text-left px-4 py-3 font-semibold">Action</th>
                          <th className="text-left px-4 py-3 font-semibold">Mode</th>
                          <th className="text-left px-4 py-3 font-semibold">File</th>
                          <th className="text-left px-4 py-3 font-semibold">Records</th>
                          <th className="text-left px-4 py-3 font-semibold">Status</th>
                          <th className="text-left px-4 py-3 font-semibold">Download</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredHistory.slice(0, 12).map((entry, index) => {
                          const trigger = resolveHistoryTrigger(entry);
                          const canDownload = canDownloadHistoryEntry(entry);
                          return (
                            <tr
                              key={`table-${entry.createdAt || "history"}-${entry.fileName || index}`}
                              className="hover:bg-emerald-50/40"
                            >
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    entry.action === "RESTORE"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {entry.action}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    trigger === "AUTO"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {trigger === "AUTO" ? "Auto" : "Manual"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{entry.fileName || "backup.json"}</td>
                              <td className="px-4 py-3 text-gray-700">{entry.recordCount || 0}</td>
                              <td className="px-4 py-3">
                                <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  {entry.status || "SUCCESS"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {canDownload ? (
                                  <button
                                    type="button"
                                    onClick={() => downloadHistoryBackupFile(entry)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                                  >
                                    <Download size={14} />
                                    Download
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {false && filteredHistory.slice(0, 12).map((entry, index) => (
                  <div
                    key={`${entry.createdAt || "history"}-${entry.fileName || index}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-gray-900">{entry.moduleName || "Module"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          entry.action === "RESTORE" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
                        }`}>
                          {entry.action}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 border border-gray-200">
                          {entry.scope === "full" ? "Full System" : "Module"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {entry.fileName || "backup.json"} • {entry.recordCount || 0} records • {formatDateTime(entry.createdAt)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white border border-gray-200 px-2 py-1">
                        {entry.status || "SUCCESS"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
           </div>
         </div>
       )}

       {/* ABOUT TAB */}
       {activeTab === "about" && (
         <div className="space-y-6" data-tour="settings-about">
           <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
             <div className="flex items-center gap-3 mb-4">
               <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                 <Sprout size={20} className="text-emerald-700" />
               </div>
               <div>
                 <div className="text-lg font-bold text-gray-900">SMJ Rice Mill</div>
                 <div className="text-xs text-gray-500">Production & Business Management System</div>
               </div>
             </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Version</div>
                  <div className="font-semibold text-gray-900 mt-1">
                    {systemInfo?.appVersion || "1.0.0"}
                  </div>
                </div>
                 <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                   <div className="text-xs text-gray-500 uppercase tracking-wide">Modules</div>
                   <div className="font-semibold text-gray-900 mt-1">7 Modules</div>
                 </div>
              </div>

              {/* UPDATE SECTION */}
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                      {updateStatus?.type === "available" && <Download size={16} />}
                      {updateStatus?.type === "downloaded" && <CheckCircle2 size={16} />}
                      {updateStatus?.type === "downloading" && <Loader2 size={16} className="animate-spin" />}
                      {(updateStatus?.type === "not-available" || updateStatus?.type === "error") && <RefreshCw size={16} />}
                      {!updateStatus && <RefreshCw size={16} />}
                      App Update
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {updateStatus?.type === "checking" && "Checking for updates..."}
                      {updateStatus?.type === "available" && `New version v${updateStatus.version} is available`}
                      {updateStatus?.type === "not-available" && "You are on the latest version"}
                      {updateStatus?.type === "downloading" && `Downloading update... ${updateStatus.percent || 0}%`}
                      {updateStatus?.type === "downloaded" && `Update v${updateStatus.version} ready to install`}
                      {updateStatus?.type === "error" && "Could not check for updates. Make sure you are online."}
                      {!updateStatus && "Check GitHub Releases for a newer version."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={updateBusy || updateStatus?.type === "downloading"}
                    onClick={handleUpdateClick}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateBusy || updateStatus?.type === "downloading" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : updateStatus?.type === "downloaded" ? (
                      <RotateCcw size={16} />
                    ) : updateStatus?.type === "available" ? (
                      <Download size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    {updateStatus?.type === "downloaded" ? "Restart & Update" : updateStatus?.type === "available" ? "Download Update" : "Check for Update"}
                  </button>
                </div>
                {!isElectronDesktop && (
                  <p className="mt-2 text-xs text-amber-600">Updating is only available in the installed desktop app.</p>
                )}
              </div>
            </div>

           <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
             <div className="text-sm font-semibold text-gray-900 mb-1">Modules & Features</div>
             <p className="text-xs text-gray-500 mb-4">An overview of what each module can do.</p>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: "Dashboard", icon: <Home size={16} />, features: ["Real-time KPI cards", "Recent activities feed", "Stock summary donuts"] },
                  { name: "Gate Pass", icon: <Truck size={16} />, features: ["Inward / Outward entries", "Sender & customer management", "Product weight & bag tracking", "Excel / PDF export"] },
                  { name: "Stock", icon: <Warehouse size={16} />, features: ["Raw & production inventory", "Per kg / No. of Bags views", "Filters & search", "Source-wise donut charts"] },
                  { name: "Production", icon: <Factory size={16} />, features: ["Batch creation", "Input / output tracking", "Yield calculation", "Status flow (In-Process → Done)"] },
                  { name: "Accounting", icon: <Calculator size={16} />, features: ["Chart of Accounts with Sub-Types", "Daybook entries", "Journal, Ledger, Trial Balance", "Profit & Loss, Balance Sheet"] },
                  { name: "Reports", icon: <ReceiptText size={16} />, features: ["Gate Pass reports", "Stock reports", "Production summary", "Accounting reports"] },
                  { name: "System Settings", icon: <Settings2 size={16} />, features: ["Company info & logo", "PIN setup (set / change / forgot)", "Backup & restore", "Interactive tutorial"] },
                ].map((mod) => (
                 <div key={mod.name} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                   <div className="flex items-center gap-2 mb-2">
                     <div className="w-6 h-6 rounded bg-emerald-200 flex items-center justify-center text-emerald-800">{mod.icon}</div>
                     <span className="text-sm font-semibold text-emerald-900">{mod.name}</span>
                   </div>
                   <ul className="space-y-1">
                     {mod.features.map((f) => (
                       <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                         <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                         {f}
                       </li>
                     ))}
                   </ul>
                 </div>
               ))}
             </div>
           </div>

           <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 shadow-sm p-6">
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
               <div>
                  <div className="text-sm font-semibold text-gray-900">Interactive Tutorial</div>
                  <p className="text-xs text-gray-500 mt-1">A step-by-step guided tour through every module — dashboard, gate passes, stock, production, accounting, reports and settings. Use the arrow keys or Next/Prev to move between steps.</p>
               </div>
               <button
                 type="button"
                 onClick={() => window.dispatchEvent(new Event("smj-start-tour"))}
                 className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
               >
                 <Sparkles size={16} /> Start Tutorial
               </button>
             </div>
           </div>
         </div>
       )}
      </div>

      <ConfirmDialog
        open={dialog.open}
        onClose={() =>
          setDialog((prev) => ({
            ...prev,
            open: false,
            onConfirm: null,
          }))
        }
        onConfirm={() => {
          const action = dialog.onConfirm;
          setDialog((prev) => ({ ...prev, open: false, onConfirm: null }));
          if (action) action();
        }}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.confirmLabel}
        variant={dialog.variant}
      />

      {restoreDialog.open && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 border border-emerald-100">
            <div className="text-lg font-semibold text-gray-900">Restore Backup</div>
            <p className="mt-1 text-sm text-gray-600">
              Choose a backup file to restore. Existing data will be handled as selected below.
            </p>

            <div className="mt-3">
              <input
                ref={restoreLocalFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) =>
                  setRestoreDialog((prev) => ({
                    ...prev,
                    localFile: e.target.files?.[0] || null,
                    error: "",
                  }))
                }
                className="w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border file:border-emerald-200 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800 hover:file:bg-emerald-100"
              />
              {restoreDialog.localFile && (
                <div className="mt-2 text-xs text-emerald-800 truncate">
                  Selected: {restoreDialog.localFile.name}
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Conflict handling
              </label>
              <select
                value={restoreDialog.conflict}
                onChange={(e) => setRestoreDialog((prev) => ({ ...prev, conflict: e.target.value }))}
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900"
              >
                <option value="replace">
                  Replace — wipe existing data and use the backup (recommended for full restore)
                </option>
                <option value="merge">
                  Merge — add only records that do not already exist (safer, keeps current data)
                </option>
              </select>
            </div>

            {restoreDialog.error && (
              <div className="mt-2 text-xs text-rose-600">{restoreDialog.error}</div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setRestoreDialog({ open: false, conflict: "replace", localFile: null, busy: false, error: "" })
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoreDialog.busy}
                className="rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {restoreDialog.busy ? "Restoring..." : "Restore Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {otpDialog.open && (
        <div className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl">
            <div className="text-left text-sm font-semibold text-emerald-800">Forgot PIN</div>

            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  otpDialog.verified ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600 text-white"
                }`}
              >
                1. Verify OTP
              </span>
              <span className="text-gray-300">→</span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  otpDialog.verified ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                2. Set New PIN
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-900">Step 1 — Enter the OTP from your email</div>
                <button
                  type="button"
                  onClick={async () => {
                    setOtpDialog((prev) => ({ ...prev, sending: true, error: "" }));
                    try {
                      const res = await api.post("/settings/otp/send");
                      if (res.data?.success) {
                        toast.success("OTP sent to email");
                        setOtpResendIn(OTP_RESEND_SECONDS);
                        const expiresAt = new Date(res.data?.data?.expiresAt || Date.now() + 5 * 60 * 1000).getTime();
                        const expiresIn = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
                        setOtpDialog((prev) => ({ ...prev, sent: true, sending: false, expiresIn }));
                      } else {
                        setOtpDialog((prev) => ({
                          ...prev,
                          sending: false,
                          error: res.data?.message || "Failed to send OTP",
                        }));
                      }
                    } catch (err) {
                      setOtpDialog((prev) => ({
                        ...prev,
                        sending: false,
                        error: err.response?.data?.message || "Failed to send OTP",
                      }));
                    }
                  }}
                  disabled={otpDialog.sending || otpResendIn > 0 || !canSendEmailOtp}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {otpDialog.sending
                    ? "Sending..."
                    : otpResendIn > 0
                    ? `Resend ${formatCountdown(otpResendIn)}`
                    : "Send OTP"}
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                  <Mail size={14} />
                  Recovery Email
                </div>
                <div className="mt-1 text-sm font-medium text-emerald-900">{settings.email ? maskEmail(settings.email) : "Not configured"}</div>
                {otpDialog.expiresIn > 0 && (
                  <div className="mt-1 text-xs text-emerald-700">OTP expires in {formatCountdown(otpDialog.expiresIn)}</div>
                )}
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  OTP code — the 4 digits you received in your email
                </label>
                <Pin4Input
                  value={otpDialog.otp}
                  onChange={(v) =>
                    setOtpDialog((prev) => ({
                      ...prev,
                      otp: v.slice(0, 4),
                      error: "",
                    }))
                  }
                />
              </div>
            </div>

            {otpDialog.verified && (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-gray-900">Step 2 — Create your new login PIN</div>
                <p className="mt-1 text-xs text-gray-600">
                  Enter a 4-digit PIN twice. This will be your new login PIN.
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">New PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength="4"
                      className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="4 digits"
                      value={otpDialog.newPin}
                      onChange={(e) =>
                        setOtpDialog((prev) => ({
                          ...prev,
                          newPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                          error: "",
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Confirm PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength="4"
                      className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Same 4 digits"
                      value={otpDialog.confirmPin}
                      onChange={(e) =>
                        setOtpDialog((prev) => ({
                          ...prev,
                          confirmPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                          error: "",
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {otpDialog.error && (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {otpDialog.error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetOtpDialog}
                className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm text-gray-700"
              >
                Cancel
              </button>
              {otpDialog.verified ? (
                <button
                  type="button"
                  onClick={resetPinViaOtp}
                  disabled={otpDialog.resetting}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {otpDialog.resetting ? "Saving..." : "Save New PIN"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpDialog.verifying || otpDialog.otp.length !== 4}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {otpDialog.verifying ? "Verifying..." : "Verify OTP"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {emailPasswordDialog.open && (
        <div className="fixed inset-0 z-[125] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-gray-900">Update App Password</div>
            <p className="mt-1 text-sm text-gray-500">
              The new email <span className="font-medium text-gray-900">{emailPasswordDialog.email}</span> has been saved. Now update the 16-character app password so OTP emails continue working.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">
                New App Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Paste 16-character password"
                value={emailPasswordDialog.password}
                onChange={(e) =>
                  setEmailPasswordDialog((prev) => ({
                    ...prev,
                    password: e.target.value,
                    error: "",
                  }))
                }
              />
              {emailPasswordDialog.error && (
                <div className="mt-2 text-xs text-rose-600">{emailPasswordDialog.error}</div>
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmailPasswordDialog({ open: false, password: "", saving: false, error: "", email: "" })}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Later
              </button>
              <button
                type="button"
                onClick={async () => {
                  const password = String(emailPasswordDialog.password || "").replace(/\s+/g, "");
                  if (password.length < 16) {
                    setEmailPasswordDialog((prev) => ({
                      ...prev,
                      error: "Enter the 16-character app password for this email.",
                    }));
                    return;
                  }
                  setEmailPasswordDialog((prev) => ({ ...prev, saving: true, error: "" }));
                  setLoading(true);
                  try {
                    await api.put("/settings", {
                      smtpPass: password,
                    });
                    setSettings((prev) => ({ ...prev, smtpPass: password }));
                    window.dispatchEvent(new Event("smj-settings-updated"));
                    setGeneralSaveMsg("Saved");
                    toast.success("App password updated");
                    setEmailPasswordDialog({ open: false, password: "", saving: false, error: "", email: "" });
                  } catch (err) {
                    setEmailPasswordDialog((prev) => ({
                      ...prev,
                      saving: false,
                      error: err?.response?.data?.message || "Failed to update app password",
                    }));
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={emailPasswordDialog.saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {emailPasswordDialog.saving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
