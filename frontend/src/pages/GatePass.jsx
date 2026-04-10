// src/pages/GatePass.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LogIn, LogOut } from "lucide-react";
import GatePassIN from "../components/GatePass/GatePassIN";
import GatePassOUT from "../components/GatePass/GatePassOUT";

export default function GatePass() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("IN");
  const highlightId = searchParams.get("highlight") || "";
  const tabs = [
    { label: "Gate Pass Inward", value: "IN", icon: <LogIn size={16} /> },
    { label: "Gate Pass Outward", value: "OUT", icon: <LogOut size={16} /> },
  ];

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "IN" || tab === "OUT") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <div className="border-b border-emerald-200 mb-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const isActive = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => {
                  setActiveTab(t.value);
                  setSearchParams({ tab: t.value });
                }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-t-lg border-b-2 transition whitespace-nowrap
                  ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-semibold border-emerald-600"
                      : "text-gray-500 border-transparent hover:text-emerald-600 hover:bg-emerald-50"
                  }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "IN" ? <GatePassIN highlightId={highlightId} /> : <GatePassOUT highlightId={highlightId} />}
    </div>
  );
}
