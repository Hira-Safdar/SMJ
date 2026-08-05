const mongoose = require("mongoose");
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/test", { serverSelectionTimeoutMS: 5000 });
    const db = mongoose.connection.db;
    const colls = await db.listCollections().toArray();
    console.log("DBs/collections sample:", mongoose.connection.name, colls.map((c) => c.name).slice(0, 20));
    const settings = await db.collection("systemsettings").find({}).sort({ createdAt: 1 }).limit(2).toArray();
    for (const s of settings) {
      console.log("--- settings doc", s._id, "email:", s.email);
      console.log("smtpHost:", s.smtpHost, "smtpPort:", s.smtpPort, "smtpUser:", s.smtpUser, "smtpSecure:", s.smtpSecure);
      console.log("mailFrom:", s.mailFrom);
      const pass = String(s.smtpPass || "");
      console.log("smtpPass len:", pass.length, "masked:", pass ? pass[0] + "****" + pass.slice(-1) : "(empty)");
    }
    if (!settings.length) console.log("No settings docs found in db", mongoose.connection.name);
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit(0);
  }
})();
