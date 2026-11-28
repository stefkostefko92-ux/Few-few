// „Installa l'app“ (PWA) — по устройството, както в Rilievi (public/js/installa.js): Chrome/Edge предлагат
// инсталирането сами (beforeinstallprompt) → бутон; iPhone/iPad нямат такова извикване → стъпките през
// „Condividi“; Samsung Internet → към Chrome (инсталираното от него Android го бележи „non sicura“).
import { h } from "./ui.js";

let offerta = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  offerta = e;
  document.dispatchEvent(new Event("liftcon-installabile"));
});
window.addEventListener("appinstalled", () => (offerta = null));

export const installata = () => window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)").matches || window.navigator.standalone === true;

function sistema() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/Android/i.test(ua)) return "android";
  return "pc";
}

const nascosta = () => {
  try {
    return localStorage.getItem("liftcon-installa-no") === "1";
  } catch {
    return false;
  }
};

/** Картата за инсталиране (или null — вече е приложение, или човекът е казал „Non ora“). */
export function schedaInstalla() {
  if (installata() || nascosta()) return null;
  const os = sistema();
  const box = h("section.scheda.installa", { "aria-labelledby": "installa-t" });
  const nonOra = h("button.link", { type: "button", on: { click: () => {
    try {
      localStorage.setItem("liftcon-installa-no", "1");
    } catch {
      /* без localStorage — картата просто ще се появи пак */
    }
    box.remove();
  } } }, "Non ora");
  const corpo = h("div");
  const disegna = () => {
    corpo.replaceChildren();
    if (os === "ios") {
      corpo.append(
        h("p", {}, "Per usarla come app a schermo intero, anche senza connessione:"),
        h("ol", {}, h("li", {}, "tocchi ", h("strong", {}, "Condividi"), " (il quadrato con la freccia verso l'alto);"), h("li", {}, "scelga ", h("strong", {}, "Aggiungi alla schermata Home"), ";"), h("li", {}, "confermi con ", h("strong", {}, "Aggiungi"), ".")),
      );
    } else if (os === "samsung") {
      const url = `intent://${location.host}/admin/documenti/#Intent;scheme=https;package=com.android.chrome;end`;
      corpo.append(h("p", {}, "Samsung Internet installa le app web come «non sicure». Apra il pannello in Chrome e la installi da lì."), h("a.btn", { href: url }, "Apri in Chrome"));
    } else if (offerta) {
      corpo.append(
        h("p", {}, "L'app si apre dalla schermata principale, a schermo intero, e funziona anche senza connessione."),
        h("button.btn", { type: "button", on: { click: async () => {
          const o = offerta;
          offerta = null;
          o.prompt();
          if ((await o.userChoice).outcome === "accepted") box.remove();
          else disegna();
        } } }, "Installa l'app"),
      );
    } else {
      corpo.append(h("p", {}, os === "android" ? "Nel menu di Chrome (⋮) scelga «Installa app» o «Aggiungi a schermata Home»." : "Nella barra dell'indirizzo o nel menu del browser scelga «Installa LiftCon»."));
    }
  };
  document.addEventListener("liftcon-installabile", disegna);
  disegna();
  box.append(h("h2#installa-t", {}, "Installi l'app su questo dispositivo"), corpo, nonOra);
  return box;
}

/** PDF в приложението на iPhone/iPad: там връзката към PDF завзема прозореца без път назад (WebKit 290847) —
 *  файлът се подава на „Condividi“ (отвори, запази във Файлове, печат), както в Rilievi (public/js/pdf-app.js). */
let pronto = null;
/** Файлът вече е свален (второто докосване на iPhone): споделя се веднага, без нова синхронизация. */
export const pdfPronto = (url) => pronto?.url === url;
export async function apriPdf(url, avvisa) {
  if (window.navigator.standalone !== true || typeof navigator.canShare !== "function") return void window.open(url, "_blank", "noopener");
  try {
    if (!pronto || pronto.url !== url) {
      const r = await fetch(url, { credentials: "same-origin" });
      if (!(r.headers.get("content-type") ?? "").includes("application/pdf")) return void (location.href = url);
      const nome = /filename="?([^";]+)"?/i.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "documento.pdf";
      pronto = { url, file: new File([await r.blob()], nome, { type: "application/pdf" }) };
    }
    await navigator.share({ files: [pronto.file] });
    pronto = null;
  } catch (err) {
    if (err?.name === "NotAllowedError" && pronto) avvisa("PDF pronto: tocchi di nuovo «PDF» per aprirlo.");
    else if (err?.name !== "AbortError") avvisa("Impossibile aprire il PDF.");
  }
}
