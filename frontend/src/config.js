// BUG-14 fix: Centralized API base URL.
// Uses Vite's environment variable system. Set VITE_API_BASE in .env for production.
// Falls back to localhost:8000 for local development.
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
