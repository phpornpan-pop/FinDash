// Persistence layer for the net worth ledger.
//
// Primary store: a Google Sheet, reached through a Google Apps Script
// "Web App" endpoint (see /google-apps-script/Code.gs for the backend code).
// Fallback / offline cache: the browser's localStorage, so the app still
// works if VITE_SHEETS_API_URL isn't configured yet, or if the network
// request fails.
//
// Set VITE_SHEETS_API_URL in a `.env` file (see .env.example) to the URL
// you get after deploying the Apps Script as a Web App.

const LOCAL_KEY = "networth-ledger:data";
const API_URL = import.meta.env.VITE_SHEETS_API_URL || "";

export function hasRemote() {
  return Boolean(API_URL);
}

export async function loadData() {
  if (API_URL) {
    try {
      const res = await fetch(API_URL, { method: "GET" });
      if (res.ok) {
        const json = await res.json();
        localStorage.setItem(LOCAL_KEY, JSON.stringify(json));
        return { data: json, source: "sheets" };
      }
    } catch (e) {
      // network / CORS / deployment issue - fall back to local cache below
    }
  }

  const raw = localStorage.getItem(LOCAL_KEY);
  if (raw) {
    try {
      return { data: JSON.parse(raw), source: API_URL ? "local-fallback" : "local" };
    } catch (e) {
      // corrupted cache, ignore
    }
  }

  return { data: null, source: "none" };
}

export async function saveData(data) {
  // always keep a local copy so nothing is lost even if the remote call fails
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage full or unavailable - remote save below is still attempted
  }

  if (!API_URL) {
    return { ok: true, source: "local-only" };
  }

  try {
    // text/plain avoids a CORS preflight; Apps Script reads the raw body
    // regardless of the declared content type.
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, source: "sheets" };
  } catch (e) {
    return { ok: false, source: "local-only", error: e };
  }
}
