// Backend URL resolution.
//
//  1. VITE_BACKEND_URL (set at BUILD time) always wins. REQUIRED when the frontend and
//     backend are deployed on different hosts, e.g. Vercel + Render:
//        VITE_BACKEND_URL=https://srlms-api.onrender.com
//  2. In `vite dev` we assume the API runs on port 4000 of the same machine, so phones on
//     your LAN can reach it via http://<your-ip>:5173.
//  3. In a production build with no VITE_BACKEND_URL we assume the API is served from the
//     same origin (e.g. behind a reverse proxy).

const stripSlash = (u) => String(u).replace(/\/+$/, "");

const getBackendHost = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return stripSlash(import.meta.env.VITE_BACKEND_URL);
  }
  if (typeof window !== "undefined" && window.location) {
    if (import.meta.env.DEV) {
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      return `${protocol}//${window.location.hostname}:4000`;
    }
    return window.location.origin;
  }
  return "http://localhost:4000";
};

export const BACKEND_URL = getBackendHost();
export const API_BASE = `${BACKEND_URL}/api/v1`;
export const SIGNALING_URL = BACKEND_URL;
