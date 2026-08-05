const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/test", { serverSelectionTimeoutMS: 5000 });
    const db = mongoose.connection.db;
    const s = await db.collection("systemsettings").find({}).sort({ createdAt: 1 }).limit(1).next();
    if (!s) { console.log("no settings"); process.exit(0); }
    const rawPass = String(s.smtpPass || "");
    const stripped = rawPass.replace(/\s+/g, "").trim();
    const user = String(s.smtpUser || s.email || "").trim();
    console.log("user:", user);
    console.log("pass raw len:", rawPass.length, "stripped len:", stripped.length, "spaces:", (rawPass.match(/ /g) || []).length);
    console.log("pass stripped mask:", stripped ? stripped[0] + "****" + stripped.slice(-1) : "(empty)");
    console.log("host:", s.smtpHost, "port:", s.smtpPort, "secure:", s.smtpSecure);
    const transport = nodemailer.createTransport({
      host: s.smtpHost || "smtp.gmail.com",
      port: Number(s.smtpPort) || 587,
      secure: !!s.smtpSecure,
      auth: { user, pass: stripped },
      connectionTimeout: 15000,
    });
    const ok = await transport.verify();
    console.log("VERIFY OK:", ok);
  } catch (err) {
    console.log("VERIFY FAILED:", err.message);
    console.log("code:", err.code, "responseCode:", err.responseCode);
    if (err.response) console.log("server response:", err.response);
  } finally {
    process.exit(0);
  }
})();
