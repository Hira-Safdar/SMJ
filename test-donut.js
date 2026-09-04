const http = require("http");
http.get("http://localhost:5000/api/stock/current", (res) => {
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => {
    try {
      const j = JSON.parse(d);
      const rows = j.data || [];
      console.log("Total rows:", rows.length);
      if (rows.length > 0) {
        console.log("First row keys:", Object.keys(rows[0]));
        console.log("First row sources:", JSON.stringify(rows[0].sources || [], null, 2));
        const withSources = rows.filter((r) => r.sources && r.sources.length > 0);
        console.log("Rows with sources:", withSources.length);
        const gatePass = rows.filter((r) =>
          (r.sources || []).some((s) => s.sourceType === "Gate Pass")
        );
        const prodGroup = rows.filter((r) =>
          (r.sources || []).some((s) => s.sourceType === "Production Group")
        );
        console.log("Rows with Gate Pass:", gatePass.length);
        console.log("Rows with Production Group:", prodGroup.length);
        const allSourceTypes = new Set();
        rows.forEach((r) =>
          (r.sources || []).forEach((s) => allSourceTypes.add(s.sourceType))
        );
        console.log("All sourceTypes:", [...allSourceTypes]);
      } else {
        console.log("No data returned");
      }
    } catch (e) {
      console.log("Parse error:", e.message);
    }
  });
}).on("error", (e) => console.log("Connection error:", e.message));
