// src/layouts/MainLayout.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Building2, Mail, ShieldCheck } from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../services/api";
import Pin4Input from "../components/Pin4Input";

export default function MainLayout({ children }) {
  const OTP_RESEND_SECONDS = 45;
  const [isOpen, setIsOpen] = useState(false);
  const toggleSidebar = () => setIsOpen((prev) => !prev);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const [settings, setSettings] = useState({
    loginPassword: "",
    adminPin: "",
    email: "",
    companyName: "",
    shortName: "",
    address: "",
    phone: "",
    logoUrl: "",
  });
  const [authLocked, setAuthLocked] = useState(false);
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [forgotDialog, setForgotDialog] = useState({
    open: false,
    channel: "email",
    otp: "",
    newPin: "",
    confirmPin: "",
    expiresIn: 0,
    sending: false,
    resetting: false,
    error: "",
  });
  const [forgotResendIn, setForgotResendIn] = useState(0);
  const [draftPrompt, setDraftPrompt] = useState({
    open: false,
    storageKey: "",
    routeLabel: "",
    payload: null,
  });
  const routeNameMap = {
    "/gatepass": "Gate Pass Management",
    "/gatepasses": "Gate Pass Management",
    "/production": "Production Management",
    "/stock": "Stock Management",
    "/accounting-finance": "Accounting & Finance",
    "/reports": "Reports",
    "/masterdata": "System Settings",
  };
  const isDashboard = location.pathname === "/";
  const moduleTitle = routeNameMap[location.pathname] || "Module";

  const getDraftStorageKey = (pathname, search) =>
    `smj_draft_${pathname}${search || ""}`;

  const isDraftEnabledRoute = (pathname) =>
    ["/gatepass", "/production"].includes(pathname);

  const getControlKey = (el, idx) =>
    el.getAttribute("data-draft-key") ||
    el.getAttribute("name") ||
    el.getAttribute("id") ||
    `${el.tagName}:${el.type || "text"}:${el.placeholder || ""}:${idx}`;

  const snapshotSignature = (snapshot) => {
    if (!snapshot?.fields?.length) return "";
    return JSON.stringify(
      [...snapshot.fields]
        .map((f) => ({
          key: f.key,
          value: f.value ?? "",
          checked: !!f.checked,
          type: f.type || "",
        }))
        .sort((a, b) => a.key.localeCompare(b.key))
    );
  };

  const collectDraftSnapshot = () => {
    const container = mainRef.current;
    if (!container) return null;
    const controls = Array.from(
      container.querySelectorAll("input, textarea, select")
    ).filter((el) => {
      const type = String(el.type || "").toLowerCase();
      return !["submit", "button", "reset", "file"].includes(type);
    });
    const fields = [];
    controls.forEach((el, idx) => {
      const key = getControlKey(el, idx);
      const type = String(el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if (el.checked) fields.push({ key, checked: true, type });
        return;
      }
      const value = String(el.value ?? "");
      if (value.trim() !== "") {
        fields.push({ key, value, type });
      }
    });
    if (!fields.length) return null;
    return {
      fields,
      savedAt: new Date().toISOString(),
      route: `${location.pathname}${location.search || ""}`,
    };
  };

  const saveCurrentRouteDraft = () => {
    if (!isDraftEnabledRoute(location.pathname)) return;
    const snapshot = collectDraftSnapshot();
    const storageKey = getDraftStorageKey(location.pathname, location.search);
    if (!snapshot) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  };

  const restoreDraft = (payload) => {
    const container = mainRef.current;
    if (!container || !payload?.fields?.length) return;
    const controls = Array.from(container.querySelectorAll("input, textarea, select"));
    const keyToElement = new Map();
    controls.forEach((el, idx) => keyToElement.set(getControlKey(el, idx), el));
    payload.fields.forEach((entry) => {
      const el = keyToElement.get(entry.key);
      if (!el) return;
      const type = String(el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        el.checked = !!entry.checked;
      } else {
        el.value = String(entry.value ?? "");
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const loadSettings = async () => {
    try {
      const res = await api.get("/settings");
      if (res.data?.data) {
        const data = res.data.data || {};
        const general = data.general || data.generalSettings || data;
        setSettings((prev) => ({
          ...prev,
          ...data,
          companyName: general.companyName || general.millName || prev.companyName || "",
          shortName: general.shortName || prev.shortName || "",
          email: general.email || general.companyEmail || prev.email || "",
        }));
      }
    } catch (err) {
      toast.error("Failed to load settings");
    }
  };

  const maskEmail = (email) => {
    if (!email || !email.includes("@")) return "***@***.***";
    const [user, domain] = String(email).split("@");
    const maskedUser = user.length <= 2 ? `${user[0] || "*"}***` : `${user[0]}***${user[user.length - 1]}`;
    return `${maskedUser}@${domain}`;
  };

  useEffect(() => {
    const loggedIn = localStorage.getItem("smj_logged_in") === "true";
    setAuthLocked(!loggedIn);
    loadSettings();
  }, []);

  useEffect(() => {
    const onLogout = () => {
      localStorage.setItem("smj_logged_in", "false");
      setAuthLocked(true);
    };
    const onSettingsUpdate = () => loadSettings();
    const onKeyDown = (e) => {
      const target = e.target;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isTyping) return;

      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const searchInput = document.querySelector("[data-global-search]");
        if (searchInput) searchInput.focus();
        return;
      }
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        toast("Shortcuts: Alt+1..9 (modules), Alt+0 (Settings), [ ] (toggle sidebar), Ctrl+K (search), Esc (close)");
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
        if (e.altKey) {
          const key = e.key;
          const map = {
            "1": "/",
            "2": "/gatepass",
            "4": "/stock",
            "5": "/accounting-finance",
            "6": "/reports",
            "0": "/masterdata",
          };
        if (map[key]) {
          e.preventDefault();
          navigate(map[key]);
        }
      }
      if (e.key === "Escape") {
        window.dispatchEvent(new Event("smj-esc"));
        if (forgotDialog.open) resetForgotDialog();
      }
    };
    window.addEventListener("smj-logout", onLogout);
    window.addEventListener("smj-settings-updated", onSettingsUpdate);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("smj-logout", onLogout);
      window.removeEventListener("smj-settings-updated", onSettingsUpdate);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate, forgotDialog.open]);

  const handleLogin = (pinOverride) => {
    const expectedPin = String(settings.loginPassword || settings.adminPin || "0000")
      .replace(/\D/g, "")
      .slice(0, 4);
    const enteredPin = String(pinOverride ?? loginPin ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (enteredPin.length !== 4) {
      setLoginError("Enter 4-digit PIN");
      toast.error("Enter 4-digit PIN");
      return;
    }
    if (enteredPin === expectedPin) {
      localStorage.setItem("smj_logged_in", "true");
      setAuthLocked(false);
      setLoginPin("");
      setLoginError("");
      toast.success("Logged in");
    } else {
      setLoginError("PIN is incorrect");
      toast.error("Invalid PIN");
    }
  };

  const canSendEmailOtp = !!String(settings.email || "").trim();
  useEffect(() => {
    if (!forgotResendIn) return undefined;
    const timer = window.setInterval(() => {
      setForgotResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotResendIn]);

  useEffect(() => {
    if (!forgotDialog.expiresIn) return undefined;
    const timer = window.setInterval(() => {
      setForgotDialog((prev) => ({
        ...prev,
        expiresIn: prev.expiresIn > 0 ? prev.expiresIn - 1 : 0,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotDialog.expiresIn]);

  const resetForgotDialog = () => {
    setForgotDialog({
      open: false,
      channel: "email",
      otp: "",
      newPin: "",
      confirmPin: "",
      expiresIn: 0,
      sending: false,
      resetting: false,
      error: "",
    });
    setForgotResendIn(0);
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // ----------------- SWIPE FOR MOBILE -----------------
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);

  const handleTouchStart = (e) => {
    if (window.innerWidth >= 768) return; // only mobile
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (window.innerWidth >= 768) return;
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;

    const distance = touchEndX - touchStartX;

    if (distance > 70) setIsOpen(true); // right swipe → open
    if (distance < -70) setIsOpen(false); // left swipe → close

    setTouchStartX(null);
    setTouchEndX(null);
  };
  // ---------------------------------------------------

  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.scrollTop = 0;
      mainEl.scrollLeft = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const raf = requestAnimationFrame(() => {
      if (mainEl) {
        mainEl.scrollTop = 0;
        mainEl.scrollLeft = 0;
      }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => cancelAnimationFrame(raf);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isDraftEnabledRoute(location.pathname)) {
      setDraftPrompt((p) => ({ ...p, open: false }));
      return undefined;
    }
    const timer = setTimeout(() => {
      const storageKey = getDraftStorageKey(location.pathname, location.search);
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        setDraftPrompt((p) => ({ ...p, open: false }));
        return;
      }
      try {
        const payload = JSON.parse(raw);
        if (!payload?.fields?.length) return;
        const current = collectDraftSnapshot();
        const savedSig = snapshotSignature(payload);
        const currentSig = snapshotSignature(current);
        if (savedSig && savedSig === currentSig) {
          setDraftPrompt((p) => ({ ...p, open: false }));
          return;
        }
        setDraftPrompt({
          open: true,
          storageKey,
          routeLabel: `${location.pathname}${location.search || ""}`,
          payload,
        });
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isDraftEnabledRoute(location.pathname)) return undefined;
    let saveTimer = null;
    const onInput = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveCurrentRouteDraft, 180);
    };
    const container = mainRef.current;
    if (!container) return undefined;
    container.addEventListener("input", onInput, true);
    container.addEventListener("change", onInput, true);
    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      container.removeEventListener("input", onInput, true);
      container.removeEventListener("change", onInput, true);
    };
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={isOpen}
        toggleSidebar={toggleSidebar}
        userName={settings.companyName || settings.shortName || "Admin User"}
        userEmail={settings.email || "admin@smjrice.pk"}
        companyName={settings.companyName || settings.shortName}
        companyAddress={settings.address}
        onLogout={() => window.dispatchEvent(new Event("smj-logout"))}
      />

      {/* MAIN CONTENT */}
      <div
        className={`
          flex-1 flex flex-col

          /* DESKTOP → margin system for perfect sizing */
          transition-all duration-500 ease-out
          ${isOpen ? "md:ml-64" : "md:ml-16"}

          /* MOBILE → no margin, sidebar overlays */
          ml-0
        `}
      >
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto p-4 md:p-6"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {!isDashboard && (
            <div className="mb-3">
              <h1 className="text-xl md:text-2xl font-semibold text-emerald-900">
                {moduleTitle}
              </h1>
            </div>
          )}
          <div>{children}</div>
        </main>
      </div>

      {authLocked && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 overflow-hidden">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="SMJ logo" className="h-9 w-9 object-contain" />
                  ) : (
                    <Building2 size={20} />
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700">Login</div>
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">
                    {settings.companyName || settings.shortName || "SMJ"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Enter your 4-digit PIN to continue to the workspace.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="space-y-3">
              <Pin4Input
                value={loginPin}
                onChange={(v) => {
                  setLoginPin(v.slice(0, 4));
                  if (loginError) setLoginError("");
                }}
                onComplete={(v) => handleLogin(v)}
                error={!!loginError}
              />
              {loginError && (
                <div className="text-xs text-red-600 text-center">{loginError}</div>
              )}
              {!settings.loginPassword && (
                <p className="text-xs text-amber-600 text-center">
                  No login PIN set. Default PIN: 0000.
                </p>
              )}
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <button
                    type="button"
                    onClick={() => handleLogin()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    <ShieldCheck size={16} />
                    Enter Workspace
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForgotDialog({
                        open: true,
                        channel: "email",
                        otp: "",
                        newPin: "",
                        confirmPin: "",
                        expiresIn: 0,
                        sending: false,
                        resetting: false,
                        error: "",
                      })
                    }
                    className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    Forgot PIN
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {forgotDialog.open && (
        <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-emerald-700">Forgot PIN</div>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">Reset login PIN</h3>
                <p className="mt-1 text-sm text-gray-500">
                  We will send a code to your saved email, then you can set a new 4-digit PIN.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                <Mail size={14} />
                Email
              </div>
              <div className="mt-1 text-sm text-gray-900">{settings.email ? maskEmail(settings.email) : "Not configured"}</div>
            </div>

            {forgotDialog.expiresIn > 0 && (
              <div className="mt-3 text-xs text-gray-500">
                Code expires in <span className="font-medium text-gray-700">{formatCountdown(forgotDialog.expiresIn)}</span>
              </div>
            )}

            <div className="mt-4">
              <Pin4Input
                value={forgotDialog.otp}
                onChange={(v) =>
                  setForgotDialog((prev) => ({
                    ...prev,
                    otp: v.slice(0, 4),
                    error: "",
                  }))
                }
              />
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="New PIN"
                value={forgotDialog.newPin}
                onChange={(e) =>
                  setForgotDialog((prev) => ({
                    ...prev,
                    newPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                    error: "",
                  }))
                }
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Confirm PIN"
                value={forgotDialog.confirmPin}
                onChange={(e) =>
                  setForgotDialog((prev) => ({
                    ...prev,
                    confirmPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                    error: "",
                  }))
                }
              />
            </div>

            {forgotDialog.error && (
              <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {forgotDialog.error}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetForgotDialog}
                className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setForgotDialog((prev) => ({ ...prev, sending: true, error: "" }));
                  try {
                    const res = await api.post("/settings/otp/send");
                    if (res.data?.success) {
                      toast.success("OTP sent to email");
                      setForgotResendIn(OTP_RESEND_SECONDS);
                      const expiresAt = new Date(res.data?.data?.expiresAt || Date.now() + 5 * 60 * 1000).getTime();
                      const expiresIn = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
                      setForgotDialog((prev) => ({ ...prev, sending: false, expiresIn }));
                    } else {
                      setForgotDialog((prev) => ({ ...prev, sending: false, error: res.data?.message || "Failed to send OTP" }));
                    }
                  } catch (err) {
                    setForgotDialog((prev) => ({
                      ...prev,
                      sending: false,
                      error: err.response?.data?.message || "Failed to send OTP",
                    }));
                  }
                }}
                disabled={
                  forgotDialog.sending ||
                  forgotResendIn > 0 ||
                  !canSendEmailOtp
                }
                className="rounded-2xl border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700 disabled:opacity-60"
              >
                {forgotDialog.sending
                  ? "Sending..."
                  : forgotResendIn > 0
                  ? `Resend in ${formatCountdown(forgotResendIn)}`
                  : "Send OTP"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (forgotDialog.otp.length !== 4) {
                    setForgotDialog((prev) => ({ ...prev, error: "Enter 4-digit OTP" }));
                    return;
                  }
                  if (forgotDialog.newPin.length !== 4) {
                    setForgotDialog((prev) => ({ ...prev, error: "Enter a new 4-digit PIN" }));
                    return;
                  }
                  if (forgotDialog.newPin !== forgotDialog.confirmPin) {
                    setForgotDialog((prev) => ({ ...prev, error: "PIN confirmation does not match" }));
                    return;
                  }
                  setForgotDialog((prev) => ({ ...prev, resetting: true, error: "" }));
                  try {
                    const res = await api.post("/settings/otp/reset-pin", {
                      otp: forgotDialog.otp,
                      newPin: forgotDialog.newPin,
                    });
                    if (res.data?.success) {
                      setSettings((prev) => ({
                        ...prev,
                        adminPin: forgotDialog.newPin,
                        loginPassword: forgotDialog.newPin,
                      }));
                      localStorage.setItem("smj_logged_in", "true");
                      setAuthLocked(false);
                      setLoginPin("");
                      setLoginError("");
                      resetForgotDialog();
                      window.dispatchEvent(new Event("smj-settings-updated"));
                      toast.success("PIN reset successful");
                    } else {
                      setForgotDialog((prev) => ({
                        ...prev,
                        resetting: false,
                        error: res.data?.message || "PIN reset failed",
                      }));
                    }
                  } catch (err) {
                    setForgotDialog((prev) => ({
                      ...prev,
                      resetting: false,
                      error: err.response?.data?.message || "PIN reset failed",
                    }));
                  }
                }}
                disabled={forgotDialog.resetting}
                className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {forgotDialog.resetting ? "Resetting..." : "Reset PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
