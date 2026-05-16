// src/services/api.js
import axios from "axios";

const apiUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${apiUrl}/api`,
  withCredentials: true,
});

export default api;
