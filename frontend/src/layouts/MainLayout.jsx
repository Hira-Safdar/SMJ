// src/layouts/MainLayout.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast, Toaster } from "react-hot-toast";
import { Building2, CheckCircle2, Leaf, LockKeyhole, Mail, ShieldCheck, Sprout, Wheat } from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../services/api";
import Pin4Input from "../components/Pin4Input";

export default function MainLayout({ children }) {
  const OTP_RESEND_SECONDS = 45;
  const getDefaultForgotDialog = () => ({
    open: false,
    channel: "email",
    otp: "",
    expiresIn: 0,
    sending: false,
    verifying: false,
    error: "",
  });
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
  const [loginScreenState, setLoginScreenState] = useState("idle");
  const loginTimersRef = useRef([]);
  const [forgotDialog, setForgotDialog] = useState(getDefaultForgotDialog());
  const [postLoginPinDialog, setPostLoginPinDialog] = useState({
    open: false,
    otp: "",
    newPin: "",
    confirmPin: "",
    saving: false,
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
  const isLoginAnimatingOut =
    loginScreenState === "success" || loginScreenState === "closing";

  const toAbsoluteLogoUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = api.defaults.baseURL || "";
    const origin = base.replace(/\/api\/?$/i, "");
    return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const resetLoginTimers = () => {
    loginTimersRef.current.forEach((id) => window.clearTimeout(id));
    loginTimersRef.current = [];
  };

  const scheduleLoginTimer = (callback, delay) => {
    const id = window.setTimeout(callback, delay);
    loginTimersRef.current.push(id);
    return id;
  };

  const completeLoginWithTransition = () => {
    resetLoginTimers();
    setLoginScreenState("success");
    toast.success("Logged in");
    scheduleLoginTimer(() => setLoginScreenState("closing"), 520);
    scheduleLoginTimer(() => {
      localStorage.setItem("smj_logged_in", "true");
      setAuthLocked(false);
      setLoginPin("");
      setLoginError("");
      setLoginScreenState("idle");
      resetLoginTimers();
    }, 980);
  };

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
          logoUrl: toAbsoluteLogoUrl(
            general.logoUrl ||
              general.logo ||
              general.logoPath ||
              data.logoUrl ||
              data.logo ||
              data.logoPath ||
              prev.logoUrl ||
              ""
          ),
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

  useEffect(
    () => () => {
      resetLoginTimers();
    },
    []
  );

  useEffect(() => {
    resetLoginTimers();
    if (authLocked) {
      setLoginScreenState("opening");
      scheduleLoginTimer(() => setLoginScreenState("ready"), 260);
      return;
    }
    setLoginScreenState("idle");
  }, [authLocked]);

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
        if (postLoginPinDialog.open) {
          setPostLoginPinDialog((prev) => ({ ...prev, open: false, error: "" }));
        }
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
  }, [navigate, forgotDialog.open, postLoginPinDialog.open]);

  const handleLogin = (pinOverride) => {
    const expectedPin = String(settings.loginPassword || settings.adminPin || "0000")
      .replace(/\D/g, "")
      .slice(0, 4);
    const enteredPin = String(pinOverride ?? loginPin ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (enteredPin.length !== 4) {
      setLoginError("Enter 4-digit PIN");
      return;
    }
    if (enteredPin === expectedPin) {
      completeLoginWithTransition();
    } else {
      setLoginError("PIN is incorrect");
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
    setForgotDialog(getDefaultForgotDialog());
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
    <div className="min-h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-center" />
      {!authLocked && (
        <>
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
        </>
      )}

      {authLocked && (
        <div
          className={[
            "relative z-[200] flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#bfece2] via-[#a7dfd3] to-[#8dd2c5] px-4 md:px-8",
            loginScreenState === "opening" ? "login-screen-enter" : "",
            loginScreenState === "closing" ? "login-screen-exit" : "",
          ].join(" ")}
        >
          <div className="pointer-events-none absolute -left-16 top-24 h-72 w-72 rounded-full bg-emerald-200/15 blur-3xl login-orb-float" />
          <div className="pointer-events-none absolute right-[-6rem] top-10 h-80 w-80 rounded-full bg-teal-200/10 blur-3xl login-orb-float-delayed" />
          <div className="pointer-events-none absolute bottom-[-10rem] left-[35%] h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl login-orb-float" />

          <div
            className={[
              "relative z-10 w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[2rem] bg-[#3f8071]/95 shadow-2xl ring-1 ring-emerald-50/25",
              loginScreenState === "opening" ? "login-card-enter" : "",
              loginScreenState === "closing" ? "login-card-exit" : "",
            ].join(" ")}
          >
            <div className="grid md:grid-cols-[1fr_0.92fr]">
              <div className="relative hidden overflow-hidden bg-[#f5fbf9] md:flex md:min-h-[560px]">
                <div className="absolute inset-y-0 right-[-10%] w-[56%] rounded-l-[42%] bg-[#f5fbf9]" />
                <div className="relative z-10 flex w-full flex-col items-center p-10 text-center">
                  <div className="mt-7 text-2xl font-bold uppercase tracking-wide text-emerald-900/90 md:mt-10 md:text-3xl">
                    {settings.companyName || settings.shortName || "SMJ Rice Mills"}
                  </div>
                  <div className="flex flex-1 items-start justify-center pt-0 text-emerald-900">
                    {settings.logoUrl ? (
                      <img src={settings.logoUrl} alt="SMJ logo" className="-mt-[390px] h-[980px] w-[980px] origin-top scale-110 object-contain" />
                    ) : (
                      <Building2 size={1080} />
                    )}
                  </div>
                </div>
                <div className="pointer-events-none absolute bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-300/70 bg-white px-5 py-2.5 text-emerald-800 shadow-2xl">
                  <Wheat size={18} />
                  <Sprout size={18} />
                  <Leaf size={18} />
                  <Wheat size={18} />
                  <Sprout size={18} />
                </div>
              </div>

              <div className="relative p-5 sm:p-7 md:px-12 md:pb-12 md:pt-20">
                <div className="mb-5 overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-[#016d73] via-[#0a7379] to-[#045e63] p-5 text-white md:hidden">
                  <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                    <div>
                      <div className="text-3xl font-semibold leading-tight">Hello!</div>
                      <p className="mt-1 text-sm text-teal-100">
                        Welcome to {settings.companyName || settings.shortName || "SMJ"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-center">
                      {settings.logoUrl ? (
                        <img
                          src={settings.logoUrl}
                          alt="SMJ logo"
                          className="h-36 w-36 object-contain sm:h-32 sm:w-32"
                        />
                      ) : (
                        <Building2 size={132} />
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                    isLoginAnimatingOut
                      ? "bg-emerald-100 text-emerald-700 login-success-pulse"
                      : "bg-emerald-100/90 text-emerald-800",
                  ].join(" ")}
                >
                  {isLoginAnimatingOut ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}
                  {isLoginAnimatingOut ? "Access Granted" : "Secure Login"}
                </div>

                <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-[2.6rem]">
                  Login
                </h3>
                <p className="mt-2 text-sm text-emerald-100/90">
                  {isLoginAnimatingOut
                    ? "Opening your workspace..."
                    : "Enter your 4-digit PIN to continue."}
                </p>

                <div className="mt-10 space-y-4">
                  <Pin4Input
                    value={loginPin}
                    onChange={(v) => {
                      if (isLoginAnimatingOut) return;
                      setLoginPin(v.slice(0, 4));
                      if (loginError) setLoginError("");
                    }}
                    onComplete={(v) => {
                      if (isLoginAnimatingOut) return;
                      handleLogin(v);
                    }}
                    error={!!loginError}
                    disabled={isLoginAnimatingOut}
                    className="mx-auto w-[248px] justify-between"
                    inputClassName="h-14 w-14 rounded-xl border-gray-300 bg-white text-emerald-900 focus:ring-teal-200"
                  />

                  {loginError && (
                    <div className="text-center text-xs text-rose-200">{loginError}</div>
                  )}
                  {!settings.loginPassword && (
                    <p className="text-center text-xs text-amber-200">
                      No login PIN set. Default PIN: 0000.
                    </p>
                  )}

                  <div className="mx-auto w-[248px]">
                    <button
                      type="button"
                      onClick={() =>
                        setForgotDialog({
                          ...getDefaultForgotDialog(),
                          open: true,
                        })
                      }
                      disabled={isLoginAnimatingOut}
                      className="block w-full text-right text-xs font-medium text-emerald-100 underline underline-offset-2 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Forgot PIN?
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLogin()}
                      disabled={isLoginAnimatingOut}
                      className={[
                        "liquid-login-btn mt-3 inline-flex w-full translate-x-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-emerald-800 transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLoginAnimatingOut ? "liquid-login-btn-filling" : "",
                      ].join(" ")}
                    >
                      <span className="relative z-[2] inline-flex items-center gap-2">
                        {isLoginAnimatingOut ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
                        {isLoginAnimatingOut ? "Entering..." : "Login to SMJ"}
                      </span>
                    </button>
                  </div>

                  <div className="pt-1 text-center text-xs text-emerald-100/80">
                    Protected by OTP reset via {settings.email ? maskEmail(settings.email) : "configured email"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {forgotDialog.open && (
        <div className="fixed inset-0 z-[210] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl">
            <div className="text-left text-sm font-semibold text-emerald-800">Forgot PIN</div>

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                <Mail size={14} />
                Recovery Email
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-900">{settings.email ? maskEmail(settings.email) : "Not configured"}</div>
              {forgotDialog.expiresIn > 0 && (
                <div className="mt-1 text-xs text-emerald-700">OTP expires in {formatCountdown(forgotDialog.expiresIn)}</div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-900">Enter OTP</div>
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
                  disabled={forgotDialog.sending || forgotResendIn > 0 || !canSendEmailOtp}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {forgotDialog.sending
                    ? "Sending..."
                    : forgotResendIn > 0
                    ? `Resend ${formatCountdown(forgotResendIn)}`
                    : "Send OTP"}
                </button>
              </div>
              <div className="mt-3">
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
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-700">
              After OTP verification, you will be logged in and redirected to System Settings to set a new PIN.
            </div>

            {forgotDialog.error && (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {forgotDialog.error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
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
                  if (forgotDialog.otp.length !== 4) {
                    setForgotDialog((prev) => ({ ...prev, error: "Enter 4-digit OTP" }));
                    return;
                  }
                  setForgotDialog((prev) => ({ ...prev, verifying: true, error: "" }));
                  try {
                    const res = await api.post("/settings/otp/verify", { otp: forgotDialog.otp });
                    if (res.data?.success) {
                      const verifiedOtp = forgotDialog.otp;
                      completeLoginWithTransition();
                      resetForgotDialog();
                      window.setTimeout(() => {
                        setPostLoginPinDialog({
                          open: true,
                          otp: verifiedOtp,
                          newPin: "",
                          confirmPin: "",
                          saving: false,
                          error: "",
                        });
                        toast("OTP verified. Set your new PIN.");
                      }, 1100);
                      window.dispatchEvent(new Event("smj-settings-updated"));
                      toast.success("OTP verified");
                    } else {
                      setForgotDialog((prev) => ({
                        ...prev,
                        verifying: false,
                        error: res.data?.message || "OTP verification failed",
                      }));
                    }
                  } catch (err) {
                    setForgotDialog((prev) => ({
                      ...prev,
                      verifying: false,
                      error: err.response?.data?.message || "OTP verification failed",
                    }));
                  }
                }}
                disabled={forgotDialog.verifying}
                className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {forgotDialog.verifying ? "Verifying..." : "Verify OTP & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {postLoginPinDialog.open && (
        <div className="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl">
            <div className="text-xs uppercase tracking-[0.14em] text-emerald-700">Set New PIN</div>
            <h3 className="mt-1 text-xl font-semibold text-emerald-900">Create your new login PIN</h3>
            <p className="mt-1 text-sm text-gray-600">Enter and confirm a 4-digit PIN.</p>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="New PIN"
                value={postLoginPinDialog.newPin}
                onChange={(e) =>
                  setPostLoginPinDialog((prev) => ({
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
                value={postLoginPinDialog.confirmPin}
                onChange={(e) =>
                  setPostLoginPinDialog((prev) => ({
                    ...prev,
                    confirmPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                    error: "",
                  }))
                }
              />
            </div>

            {postLoginPinDialog.error && (
              <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {postLoginPinDialog.error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPostLoginPinDialog((prev) => ({ ...prev, open: false, error: "" }))}
                className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm text-gray-700"
              >
                Later
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (postLoginPinDialog.newPin.length !== 4) {
                    setPostLoginPinDialog((prev) => ({ ...prev, error: "Enter a new 4-digit PIN" }));
                    return;
                  }
                  if (postLoginPinDialog.newPin !== postLoginPinDialog.confirmPin) {
                    setPostLoginPinDialog((prev) => ({ ...prev, error: "PIN confirmation does not match" }));
                    return;
                  }
                  setPostLoginPinDialog((prev) => ({ ...prev, saving: true, error: "" }));
                  try {
                    const res = await api.post("/settings/otp/reset-pin", {
                      otp: postLoginPinDialog.otp,
                      newPin: postLoginPinDialog.newPin,
                    });
                    if (res.data?.success) {
                      setSettings((prev) => ({
                        ...prev,
                        adminPin: postLoginPinDialog.newPin,
                        loginPassword: postLoginPinDialog.newPin,
                      }));
                      setPostLoginPinDialog({
                        open: false,
                        otp: "",
                        newPin: "",
                        confirmPin: "",
                        saving: false,
                        error: "",
                      });
                      toast.success("New PIN saved");
                      window.dispatchEvent(new Event("smj-settings-updated"));
                    } else {
                      setPostLoginPinDialog((prev) => ({
                        ...prev,
                        saving: false,
                        error: res.data?.message || "Failed to save PIN",
                      }));
                    }
                  } catch (err) {
                    setPostLoginPinDialog((prev) => ({
                      ...prev,
                      saving: false,
                      error: err.response?.data?.message || "Failed to save PIN",
                    }));
                  }
                }}
                disabled={postLoginPinDialog.saving}
                className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {postLoginPinDialog.saving ? "Saving..." : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
