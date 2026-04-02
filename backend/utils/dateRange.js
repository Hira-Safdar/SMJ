const getDateRangeFromQuery = (query = {}) => {
  const range = String(query.range || "month").toLowerCase();
  const now = new Date();
  let start = null;
  let end = null;

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
    const day = now.getDay();
    const diff = now.getDate() - day;
    start = new Date(now.getFullYear(), now.getMonth(), diff);
    end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999);
  } else if (range === "year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (range === "custom") {
    start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    end = query.endDate ? new Date(query.endDate) : new Date();
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
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
