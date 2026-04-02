// src/components/MasterData/SystemSettings.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import JSZip from "jszip";
import {
  UploadCloud,
  Save,
  ArrowDownCircle,
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
  Filter,
} from "lucide-react";
import { toast } from "react-hot-toast";
import Pin4Input from "../Pin4Input";
import ConfirmDialog from "../ui/ConfirmDialog";

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
    additionalStockSettingsEnabled: false,
    loginPassword: "",
    backupAutomationEnabled: false,
    backupScheduleTime: "02:00",
  });

  const [activeTab, setActiveTab] = useState("general");
  const [additionalSettingPinDialog, setAdditionalSettingPinDialog] = useState({
    open: false,
    pin: "",
    newValue: false,
  });
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
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
  const [historyFilterScope, setHistoryFilterScope] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [activeBackupTask, setActiveBackupTask] = useState({
    scope: "",
    label: "Backup system is idle.",
    percent: 0,
    phase: "idle",
  });
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [additionalPinError, setAdditionalPinError] = useState("");
  const [otpDialog, setOtpDialog] = useState({
    open: false,
    sent: false,
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
  const [backupChoiceDialog, setBackupChoiceDialog] = useState({
    open: false,
    action: "",
  });
  const fullRestoreInputRef = useRef(null);
  const moduleRestoreInputRefs = useRef({});
  const savedGeneralEmailRef = useRef("");

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

  const updateGlobalProgress = ({ scope, label, percent, phase }) => {
    setActiveBackupTask({
      scope: scope || "",
      label: label || "Backup system is idle.",
      percent: Number(percent || 0),
      phase: phase || "idle",
    });
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
          setSettings((prev) => ({ ...prev, ...s }));
          savedGeneralEmailRef.current = String(s.email || "").trim();
        }
      } catch (err) {
        toast.error("Failed to load settings");
      }
    };
    load();
  }, []);

  useEffect(() => {
    const refresh = () => loadBackupModules({ silent: true });
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

  useEffect(() => {
    const onEsc = () => {
      if (otpDialog.open) resetOtpDialog();
      if (additionalSettingPinDialog.open) setAdditionalSettingPinDialog({ open: false, pin: "", newValue: false });
      if (emailPasswordDialog.open) setEmailPasswordDialog({ open: false, password: "", saving: false, error: "", email: "" });
    };
    window.addEventListener("smj-esc", onEsc);
    return () => window.removeEventListener("smj-esc", onEsc);
  }, [otpDialog.open, additionalSettingPinDialog.open, emailPasswordDialog.open, otpResendIn]);

  const handleChange = (k, v) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

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
    const shouldSyncMailIdentity = nextEmail && nextEmail !== previousEmail;
    const nextSmtpUser =
      shouldSyncMailIdentity &&
      (!String(settings.smtpUser || "").trim() || String(settings.smtpUser || "").trim() === previousEmail)
        ? nextEmail
        : settings.smtpUser || "";
    const nextMailFrom =
      shouldSyncMailIdentity &&
      (!String(settings.mailFrom || "").trim() || String(settings.mailFrom || "").trim() === previousEmail)
        ? nextEmail
        : settings.mailFrom || "";

    const payload = {
      companyName: settings.companyName || "",
      shortName: settings.shortName || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: nextEmail,
      smtpHost: settings.smtpHost || "",
      smtpPort: Number(settings.smtpPort || 587),
      smtpUser: nextSmtpUser,
      smtpPass: settings.smtpPass || "",
      smtpSecure: !!settings.smtpSecure,
      mailFrom: nextMailFrom,
      defaultCurrency: settings.defaultCurrency || "",
      logoUrl: settings.logoUrl || "",
    };
    const saved = await saveSettings(payload);
    if (!saved) return;

    setSettings((prev) => ({
      ...prev,
      email: nextEmail,
      smtpUser: nextSmtpUser,
      mailFrom: nextMailFrom,
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

  const handleSaveStock = async () => {
    setPinError("");
    if (newPin || confirmPin || currentPin) {
      if (!currentPin || currentPin.length < 4) {
        setDialog({
          open: true,
          title: "Current PIN required",
          message: "Enter your current admin PIN to set a new one.",
          variant: "warning",
          confirmLabel: "OK",
          onConfirm: null,
        });
        return;
      }
      if (!newPin || newPin.length < 4) {
        setDialog({
          open: true,
          title: "New PIN required",
          message: "Enter a 4-digit new PIN.",
          variant: "warning",
          confirmLabel: "OK",
          onConfirm: null,
        });
        return;
      }
      if (newPin !== confirmPin) {
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
    }
    const payload = { ...settings };
    delete payload.adminPin;
    delete payload.loginPassword;
    if (currentPin) payload.adminPin = currentPin;
    if (newPin) {
      payload.newAdminPin = newPin;
      payload.loginPassword = newPin;
    }
    setLoading(true);
    try {
      await api.put("/settings", payload);
      toast.success("Settings saved");
      window.dispatchEvent(new Event("smj-settings-updated"));
      if (newPin) {
        setSettings((prev) => ({
          ...prev,
          adminPin: newPin,
          loginPassword: newPin,
        }));
      }
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      if (err.response?.status === 403) {
        setPinError("PIN is incorrect");
        toast.error("PIN is incorrect");
      } else {
        toast.error("Error saving settings");
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
        handleChange("logoUrl", res.data.logoUrl);
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

  const downloadBackup = async ({ includeDropdowns = true } = {}) => {
    updateModuleProgress("all", {
      busy: true,
      phase: "backup",
      percent: 5,
      message: "Preparing full system backup...",
    });
    updateGlobalProgress({
      scope: "all",
      label: "Preparing full system backup...",
      percent: 5,
      phase: "backup",
    });
    showBackupToast({ title: "Backup started", detail: "Full system snapshot is being prepared." });
    try {
      const res = await api.get("/settings/backup", {
        params: { includeDropdowns },
        responseType: "blob",
        onDownloadProgress: (event) => {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 60;
          updateModuleProgress("all", {
            busy: true,
            phase: "backup",
            percent,
            message: `Downloading full backup... ${percent}%`,
          });
          updateGlobalProgress({
            scope: "all",
            label: `Downloading full backup... ${percent}%`,
            percent,
            phase: "backup",
          });
        },
      });
      const filename = parseDownloadFilename(
        res.headers["content-disposition"],
        `smj-backup-all-${new Date().toISOString().slice(0, 10)}.json`
      );
      triggerBlobDownload(res.data, filename);
      updateModuleProgress("all", {
        busy: false,
        phase: "done",
        percent: 100,
        message: "Full backup downloaded successfully.",
      });
      updateGlobalProgress({
        scope: "all",
        label: "Full backup downloaded successfully.",
        percent: 100,
        phase: "done",
      });
      showBackupToast({ title: "Backup completed", detail: "Full system backup file is ready.", tone: "success" });
      await loadBackupModules({ silent: true });
    } catch (err) {
      updateModuleProgress("all", {
        busy: false,
        phase: "error",
        percent: 0,
        message: err?.response?.data?.message || "Full backup failed.",
      });
      updateGlobalProgress({
        scope: "all",
        label: err?.response?.data?.message || "Full backup failed.",
        percent: 0,
        phase: "error",
      });
      showBackupToast({ title: "Backup failed", detail: "Full system backup could not be created.", tone: "error" });
      toast.error("Backup download failed");
    }
  };

  const downloadModuleBackup = async (moduleKey, label, { suppressDownload = false, includeDropdowns = true } = {}) => {
    updateModuleProgress(moduleKey, {
      busy: true,
      phase: "backup",
      percent: 5,
      message: `Preparing ${label} backup...`,
    });
    updateGlobalProgress({
      scope: moduleKey,
      label: `Preparing ${label} backup...`,
      percent: 5,
      phase: "backup",
    });
    showBackupToast({ title: `${label} backup started`, detail: "Live data snapshot is being generated." });
    try {
      const res = await api.get(`/settings/backup/${moduleKey}`, {
        params: { includeDropdowns },
        responseType: "blob",
        onDownloadProgress: (event) => {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 60;
          updateModuleProgress(moduleKey, {
            busy: true,
            phase: "backup",
            percent,
            message: `Downloading ${label}... ${percent}%`,
          });
          updateGlobalProgress({
            scope: moduleKey,
            label: `Downloading ${label}... ${percent}%`,
            percent,
            phase: "backup",
          });
        },
      });
      const filename = parseDownloadFilename(
        res.headers["content-disposition"],
        `smj-backup-${moduleKey}-${new Date().toISOString().slice(0, 10)}.json`
      );
      if (!suppressDownload) {
        triggerBlobDownload(res.data, filename);
      }
      updateModuleProgress(moduleKey, {
        busy: false,
        phase: "done",
        percent: 100,
        message: `${label} backup downloaded.`,
      });
      updateGlobalProgress({
        scope: moduleKey,
        label: `${label} backup downloaded.`,
        percent: 100,
        phase: "done",
      });
      showBackupToast({ title: `${label} ready`, detail: "Backup file downloaded successfully.", tone: "success" });
      await loadBackupModules({ silent: true });
      return {
        blob: res.data,
        filename,
      };
    } catch (err) {
      updateModuleProgress(moduleKey, {
        busy: false,
        phase: "error",
        percent: 0,
        message: err?.response?.data?.message || `${label} backup failed.`,
      });
      updateGlobalProgress({
        scope: moduleKey,
        label: err?.response?.data?.message || `${label} backup failed.`,
        percent: 0,
        phase: "error",
      });
      showBackupToast({ title: `${label} failed`, detail: "Module backup could not be created.", tone: "error" });
      toast.error(`${label} backup failed`);
      return null;
    }
  };

  const downloadAllModules = async ({ includeDropdowns = true } = {}) => {
    if (!backupModules.length) return;
    const zip = new JSZip();
    updateGlobalProgress({
      scope: "zip-all",
      label: "Preparing ZIP package for all modules...",
      percent: 4,
      phase: "backup",
    });
    showBackupToast({ title: "ZIP export started", detail: "Collecting all module backups into one package." });
    for (let index = 0; index < backupModules.length; index += 1) {
      const module = backupModules[index];
      const stepBase = Math.round((index / backupModules.length) * 80);
      updateGlobalProgress({
        scope: module.key,
        label: `Collecting ${module.name} backup...`,
        percent: Math.max(5, stepBase),
        phase: "backup",
      });
      // eslint-disable-next-line no-await-in-loop
      const result = await downloadModuleBackup(module.key, module.name, {
        suppressDownload: true,
        includeDropdowns,
      });
      if (result?.blob && result?.filename) {
        zip.file(result.filename, result.blob);
      }
    }
    try {
      updateGlobalProgress({
        scope: "zip-all",
        label: "Compressing all module backups...",
        percent: 88,
        phase: "backup",
      });
      const zipBlob = await zip.generateAsync(
        { type: "blob" },
        (metadata) => {
          const percent = 88 + Math.round((metadata.percent || 0) * 0.12);
          updateGlobalProgress({
            scope: "zip-all",
            label: `Creating ZIP package... ${Math.min(percent, 100)}%`,
            percent: Math.min(percent, 100),
            phase: "backup",
          });
        }
      );
      const fileName = `smj-backup-modules-${new Date().toISOString().slice(0, 10)}.zip`;
      triggerBlobDownload(zipBlob, fileName);
      updateGlobalProgress({
        scope: "zip-all",
        label: "ZIP package downloaded successfully.",
        percent: 100,
        phase: "done",
      });
      showBackupToast({ title: "ZIP package ready", detail: "All module backups were bundled into one file.", tone: "success" });
    } catch (err) {
      updateGlobalProgress({
        scope: "zip-all",
        label: "ZIP creation failed.",
        percent: 0,
        phase: "error",
      });
      showBackupToast({ title: "ZIP export failed", detail: "The combined ZIP package could not be created.", tone: "error" });
      toast.error("ZIP download failed");
    }
  };

  const handleRestoreSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setRestoreFile(f);
  };

  const openBackupChoiceDialog = (action) => {
    setBackupChoiceDialog({ open: true, action });
  };

  const handleBackupChoice = async (includeDropdowns) => {
    const action = backupChoiceDialog.action;
    setBackupChoiceDialog({ open: false, action: "" });
    if (action === "backup") {
      await downloadBackup({ includeDropdowns });
      return;
    }
    if (action === "zip") {
      await downloadAllModules({ includeDropdowns });
    }
  };

  const uploadRestore = async (file = restoreFile) => {
    if (!file) {
      setDialog({
        open: true,
        title: "No file selected",
        message: "Please choose a backup JSON file first.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: null,
      });
      return;
    }
    const form = new FormData();
    form.append("backup", file);
    updateModuleProgress("all", {
      busy: true,
      phase: "restore",
      percent: 5,
      message: "Uploading full restore file...",
    });
    updateGlobalProgress({
      scope: "all",
      label: "Uploading full restore file...",
      percent: 5,
      phase: "restore",
    });
    showBackupToast({ title: "Restore started", detail: "Full system restore is in progress." });
    setLoading(true);
    try {
      await api.post("/settings/restore", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 60;
          updateModuleProgress("all", {
            busy: true,
            phase: "restore",
            percent,
            message: `Restoring full backup... ${percent}%`,
          });
          updateGlobalProgress({
            scope: "all",
            label: `Restoring full backup... ${percent}%`,
            percent,
            phase: "restore",
          });
        },
      });
      setRestoreFile(null);
      if (fullRestoreInputRef.current) fullRestoreInputRef.current.value = "";
      updateModuleProgress("all", {
        busy: false,
        phase: "done",
        percent: 100,
        message: "Full restore completed successfully.",
      });
      updateGlobalProgress({
        scope: "all",
        label: "Full restore completed successfully.",
        percent: 100,
        phase: "done",
      });
      showBackupToast({ title: "Restore completed", detail: "Full system data was restored successfully.", tone: "success" });
      await loadBackupModules({ silent: true });
      setDialog({
        open: true,
        title: "Restore complete",
        message: "Backup restored successfully. Reload the app to continue.",
        variant: "info",
        confirmLabel: "Reload",
        onConfirm: () => window.location.reload(),
      });
    } catch (err) {
      updateModuleProgress("all", {
        busy: false,
        phase: "error",
        percent: 0,
        message: err?.response?.data?.message || "Restore failed.",
      });
      updateGlobalProgress({
        scope: "all",
        label: err?.response?.data?.message || "Restore failed.",
        percent: 0,
        phase: "error",
      });
      showBackupToast({ title: "Restore failed", detail: "Full system restore could not be completed.", tone: "error" });
      toast.error("Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleModuleRestoreSelect = (module, file) => {
    if (!file) return;
    setDialog({
      open: true,
      title: `Restore ${module.name}?`,
      message: `This will overwrite the current ${module.name.toLowerCase()} data with the selected backup file.`,
      variant: "warning",
      confirmLabel: "Restore",
      onConfirm: () => uploadModuleRestore(module, file),
    });
  };

  const uploadModuleRestore = async (module, file) => {
    if (!file) return;
    const form = new FormData();
    form.append("backup", file);
    updateModuleProgress(module.key, {
      busy: true,
      phase: "restore",
      percent: 5,
      message: `Uploading ${module.name} restore file...`,
    });
    updateGlobalProgress({
      scope: module.key,
      label: `Uploading ${module.name} restore file...`,
      percent: 5,
      phase: "restore",
    });
    showBackupToast({ title: `${module.name} restore started`, detail: "Module restore is in progress." });
    setLoading(true);
    try {
      const res = await api.post(`/settings/restore/${module.key}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 60;
          updateModuleProgress(module.key, {
            busy: true,
            phase: "restore",
            percent,
            message: `Restoring ${module.name}... ${percent}%`,
          });
          updateGlobalProgress({
            scope: module.key,
            label: `Restoring ${module.name}... ${percent}%`,
            percent,
            phase: "restore",
          });
        },
      });
      if (moduleRestoreInputRefs.current[module.key]) {
        moduleRestoreInputRefs.current[module.key].value = "";
      }
      updateModuleProgress(module.key, {
        busy: false,
        phase: "done",
        percent: 100,
        message: res.data?.message || `${module.name} restored.`,
      });
      updateGlobalProgress({
        scope: module.key,
        label: res.data?.message || `${module.name} restored.`,
        percent: 100,
        phase: "done",
      });
      showBackupToast({ title: `${module.name} restored`, detail: "Module data was restored successfully.", tone: "success" });
      await loadBackupModules({ silent: true });
      toast.success(`${module.name} restored`);
    } catch (err) {
      updateModuleProgress(module.key, {
        busy: false,
        phase: "error",
        percent: 0,
        message: err?.response?.data?.message || `${module.name} restore failed.`,
      });
      updateGlobalProgress({
        scope: module.key,
        label: err?.response?.data?.message || `${module.name} restore failed.`,
        percent: 0,
        phase: "error",
      });
      showBackupToast({ title: `${module.name} restore failed`, detail: "Module restore could not be completed.", tone: "error" });
      toast.error(`${module.name} restore failed`);
    } finally {
      setLoading(false);
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
    const fromDate = historyDateFrom ? new Date(`${historyDateFrom}T00:00:00`) : null;
    const toDate = historyDateTo ? new Date(`${historyDateTo}T23:59:59.999`) : null;
    return (backupMeta.history || []).filter((entry) => {
      if (historyFilterAction !== "ALL" && String(entry.action || "") !== historyFilterAction) return false;
      if (historyFilterScope !== "ALL" && String(entry.scope || "") !== historyFilterScope) return false;
      const entryDate = entry.createdAt ? new Date(entry.createdAt) : null;
      if (fromDate && entryDate && entryDate < fromDate) return false;
      if (toDate && entryDate && entryDate > toDate) return false;
      if (!term) return true;
      const haystack = [
        entry.moduleName,
        entry.fileName,
        entry.action,
        entry.scope,
        entry.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [
    backupMeta.history,
    historyFilterAction,
    historyFilterScope,
    historySearch,
    historyDateFrom,
    historyDateTo,
  ]);

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
      <div className="border-b border-emerald-200">
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
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
            activeTab === "stock"
              ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
              : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Shield size={16} />
          Admin Settings
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
      </div>
      </div>

      {/* Content */}
      <div className="p-4 rounded-lg">
        {/* GENERAL TAB */}
        {activeTab === "general" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4">
              <div className="text-lg font-semibold text-gray-900">General Settings</div>
              <p className="mt-1 text-sm text-gray-600">
                Manage the main business identity shown across reports, invoices, and the app header.
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Company Name</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.companyName || ""}
                      onChange={(e) => handleChange("companyName", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Short Name</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.shortName || ""}
                      onChange={(e) => handleChange("shortName", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Default Currency</label>
                    <input
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={settings.defaultCurrency || ""}
                      onChange={(e) => handleChange("defaultCurrency", e.target.value)}
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
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="text-sm font-semibold text-gray-900">Logo & Branding</div>
                <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center">
                  {settings.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt="logo"
                      className="mx-auto h-28 object-contain"
                    />
                  ) : (
                    <div className="h-28 w-full flex items-center justify-center text-sm text-gray-400">
                      No logo configured
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoSelect}
                    className="w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-emerald-800 file:font-medium"
                  />
                  <button
                    className="w-full rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                    onClick={uploadLogo}
                    type="button"
                    disabled={loading}
                  >
                    <UploadCloud size={15} /> Upload Logo
                  </button>
                  {logoFile && (
                    <div className="text-xs text-gray-500">
                      Selected file: <span className="font-medium text-gray-700">{logoFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {generalSaveMsg ? (
                <div className={`text-sm ${generalSaveMsg === "Saved" ? "text-emerald-700" : "text-rose-600"}`}>
                  {generalSaveMsg}
                </div>
              ) : (
                <div className="text-sm text-gray-500">Save changes to update company details across the app.</div>
              )}
              <button
                onClick={handleSaveGeneral}
                disabled={loading}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save size={16} /> {loading ? "Saving..." : "Save General Settings"}
              </button>
            </div>
          </div>
        )}

        {/* STOCK & ADMIN TAB */}
        {activeTab === "stock" && (
          <div className="space-y-4 w-full max-w-none">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4">
              <div className="text-lg font-semibold text-gray-900">Admin Settings</div>
              <p className="mt-1 text-sm text-gray-600">
                Control protected stock options and manage the main 4-digit admin PIN used for sensitive actions.
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="text-sm font-semibold text-emerald-900">Protected Options</div>
                  <p className="mt-1 text-sm text-emerald-800">
                    Turn on extra stock controls for Production and Stock pages.
                  </p>
                  <label className="mt-3 flex items-start gap-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!(settings.additionalStockSettingsEnabled ?? false)}
                      onChange={() =>
                        setAdditionalSettingPinDialog({
                          open: true,
                          pin: "",
                          newValue: !settings.additionalStockSettingsEnabled,
                        })
                      }
                    />
                    <span>Show additional stock options in Production & Stock pages</span>
                  </label>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Current Status</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900">
                    {settings.additionalStockSettingsEnabled ? "Additional settings are enabled" : "Additional settings are disabled"}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    These options stay protected and require the admin PIN when changed.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-emerald-700">Master PIN (4 digits)</label>
                <p className="mt-1 text-sm text-gray-500">
                  The same PIN is used for login and protected stock settings.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3">
                <Pin4Input
                  value={currentPin}
                  onChange={(v) => {
                    setCurrentPin(v.slice(0, 4));
                    if (pinError) setPinError("");
                  }}
                  error={!!pinError}
                />
                {pinError && (
                    <div className="text-sm text-rose-600">{pinError}</div>
                )}
                <div className="relative">
                  <input
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="New PIN (4 digits)"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength="4"
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="Confirm New PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showConfirmPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOtpDialog({ open: true, sent: false, channel: "email", otp: "", newPin: "", confirmPin: "", expiresIn: 0, sending: false, resetting: false, error: "" })
                    }
                    className="text-sm text-emerald-700 hover:underline text-left"
                  >
                    Forgot PIN?
                </button>
                </div>
              </div>
            </div>
            {additionalSettingPinDialog.open && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 w-full max-w-sm shadow-xl">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Admin PIN required</h3>
                  <p className="text-xs text-gray-600 mb-3">
                    Enter admin PIN to {additionalSettingPinDialog.newValue ? "enable" : "disable"} additional stock settings.
                  </p>
                  <Pin4Input
                    value={additionalSettingPinDialog.pin}
                    onChange={(v) =>
                      setAdditionalSettingPinDialog((p) => ({
                        ...p,
                        pin: v.slice(0, 4),
                      }))
                    }
                    className="mb-4"
                    error={!!additionalPinError}
                  />
                  {additionalPinError && (
                    <div className="text-xs text-red-600 mb-3">{additionalPinError}</div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAdditionalSettingPinDialog({ open: false, pin: "", newValue: false });
                        setAdditionalPinError("");
                      }}
                      className="px-3 py-1.5 rounded border border-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!additionalSettingPinDialog.pin) return;
                        setLoading(true);
                        try {
                          await api.put("/settings", {
                            ...settings,
                            additionalStockSettingsEnabled: additionalSettingPinDialog.newValue,
                            adminPin: additionalSettingPinDialog.pin,
                          });
                          handleChange("additionalStockSettingsEnabled", additionalSettingPinDialog.newValue);
                          setAdditionalSettingPinDialog({ open: false, pin: "", newValue: false });
                          setAdditionalPinError("");
                          toast.success(
                            additionalSettingPinDialog.newValue
                              ? "Additional settings enabled"
                              : "Additional settings disabled"
                          );
                        } catch (err) {
                          if (err.response?.status === 403) {
                            setAdditionalPinError("PIN is incorrect");
                            toast.error("PIN is incorrect");
                          } else {
                            toast.error("Error updating setting");
                          }
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={additionalSettingPinDialog.pin.length !== 4 || loading}
                      className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-2 w-full flex justify-end">
              <button
                onClick={handleSaveStock}
                disabled={loading}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save size={16} /> {loading ? "Saving..." : "Save Admin Settings"}
              </button>
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
                        ? `Runs daily at ${settings.backupScheduleTime || backupMeta.scheduleTime || "02:00"}`
                        : "Set a daily backup time"}
                    </span>
                  </button>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="text-xs font-medium text-emerald-800 mb-2">Daily Backup Time</div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      <input
                        type="time"
                        value={settings.backupScheduleTime || "02:00"}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            backupScheduleTime: e.target.value || "02:00",
                          }))
                        }
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900"
                      />
                      <button
                        type="button"
                        onClick={saveBackupScheduleTime}
                        disabled={backupBusy}
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        Save Time
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => openBackupChoiceDialog("backup")}
                      disabled={loading}
                      className="rounded-lg border border-emerald-200 bg-white text-emerald-800 px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <ArrowDownCircle size={15} /> Backup
                    </button>
                    <button
                      type="button"
                      onClick={() => openBackupChoiceDialog("zip")}
                      disabled={loading || backupModules.length === 0}
                      className="rounded-lg border border-emerald-600 bg-emerald-600 text-white px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Download size={15} /> ZIP
                    </button>
                    <button
                      type="button"
                      onClick={() => fullRestoreInputRef.current?.click()}
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
                  <span>{activeBackupTask.percent || 0}%</span>
                </div>
                <div className="h-3 rounded-full bg-emerald-50 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
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
                    {activeBackupTask.label || "Use Backup System to download a complete snapshot of the whole application."}
                  </div>
                  <div className="rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-emerald-700 whitespace-nowrap">
                    {activeBackupTask.scope || "idle"}
                  </div>
                </div>
              </div>

              <input
                ref={fullRestoreInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  handleRestoreSelect(e);
                  if (!file) return;
                  setDialog({
                    open: true,
                    title: "Restore full backup?",
                    message:
                      "This will overwrite the current system data with the selected full backup file.",
                    variant: "warning",
                    confirmLabel: "Restore All",
                    onConfirm: () => uploadRestore(file),
                  });
                }}
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-gray-900">
                  <History size={18} className="text-emerald-700" />
                  <div className="text-base font-semibold">Backup History</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHistoryFilters((s) => !s)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium flex items-center gap-2 ${
                      showHistoryFilters
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                    }`}
                  >
                    <Filter size={15} />
                    {showHistoryFilters ? "Hide Filters" : "Show Filters"}
                  </button>
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
              <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <select
                  value={historyFilterAction}
                  onChange={(e) => setHistoryFilterAction(e.target.value)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All Actions</option>
                  <option value="BACKUP">Backup</option>
                  <option value="RESTORE">Restore</option>
                </select>
                <select
                  value={historyFilterScope}
                  onChange={(e) => setHistoryFilterScope(e.target.value)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All Scope</option>
                  <option value="full">Full System</option>
                  <option value="module">Module</option>
                </select>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search file or action..."
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
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
                          <th className="text-left px-4 py-3 font-semibold">Scope</th>
                          <th className="text-left px-4 py-3 font-semibold">File</th>
                          <th className="text-left px-4 py-3 font-semibold">Records</th>
                          <th className="text-left px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredHistory.slice(0, 12).map((entry, index) => (
                          <tr key={`table-${entry.createdAt || "history"}-${entry.fileName || index}`} className="hover:bg-emerald-50/40">
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                entry.action === "RESTORE" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
                              }`}>
                                {entry.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{entry.scope === "full" ? "Full System" : "Module"}</td>
                            <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate">{entry.fileName || "backup.json"}</td>
                            <td className="px-4 py-3 text-gray-700">{entry.recordCount || 0}</td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                {entry.status || "SUCCESS"}
                              </span>
                            </td>
                          </tr>
                        ))}
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

      {backupChoiceDialog.open && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 border border-emerald-100">
            <div className="text-lg font-semibold text-gray-900">Choose Backup Type</div>
            <p className="mt-2 text-sm text-gray-600">
              Do you want a full backup with dropdown options, or only record data without dropdown lists?
            </p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => handleBackupChoice(true)}
                className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100"
              >
                <div className="text-sm font-semibold text-emerald-900">Full Backup With Dropdowns</div>
                <div className="text-xs text-emerald-700 mt-1">Includes records plus saved dropdown values and list options.</div>
              </button>
              <button
                type="button"
                onClick={() => handleBackupChoice(false)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="text-sm font-semibold text-gray-900">Records Only</div>
                <div className="text-xs text-gray-600 mt-1">Exports business records without dropdown option lists.</div>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setBackupChoiceDialog({ open: false, action: "" })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {otpDialog.open && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-gray-900">OTP Verification</h3>
            <p className="text-xs text-gray-500 mt-1">
              Choose a delivery channel, enter the code, then set a new 4-digit PIN.
            </p>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Email</div>
              <div className="mt-1 text-gray-900">{settings.email ? maskEmail(settings.email) : "Not configured"}</div>
            </div>

            {otpDialog.expiresIn > 0 && (
              <div className="mt-3 text-xs text-gray-500">
                Code expires in <span className="font-medium text-gray-700">{formatCountdown(otpDialog.expiresIn)}</span>
              </div>
            )}
            <div className="mt-4">
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
              {otpDialog.error && (
                <div className="text-xs text-red-600 text-center mt-2">{otpDialog.error}</div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength="4"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="New PIN"
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
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength="4"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Confirm PIN"
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
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetOtpDialog}
                className="px-3 py-2 rounded border border-gray-300 text-sm"
              >
                Cancel
              </button>
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
                disabled={
                  otpDialog.sending ||
                  otpResendIn > 0 ||
                  !canSendEmailOtp
                }
                className="px-3 py-2 rounded border border-gray-300 text-sm"
              >
                {otpDialog.sending
                  ? "Sending..."
                  : otpResendIn > 0
                  ? `Resend in ${formatCountdown(otpResendIn)}`
                  : "Send via Email"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (otpDialog.otp.length !== 4) {
                    setOtpDialog((prev) => ({ ...prev, error: "Enter 4-digit OTP" }));
                    return;
                  }
                  if (otpDialog.newPin.length !== 4) {
                    setOtpDialog((prev) => ({ ...prev, error: "Enter a new 4-digit PIN" }));
                    return;
                  }
                  if (otpDialog.newPin !== otpDialog.confirmPin) {
                    setOtpDialog((prev) => ({ ...prev, error: "PIN confirmation does not match" }));
                    return;
                  }
                  setOtpDialog((prev) => ({ ...prev, resetting: true, error: "" }));
                  try {
                    const res = await api.post("/settings/otp/reset-pin", {
                      otp: otpDialog.otp,
                      newPin: otpDialog.newPin,
                    });
                    if (res.data?.success) {
                      toast.success("PIN reset successful");
                      setSettings((prev) => ({
                        ...prev,
                        adminPin: otpDialog.newPin,
                        loginPassword: otpDialog.newPin,
                      }));
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
                }}
                disabled={otpDialog.resetting}
                className="px-3 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
              >
                {otpDialog.resetting ? "Resetting..." : "Reset PIN"}
              </button>
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
