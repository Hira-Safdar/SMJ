const Customer = require("../models/customerModel");

const normalizeName = (s) => String(s || "").trim().replace(/\s+/g, " ");
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.listCustomers = async (req, res) => {
  try {
    const limit = Math.min(5000, Math.max(1, Number(req.query?.limit || 2000)));
    const q = String(req.query?.q || "").trim();
    const filter = {};
    if (q) filter.name = { $regex: q, $options: "i" };
    const rows = await Customer.find(filter).sort({ name: 1 }).limit(limit).lean();
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createOrUpdateCustomer = async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) return res.status(400).json({ success: false, message: "name is required" });

    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const address = String(req.body?.address || "").trim();

    // If phone matches an existing customer, update missing fields and return it.
    if (phone) {
      const byPhone = await Customer.findOne({ phone }).lean();
      if (byPhone) {
        const update = {};
        if (!byPhone.email && email) update.email = email;
        if (!byPhone.address && address) update.address = address;
        if (byPhone.name !== name && name) update.name = name;
        const updated = Object.keys(update).length
          ? await Customer.findByIdAndUpdate(byPhone._id, { $set: update }, { new: true }).lean()
          : byPhone;
        return res.status(201).json({ success: true, data: updated });
      }
    }

    const escaped = escapeRegex(name);
    const existing = await Customer.findOne({ name: { $regex: new RegExp(`^${escaped}$`, "i") } });
    if (existing) {
      if (phone && !existing.phone) existing.phone = phone;
      if (email && !existing.email) existing.email = email;
      if (address && !existing.address) existing.address = address;
      await existing.save();
      return res.status(201).json({ success: true, data: existing });
    }

    const created = await Customer.create({ name, phone, email, address });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const row = await Customer.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

