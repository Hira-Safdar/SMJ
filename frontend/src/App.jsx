// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import GatePass from "./pages/GatePass";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import Production from "./pages/Production";
import MasterData from "./pages/MasterData";
import AccountingFinance from "./pages/AccountingFinance";
import Reports from "./pages/Reports";
import AIChatbot from "./components/AI/AIChatbot";

export default function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/gatepass" element={<GatePass />} />
          <Route path="/gatepasses" element={<GatePass />} />
          <Route path="/production" element={<Production />} />
          <Route path="/accounting-finance" element={<AccountingFinance />} />
          <Route
            path="/reports"
            element={
              <Reports
                allowedTabs={[
                  "acc-reports",
                  "stock-reports",
                  "production-summary",
                  "gatepass",
                  "by-product",
                  "production",
                  "companies",
                  "customers",
                ]}
              />
            }
          />
          <Route path="/masterdata" element={<MasterData />} />
        </Routes>
        <AIChatbot />
      </MainLayout>
    </Router>
  );
}
