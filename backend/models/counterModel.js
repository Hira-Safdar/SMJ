// backend/models/counterModel.js
// Monotonic counters used for number sequences that must never reuse a value
// (e.g. gate pass numbers — a deleted record's number must not be regenerated).
const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", CounterSchema);
