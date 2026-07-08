// WiFi QR по стандарта на Android/iOS: сканираш камерата и телефонът се
// свързва сам. Чиста функция (тествана с node:test).

export type WifiAuth = "WPA" | "WEP" | "nopass";

export interface WifiData {
  ssid: string;
  password: string;
  auth: WifiAuth;
  hidden: boolean;
}

/** Екранира специалните за формата знаци: \ ; , : " */
function esc(s: string): string {
  return s.replace(/([\\;,:"])/g, "\\$1");
}

export function wifiQr(d: WifiData): string {
  const auth = d.auth === "nopass" ? "nopass" : d.auth;
  const pass = d.auth === "nopass" ? "" : `P:${esc(d.password)};`;
  const hidden = d.hidden ? "H:true;" : "";
  return `WIFI:T:${auth};S:${esc(d.ssid)};${pass}${hidden};`;
}
