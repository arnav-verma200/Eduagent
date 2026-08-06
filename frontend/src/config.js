// BUG-14 fix: Centralized API base URL.
// Uses Vite's environment variable system. Set VITE_API_BASE in .env for production.
export const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8000"
    : ""
);
