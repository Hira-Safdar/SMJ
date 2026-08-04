// src/services/api.js
import axios from "axios";

const apiUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${apiUrl}/api`,
  withCredentials: true,
});

// Render free-tier cold starts (and other transient network hiccups) can drop
// the first request with a 4xx/5xx that succeeds on retry. GETs are idempotent,
// so retry them a couple of times with a short backoff before surfacing the error.
const MAX_RETRIES = 2;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error || {};
    const isGet = (config?.method || "").toLowerCase() === "get";
    const status = response?.status;

    const retryable =
      isGet &&
      config &&
      config._retryCount !== undefined &&
      config._retryCount < MAX_RETRIES &&
      (typeof status === "undefined" || status >= 400 && status < 500 || status >= 500);

    if (retryable) {
      const retryCount = config._retryCount === undefined ? 0 : config._retryCount;
      config._retryCount = retryCount + 1;
      await new Promise((r) => setTimeout(r, 700 * (retryCount + 1)));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;
