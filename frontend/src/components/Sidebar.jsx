// src/components/Sidebar.jsx
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  Home,
  Box,
  BarChart3,
  Settings,
  Truck,
  Bell,
  User,
  LogOut,
  FactoryIcon,
  Menu,
  Lightbulb,
  ChevronDown,
  ChartNoAxesCombined,
  BriefcaseBusiness,
  ShieldAlert,
  Bot,
} from "lucide-react";

const MENU = [
  { name: "Dashboard", icon: <Home size={18} />, path: "/" },
  {
    name: "Gate Pass Management",
    icon: <Truck size={18} />,
    path: "/gatepass",
    children: [
      { name: "Gate Pass Inward", path: "/gatepass?tab=IN" },
      { name: "Gate Pass Outward", path: "/gatepass?tab=OUT" },
    ],
  },
  {
    name: "Production Management",
    icon: <FactoryIcon size={18} />,
    path: "/production",
  },
  {
    name: "Stock Management",
    icon: <Box size={18} />,
    path: "/stock",
  },
  {
    name: "Accounting & Finance",
    icon: <BriefcaseBusiness size={18} />,
    path: "/accounting-finance",
    children: [
      { name: "Chart of Accounts", path: "/accounting-finance?tab=coa" },
      { name: "Journal Entry", path: "/accounting-finance?tab=journal-entry" },
      { name: "Journal", path: "/accounting-finance?tab=journal-report" },
      { name: "Ledger", path: "/accounting-finance?tab=ledger" },
      { name: "Trial Balance", path: "/accounting-finance?tab=trial" },
      { name: "Profit & Loss", path: "/accounting-finance?tab=pl" },
      { name: "Balance Sheet", path: "/accounting-finance?tab=balance" },
      { name: "Cash Flow", path: "/accounting-finance?tab=cash-flow" },
    ],
  },
  {
    name: "Reports",
    icon: <ChartNoAxesCombined size={18} />,
    path: "/reports",
    children: [
      { name: "Accounting & Finance Reports", path: "/reports?tab=acc-reports" },
      { name: "Stock Reports", path: "/reports?tab=stock-reports" },
      { name: "Production Summary", path: "/reports?tab=production-summary" },
      { name: "By-Product", path: "/reports?tab=by-product" },
      { name: "Production Detail", path: "/reports?tab=production" },
      { name: "Company List", path: "/reports?tab=companies" },
      { name: "Customer List", path: "/reports?tab=customers" },
    ],
  },
  {
    name: "System Settings",
    icon: <Settings size={18} />,
    path: "/masterdata?tab=system",
  },
];

export default function Sidebar({
  isOpen,
  toggleSidebar,
  userName,
  userEmail,
  companyName,
  companyAddress,
  onLogout,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => {
    const current = location.pathname + location.search;
    const parent = MENU.find(
      (m) => Array.isArray(m.children) && m.children.length > 1 && m.children.some((c) => c.path === current),
    );
    if (parent) setOpenMenu(parent.name);
  }, [location.pathname, location.search]);

  return (
    <>
      {/* BACKDROP FOR MOBILE */}
      {isOpen && (
        <div
          onClick={toggleSidebar}
          className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 
          bg-gradient-to-b from-teal-700 to-emerald-900 text-white shadow-xl
          transition-transform duration-300 ease-in-out
          ${isOpen ? "md:w-64" : "md:w-16"}
          ${
            isOpen
              ? "translate-x-0 w-64"
              : "-translate-x-full w-64 md:translate-x-0"
          }
        `}
      >
        <div className="h-full flex flex-col">
          {/* TOP */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-3 px-4 py-4 border-b border-emerald-700">
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg bg-emerald-800/40 hover:bg-emerald-800 transition"
              >
                <Menu size={18} />
              </button>

              {isOpen && (
                <div>
                  <h1 className="text-lg font-bold">
                    {companyName || "SMJ Rice Mill"}
                  </h1>
                  <p className="text-xs text-emerald-200">
                    {companyAddress || "Mirza Virkan Road, Sheikhupura"}
                  </p>
                </div>
              )}
            </div>

            {/* MENU */}
            <nav className="px-2 py-4 space-y-1 overflow-y-auto no-scrollbar flex-1 min-h-0 scroll-smooth">
              {MENU.map((m) => {
                const currentRoute = location.pathname + location.search;
                const childCount = Array.isArray(m.children) ? m.children.length : 0;
                const hasDropdown = childCount > 1;
                const hasSingleChild = childCount === 1;
                const isExpanded = openMenu === m.name;
                const childActive = Array.isArray(m.children) && m.children.some((c) => c.path === currentRoute);
                const active = location.pathname === m.path || currentRoute === m.path || childActive;
                return (
                  <div key={m.name} className="space-y-1">
                    {hasDropdown ? (
                      <button
                        type="button"
                        title={!isOpen ? m.name : ""}
                        onClick={() => {
                          setOpenMenu((prev) =>
                            prev === m.name ? null : m.name,
                          );
                          if (m.children && m.children[0]) {
                            navigate(m.children[0].path);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition
                          ${
                            active
                              ? "bg-emerald-600 text-white"
                              : "hover:bg-emerald-700 text-emerald-100"
                          }
                          ${isOpen ? "" : "justify-center"}
                        `}
                      >
                        {m.icon}
                        {isOpen && (
                          <>
                            <span className="text-sm flex-1 text-left">
                              {m.name}
                            </span>
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </>
                        )}
                      </button>
                    ) : hasSingleChild ? (
                      <Link
                        to={m.children[0].path}
                        title={!isOpen ? m.name : ""}
                        onClick={() => {
                          if (window.innerWidth < 768 && isOpen) toggleSidebar();
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition
                          ${
                            active
                              ? "bg-emerald-600 text-white"
                              : "hover:bg-emerald-700 text-emerald-100"
                          }
                          ${isOpen ? "" : "justify-center"}
                        `}
                      >
                        {m.icon}
                        {isOpen && <span className="text-sm">{m.name}</span>}
                      </Link>
                    ) : (
                      <Link
                        to={m.path}
                        title={!isOpen ? m.name : ""}
                        onClick={() => {
                          if (window.innerWidth < 768 && isOpen)
                            toggleSidebar();
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition
                          ${
                            active
                              ? "bg-emerald-600 text-white"
                              : "hover:bg-emerald-700 text-emerald-100"
                          }
                          ${isOpen ? "" : "justify-center"}
                        `}
                      >
                        {m.icon}
                        {isOpen && <span className="text-sm">{m.name}</span>}
                      </Link>
                    )}

                    {hasDropdown && isOpen && (
                      <div
                        className={`ml-8 mt-1 overflow-hidden border-l border-emerald-400/40 pl-2 transition-all duration-300 ease-out ${
                          isExpanded
                            ? "max-h-96 opacity-100"
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="space-y-1 py-1">
                          {m.children.map((c) => {
                            const childActive =
                              location.pathname + location.search === c.path;
                            return (
                              <Link
                                key={c.name}
                                to={c.path}
                                onClick={() => {
                                  if (window.innerWidth < 768 && isOpen)
                                    toggleSidebar();
                                }}
                                className={`block px-2.5 py-1.5 rounded-md text-xs transition
                                ${
                                  childActive
                                    ? "bg-emerald-600/90 text-white"
                                    : "text-emerald-100 hover:bg-emerald-700/60"
                                }
                              `}
                              >
                                <span className="block">{c.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* PROFILE */}
          <div className="px-3 py-4 border-t border-emerald-700 mt-auto">
          <div
            className={`flex items-center gap-3 ${isOpen ? "" : "flex-col"}`}
          >
              <button
                type="button"
                className="bg-emerald-600 p-1 rounded-full"
                onClick={() => navigate("/masterdata?tab=system")}
                title="System Settings"
              >
                <User size={20} />
              </button>

              {isOpen && (
                <div>
                  <div className="text-sm font-semibold">{userName || "Admin User"}</div>
                  <div className="text-xs text-emerald-200">
                    {userEmail || "admin@smjrice.pk"}
                  </div>
                </div>
              )}

              <button
                className="text-emerald-200 hover:text-white p-2 rounded"
                onClick={onLogout}
                type="button"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
