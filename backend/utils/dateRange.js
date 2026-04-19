const getDateRangeFromQuery = (query = {}) => {
  const range = String(query.range || "month").toLowerCase();
  const now = new Date();
  let start = null;
  let end = null;
  const anchorDate = query.anchorDate ? new Date(query.anchorDate) : null;
  const monthValue = String(query.monthValue || "").trim();
  const yearValue = Number(query.yearValue || 0);

  const ignoreDate =
    String(query.ignoreDate || "").toLowerCase() === "1" ||
    String(query.ignoreDate || "").toLowerCase() === "true" ||
    range === "all";

  if (ignoreDate) {
    start = new Date(0);
    end = new Date();
  } else
  if (query.startDate || query.endDate) {
    start = query.startDate ? new Date(query.startDate) : new Date(0);
    end = query.endDate ? new Date(query.endDate) : new Date();
  } else if (range === "particular" || range === "date") {
    const base = query.date ? new Date(query.date) : new Date(now);
    start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  } else if (range === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === "week") {
    const base =
      anchorDate && Number.isFinite(anchorDate.getTime()) ? anchorDate : new Date(now);
    const day = base.getDay();
    const diff = base.getDate() - day;
    start = new Date(base.getFullYear(), base.getMonth(), diff);
    end = new Date(base.getFullYear(), base.getMonth(), diff + 6, 23, 59, 59, 999);
  } else if (range === "year") {
    const y =
      Number.isFinite(yearValue) && yearValue >= 1900 && yearValue <= 3000
        ? yearValue
        : now.getFullYear();
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31, 23, 59, 59, 999);
  } else if (range === "custom") {
    start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    end = query.endDate ? new Date(query.endDate) : new Date();
  } else {
    if (/^\d{4}-\d{2}$/.test(monthValue)) {
      const [y, m] = monthValue.split("-").map(Number);
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0, 23, 59, 59, 999);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
  }

  if (!Number.isFinite(start?.getTime())) {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (!Number.isFinite(end?.getTime())) {
    end = new Date();
  }
  end.setHours(23, 59, 59, 999);

  return { start, end, range };
};

module.exports = { getDateRangeFromQuery };
