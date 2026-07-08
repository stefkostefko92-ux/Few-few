// Споделяне на дизайн чрез линк — състоянието се кодира в самия URL (#p=…),
// без сървър. UTF-8 → base64url, за да минава кирилицата.

export function encodeState(state: object): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState<T = Record<string, unknown>>(s: string): T | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    return typeof obj === "object" && obj !== null ? (obj as T) : null;
  } catch {
    return null;
  }
}

/** Ако в адреса има споделено състояние (#p=…), връща го и чисти хеша. */
export function takeSharedState<T = Record<string, unknown>>(): T | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/[#&]p=([^&]+)/);
  if (!m) return null;
  const data = decodeState<T>(decodeURIComponent(m[1]!));
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return data;
}
