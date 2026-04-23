function entry({ key, title, tags = [], route = "", steps = [], notes = [] }) {
  const text = [
    `Topic: ${title}`,
    route ? `Route: ${route}` : null,
    steps.length ? `How to open:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : null,
    notes.length ? `Notes:\n${notes.map((s) => `- ${s}`).join("\n")}` : null,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { key, title, text, tags, route };
}

module.exports = [
  entry({
    key: "nav.dashboard",
    title: "Dashboard (Home)",
    tags: ["dashboard", "home", "summary"],
    route: "/",
    steps: ["Open sidebar", "Click `Dashboard`"],
  }),
  entry({
    key: "nav.gatepass.in",
    title: "Gate Pass Inward",
    tags: ["gatepass", "gate pass", "inward", "in"],
    route: "/gatepass?tab=IN",
    steps: ["Sidebar → `Gate Pass Management`", "Click `Gate Pass Inward`"],
  }),
  entry({
    key: "nav.gatepass.out",
    title: "Gate Pass Outward",
    tags: ["gatepass", "gate pass", "outward", "out"],
    route: "/gatepass?tab=OUT",
    steps: ["Sidebar → `Gate Pass Management`", "Click `Gate Pass Outward`"],
  }),
  entry({
    key: "nav.production",
    title: "Production Management",
    tags: ["production", "batch", "milling"],
    route: "/production",
    steps: ["Sidebar → `Production Management`"],
  }),
  entry({
    key: "nav.stock",
    title: "Stock Management",
    tags: ["stock", "inventory"],
    route: "/stock",
    steps: ["Sidebar → `Stock Management`"],
  }),
  entry({
    key: "nav.acc.coa",
    title: "Accounting: Chart of Accounts",
    tags: ["accounting", "finance", "coa", "chart of accounts"],
    route: "/accounting-finance?tab=coa",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Chart of Accounts`"],
  }),
  entry({
    key: "nav.acc.journal_entry",
    title: "Accounting: Journal Entry",
    tags: ["accounting", "journal entry", "voucher", "payment", "receipt"],
    route: "/accounting-finance?tab=journal-entry",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Journal Entry`"],
    notes: [
      "Voucher types supported: JOURNAL, PAYMENT, RECEIPT.",
      "If you can’t post, check required fields and line debit/credit totals.",
    ],
  }),
  entry({
    key: "nav.acc.journal_report",
    title: "Accounting: Journal (Report)",
    tags: ["accounting", "journal", "journal report", "book"],
    route: "/accounting-finance?tab=journal-report",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Journal`"],
  }),
  entry({
    key: "nav.acc.ledger",
    title: "Accounting: Ledger",
    tags: ["accounting", "ledger"],
    route: "/accounting-finance?tab=ledger",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Ledger`"],
  }),
  entry({
    key: "nav.acc.trial",
    title: "Accounting: Trial Balance",
    tags: ["accounting", "trial balance", "trial"],
    route: "/accounting-finance?tab=trial",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Trial Balance`"],
  }),
  entry({
    key: "nav.acc.pl",
    title: "Accounting: Profit & Loss",
    tags: ["accounting", "profit", "loss", "p&l", "pl"],
    route: "/accounting-finance?tab=pl",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Profit & Loss`"],
  }),
  entry({
    key: "nav.acc.balance",
    title: "Accounting: Balance Sheet",
    tags: ["accounting", "balance sheet", "balance"],
    route: "/accounting-finance?tab=balance",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Balance Sheet`"],
  }),
  entry({
    key: "nav.acc.cash_flow",
    title: "Accounting: Cash Flow",
    tags: ["accounting", "cash flow", "cash"],
    route: "/accounting-finance?tab=cash-flow",
    steps: ["Sidebar → `Accounting & Finance`", "Click `Cash Flow`"],
  }),
  entry({
    key: "nav.reports.acc",
    title: "Reports: Accounting & Finance Reports",
    tags: ["reports", "accounting reports"],
    route: "/reports?tab=acc-reports",
    steps: ["Sidebar → `Reports`", "Click `Accounting & Finance Reports`"],
  }),
  entry({
    key: "nav.reports.stock",
    title: "Reports: Stock Reports",
    tags: ["reports", "stock reports", "inventory reports"],
    route: "/reports?tab=stock-reports",
    steps: ["Sidebar → `Reports`", "Click `Stock Reports`"],
  }),
  entry({
    key: "nav.reports.production",
    title: "Reports: Production Summary",
    tags: ["reports", "production summary"],
    route: "/reports?tab=production-summary",
    steps: ["Sidebar → `Reports`", "Click `Production Summary`"],
  }),
  entry({
    key: "nav.reports.gatepass",
    title: "Reports: Gatepass Report",
    tags: ["reports", "gatepass report", "gate pass report"],
    route: "/reports?tab=gatepass",
    steps: ["Sidebar → `Reports`", "Click `Gatepass`"],
  }),
  entry({
    key: "nav.reports.customers",
    title: "Reports: Customer List",
    tags: ["reports", "customers", "customer list"],
    route: "/reports?tab=customers",
    steps: ["Sidebar → `Reports`", "Click `Customer List`"],
  }),
  entry({
    key: "nav.settings.system",
    title: "System Settings",
    tags: ["settings", "system settings", "masterdata", "master data"],
    route: "/masterdata?tab=system",
    steps: ["Sidebar → `System Settings`"],
    notes: ["If you are locked out, use the PIN screen to log in."],
  }),
  entry({
    key: "nav.troubleshoot.missing_menu",
    title: "Troubleshooting: Can’t see a module/tab",
    tags: ["help", "where", "not visible", "missing", "module", "tab", "sub tab", "submenu"],
    steps: [
      "If sidebar is collapsed, click the menu (☰) icon to expand it.",
      "If a module has a dropdown, click the module name to expand its submenu.",
      "Use the exact names: `Accounting & Finance`, `Gate Pass Management`, `Reports`, etc.",
      "If you are on mobile, open sidebar then tap outside to close.",
    ],
  }),
];

