import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { Search, Bell, LogOut, Menu, X, ChevronDown, ChevronRight, Plus, Edit, Trash2, Eye, Filter, Download, AlertTriangle, CheckCircle, Clock, Settings, BarChart3, Wrench, Building2, Users, Truck, HardHat, Package, ShoppingCart, FileText, ClipboardList, Receipt, FileOutput, FolderOpen, Shield, Bot, Home, ArrowRight, ArrowLeft, RefreshCw, Activity, TrendingUp, AlertCircle, Zap, Calendar, MapPin, Phone, Mail, Hash, Upload, Save, Palette, Image, UserPlus, UserX, UserCheck, Lock, Unlock, FileUp, Sparkles, Copy, MoreVertical, ChevronUp, Check, XCircle, Loader2 } from "lucide-react";

// ═══════════════════════════════════════════════════════
// THEME ENGINE
// ═══════════════════════════════════════════════════════
const DEFAULT_THEME = {
  primary: "#0891b2",
  primaryLight: "rgba(8,145,178,0.15)",
  primaryGlow: "rgba(8,145,178,0.2)",
  accent: "#06b6d4",
  bg: "#09090b",
  bgCard: "rgba(24,24,27,0.8)",
  bgCardSolid: "#18181b",
  border: "#27272a",
  borderLight: "rgba(39,39,42,0.5)",
  text: "#d4d4d8",
  textMuted: "#71717a",
  textBright: "#ffffff",
  danger: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  fontDisplay: "'Bebas Neue', sans-serif",
  fontBody: "'Rajdhani', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  borderRadius: "12px",
  logoUrl: "",
  companyName: "ERP Ascensori",
  companySubtitle: "Enterprise",
};

const ThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: (t) => {} });
const useTheme = () => useContext(ThemeContext);

const themeToCSS = (t) => ({
  "--c-primary": t.primary,
  "--c-primary-light": t.primaryLight,
  "--c-primary-glow": t.primaryGlow,
  "--c-accent": t.accent,
  "--c-bg": t.bg,
  "--c-bg-card": t.bgCard,
  "--c-border": t.border,
  "--c-text": t.text,
  "--c-text-muted": t.textMuted,
  "--c-text-bright": t.textBright,
  "--c-danger": t.danger,
  "--c-success": t.success,
  "--c-warning": t.warning,
  "--radius": t.borderRadius,
});

// ═══════════════════════════════════════════════════════
// COMPANY SETTINGS
// ═══════════════════════════════════════════════════════
const DEFAULT_COMPANY = {
  ragioneSociale: "La Tua Azienda SRL",
  partitaIva: "IT12345678901",
  codiceFiscale: "12345678901",
  indirizzo: "Via Roma 1",
  citta: "Milano",
  cap: "20121",
  provincia: "MI",
  paese: "Italia",
  telefono: "+39 02 0000000",
  email: "info@azienda.it",
  pec: "azienda@pec.it",
  sito: "www.azienda.it",
  rea: "MI-1234567",
  capitaleSociale: "€ 10.000,00 i.v.",
  prefissoPreventivo: "PRV",
  prefissoOrdine: "OL",
  prefissoFattura: "FT",
  prefissoDDT: "DDT",
  logoUrl: "",
};

// ═══════════════════════════════════════════════════════
// MOCK DATA (mutable)
// ═══════════════════════════════════════════════════════
const DEMO_USER = { id: "u1", nome: "Amministratore", cognome: "Sistema", ruolo: "MASTER", email: "admin@erp-ascensori.it" };

// ═══════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════
const API_BASE = "/api";
const api = {
  token: null,
  refreshToken: null,
  init() {
    this.token = localStorage.getItem("erp_token");
    this.refreshToken = localStorage.getItem("erp_refresh");
  },
  setTokens(access, refresh) {
    this.token = access;
    this.refreshToken = refresh;
    localStorage.setItem("erp_token", access);
    localStorage.setItem("erp_refresh", refresh);
  },
  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem("erp_token");
    localStorage.removeItem("erp_refresh");
    localStorage.removeItem("erp_user");
  },
  async fetch(endpoint, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    try {
      let res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      if (res.status === 401 && this.refreshToken) {
        const rr = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: this.refreshToken }) });
        if (rr.ok) { const d = await rr.json(); this.setTokens(d.accessToken, d.refreshToken); headers["Authorization"] = `Bearer ${d.accessToken}`; res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
        else { this.clearTokens(); window.location.reload(); return null; }
      }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
      return res.json();
    } catch (e) { console.error(`API ${endpoint}:`, e); throw e; }
  },
  get(ep) { return this.fetch(ep); },
  post(ep, body) { return this.fetch(ep, { method: "POST", body }); },
  put(ep, body) { return this.fetch(ep, { method: "PUT", body }); },
  del(ep) { return this.fetch(ep, { method: "DELETE" }); },
  async upload(file) {
    const fd = new FormData();
    fd.append("file", file);
    const headers = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", headers, body: fd });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    return res.json();
  },
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Login fallito"); }
    const data = await res.json();
    this.setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem("erp_user", JSON.stringify(data.user));
    return data;
  },
};
api.init();

// Hook for API data fetching
const useApiData = (endpoint) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    setLoading(true);
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const res = await api.get(`${endpoint}${separator}limit=100`);
      setData(res.data || res || []);
      setError(null);
    } catch (e) {
      setError(e.message);
      console.error(`Fetch ${endpoint}:`, e);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const basePath = endpoint ? endpoint.split("?")[0] : "";
  const add = async (item) => {
    try { const res = await api.post(basePath, item); await fetchData(); return res; }
    catch (e) { throw e; }
  };
  const update = async (id, item) => {
    try { const res = await api.put(`${basePath}/${id}`, item); await fetchData(); return res; }
    catch (e) { throw e; }
  };
  const remove = async (id) => {
    try { await api.del(`${basePath}/${id}`); await fetchData(); }
    catch (e) { throw e; }
  };

  return { data, loading, error, refresh: fetchData, add, update, remove };
};

let nextId = 100;
const genId = () => String(++nextId);

const makeStore = (initial) => {
  let items = [...initial];
  return {
    getAll: () => [...items],
    get: (id) => items.find(i => i.id === id),
    add: (item) => { const n = { ...item, id: genId(), createdAt: new Date().toISOString() }; items.unshift(n); return n; },
    update: (id, data) => { items = items.map(i => i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i); return items.find(i => i.id === id); },
    remove: (id) => { items = items.filter(i => i.id !== id); },
  };
};

const impiantiStore = makeStore([
  { id: "1", matricola: "MI-2024-001", marca: "KONE", modello: "MonoSpace 500", anno: 2020, portata: 630, fermate: 8, quadro: "KONE V3F25 VVVF", stato: "ATTIVO", indirizzo: "Via Garibaldi 22, Milano", condominio: "Residenza del Parco", prossimaRevisione: "2025-04-15", note: "", foto: [{ url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjMDg5MWIyIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0iQXJpYWwiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Gb3RvIENhYmluYTwvdGV4dD48L3N2Zz4=", nome: "Cabina frontale.jpg" }, { url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjZjU5ZTBiIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0iQXJpYWwiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5RdWFkcm8gTWFub3ZyYTwvdGV4dD48L3N2Zz4=", nome: "Quadro manovra.jpg" }], documenti: [{ nome: "Certificato collaudo 2024.pdf", size: 245000, data: "2024-10-15" }, { nome: "Libretto impianto.pdf", size: 1200000, data: "2020-03-01" }] },
  { id: "2", matricola: "MI-2024-002", marca: "Otis", modello: "Gen2 Comfort", anno: 2018, portata: 480, fermate: 6, quadro: "Otis OVF30 VVVF", stato: "ATTIVO", indirizzo: "Piazza Duomo 3, Milano", condominio: "Palazzo Duomo Center", prossimaRevisione: "2025-03-01", note: "", foto: [{ url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjMTBiOTgxIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0iQXJpYWwiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Gb3RvIFBvcnRhPC90ZXh0Pjwvc3ZnPg==", nome: "Porta piano.jpg" }], documenti: [] },
  { id: "3", matricola: "MI-2024-003", marca: "Schindler", modello: "3300", anno: 2015, portata: 1000, fermate: 12, quadro: "Schindler Bionic 2 velocità", stato: "MANUTENZIONE", indirizzo: "Via Garibaldi 22, Milano", condominio: "Residenza del Parco", prossimaRevisione: "2025-02-10", note: "", foto: [], documenti: [{ nome: "Rapporto ispezione ASL.pdf", size: 520000, data: "2025-01-20" }] },
  { id: "4", matricola: "MI-2024-004", marca: "ThyssenKrupp", modello: "Synergy", anno: 2022, portata: 800, fermate: 10, quadro: "TK MC3 VVVF con inverter", stato: "ATTIVO", indirizzo: "Corso Vittorio 18, Milano", condominio: "Torre Moderna", prossimaRevisione: "2025-08-20", note: "", foto: [], documenti: [] },
]);

const condominiStore = makeStore([
  { id: "1", nome: "Residenza del Parco", indirizzo: "Via Garibaldi 22", citta: "Milano", cap: "20121", provincia: "MI", unitaImmobiliari: 24, amministratore: "Giuseppe Verdi", note: "" },
  { id: "2", nome: "Palazzo Duomo Center", indirizzo: "Piazza Duomo 3", citta: "Milano", cap: "20122", provincia: "MI", unitaImmobiliari: 16, amministratore: "Anna Bianchi", note: "" },
  { id: "3", nome: "Torre Moderna", indirizzo: "Corso Vittorio 18", citta: "Milano", cap: "20123", provincia: "MI", unitaImmobiliari: 48, amministratore: "Giuseppe Verdi", note: "" },
]);

const amministratoriStore = makeStore([
  { id: "1", nome: "Giuseppe", cognome: "Verdi", tipo: "SOCIETA", ragioneSociale: "Verdi Gestioni SRL", email: "info@verdigestioni.it", telefono: "+39 02 1234567", pec: "verdi@pec.it", partitaIva: "12345678901", indirizzo: "Via Roma 15, Milano", note: "" },
  { id: "2", nome: "Anna", cognome: "Bianchi", tipo: "PERSONA_FISICA", ragioneSociale: "", email: "anna.bianchi@pec.it", telefono: "+39 02 7654321", pec: "", partitaIva: "", indirizzo: "Corso Buenos Aires 42, Milano", note: "" },
]);

const dipendentiStore = makeStore([
  { id: "1", nome: "Marco", cognome: "Rossi", tipo: "TECNICO", email: "marco.rossi@erp.it", telefono: "+39 333 1111111", specializzazioni: "KONE, Otis", patente: "B", attivo: true, note: "" },
  { id: "2", nome: "Luca", cognome: "Ferrari", tipo: "TECNICO", email: "luca.ferrari@erp.it", telefono: "+39 333 2222222", specializzazioni: "Schindler, ThyssenKrupp", patente: "B", attivo: true, note: "" },
  { id: "3", nome: "Elena", cognome: "Conti", tipo: "AMMINISTRATIVO", email: "elena.conti@erp.it", telefono: "+39 333 3333333", specializzazioni: "", patente: "", attivo: true, note: "" },
]);

const automezziStore = makeStore([
  { id: "1", targa: "FG123AB", marca: "Fiat", modello: "Ducato", anno: 2022, chilometraggio: 45000, stato: "verde", conducente: "Marco Rossi", scadenzaRevisione: "2025-06-30", scadenzaAssicurazione: "2025-12-31", note: "" },
  { id: "2", targa: "HJ456CD", marca: "Iveco", modello: "Daily", anno: 2021, chilometraggio: 68000, stato: "giallo", conducente: "Luca Ferrari", scadenzaRevisione: "2025-03-15", scadenzaAssicurazione: "2025-08-20", note: "" },
]);

const cottimistiStore = makeStore([
  { id: "1", ragioneSociale: "Ascensori Rapidi SNC", tipo: "AZIENDA", partitaIva: "98765432101", email: "info@ascensorirapidi.it", telefono: "+39 02 9999999", indirizzo: "Via Meccanica 10, Milano", attivo: true, note: "" },
]);

const magazzinoStore = makeStore([
  { id: "1", codice: "COMP-001", barcode: "8001234000001", nome: "Fune portante 8mm", tipo: "COMPONENTI", categoria: "Funi", quantita: 50, sogliaMinima: 10, prezzoAcquisto: 12.50, prezzoVendita: 25.00, ubicazione: "A1-01", note: "" },
  { id: "2", codice: "COMP-002", barcode: "8001234000002", nome: "Pattino guida cabina", tipo: "COMPONENTI", categoria: "Guide", quantita: 30, sogliaMinima: 5, prezzoAcquisto: 45.00, prezzoVendita: 85.00, ubicazione: "A1-02", note: "" },
  { id: "3", codice: "COMP-003", barcode: "8001234000003", nome: "Pulsantiera cabina 8P", tipo: "COMPONENTI", categoria: "Elettronica", quantita: 3, sogliaMinima: 3, prezzoAcquisto: 180.00, prezzoVendita: 350.00, ubicazione: "B2-01", note: "" },
  { id: "4", codice: "VEND-001", barcode: "8001234100001", nome: "Kit manutenzione base", tipo: "VENDITA", categoria: "Kit", quantita: 15, sogliaMinima: 5, prezzoAcquisto: 85.00, prezzoVendita: 180.00, ubicazione: "D1-01", note: "" },
  { id: "5", codice: "VEND-002", barcode: "8001234100002", nome: "Olio idraulico 20L", tipo: "VENDITA", categoria: "Lubrificanti", quantita: 2, sogliaMinima: 8, prezzoAcquisto: 65.00, prezzoVendita: 120.00, ubicazione: "D2-01", note: "" },
]);

const preventiviStore = makeStore([
  { id: "1", numero: "PRV-00001", oggetto: "Manutenzione straordinaria KONE", stato: "APPROVATO", totaleLordo: 5490, data: "2025-03-18", amministratore: "Giuseppe Verdi", note: "" },
  { id: "2", numero: "PRV-00002", oggetto: "Sostituzione operatore porte Otis", stato: "INVIATO", totaleLordo: 2800, data: "2025-03-20", amministratore: "Anna Bianchi", note: "" },
]);

const ordiniStore = makeStore([
  { id: "1", numero: "OL-00001", oggetto: "Manutenzione straordinaria KONE MonoSpace", stato: "IN_LAVORO", priorita: "URGENTE", impianto: "MI-2024-001", tecnico: "Marco Rossi", cottimista: "", data: "2025-03-20", noteInterne: "", noteCommittente: "" },
  { id: "2", numero: "OL-00002", oggetto: "Revisione periodica Otis Gen2", stato: "CONFERMATO", priorita: "ORDINARIA", impianto: "MI-2024-002", tecnico: "Luca Ferrari", cottimista: "", data: "2025-03-22", noteInterne: "", noteCommittente: "" },
  { id: "3", numero: "OL-00003", oggetto: "Emergenza blocco Schindler 3300", stato: "EMESSO", priorita: "EMERGENZA", impianto: "MI-2024-003", tecnico: "", cottimista: "", data: "2025-03-25", noteInterne: "", noteCommittente: "" },
]);

const fattureEmesseStore = makeStore([
  { id: "1", numero: "FT-2025-001", stato: "PAGATA", oggetto: "Manutenzione ordinaria Q1", cliente: "Verdi Gestioni SRL", totaleLordo: 3200, totaleNetto: 2622.95, totaleIva: 577.05, data: "2025-01-15", dataScadenza: "2025-02-15", dataPagamento: "2025-02-10", metodoPagamento: "Bonifico 30gg", ordineLavoro: "OL-00001", note: "" },
  { id: "2", numero: "FT-2025-002", stato: "INVIATA", oggetto: "Intervento urgente Schindler", cliente: "Anna Bianchi", totaleLordo: 1850, totaleNetto: 1516.39, totaleIva: 333.61, data: "2025-02-20", dataScadenza: "2025-03-20", dataPagamento: "", metodoPagamento: "Bonifico 60gg", ordineLavoro: "OL-00003", note: "" },
  { id: "3", numero: "FT-2025-004", stato: "SCADUTA", oggetto: "Sostituzione funi ascensore", cliente: "Torre Moderna Condominio", totaleLordo: 5490, totaleNetto: 4500, totaleIva: 990, data: "2025-01-05", dataScadenza: "2025-02-05", dataPagamento: "", metodoPagamento: "Bonifico 30gg", ordineLavoro: "", note: "Sollecito inviato il 15/02" },
  { id: "4", numero: "FT-2025-005", stato: "BOZZA", oggetto: "Contratto manutenzione annuale 2025", cliente: "Residenza del Parco", totaleLordo: 8400, totaleNetto: 6885.25, totaleIva: 1514.75, data: "2025-03-25", dataScadenza: "", dataPagamento: "", metodoPagamento: "", ordineLavoro: "", note: "" },
]);

const fattureRicevuteStore = makeStore([
  { id: "5", numero: "FR-2025-001", stato: "PAGATA", oggetto: "Acquisto componenti KONE", fornitore: "KONE Italia SpA", totaleLordo: 4500, totaleNetto: 3688.52, totaleIva: 811.48, data: "2025-03-01", dataScadenza: "2025-04-01", dataPagamento: "2025-03-28", metodoPagamento: "Bonifico 30gg", numeroFornitore: "INV-KONE-2025-0342", note: "" },
  { id: "6", numero: "FR-2025-002", stato: "EMESSA", oggetto: "Funi e ricambi Schindler", fornitore: "Schindler Ricambi SRL", totaleLordo: 2100, totaleNetto: 1721.31, totaleIva: 378.69, data: "2025-03-10", dataScadenza: "2025-04-10", dataPagamento: "", metodoPagamento: "RiBa 60gg", numeroFornitore: "SCH-2025-1187", note: "" },
  { id: "7", numero: "FR-2025-003", stato: "PAGATA", oggetto: "Materiale elettrico per quadri", fornitore: "Elettro Forniture Milano", totaleLordo: 890, totaleNetto: 729.51, totaleIva: 160.49, data: "2025-02-15", dataScadenza: "2025-03-15", dataPagamento: "2025-03-12", metodoPagamento: "Bonifico 30gg", numeroFornitore: "EFM-4521", note: "" },
]);

const ddtStore = makeStore([
  { id: "1", numero: "DDT-2025-001", data: "2025-03-20", destinatario: "Residenza del Parco", causale: "Trasporto componenti", vettore: "", indirizzoConsegna: "Via Garibaldi 22, Milano", note: "" },
]);

const documentiStore = makeStore([
  { id: "1", titolo: "Cartello Fuori Servizio MI-2024-003", tipo: "CARTELLO_CANTIERE", contenuto: "", data: "2025-03-25", note: "" },
  { id: "2", titolo: "Verbale Chiusura Cantiere OL-00004", tipo: "VERBALE_CANTIERE", contenuto: "", data: "2025-03-15", note: "" },
]);

const usersStore = makeStore([
  { id: "u1", email: "admin@erp-ascensori.it", nome: "Amministratore", cognome: "Sistema", ruolo: "MASTER", attivo: true, password: "••••••••" },
  { id: "u2", email: "tecnico@erp-ascensori.it", nome: "Marco", cognome: "Rossi", ruolo: "TECNICO", attivo: true, password: "••••••••" },
  { id: "u3", email: "elena.conti@erp.it", nome: "Elena", cognome: "Conti", ruolo: "OPERATORE", attivo: true, password: "••••••••" },
]);

// ═══════════════════════════════════════════════════════
// STYLE HELPERS
// ═══════════════════════════════════════════════════════
const STATO_COLORS = {
  ATTIVO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", FERMO: "bg-red-500/20 text-red-400 border-red-500/30",
  MANUTENZIONE: "bg-amber-500/20 text-amber-400 border-amber-500/30", FUORI_SERVIZIO: "bg-red-500/20 text-red-400 border-red-500/30",
  DISMESSO: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", BOZZA: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  EMESSO: "bg-blue-500/20 text-blue-400 border-blue-500/30", CONFERMATO: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  IN_LAVORO: "bg-amber-500/20 text-amber-400 border-amber-500/30", SOSPESO: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  COMPLETATO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", CHIUSO: "bg-zinc-600/20 text-zinc-300 border-zinc-500/30",
  CONTESTATO: "bg-red-500/20 text-red-400 border-red-500/30", ANNULLATO: "bg-zinc-700/20 text-zinc-500 border-zinc-600/30",
  APPROVATO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", INVIATO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  RIFIUTATO: "bg-red-500/20 text-red-400 border-red-500/30", SCADUTO: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  PAGATA: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", STORNATA: "bg-red-500/20 text-red-400 border-red-500/30",
  URGENTE: "bg-amber-500/20 text-amber-400 border-amber-500/30", EMERGENZA: "bg-red-500/20 text-red-400 border-red-500/30",
  ORDINARIA: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  SOCIETA: "bg-blue-500/20 text-blue-400 border-blue-500/30", PERSONA_FISICA: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  TECNICO: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", AMMINISTRATIVO: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  COMMERCIALE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", MAGAZZINIERE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  AZIENDA: "bg-blue-500/20 text-blue-400 border-blue-500/30", COOPERATIVA: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  DITTA_INDIVIDUALE: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  COMPONENTI: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", VENDITA: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CARTELLO_CANTIERE: "bg-amber-500/20 text-amber-400 border-amber-500/30", VERBALE_CANTIERE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CERTIFICATO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", CONTRATTO: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ALTRO: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  APERTA: "bg-red-500/20 text-red-400 border-red-500/30", IN_GESTIONE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  CHIUSA: "bg-zinc-600/20 text-zinc-300 border-zinc-500/30", PERSONA_BLOCCATA: "bg-red-500/20 text-red-400 border-red-500/30",
  GUASTO: "bg-amber-500/20 text-amber-400 border-amber-500/30", RUMORE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  INFILTRAZIONE: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  FULL_RISK: "bg-purple-500/20 text-purple-400 border-purple-500/30", SEMI_INTEGRALE: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  PROGRAMMATA: "bg-blue-500/20 text-blue-400 border-blue-500/30", ESEGUITA: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  STRAORDINARIA: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  OK: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", ANOMALIE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  FERMO_IMPIANTO: "bg-red-500/20 text-red-400 border-red-500/30",
  POSITIVO: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", NEGATIVO: "bg-red-500/20 text-red-400 border-red-500/30",
  CON_PRESCRIZIONI: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DISDETTO: "bg-red-500/20 text-red-400 border-red-500/30",
  MASTER: "bg-red-500/20 text-red-400 border-red-500/30", ADMIN: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DIREZIONE: "bg-amber-500/20 text-amber-400 border-amber-500/30", RESPONSABILE: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  OPERATORE: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", CLIENTE: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

const Badge = ({ value }) => {
  const c = STATO_COLORS[value] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${c}`}>{(value || "").replace(/_/g, " ")}</span>;
};

const Semaforo = ({ v }) => <span className={`inline-block w-3 h-3 rounded-full ${v === "verde" ? "bg-emerald-500" : v === "giallo" ? "bg-amber-500" : "bg-red-500"}`} />;

// ═══════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════
const Card = ({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 backdrop-blur-sm ${onClick ? "cursor-pointer hover:border-cyan-500/40 transition-colors" : ""} ${className}`}>{children}</div>
);

const Btn = ({ children, variant = "primary", size = "md", onClick, icon: Icon, className = "", disabled, loading }) => {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none";
  const v = { primary: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20", secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700", danger: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30", ghost: "hover:bg-zinc-800 text-zinc-400", success: "bg-emerald-600 hover:bg-emerald-500 text-white" };
  const s = { xs: "px-2 py-1 text-[11px] gap-1", sm: "px-3 py-1.5 text-xs gap-1.5", md: "px-4 py-2 text-sm gap-2", lg: "px-5 py-2.5 text-sm gap-2" };
  return <button onClick={onClick} disabled={disabled || loading} className={`${base} ${v[variant]} ${s[size]} ${className}`}>{loading ? <Loader2 size={14} className="animate-spin" /> : Icon && <Icon size={size === "xs" ? 12 : 14} />} {children}</button>;
};

const Input = ({ label, ...props }) => (
  <div className="space-y-1"><label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</label><input {...props} className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors" /></div>
);

const TextArea = ({ label, ...props }) => (
  <div className="space-y-1"><label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</label><textarea {...props} className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none" /></div>
);

const Select = ({ label, children, ...props }) => (
  <div className="space-y-1"><label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</label><select {...props} className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/50 transition-colors">{children}</select></div>
);

// Select per campi relazione: carica le opzioni dall'API e salva l'ID
const RelationSelect = ({ label, endpoint, labelFn, value, onChange, disabled }) => {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    let alive = true;
    api.get(`${endpoint}?limit=100`).then(r => { if (alive) setOptions(r?.data || []); }).catch(() => {});
    return () => { alive = false; };
  }, [endpoint]);
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>
      <select value={value || ""} onChange={onChange} disabled={disabled} className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/50 transition-colors">
        <option value="">— Nessuno —</option>
        {options.map(o => <option key={o.id} value={o.id}>{labelFn(o)}</option>)}
      </select>
    </div>
  );
};

// Escape HTML per i documenti di stampa (evita XSS da campi liberi)
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Date API (ISO) → YYYY-MM-DD per visualizzazione e input type=date
const fmtD = (v) => (v ? String(v).slice(0, 10) : "");

// Nome leggibile per valori relazione: stringa o oggetto annidato dall'API
const relName = (v, ...keys) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  for (const k of keys) if (v[k]) return v[k];
  return [v.nome, v.cognome].filter(Boolean).join(" ") || v.ragioneSociale || v.matricola || v.numero || "";
};

// Gerarchia ruoli (allineata al backend): livello più basso = più permessi
const ROLE_LEVELS_FE = { MASTER: 1, ADMIN: 2, DIREZIONE: 3, RESPONSABILE: 4, TECNICO: 5, OPERATORE: 6, CLIENTE: 7 };
const realRole = () => { try { return JSON.parse(localStorage.getItem("erp_user") || "{}").ruolo || "OPERATORE"; } catch { return "OPERATORE"; } };
// Anteprima ruolo (solo visuale: il backend applica sempre il ruolo reale)
const currentRole = () => localStorage.getItem("erp_role_preview") || realRole();
const hasRole = (minRole) => (ROLE_LEVELS_FE[currentRole()] ?? 9) <= (ROLE_LEVELS_FE[minRole] ?? 1);

// Matrice permessi scaricata da /api/auth/permissions (unica fonte di verità)
let PERM_DATA = null;
try { PERM_DATA = JSON.parse(localStorage.getItem("erp_permissions") || "null"); } catch {}
const caricaPermessi = async () => {
  try { PERM_DATA = await api.get("/auth/permissions"); localStorage.setItem("erp_permissions", JSON.stringify(PERM_DATA)); } catch {}
  return PERM_DATA;
};
// può("fatture", "edit") → bool, secondo il ruolo (o l'anteprima)
const può = (module, action = "view") => {
  const ruolo = currentRole();
  const m = PERM_DATA?.matrice?.[ruolo]?.[module];
  if (m) return !!m[action];
  return hasRole("ADMIN"); // matrice non ancora caricata: prudente
};
// modulo canonico da un endpoint API ("/fatture?tipo=EMESSA" → "fatture")
const moduloDi = (endpoint) => (endpoint || "").replace(/^\//, "").split("?")[0];
const NAV_MODULE = { fatture_emesse: "fatture", fatture_ricevute: "fatture", buoni_lavoro: "buoni-lavoro" };

const SearchBar = ({ value, onChange, placeholder = "Cerca..." }) => (
  <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50" /></div>
);

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"} w-full max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg"><X size={20} className="text-zinc-400" /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

const ConfirmDialog = ({ open, onClose, onConfirm, title, message }) => (
  <Modal open={open} onClose={onClose} title={title || "Conferma eliminazione"}>
    <p className="text-zinc-400 text-sm mb-6">{message || "Sei sicuro? Questa azione non è reversibile."}</p>
    <div className="flex justify-end gap-2">
      <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
      <Btn variant="danger" icon={Trash2} onClick={onConfirm}>Elimina</Btn>
    </div>
  </Modal>
);

const Toast = ({ message, type = "success", onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  const colors = { success: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400", error: "bg-red-500/20 border-red-500/30 text-red-400", info: "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" };
  return (
    <div className={`fixed bottom-4 right-4 z-[60] px-4 py-3 rounded-xl border ${colors[type]} backdrop-blur-sm flex items-center gap-2 shadow-xl animate-[slideUp_0.3s_ease]`}>
      {type === "success" ? <CheckCircle size={16} /> : type === "error" ? <XCircle size={16} /> : <AlertCircle size={16} />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// AI AUTO-FILL BUTTON
// ═══════════════════════════════════════════════════════
const AIAutoFillButton = ({ fields, formData, setFormData, context }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const extractableFields = fields.filter(f => !f.hidden && !["photos", "files", "documents", "relation"].includes(f.type));

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 14 * 1024 * 1024) { setStatus({ type: "error", text: "File troppo grande (max 14 MB)" }); return; }
    setLoading(true);
    setStatus({ type: "info", text: `Lettura di "${file.name}" con AI in corso...` });
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Impossibile leggere il file"));
        r.readAsDataURL(file);
      });
      const fileBase64 = String(dataUrl).split(",")[1] || "";
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const mimeByExt = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", csv: "text/csv", txt: "text/plain", json: "application/json", md: "text/markdown" };
      const res = await api.post("/ai/extract", {
        fileBase64,
        mimeType: file.type || mimeByExt[ext] || "application/octet-stream",
        fileName: file.name,
        entity: context,
        fields: extractableFields.map(f => ({ key: f.key, label: f.label, type: f.type || "text", options: f.options })),
      });
      const extracted = res?.data || {};
      const filledKeys = Object.keys(extracted).filter(k => extractableFields.some(f => f.key === k));
      if (filledKeys.length === 0) {
        setStatus({ type: "error", text: "Nessun dato riconosciuto nel documento. Prova con un file più leggibile." });
        return;
      }
      setFormData(prev => {
        const next = { ...prev };
        filledKeys.forEach(k => {
          const f = extractableFields.find(x => x.key === k);
          let v = extracted[k];
          if (f?.type === "checkbox") v = v === true || ["true", "sì", "si", "1"].includes(String(v).toLowerCase());
          else if (Array.isArray(v)) v = v.join(", ");
          else if (v !== null && typeof v === "object") v = JSON.stringify(v);
          else if (typeof v !== "string") v = String(v);
          next[k] = v;
        });
        return next;
      });
      setStatus({ type: "success", text: `${filledKeys.length} campi compilati da "${file.name}" — verifica i dati prima di salvare` });
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Errore lettura documento" });
    } finally { setLoading(false); }
  };

  return (
    <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-cyan-500/5 to-purple-500/5 border border-cyan-500/20">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn size="sm" variant="primary" icon={Sparkles} onClick={() => fileRef.current?.click()} loading={loading}>Compila da documento (AI)</Btn>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.json,.md" className="hidden" onChange={handleFileUpload} />
        <span className="text-[11px] text-zinc-500">Carica un PDF, una foto o un CSV: l'AI legge il documento e compila i campi del modulo</span>
      </div>
      {status && (
        <p className={`text-[11px] mt-2 flex items-center gap-1.5 ${status.type === "error" ? "text-red-400" : status.type === "success" ? "text-emerald-400" : "text-cyan-400"}`}>
          {status.type === "success" ? <CheckCircle size={12} /> : status.type === "error" ? <XCircle size={12} /> : <Loader2 size={12} className="animate-spin" />}
          {status.text}
        </p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// GENERIC CRUD MODULE PAGE
// ═══════════════════════════════════════════════════════
const CrudModulePage = ({ title, subtitle, store, apiEndpoint, columns, formFields, entityName, filterField, filterOptions }) => {
  const apiData = useApiData(apiEndpoint);
  const [localData, setLocalData] = useState(store ? store.getAll() : []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit' | 'view'
  const [formData, setFormData] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const useApi = !!apiEndpoint;
  const permModule = moduloDi(apiEndpoint);
  const puòCreare = !apiEndpoint || può(permModule, "create");
  const puòModificare = !apiEndpoint || può(permModule, "edit");
  const puòEliminare = !apiEndpoint || può(permModule, "delete");
  const data = useApi ? apiData.data : localData;
  const loading = useApi ? apiData.loading : false;
  const refresh = useApi ? apiData.refresh : () => setLocalData(store.getAll());

  const filtered = data.filter(row => {
    if (filter && filterField && row[filterField] !== filter) return false;
    if (!search) return true;
    return Object.values(row).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase())) || Object.values(row).some(v => typeof v === "number" && String(v).includes(search));
  });

  const openCreate = () => {
    const empty = {};
    formFields.forEach(f => { empty[f.key] = f.default ?? ""; });
    setFormData(empty);
    setSelectedId(null);
    setModalMode("create");
  };

  const openEdit = (row) => {
    setFormData({ ...row });
    setSelectedId(row.id);
    setModalMode("edit");
  };

  const openView = (row) => {
    setFormData({ ...row });
    setSelectedId(row.id);
    setModalMode("view");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modalMode === "create") {
        if (useApi) await apiData.add(formData);
        else { store.add(formData); refresh(); }
        setToast({ message: `${entityName} creato con successo`, type: "success" });
      } else if (modalMode === "edit") {
        if (useApi) await apiData.update(selectedId, formData);
        else { store.update(selectedId, formData); refresh(); }
        setToast({ message: `${entityName} aggiornato`, type: "success" });
      }
      setModalMode(null);
    } catch (e) {
      setToast({ message: `Errore: ${e.message}`, type: "error" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      if (useApi) await apiData.remove(id);
      else { store.remove(id); refresh(); }
      setDeleteConfirm(null);
      setToast({ message: `${entityName} eliminato`, type: "info" });
    } catch (e) {
      setToast({ message: `Errore: ${e.message}`, type: "error" });
    }
  };

  const setField = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const actionCol = {
    key: "_actions", label: "", render: (row) => (
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); openView(row); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400"><Eye size={14} /></button>
        {puòModificare && <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-amber-400"><Edit size={14} /></button>}
        {puòEliminare && <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.id); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>}
      </div>
    )
  };

  const [importModal, setImportModal] = useState(false);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef(null);

  const parseCSV = (text) => {
    const lines = text.trim().split("\n").map(l => l.split(/[,;\t]/).map(c => c.replace(/^"|"$/g, "").trim()));
    if (lines.length < 2) return;
    setCsvHeaders(lines[0]);
    setCsvData(lines.slice(1).filter(r => r.some(c => c)).map(row => {
      const obj = {};
      lines[0].forEach((h, i) => { if (row[i]) obj[h] = row[i]; });
      return obj;
    }));
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(ev.target?.result);
    reader.readAsText(file);
  };

  const aiImportRef = useRef(null);
  const [aiImporting, setAiImporting] = useState(false);
  const handleAiImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAiImporting(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("Lettura file fallita")); r.readAsDataURL(file);
      });
      const extractFields = formFields.filter(f => !f.hidden && !["photos", "files", "relation"].includes(f.type));
      const res = await api.post("/ai/extract", {
        fileBase64: String(dataUrl).split(",")[1] || "",
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
        entity: entityName,
        multi: true,
        fields: extractFields.map(f => ({ key: f.key, label: f.label, type: f.type || "text", options: f.options })),
      });
      const records = res?.records || [];
      if (!records.length) { setToast({ message: "Nessun record riconosciuto nel documento", type: "error" }); return; }
      setCsvHeaders([...new Set(records.flatMap(r => Object.keys(r)))]);
      setCsvData(records);
      setToast({ message: `${records.length} record estratti con AI — controlla l'anteprima e importa`, type: "success" });
    } catch (err) {
      setToast({ message: `AI import: ${err.message}`, type: "error" });
    } finally { setAiImporting(false); }
  };

  const executeImport = async () => {
    if (!csvData.length || !apiEndpoint) return;
    setImporting(true);
    try {
      const modulo = apiEndpoint.replace("/", "").split("?")[0];
      const res = await api.post(`/import/${modulo}`, { records: csvData });
      setToast({ message: `Importati ${res.imported}/${res.total} record${res.errors?.length ? ` (${res.errors.length} errori)` : ""}`, type: res.errors?.length ? "info" : "success" });
      setImportModal(false); setCsvData([]); setCsvHeaders([]);
      if (useApi) await apiData.refresh();
    } catch (e) { setToast({ message: `Import fallito: ${e.message}`, type: "error" }); }
    finally { setImporting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>{title}</h1>{subtitle && <p className="text-zinc-500 text-sm">{subtitle}</p>}</div>
        <div className="flex gap-2">
          {puòCreare && apiEndpoint && <Btn variant="secondary" size="sm" icon={Upload} onClick={() => setImportModal(true)}>Importa CSV</Btn>}
          <Btn variant="secondary" size="sm" icon={Download} onClick={() => {
            const cols = formFields.filter(f => !f.hidden && !["photos", "files"].includes(f.type));
            const valore = (r, f) => {
              if (f.type === "relation") { const rel = r[f.key.replace(/Id$/, "")]; return relName(rel) || r[f.key] || ""; }
              let v = r[f.key];
              if (v === null || v === undefined) return "";
              if (Array.isArray(v)) return v.map(x => x?.nome || x).join(", ");
              if (typeof v === "object") return relName(v) || "";
              if (f.type === "date") return fmtD(v);
              return String(v);
            };
            const cell = (v) => { v = String(v).replace(/"/g, '""'); return /[;"\n]/.test(v) ? `"${v}"` : v; };
            const csv = "\uFEFF" + [cols.map(c => c.label || c.key).join(";"), ...filtered.map(r => cols.map(f => cell(valore(r, f))).join(";"))].join("\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a"); a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, "_")}.csv`; a.click();
            URL.revokeObjectURL(url);
          }}>Esporta CSV</Btn>
          {puòCreare && <Btn icon={Plus} onClick={openCreate}>Nuovo {entityName}</Btn>}
        </div>
      </div>

      <Card className="mb-4">
        <div className="flex gap-3">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder={`Cerca in ${title.toLowerCase()}...`} /></div>
          {filterField && filterOptions && (
            <Select value={filter} onChange={e => setFilter(e.target.value)} label="">
              <option value="">Tutti</option>
              {filterOptions.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
            </Select>
          )}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-zinc-800">{[...columns, actionCol].map(c => <th key={c.key} className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{c.label}</th>)}</tr></thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group cursor-pointer" onDoubleClick={() => puòModificare ? openEdit(row) : openView(row)}>
                  {[...columns, actionCol].map(c => <td key={c.key} className="px-4 py-3 text-sm text-zinc-300">{c.render ? c.render(row) : row[c.key]}</td>)}
                </tr>
              ))}
              {filtered.length === 0 && !loading && <tr><td colSpan={columns.length + 1} className="text-center py-10 text-zinc-600">Nessun record trovato</td></tr>}
              {loading && <tr><td colSpan={columns.length + 1} className="text-center py-10"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /><p className="text-zinc-500 text-sm mt-2">Caricamento...</p></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
          <span className="text-xs text-zinc-600">{filtered.length} record</span>
          <span className="text-xs text-zinc-600">Doppio click per modificare</span>
        </div>
      </Card>

      {/* CREATE / EDIT / VIEW MODAL */}
      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === "create" ? `Nuovo ${entityName}` : modalMode === "edit" ? `Modifica ${entityName}` : `Dettaglio ${entityName}`} wide>
        {modalMode !== "view" && (
          <AIAutoFillButton fields={formFields} formData={formData} setFormData={setFormData} context={entityName} />
        )}
        <div className="grid grid-cols-2 gap-4">
          {formFields.filter(f => !f.hidden).map(f => (
            <div key={f.key} className={f.wide ? "col-span-2" : ""}>
              {f.type === "relation" ? (
                <RelationSelect label={f.label} endpoint={f.endpoint} labelFn={f.labelFn || ((o) => o.nome || o.id)} value={formData[f.key]} onChange={e => setField(f.key, e.target.value || null)} disabled={modalMode === "view"} />
              ) : f.type === "select" ? (
                <Select label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)} disabled={modalMode === "view"}>
                  <option value="">— Seleziona —</option>
                  {f.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                </Select>
              ) : f.type === "textarea" ? (
                <TextArea label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)} rows={3} disabled={modalMode === "view"} />
              ) : f.type === "checkbox" ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{f.label}</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!formData[f.key]} onChange={e => setField(f.key, e.target.checked)} disabled={modalMode === "view"} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-cyan-600 focus:ring-cyan-500" />
                    <span className="text-sm text-zinc-300">{formData[f.key] ? "Sì" : "No"}</span>
                  </label>
                </div>
              ) : f.type === "photos" ? (
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{f.label}</label>
                  <div className="flex flex-wrap gap-2">
                    {(formData[f.key] || []).map((photo, pi) => (
                      <div key={pi} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800">
                        <img src={photo.url} alt={photo.nome || `Foto ${pi + 1}`} className="w-full h-full object-cover" />
                        {modalMode !== "view" && (
                          <button onClick={() => setField(f.key, (formData[f.key] || []).filter((_, i) => i !== pi))}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-300 truncate">{photo.nome || `Foto ${pi + 1}`}</div>
                      </div>
                    ))}
                    {modalMode !== "view" && (
                      <label className="w-20 h-20 rounded-lg border-2 border-dashed border-zinc-700 hover:border-cyan-500/50 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-800/30">
                        <Upload size={16} className="text-zinc-500 mb-1" />
                        <span className="text-[9px] text-zinc-500">Aggiungi</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          for (const file of files) {
                            try {
                              const u = await api.upload(file);
                              setFormData(prev => ({ ...prev, [f.key]: [...(prev[f.key] || []), { url: u.url, nome: u.nome, tipo: u.tipo, data: new Date().toISOString() }] }));
                            } catch (err) { console.error("Upload foto:", err); }
                          }
                        }} />
                      </label>
                    )}
                  </div>
                  {(formData[f.key] || []).length === 0 && modalMode === "view" && <p className="text-xs text-zinc-600 italic">Nessuna foto caricata</p>}
                </div>
              ) : f.type === "files" ? (
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{f.label}</label>
                  <div className="space-y-1">
                    {(formData[f.key] || []).map((doc, di) => (
                      <div key={di} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/40 border border-zinc-700/50 group">
                        <FileText size={14} className="text-cyan-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline truncate block">{doc.nome}</a> : <p className="text-xs text-zinc-300 truncate">{doc.nome}</p>}
                          <p className="text-[10px] text-zinc-600">{doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ""} {doc.data ? `· ${doc.data.slice(0, 10)}` : ""}</p>
                        </div>
                        {modalMode !== "view" && (
                          <button onClick={() => setField(f.key, (formData[f.key] || []).filter((_, i) => i !== di))}
                            className="p-1 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    {modalMode !== "view" && (
                      <label className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-zinc-700 hover:border-cyan-500/50 cursor-pointer transition-colors bg-zinc-800/20">
                        <Upload size={14} className="text-zinc-500" />
                        <span className="text-xs text-zinc-500">Carica documento (PDF, DOC, XLS...)</span>
                        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" multiple className="hidden" onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          for (const file of files) {
                            try {
                              const u = await api.upload(file);
                              setFormData(prev => ({ ...prev, [f.key]: [...(prev[f.key] || []), { url: u.url, nome: u.nome, size: u.size, tipo: u.tipo, data: new Date().toISOString() }] }));
                            } catch (err) { console.error("Upload documento:", err); }
                          }
                        }} />
                      </label>
                    )}
                  </div>
                  {(formData[f.key] || []).length === 0 && modalMode === "view" && <p className="text-xs text-zinc-600 italic">Nessun documento caricato</p>}
                </div>
              ) : (
                <Input label={f.label} type={f.type || "text"} value={f.type === "date" ? fmtD(formData[f.key]) : formData[f.key] ?? ""} onChange={e => setField(f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} disabled={modalMode === "view"} placeholder={f.placeholder} />
              )}
            </div>
          ))}
        </div>
        {modalMode !== "view" && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
            <Btn variant="secondary" onClick={() => setModalMode(null)}>Annulla</Btn>
            <Btn icon={Save} onClick={handleSave} loading={saving}>{modalMode === "create" ? "Crea" : "Salva modifiche"}</Btn>
          </div>
        )}
        {modalMode === "view" && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
            <Btn variant="secondary" onClick={() => setModalMode(null)}>Chiudi</Btn>
            {puòModificare && <Btn variant="primary" icon={Edit} onClick={() => setModalMode("edit")}>Modifica</Btn>}
            {puòEliminare && <Btn variant="danger" icon={Trash2} onClick={() => { setDeleteConfirm(selectedId); setModalMode(null); }}>Elimina</Btn>}
            {!puòModificare && <span />}
          </div>
        )}
      </Modal>

      <Modal open={importModal} onClose={() => { setImportModal(false); setCsvData([]); }} title="Importa da CSV" wide>
        <div className="space-y-4">
          <div className="p-4 rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/20 text-center">
            <Upload size={24} className="mx-auto mb-2 text-zinc-500" />
            <p className="text-sm text-zinc-400 mb-2">Carica file CSV, TSV o incolla i dati</p>
            <div className="flex gap-2 justify-center">
              <Btn variant="secondary" icon={FileUp} onClick={() => importFileRef.current?.click()}>Scegli File CSV</Btn>
              <Btn variant="primary" icon={Sparkles} loading={aiImporting} onClick={() => aiImportRef.current?.click()}>Importa con AI (PDF/foto/CSV)</Btn>
            </div>
            <input ref={importFileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleImportFile} />
            <input ref={aiImportRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt" className="hidden" onChange={handleAiImportFile} />
          </div>
          {csvData.length > 0 && (
            <div>
              <p className="text-sm text-zinc-300 mb-2">{csvData.length} righe trovate — Colonne: <span className="text-cyan-400">{csvHeaders.join(", ")}</span></p>
              <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs"><thead><tr className="bg-zinc-800">{csvHeaders.map(h => <th key={h} className="px-2 py-1.5 text-left text-zinc-400">{h}</th>)}</tr></thead>
                <tbody>{csvData.slice(0, 5).map((row, i) => <tr key={i} className="border-t border-zinc-800/50">{csvHeaders.map(h => <td key={h} className="px-2 py-1 text-zinc-500">{row[h] || ""}</td>)}</tr>)}</tbody></table>
                {csvData.length > 5 && <p className="text-center text-[10px] text-zinc-600 py-1">...e altre {csvData.length - 5} righe</p>}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Btn variant="secondary" onClick={() => { setCsvData([]); setCsvHeaders([]); }}>Annulla</Btn>
                <Btn icon={Upload} onClick={executeImport} loading={importing}>Importa {csvData.length} record</Btn>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => handleDelete(deleteConfirm)} message={`Eliminare definitivamente questo ${entityName.toLowerCase()}? L'operazione non è reversibile.`} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// MODULE CONFIGS — fields + columns per ogni modulo
// ═══════════════════════════════════════════════════════
const IMPIANTI_FIELDS = [
  { key: "matricola", label: "Matricola", placeholder: "MI-2025-XXX" },
  { key: "marca", label: "Marca", placeholder: "KONE, Otis, Schindler..." },
  { key: "modello", label: "Modello", placeholder: "Modello" },
  { key: "anno", label: "Anno", type: "number", placeholder: "2025" },
  { key: "portata", label: "Portata (kg)", type: "number", placeholder: "630" },
  { key: "fermate", label: "Fermate", type: "number", placeholder: "8" },
  { key: "quadro", label: "Quadro di Manovra", placeholder: "Marca, modello, tipo (es: VVVF, 2 velocità...)" },
  { key: "zona", label: "Zona / Giro manutenzione", placeholder: "es. Milano Nord" },
  { key: "stato", label: "Stato", type: "select", options: ["ATTIVO", "FERMO", "MANUTENZIONE", "FUORI_SERVIZIO", "DISMESSO"], default: "ATTIVO" },
  { key: "condominioId", label: "Condominio", type: "relation", endpoint: "/condomini", labelFn: o => o.nome },
  { key: "indirizzo", label: "Indirizzo", wide: true, placeholder: "Via, Città" },
  { key: "prossimaRevisione", label: "Prossima Revisione", type: "date" },
  { key: "note", label: "Note", type: "textarea", wide: true },
  { key: "foto", label: "Foto Impianto", type: "photos", wide: true, default: [] },
  { key: "documenti", label: "Documenti Allegati", type: "files", wide: true, default: [] },
];

const IMPIANTI_COLS = [
  { key: "matricola", label: "Matricola", render: r => <span className="font-mono text-cyan-400 font-bold">{r.matricola}</span> },
  { key: "marca", label: "Marca/Modello", render: r => <span>{r.marca} <span className="text-zinc-500">{r.modello}</span></span> },
  { key: "fermate", label: "Fermate/Portata", render: r => <span className="text-zinc-400">{r.fermate}F / {r.portata}kg</span> },
  { key: "quadro", label: "Quadro", render: r => <span className="text-zinc-400 text-xs">{r.quadro || "—"}</span> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "condominio", label: "Condominio", render: r => <span className="text-zinc-400">{relName(r.condominio, "nome") || "—"}</span> },
  { key: "zona", label: "Zona", render: r => r.zona ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{r.zona}</span> : <span className="text-zinc-600">—</span> },
  { key: "media", label: "Media", render: r => {
    const nf = (r.foto || []).length;
    const nd = (r.documenti || []).length;
    if (nf === 0 && nd === 0) return <span className="text-zinc-600">—</span>;
    return <span className="flex items-center gap-2 text-xs">{nf > 0 && <span className="flex items-center gap-0.5 text-cyan-400" title={`${nf} foto`}><Image size={12} />{nf}</span>}{nd > 0 && <span className="flex items-center gap-0.5 text-zinc-400" title={`${nd} documenti`}><FileText size={12} />{nd}</span>}</span>;
  }},
  { key: "prossimaRevisione", label: "Revisione", render: r => { if (!r.prossimaRevisione) return "—"; const d = Math.ceil((new Date(r.prossimaRevisione) - new Date()) / 86400000); return <span className={d < 0 ? "text-red-400 font-bold" : d <= 30 ? "text-amber-400" : "text-zinc-400"}>{fmtD(r.prossimaRevisione)}</span>; } },
];

const CONDOMINI_FIELDS = [
  { key: "nome", label: "Nome", placeholder: "Nome condominio" },
  { key: "indirizzo", label: "Indirizzo", placeholder: "Via..." },
  { key: "citta", label: "Città", placeholder: "Milano" }, { key: "cap", label: "CAP", placeholder: "20121" }, { key: "provincia", label: "Prov.", placeholder: "MI" },
  { key: "unitaImmobiliari", label: "Unità immobiliari", type: "number" },
  { key: "amministratoreId", label: "Amministratore", type: "relation", endpoint: "/amministratori", labelFn: o => o.ragioneSociale || `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const CONDOMINI_COLS = [
  { key: "nome", label: "Nome", render: r => <span className="text-zinc-200 font-medium">{r.nome}</span> },
  { key: "indirizzo", label: "Indirizzo", render: r => <span className="text-zinc-400">{r.indirizzo}, {r.citta}</span> },
  { key: "unitaImmobiliari", label: "Unità" }, { key: "amministratore", label: "Amministratore", render: r => <span className="text-zinc-400">{relName(r.amministratore) || "—"}</span> },
];

const AMMINISTRATORI_FIELDS = [
  { key: "tipo", label: "Tipo", type: "select", options: ["PERSONA_FISICA", "SOCIETA"], default: "PERSONA_FISICA" },
  { key: "nome", label: "Nome" }, { key: "cognome", label: "Cognome" },
  { key: "ragioneSociale", label: "Ragione Sociale" }, { key: "email", label: "Email", type: "email" }, { key: "telefono", label: "Telefono" },
  { key: "pec", label: "PEC", type: "email" }, { key: "partitaIva", label: "P.IVA" }, { key: "indirizzo", label: "Indirizzo", wide: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const AMMINISTRATORI_COLS = [
  { key: "nome", label: "Nome", render: r => <span className="font-medium">{r.nome} {r.cognome}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "ragioneSociale", label: "Ragione Sociale", render: r => <span className="text-zinc-400">{r.ragioneSociale || "—"}</span> },
  { key: "email", label: "Email", render: r => <span className="text-cyan-400">{r.email}</span> }, { key: "telefono", label: "Telefono" },
];

const DIPENDENTI_FIELDS = [
  { key: "nome", label: "Nome" }, { key: "cognome", label: "Cognome" },
  { key: "tipo", label: "Tipo", type: "select", options: ["TECNICO", "AMMINISTRATIVO", "COMMERCIALE", "MAGAZZINIERE"], default: "TECNICO" },
  { key: "email", label: "Email", type: "email" }, { key: "telefono", label: "Telefono" },
  { key: "patente", label: "Patente" }, { key: "specializzazioni", label: "Specializzazioni", placeholder: "KONE, Otis..." },
  { key: "attivo", label: "Attivo", type: "checkbox", default: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const DIPENDENTI_COLS = [
  { key: "nome", label: "Nome", render: r => <span className="font-medium">{r.nome} {r.cognome}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "email", label: "Email", render: r => <span className="text-cyan-400">{r.email}</span> },
  { key: "telefono", label: "Telefono", render: r => <span className="text-zinc-400">{r.telefono}</span> },
  { key: "attivo", label: "Attivo", render: r => r.attivo ? <span className="text-emerald-400">● Attivo</span> : <span className="text-red-400">● Inattivo</span> },
];

const AUTOMEZZI_FIELDS = [
  { key: "targa", label: "Targa" }, { key: "marca", label: "Marca" }, { key: "modello", label: "Modello" },
  { key: "anno", label: "Anno", type: "number" }, { key: "chilometraggio", label: "Km", type: "number" },
  { key: "stato", label: "Semaforo", type: "select", options: ["verde", "giallo", "rosso"], default: "verde" },
  { key: "conducenteId", label: "Conducente", type: "relation", endpoint: "/dipendenti", labelFn: o => `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "scadenzaRevisione", label: "Scad. Revisione", type: "date" },
  { key: "scadenzaAssicurazione", label: "Scad. Assicurazione", type: "date" }, { key: "note", label: "Note", type: "textarea", wide: true },
];
const AUTOMEZZI_COLS = [
  { key: "targa", label: "Targa", render: r => <span className="font-mono text-cyan-400 font-bold">{r.targa}</span> },
  { key: "v", label: "Veicolo", render: r => <span>{r.marca} {r.modello}</span> },
  { key: "chilometraggio", label: "Km", render: r => <span className="text-zinc-400">{r.chilometraggio?.toLocaleString()} km</span> },
  { key: "stato", label: "Stato", render: r => <Semaforo v={r.stato} /> },
  { key: "conducente", label: "Conducente", render: r => relName(r.conducente) || <span className="text-zinc-600 italic">N/A</span> },
];

const COTTIMISTI_FIELDS = [
  { key: "ragioneSociale", label: "Ragione Sociale" },
  { key: "tipo", label: "Tipo", type: "select", options: ["AZIENDA", "COOPERATIVA", "DITTA_INDIVIDUALE"], default: "AZIENDA" },
  { key: "partitaIva", label: "P.IVA" }, { key: "email", label: "Email", type: "email" }, { key: "telefono", label: "Telefono" },
  { key: "indirizzo", label: "Indirizzo", wide: true }, { key: "attivo", label: "Attivo", type: "checkbox", default: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const COTTIMISTI_COLS = [
  { key: "ragioneSociale", label: "Ragione Sociale", render: r => <span className="font-medium">{r.ragioneSociale}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "email", label: "Email", render: r => <span className="text-cyan-400">{r.email}</span> }, { key: "telefono", label: "Telefono" },
  { key: "attivo", label: "Attivo", render: r => r.attivo ? <span className="text-emerald-400">●</span> : <span className="text-red-400">●</span> },
];

const MAGAZZINO_FIELDS = [
  { key: "codice", label: "Codice" }, { key: "barcode", label: "Barcode" }, { key: "nome", label: "Nome articolo" },
  { key: "tipo", label: "Tipo", type: "select", options: ["COMPONENTI", "VENDITA"], default: "COMPONENTI" },
  { key: "categoria", label: "Categoria" }, { key: "ubicazione", label: "Ubicazione", placeholder: "A1-01" },
  { key: "quantita", label: "Quantità", type: "number", default: 0 }, { key: "sogliaMinima", label: "Soglia minima", type: "number", default: 0 },
  { key: "prezzoAcquisto", label: "Prezzo acquisto €", type: "number" }, { key: "prezzoVendita", label: "Prezzo vendita €", type: "number" },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const MAGAZZINO_COLS = [
  { key: "codice", label: "Codice", render: r => <span className="font-mono text-cyan-400">{r.codice}</span> },
  { key: "nome", label: "Articolo" }, { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "quantita", label: "Qta", render: r => <span className={r.quantita <= r.sogliaMinima ? "text-red-400 font-bold" : ""}>{r.quantita} {r.quantita <= r.sogliaMinima && <AlertTriangle size={12} className="inline ml-1" />}</span> },
  { key: "prezzi", label: "Acq / Vend €", render: r => <span className="text-zinc-400">{r.prezzoAcquisto} / <span className="text-emerald-400">{r.prezzoVendita}</span></span> },
  { key: "ubicazione", label: "Ubicaz.", render: r => <span className="font-mono text-zinc-500">{r.ubicazione}</span> },
];

const PREVENTIVI_FIELDS = [
  { key: "numero", label: "Numero", placeholder: "PRV-XXXXX" }, { key: "oggetto", label: "Oggetto", wide: true },
  { key: "stato", label: "Stato", type: "select", options: ["BOZZA", "INVIATO", "APPROVATO", "RIFIUTATO", "SCADUTO"], default: "BOZZA" },
  { key: "totaleLordo", label: "Totale lordo €", type: "number" },
  { key: "amministratoreId", label: "Amministratore", type: "relation", endpoint: "/amministratori", labelFn: o => o.ragioneSociale || `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.marca || ""} ${o.modello || ""}`.trim() },
  { key: "data", label: "Data", type: "date" },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const PREVENTIVI_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "oggetto", label: "Oggetto" }, { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "totaleLordo", label: "Importo", render: r => <span className="text-emerald-400 font-bold">€ {r.totaleLordo?.toLocaleString()}</span> },
  { key: "data", label: "Data", render: r => <span className="text-zinc-500">{fmtD(r.data)}</span> },
];

const ORDINI_FIELDS = [
  { key: "numero", label: "Numero", placeholder: "OL-XXXXX" }, { key: "oggetto", label: "Oggetto", wide: true },
  { key: "stato", label: "Stato", type: "select", options: ["BOZZA", "EMESSO", "CONFERMATO", "IN_LAVORO", "SOSPESO", "COMPLETATO", "CHIUSO", "CONTESTATO", "ANNULLATO"], default: "BOZZA" },
  { key: "priorita", label: "Priorità", type: "select", options: ["ORDINARIA", "URGENTE", "EMERGENZA"], default: "ORDINARIA" },
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.marca || ""} ${o.modello || ""}`.trim() },
  { key: "tecnicoId", label: "Tecnico", type: "relation", endpoint: "/dipendenti?tipo=TECNICO", labelFn: o => `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "cottimistiId", label: "Cottimista", type: "relation", endpoint: "/cottimisti", labelFn: o => o.ragioneSociale },
  { key: "data", label: "Data", type: "date" },
  { key: "noteInterne", label: "Note interne", type: "textarea", wide: true }, { key: "noteCommittente", label: "Note committente", type: "textarea", wide: true },
];
const ORDINI_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "oggetto", label: "Oggetto", render: r => <span className="max-w-[200px] truncate block">{r.oggetto}</span> },
  { key: "priorita", label: "Priorità", render: r => <Badge value={r.priorita} /> }, { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "impianto", label: "Impianto", render: r => <span className="font-mono text-zinc-400">{relName(r.impianto, "matricola") || "—"}</span> },
  { key: "tecnico", label: "Tecnico", render: r => relName(r.tecnico) || <span className="text-zinc-600 italic">N/A</span> },
];

const FATTURE_EMESSE_FIELDS = [
  { key: "numero", label: "Numero", placeholder: "FT-2025-XXX" },
  { key: "stato", label: "Stato", type: "select", options: ["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"], default: "BOZZA" },
  { key: "oggetto", label: "Oggetto / Descrizione", wide: true },
  { key: "cliente", label: "Cliente / Amministratore", placeholder: "Ragione sociale o nome cliente" },
  { key: "ordineLavoroId", label: "Ordine di Lavoro", type: "relation", endpoint: "/ordini", labelFn: o => `${o.numero} — ${o.oggetto || ""}`.slice(0, 60) },
  { key: "tipo", hidden: true, default: "EMESSA" },
  { key: "metodoPagamento", label: "Metodo Pagamento", type: "select", options: ["Bonifico 30gg", "Bonifico 60gg", "Bonifico 90gg", "RiBa 30gg", "RiBa 60gg", "Contanti", "Carta", "Altro"], default: "" },
  { key: "totaleNetto", label: "Imponibile €", type: "number" },
  { key: "totaleIva", label: "IVA €", type: "number" },
  { key: "totaleLordo", label: "Totale lordo €", type: "number" },
  { key: "data", label: "Data emissione", type: "date" },
  { key: "dataScadenza", label: "Scadenza pagamento", type: "date" },
  { key: "dataPagamento", label: "Data pagamento", type: "date" },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const FATTURE_EMESSE_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "cliente", label: "Cliente", render: r => <span className="text-zinc-300">{r.cliente}</span> },
  { key: "oggetto", label: "Oggetto", render: r => <span className="max-w-[200px] truncate block text-zinc-400">{r.oggetto}</span> },
  { key: "totaleLordo", label: "Importo", render: r => <span className="text-emerald-400 font-bold">€ {r.totaleLordo?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span> },
  { key: "dataScadenza", label: "Scadenza", render: r => {
    if (!r.dataScadenza) return <span className="text-zinc-600">—</span>;
    const d = Math.ceil((new Date(r.dataScadenza) - new Date()) / 86400000);
    return <span className={r.stato === "PAGATA" ? "text-zinc-500 line-through" : d < 0 ? "text-red-400 font-bold" : d <= 7 ? "text-amber-400" : "text-zinc-400"}>{fmtD(r.dataScadenza)}{d < 0 && r.stato !== "PAGATA" ? ` (${Math.abs(d)}gg)` : ""}</span>;
  }},
  { key: "pagamento", label: "Pagata", render: r => r.stato === "PAGATA" ? <span className="text-emerald-400 text-xs">✓ {fmtD(r.dataPagamento)}</span> : r.stato === "SCADUTA" ? <span className="text-red-400 text-xs font-bold">SCADUTA</span> : <span className="text-zinc-600">—</span> },
];

const FATTURE_RICEVUTE_FIELDS = [
  { key: "numero", label: "Numero interno", placeholder: "FR-2025-XXX" },
  { key: "numeroFornitore", label: "Numero fattura fornitore", placeholder: "Numero originale del fornitore" },
  { key: "stato", label: "Stato", type: "select", options: ["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"], default: "EMESSA" },
  { key: "oggetto", label: "Oggetto / Descrizione", wide: true },
  { key: "fornitore", label: "Fornitore", placeholder: "Ragione sociale fornitore" },
  { key: "tipo", hidden: true, default: "RICEVUTA" },
  { key: "metodoPagamento", label: "Metodo Pagamento", type: "select", options: ["Bonifico 30gg", "Bonifico 60gg", "Bonifico 90gg", "RiBa 30gg", "RiBa 60gg", "Contanti", "Carta", "Altro"], default: "" },
  { key: "totaleNetto", label: "Imponibile €", type: "number" },
  { key: "totaleIva", label: "IVA €", type: "number" },
  { key: "totaleLordo", label: "Totale lordo €", type: "number" },
  { key: "data", label: "Data ricezione", type: "date" },
  { key: "dataScadenza", label: "Scadenza pagamento", type: "date" },
  { key: "dataPagamento", label: "Data pagamento", type: "date" },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const FATTURE_RICEVUTE_COLS = [
  { key: "numero", label: "N. Interno", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "numeroFornitore", label: "N. Fornitore", render: r => <span className="font-mono text-zinc-400">{r.numeroFornitore || "—"}</span> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "fornitore", label: "Fornitore", render: r => <span className="text-zinc-300">{r.fornitore}</span> },
  { key: "oggetto", label: "Oggetto", render: r => <span className="max-w-[180px] truncate block text-zinc-400">{r.oggetto}</span> },
  { key: "totaleLordo", label: "Importo", render: r => <span className="text-red-400 font-bold">€ {r.totaleLordo?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span> },
  { key: "dataScadenza", label: "Scadenza", render: r => {
    if (!r.dataScadenza) return <span className="text-zinc-600">—</span>;
    const d = Math.ceil((new Date(r.dataScadenza) - new Date()) / 86400000);
    return <span className={r.stato === "PAGATA" ? "text-zinc-500 line-through" : d < 0 ? "text-red-400 font-bold" : d <= 7 ? "text-amber-400" : "text-zinc-400"}>{fmtD(r.dataScadenza)}</span>;
  }},
  { key: "pagamento", label: "Pagata", render: r => r.stato === "PAGATA" ? <span className="text-emerald-400 text-xs">✓ {fmtD(r.dataPagamento)}</span> : <span className="text-zinc-600">—</span> },
];

const DDT_FIELDS = [
  { key: "numero", label: "Numero" }, { key: "data", label: "Data", type: "date" }, { key: "destinatario", label: "Destinatario", wide: true },
  { key: "causale", label: "Causale" }, { key: "vettore", label: "Vettore" }, { key: "indirizzoConsegna", label: "Indirizzo consegna", wide: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const DDT_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "data", label: "Data", render: r => fmtD(r.data) }, { key: "destinatario", label: "Destinatario" }, { key: "causale", label: "Causale" },
];

const DOC_FIELDS = [
  { key: "titolo", label: "Titolo", wide: true },
  { key: "tipo", label: "Tipo", type: "select", options: ["CARTELLO_CANTIERE", "VERBALE_CANTIERE", "CERTIFICATO", "CONTRATTO", "ALTRO"], default: "ALTRO" },
  { key: "contenuto", label: "Contenuto", type: "textarea", wide: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const DOC_COLS = [
  { key: "titolo", label: "Titolo", render: r => <span className="text-zinc-200">{r.titolo}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "data", label: "Data", render: r => <span className="text-zinc-500">{r.data || r.createdAt?.slice(0, 10)}</span> },
];


// ═══════════════════════════════════════════════════════
// MODULE CONFIGS — Contratti / Visite / Verifiche (DPR 162/99)
// ═══════════════════════════════════════════════════════
const CONTRATTI_FIELDS = [
  { key: "numero", label: "Numero contratto", placeholder: "CTR-2026-XXX" },
  { key: "tipo", label: "Tipo", type: "select", options: ["ORDINARIA", "SEMI_INTEGRALE", "FULL_RISK"], default: "ORDINARIA" },
  { key: "stato", label: "Stato", type: "select", options: ["ATTIVO", "SOSPESO", "DISDETTO", "SCADUTO"], default: "ATTIVO" },
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.marca || ""} ${o.modello || ""}`.trim() },
  { key: "amministratoreId", label: "Amministratore", type: "relation", endpoint: "/amministratori", labelFn: o => o.ragioneSociale || `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "canoneAnnuo", label: "Canone annuo €", type: "number" },
  { key: "visiteAnno", label: "Visite/anno (min 2 — DPR 162/99)", type: "number", default: 2 },
  { key: "dataInizio", label: "Data inizio", type: "date" },
  { key: "dataFine", label: "Data fine", type: "date" },
  { key: "rinnovoAutomatico", label: "Rinnovo automatico", type: "checkbox", default: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const CONTRATTI_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "impianto", label: "Impianto", render: r => <span className="font-mono text-zinc-400">{relName(r.impianto, "matricola") || "—"}</span> },
  { key: "amministratore", label: "Amministratore", render: r => <span className="text-zinc-400">{relName(r.amministratore) || "—"}</span> },
  { key: "canoneAnnuo", label: "Canone", render: r => <span className="text-emerald-400 font-bold">€ {Number(r.canoneAnnuo || 0).toLocaleString("it-IT")}</span> },
  { key: "visiteAnno", label: "Visite/anno", render: r => <span className={Number(r.visiteAnno) < 2 ? "text-red-400 font-bold" : "text-zinc-400"}>{r.visiteAnno}{Number(r.visiteAnno) < 2 ? " ⚠" : ""}</span> },
  { key: "dataFine", label: "Scadenza", render: r => {
    if (!r.dataFine) return <span className="text-zinc-600">—</span>;
    const d = Math.ceil((new Date(r.dataFine) - new Date()) / 86400000);
    return <span className={d < 0 ? "text-red-400 font-bold" : d <= 60 ? "text-amber-400" : "text-zinc-400"}>{fmtD(r.dataFine)}</span>;
  }},
];

const VISITE_FIELDS = [
  { key: "tipo", label: "Tipo visita", type: "select", options: ["ORDINARIA", "STRAORDINARIA", "EMERGENZA"], default: "ORDINARIA" },
  { key: "stato", label: "Stato", type: "select", options: ["PROGRAMMATA", "ESEGUITA", "ANNULLATA"], default: "PROGRAMMATA" },
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.indirizzo || ""}`.trim() },
  { key: "contrattoId", label: "Contratto", type: "relation", endpoint: "/contratti", labelFn: o => o.numero },
  { key: "tecnicoId", label: "Tecnico", type: "relation", endpoint: "/dipendenti?tipo=TECNICO", labelFn: o => `${o.nome || ""} ${o.cognome || ""}`.trim() },
  { key: "dataProgrammata", label: "Data programmata", type: "date" },
  { key: "dataEsecuzione", label: "Data esecuzione", type: "date" },
  { key: "esito", label: "Esito", type: "select", options: ["OK", "ANOMALIE", "FERMO_IMPIANTO"], default: "" },
  { key: "descrizione", label: "Descrizione attività", type: "textarea", wide: true },
  { key: "anomalie", label: "Anomalie riscontrate", type: "textarea", wide: true },
];
const VISITE_COLS = [
  { key: "dataProgrammata", label: "Programmata", render: r => {
    if (!r.dataProgrammata) return <span className="text-zinc-600">—</span>;
    const d = Math.ceil((new Date(r.dataProgrammata) - new Date()) / 86400000);
    const late = r.stato === "PROGRAMMATA" && d < 0;
    return <span className={late ? "text-red-400 font-bold" : "text-zinc-300"}>{fmtD(r.dataProgrammata)}{late ? " (in ritardo)" : ""}</span>;
  }},
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "impianto", label: "Impianto", render: r => <span className="font-mono text-zinc-400">{relName(r.impianto, "matricola") || "—"}{r.impianto?.zona ? <span className="ml-1 text-[10px] text-cyan-400">({r.impianto.zona})</span> : null}</span> },
  { key: "tecnico", label: "Tecnico", render: r => relName(r.tecnico) || <span className="text-zinc-600 italic">N/A</span> },
  { key: "esito", label: "Esito", render: r => r.esito ? <Badge value={r.esito} /> : <span className="text-zinc-600">—</span> },
  { key: "dataEsecuzione", label: "Eseguita", render: r => <span className="text-zinc-500">{fmtD(r.dataEsecuzione) || "—"}</span> },
];

const VERIFICHE_FIELDS = [
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.marca || ""} ${o.modello || ""}`.trim() },
  { key: "dataVerifica", label: "Data verifica", type: "date" },
  { key: "organismo", label: "Organismo abilitato", placeholder: "es. IMQ, Eco Cert..." },
  { key: "esito", label: "Esito", type: "select", options: ["POSITIVO", "NEGATIVO", "CON_PRESCRIZIONI"], default: "" },
  { key: "prossimaScadenza", label: "Prossima scadenza (biennale)", type: "date" },
  { key: "prescrizioni", label: "Prescrizioni", type: "textarea", wide: true },
  { key: "note", label: "Note", type: "textarea", wide: true },
];
const VERIFICHE_COLS = [
  { key: "impianto", label: "Impianto", render: r => <span className="font-mono text-cyan-400 font-bold">{relName(r.impianto, "matricola") || "—"}</span> },
  { key: "dataVerifica", label: "Data verifica", render: r => <span className="text-zinc-300">{fmtD(r.dataVerifica) || "—"}</span> },
  { key: "organismo", label: "Organismo", render: r => <span className="text-zinc-400">{r.organismo || "—"}</span> },
  { key: "esito", label: "Esito", render: r => r.esito ? <Badge value={r.esito} /> : <span className="text-zinc-600">—</span> },
  { key: "prossimaScadenza", label: "Prossima scadenza", render: r => {
    if (!r.prossimaScadenza) return <span className="text-zinc-600">—</span>;
    const d = Math.ceil((new Date(r.prossimaScadenza) - new Date()) / 86400000);
    return <span className={d < 0 ? "text-red-400 font-bold" : d <= 60 ? "text-amber-400" : "text-zinc-400"}>{fmtD(r.prossimaScadenza)} ({d < 0 ? `scaduta da ${Math.abs(d)}gg` : `${d}gg`})</span>;
  }},
  { key: "prescrizioni", label: "Prescrizioni", render: r => r.prescrizioni ? <span className="text-amber-400 text-xs max-w-[200px] truncate block">{r.prescrizioni}</span> : <span className="text-zinc-600">—</span> },
];


// Изтегляне на PDF с Bearer токен
const scaricaPdf = async (path, filename) => {
  const res = await fetch(`/api${path}`, { headers: api.token ? { Authorization: `Bearer ${api.token}` } : {} });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Download fallito"); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};


// ═══════════════════════════════════════════════════════
// SEGNALAZIONI GUASTI (centralino 24h)
// ═══════════════════════════════════════════════════════
const SEGNALAZIONI_FIELDS = [
  { key: "tipo", label: "Tipo", type: "select", options: ["GUASTO", "PERSONA_BLOCCATA", "RUMORE", "INFILTRAZIONE", "ALTRO"], default: "GUASTO" },
  { key: "priorita", label: "Priorità", type: "select", options: ["ORDINARIA", "URGENTE", "EMERGENZA"], default: "ORDINARIA" },
  { key: "stato", label: "Stato", type: "select", options: ["APERTA", "IN_GESTIONE", "CHIUSA"], default: "APERTA" },
  { key: "impiantoId", label: "Impianto", type: "relation", endpoint: "/impianti", labelFn: o => `${o.matricola} — ${o.indirizzo || ""}`.trim() },
  { key: "segnalante", label: "Segnalante" },
  { key: "telefono", label: "Telefono" },
  { key: "canale", label: "Canale", type: "select", options: ["TELEFONO", "EMAIL", "WHATSAPP", "PORTALE"], default: "TELEFONO" },
  { key: "dataApertura", label: "Data apertura", type: "date" },
  { key: "descrizione", label: "Descrizione", type: "textarea", wide: true },
  { key: "notaChiusura", label: "Nota chiusura", type: "textarea", wide: true },
];
const SEGNALAZIONI_COLS = [
  { key: "dataApertura", label: "Aperta il", render: r => <span className="text-zinc-300">{fmtD(r.dataApertura)}</span> },
  { key: "tipo", label: "Tipo", render: r => <Badge value={r.tipo} /> },
  { key: "priorita", label: "Priorità", render: r => <Badge value={r.tipo === "PERSONA_BLOCCATA" ? "EMERGENZA" : r.priorita} /> },
  { key: "stato", label: "Stato", render: r => <Badge value={r.stato} /> },
  { key: "impianto", label: "Impianto", render: r => <span className="font-mono text-zinc-400">{relName(r.impianto, "matricola") || "—"}</span> },
  { key: "segnalante", label: "Segnalante", render: r => <span className="text-zinc-400">{r.segnalante || "—"}{r.telefono ? <span className="text-zinc-600 text-xs"> · {r.telefono}</span> : null}</span> },
  { key: "ordineLavoro", label: "Ordine", render: r => r.ordineLavoro ? <span className="font-mono text-cyan-400">{r.ordineLavoro.numero}</span> : <span className="text-zinc-600">—</span> },
];

const SegnalazioniPage = () => {
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const azione = async (id, path) => {
    try {
      const r = await api.post(`/segnalazioni/${id}/${path}`);
      setToast({ message: r.message || "Fatto", type: "success" });
      setRefreshKey(k => k + 1);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };
  const COLS = [
    ...SEGNALAZIONI_COLS,
    { key: "_azioni", label: "", render: r => (
      <div className="flex gap-1">
        {!r.ordineLavoroId && r.stato !== "CHIUSA" && (
          <button onClick={(e) => { e.stopPropagation(); azione(r.id, "crea-ordine"); }}
            className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Crea ordine di lavoro">
            <ClipboardList size={14} />
          </button>
        )}
        {r.stato !== "CHIUSA" && (
          <button onClick={(e) => { e.stopPropagation(); azione(r.id, "chiudi"); }}
            className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400" title="Chiudi segnalazione">
            <CheckCircle size={14} />
          </button>
        )}
      </div>
    )},
  ];
  return (
    <div>
      <CrudModulePage key={refreshKey} title="SEGNALAZIONI GUASTI" subtitle="Centralino 24h — icone riga: crea ordine di lavoro / chiudi" apiEndpoint="/segnalazioni" columns={COLS} formFields={SEGNALAZIONI_FIELDS} entityName="Segnalazione" filterField="stato" filterOptions={["APERTA", "IN_GESTIONE", "CHIUSA"]} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGE: IMPIANTI (con rendiconto manutenzioni PDF)
// ═══════════════════════════════════════════════════════
const ImpiantiPage = () => {
  const [toast, setToast] = useState(null);
  const COLS = [
    ...IMPIANTI_COLS,
    { key: "_rendiconto", label: "", render: r => (
      <button onClick={async (e) => { e.stopPropagation();
        try { await scaricaPdf(`/pdf/rendiconto/${r.id}`, `Rendiconto_${r.matricola}.pdf`); }
        catch (err) { setToast({ message: err.message, type: "error" }); }
      }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Rendiconto manutenzioni (PDF)">
        <FileOutput size={14} />
      </button>
    )},
  ];
  return (
    <div>
      <CrudModulePage title="IMPIANTI" subtitle="Registro completo con scadenze — icona riga: rendiconto manutenzioni PDF" apiEndpoint="/impianti" columns={COLS} formFields={IMPIANTI_FIELDS} entityName="Impianto" filterField="stato" filterOptions={["ATTIVO", "FERMO", "MANUTENZIONE", "FUORI_SERVIZIO"]} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGE: CONTRATTI (con azioni workflow)
// ═══════════════════════════════════════════════════════
const ContrattiPage = () => {
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(null);
  const azione = async (id, path, refreshHint) => {
    setBusy(id + path);
    try {
      const r = await api.post(`/contratti/${id}/${path}`);
      setToast({ message: r.message || "Operazione completata", type: "success" });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    finally { setBusy(null); }
  };
  const COLS = [
    ...CONTRATTI_COLS,
    { key: "_azioni", label: "", render: r => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); azione(r.id, "genera-visite"); }} disabled={busy === r.id + "genera-visite"}
          className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400 disabled:opacity-40" title="Genera visite programmate">
          <Calendar size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); azione(r.id, "genera-fattura"); }} disabled={busy === r.id + "genera-fattura"}
          className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 disabled:opacity-40" title="Genera fattura canone (bozza)">
          <Receipt size={14} />
        </button>
      </div>
    )},
  ];
  return (
    <div>
      <CrudModulePage title="CONTRATTI DI MANUTENZIONE" subtitle="Canoni, periodicità visite e rinnovi — icone riga: genera visite / fattura canone" apiEndpoint="/contratti" columns={COLS} formFields={CONTRATTI_FIELDS} entityName="Contratto" filterField="stato" filterOptions={["ATTIVO", "SOSPESO", "DISDETTO", "SCADUTO"]} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGE: VISITE con vista calendario
// ═══════════════════════════════════════════════════════
const CalendarioVisite = () => {
  const { data } = useApiData("/visite");
  const [mese, setMese] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const giorni = [];
  const primo = new Date(mese);
  const offset = (primo.getDay() + 6) % 7; // lunedì = 0
  const nGiorni = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
  for (let i = 0; i < offset; i++) giorni.push(null);
  for (let d = 1; d <= nGiorni; d++) giorni.push(new Date(mese.getFullYear(), mese.getMonth(), d));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const visiteDi = (giorno) => data.filter(v => v.dataProgrammata && fmtD(v.dataProgrammata) === ymd(giorno));
  const STATO_DOT = { PROGRAMMATA: "#06b6d4", ESEGUITA: "#10b981", ANNULLATA: "#71717a" };
  const oggi = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <Btn size="sm" variant="secondary" icon={ArrowLeft} onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))}>Prec</Btn>
        <h3 className="text-lg font-bold text-white capitalize" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
          {mese.toLocaleString("it-IT", { month: "long", year: "numeric" })}
        </h3>
        <Btn size="sm" variant="secondary" onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))}>Succ <ArrowRight size={14} /></Btn>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => <div key={g} className="text-[10px] font-bold text-zinc-500 uppercase py-1">{g}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {giorni.map((g, i) => {
          if (!g) return <div key={`e${i}`} />;
          const vs = visiteDi(g);
          const isOggi = ymd(g) === oggi;
          return (
            <div key={i} className={`min-h-[72px] rounded-lg border p-1 ${isOggi ? "border-cyan-500/60 bg-cyan-500/5" : "border-zinc-800 bg-zinc-900/40"}`}>
              <p className={`text-[10px] font-bold ${isOggi ? "text-cyan-400" : "text-zinc-500"}`}>{g.getDate()}</p>
              <div className="space-y-0.5 mt-0.5">
                {vs.slice(0, 3).map(v => (
                  <div key={v.id} className="flex items-center gap-1 px-1 py-0.5 rounded bg-zinc-800/80 overflow-hidden" title={`${v.tipo} — ${relName(v.impianto, "matricola")} ${relName(v.tecnico) ? "· " + relName(v.tecnico) : ""}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATO_DOT[v.stato] || "#71717a" }} />
                    <span className="text-[9px] text-zinc-300 truncate">{relName(v.impianto, "matricola") || v.tipo}</span>
                  </div>
                ))}
                {vs.length > 3 && <p className="text-[9px] text-zinc-500 px-1">+{vs.length - 3} altre</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#06b6d4" }} />Programmata</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#10b981" }} />Eseguita</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#71717a" }} />Annullata</span>
      </div>
    </Card>
  );
};

const VisitePage = () => {
  const [vista, setVista] = useState("lista");
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[{ id: "lista", label: "Lista", icon: ClipboardList }, { id: "calendario", label: "Calendario", icon: Calendar }].map(v => (
          <button key={v.id} onClick={() => setVista(v.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${vista === v.id ? "bg-cyan-600/15 text-cyan-400 border border-cyan-500/20" : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 border border-transparent"}`}><v.icon size={16} />{v.label}</button>
        ))}
      </div>
      {vista === "lista"
        ? <CrudModulePage title="MANUTENZIONI PROGRAMMATE" subtitle="Visite ordinarie (min. 2/anno — DPR 162/99), straordinarie ed emergenze" apiEndpoint="/visite" columns={VISITE_COLS} formFields={VISITE_FIELDS} entityName="Visita" filterField="stato" filterOptions={["PROGRAMMATA", "ESEGUITA", "ANNULLATA"]} />
        : <CalendarioVisite />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGES: USER MANAGEMENT
// ═══════════════════════════════════════════════════════
const UsersPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const res = await api.get("/users");
      setData(res.data || []);
    } catch (e) { console.error("Users load:", e); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const setField = (k, v) => setFormData(p => ({ ...p, [k]: v }));

  const filtered = data.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [u.nome, u.cognome, u.email, u.ruolo].some(v => v && v.toLowerCase().includes(s));
  });

  const openCreate = () => { setFormData({ email: "", nome: "", cognome: "", ruolo: "OPERATORE", attivo: true, password: "" }); setSelectedId(null); setModalMode("create"); };
  const openEdit = (u) => { setFormData({ ...u, password: "" }); setSelectedId(u.id); setModalMode("edit"); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modalMode === "create") { await api.post("/users", formData); setToast({ message: "Utente creato", type: "success" }); }
      else { await api.put(`/users/${selectedId}`, formData); setToast({ message: "Utente aggiornato", type: "success" }); }
      await refresh(); setModalMode(null);
    } catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    try { await api.post(`/users/${u.id}/toggle`); await refresh(); setToast({ message: u.attivo ? "Utente sospeso" : "Utente riattivato", type: "info" }); }
    catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
  };
  const handleDelete = async (id) => {
    try { await api.del(`/users/${id}`); await refresh(); setDeleteConfirm(null); setToast({ message: "Utente eliminato", type: "info" }); }
    catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>GESTIONE UTENTI</h1><p className="text-zinc-500 text-sm">Crea, modifica, sospendi o elimina utenti</p></div>
        <Btn icon={UserPlus} onClick={openCreate}>Nuovo Utente</Btn>
      </div>

      <Card className="mb-4">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Legenda Livelli di Accesso</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { ruolo: "MASTER", livello: "L1", desc: "Accesso totale al sistema. Gestione utenti, impostazioni, audit log. Può vedere e modificare tutto senza restrizioni.", color: "border-red-500/30 bg-red-500/5" },
            { ruolo: "ADMIN", livello: "L2", desc: "Amministrazione completa. Gestione anagrafica, fatturazione, report. Non può modificare utenti MASTER.", color: "border-orange-500/30 bg-orange-500/5" },
            { ruolo: "DIREZIONE", livello: "L3", desc: "Visibilità direzionale. Dashboard, KPI, preventivi, fatture e report aggregati. Nessuna modifica alla configurazione.", color: "border-amber-500/30 bg-amber-500/5" },
            { ruolo: "RESPONSABILE", livello: "L4", desc: "Responsabile di area. Gestisce impianti, ordini lavoro, dipendenti e cottimisti della propria zona.", color: "border-cyan-500/30 bg-cyan-500/5" },
            { ruolo: "TECNICO", livello: "L5", desc: "Operativo sul campo. Vede gli impianti e ordini assegnati, aggiorna stati, carica foto e note tecniche.", color: "border-cyan-500/30 bg-cyan-500/5" },
            { ruolo: "OPERATORE", livello: "L6", desc: "Accesso base. Consultazione dati, inserimento movimenti magazzino e note. Nessuna cancellazione.", color: "border-zinc-500/30 bg-zinc-500/5" },
            { ruolo: "CLIENTE", livello: "L7", desc: "Accesso esterno. Vede solo i propri impianti, preventivi e fatture. Nessuna modifica ai dati.", color: "border-zinc-600/30 bg-zinc-600/5" },
          ].map(r => (
            <div key={r.ruolo} className={`p-3 rounded-lg border ${r.color} transition-colors`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-zinc-500 font-mono">{r.livello}</span>
                <Badge value={r.ruolo} />
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cerca nome, cognome, email, ruolo..." /></Card>

      <Card>
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-800/50">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${u.attivo ? "bg-cyan-600/20 text-cyan-400" : "bg-zinc-700/30 text-zinc-500"}`}>
                  {u.nome?.[0]}{u.cognome?.[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{u.nome} {u.cognome}</p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </div>
                <Badge value={u.ruolo} />
                <span className="text-[10px] font-mono text-zinc-600">L{["MASTER","ADMIN","DIREZIONE","RESPONSABILE","TECNICO","OPERATORE","CLIENTE"].indexOf(u.ruolo) + 1}</span>
                {!u.attivo && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">SOSPESO</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-amber-400 transition-colors" title="Modifica"><Edit size={16} /></button>
                <button onClick={() => toggleActive(u)} className={`p-2 rounded-lg hover:bg-zinc-700 transition-colors ${u.attivo ? "text-zinc-500 hover:text-orange-400" : "text-zinc-500 hover:text-emerald-400"}`} title={u.attivo ? "Sospendi" : "Riattiva"}>
                  {u.attivo ? <UserX size={16} /> : <UserCheck size={16} />}
                </button>
                <button onClick={() => setDeleteConfirm(u.id)} className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors" title="Elimina"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === "create" ? "Nuovo Utente" : "Modifica Utente"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" value={formData.nome || ""} onChange={e => setField("nome", e.target.value)} />
            <Input label="Cognome" value={formData.cognome || ""} onChange={e => setField("cognome", e.target.value)} />
          </div>
          <Input label="Email" type="email" value={formData.email || ""} onChange={e => setField("email", e.target.value)} />
          <Input label={modalMode === "edit" ? "Nuova Password (lascia vuoto per non cambiare)" : "Password"} type="password" value={formData.password || ""} onChange={e => setField("password", e.target.value)} placeholder={modalMode === "edit" ? "••••••••" : ""} />
          <Select label="Ruolo" value={formData.ruolo || "OPERATORE"} onChange={e => setField("ruolo", e.target.value)}>
            {["MASTER", "ADMIN", "DIREZIONE", "RESPONSABILE", "TECNICO", "OPERATORE", "CLIENTE"].map(r => <option key={r} value={r}>{r} (L{["MASTER", "ADMIN", "DIREZIONE", "RESPONSABILE", "TECNICO", "OPERATORE", "CLIENTE"].indexOf(r) + 1})</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Btn variant="secondary" onClick={() => setModalMode(null)}>Annulla</Btn>
            <Btn icon={Save} onClick={handleSave} loading={saving}>{modalMode === "create" ? "Crea Utente" : "Salva"}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => handleDelete(deleteConfirm)} message="Eliminare questo utente? Non potrà più accedere al sistema." />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGES: SETTINGS (Theme + Company + Logo)
// ═══════════════════════════════════════════════════════
const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const [company, setCompany] = useState(() => { try { return JSON.parse(localStorage.getItem("erp_company") || "null") || DEFAULT_COMPANY; } catch { return DEFAULT_COMPANY; } });
  const [tab, setTab] = useState("azienda");
  const [toast, setToast] = useState(null);
  const [logoPreview, setLogoPreview] = useState(theme.logoUrl || "");
  const fileRef = useRef(null);
  const AI_CONFIG_DEFAULT = { provider: "gemini", geminiKey: "", anthropicKey: "", openaiKey: "", testResult: "" };
  const [aiConfig, setAiConfig] = useState(() => { try { return { ...AI_CONFIG_DEFAULT, ...(JSON.parse(localStorage.getItem("erp_ai_config") || "null") || {}) }; } catch { return AI_CONFIG_DEFAULT; } });
  const [aiTesting, setAiTesting] = useState(false);

  const setAiField = (k, v) => setAiConfig(p => ({ ...p, [k]: v }));

  const saveAiConfig = async () => {
    localStorage.setItem("erp_ai_config", JSON.stringify(aiConfig));
    // Try to save to backend env
    try {
      await api.post("/ai/save-config", { provider: aiConfig.provider, geminiKey: aiConfig.geminiKey, anthropicKey: aiConfig.anthropicKey, openaiKey: aiConfig.openaiKey });
      setToast({ message: "Configurazione AI salvata sul server", type: "success" });
    } catch {
      setToast({ message: "Salvata in locale — configura le chiavi nel file .env del server per l'uso in produzione", type: "info" });
    }
  };

  const testAi = async () => {
    setAiTesting(true);
    setAiField("testResult", "");
    try {
      const res = await api.post("/ai/generate", { prompt: "Genera una breve descrizione tecnica di un impianto elevatore KONE MonoSpace 500, 8 fermate, 630kg.", tipo: "TEST" });
      setAiField("testResult", res.testo || "Risposta ricevuta ma vuota");
      setToast({ message: "AI funzionante!", type: "success" });
    } catch (e) {
      setAiField("testResult", `Errore: ${e.message}`);
      setToast({ message: `Test fallito: ${e.message}`, type: "error" });
    } finally { setAiTesting(false); }
  };

  const setCompanyField = (k, v) => setCompany(p => ({ ...p, [k]: v }));

  const saveCompany = () => {
    localStorage.setItem("erp_company", JSON.stringify(company));
    setToast({ message: "Anagrafica salvata", type: "success" });
  };

  const saveTheme = () => {
    localStorage.setItem("erp_theme", JSON.stringify(theme));
    setToast({ message: "Tema salvato", type: "success" });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result;
      setLogoPreview(url);
      setTheme(p => ({ ...p, logoUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  const presetThemes = [
    { name: "Cyan Industriale", primary: "#0891b2", bg: "#09090b" },
    { name: "Emerald", primary: "#10b981", bg: "#09090b" },
    { name: "Amber", primary: "#f59e0b", bg: "#09090b" },
    { name: "Viola", primary: "#8b5cf6", bg: "#09090b" },
    { name: "Rosso", primary: "#ef4444", bg: "#09090b" },
    { name: "Blu", primary: "#3b82f6", bg: "#09090b" },
    { name: "Light Mode", primary: "#0891b2", bg: "#f4f4f5" },
  ];

  const tabs = [
    { id: "azienda", label: "Anagrafica Azienda", icon: Building2 },
    { id: "logo", label: "Logo", icon: Image },
    { id: "tema", label: "Personalizzazione Grafica", icon: Palette },
    { id: "documenti", label: "Prefissi Documenti", icon: FileText },
    { id: "ai", label: "Configurazione AI", icon: Bot },
  ];

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>IMPOSTAZIONI</h1><p className="text-zinc-500 text-sm">Personalizza il sistema: grafica, anagrafica, logo, documenti</p></div>

      <div className="flex gap-2 mb-5">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-cyan-600/15 text-cyan-400 border border-cyan-500/20" : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 border border-transparent"}`}><t.icon size={16} />{t.label}</button>)}
      </div>

      {tab === "azienda" && (
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Anagrafica Società</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Ragione Sociale" value={company.ragioneSociale} onChange={e => setCompanyField("ragioneSociale", e.target.value)} /></div>
            <Input label="Partita IVA" value={company.partitaIva} onChange={e => setCompanyField("partitaIva", e.target.value)} />
            <Input label="Codice Fiscale" value={company.codiceFiscale} onChange={e => setCompanyField("codiceFiscale", e.target.value)} />
            <Input label="Indirizzo" value={company.indirizzo} onChange={e => setCompanyField("indirizzo", e.target.value)} />
            <Input label="Città" value={company.citta} onChange={e => setCompanyField("citta", e.target.value)} />
            <Input label="CAP" value={company.cap} onChange={e => setCompanyField("cap", e.target.value)} />
            <Input label="Provincia" value={company.provincia} onChange={e => setCompanyField("provincia", e.target.value)} />
            <Input label="Paese" value={company.paese} onChange={e => setCompanyField("paese", e.target.value)} />
            <Input label="Telefono" value={company.telefono} onChange={e => setCompanyField("telefono", e.target.value)} />
            <Input label="Email" value={company.email} onChange={e => setCompanyField("email", e.target.value)} />
            <Input label="PEC" value={company.pec} onChange={e => setCompanyField("pec", e.target.value)} />
            <Input label="Sito Web" value={company.sito} onChange={e => setCompanyField("sito", e.target.value)} />
            <Input label="REA" value={company.rea} onChange={e => setCompanyField("rea", e.target.value)} />
            <Input label="Capitale Sociale" value={company.capitaleSociale} onChange={e => setCompanyField("capitaleSociale", e.target.value)} />
          </div>
          <div className="flex justify-end mt-6"><Btn icon={Save} onClick={saveCompany}>Salva Anagrafica</Btn></div>
        </Card>
      )}

      {tab === "logo" && (
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Logo Azienda</h3>
          <div className="flex items-start gap-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-40 h-40 border-2 border-dashed border-zinc-700 rounded-xl flex items-center justify-center overflow-hidden bg-zinc-800/50">
                {logoPreview ? <img src={logoPreview} className="max-w-full max-h-full object-contain" alt="Logo" /> : <Image size={40} className="text-zinc-600" />}
              </div>
              <Btn icon={Upload} variant="secondary" onClick={() => fileRef.current?.click()}>Carica Logo</Btn>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              {logoPreview && <Btn size="xs" variant="ghost" onClick={() => { setLogoPreview(""); setTheme(p => ({ ...p, logoUrl: "" })); }}>Rimuovi logo</Btn>}
            </div>
            <div className="flex-1">
              <p className="text-sm text-zinc-400 mb-2">Il logo apparirà nella sidebar, nelle stampe di preventivi, fatture, DDT e documenti.</p>
              <p className="text-xs text-zinc-600">Formati: PNG, JPG, SVG. Dimensione consigliata: 200×60px.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Input label="Nome azienda (sidebar)" value={theme.companyName} onChange={e => setTheme(p => ({ ...p, companyName: e.target.value }))} />
                <Input label="Sottotitolo" value={theme.companySubtitle} onChange={e => setTheme(p => ({ ...p, companySubtitle: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-6"><Btn icon={Save} onClick={saveTheme}>Salva</Btn></div>
        </Card>
      )}

      {tab === "tema" && (
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Personalizzazione Grafica</h3>
          <div className="mb-6">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Temi Predefiniti</label>
            <div className="flex gap-2 flex-wrap">
              {presetThemes.map(pt => (
                <button key={pt.name} onClick={() => setTheme(p => ({ ...p, primary: pt.primary, bg: pt.bg, primaryLight: `${pt.primary}26`, primaryGlow: `${pt.primary}33`, accent: pt.primary }))}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors">
                  <span className="w-4 h-4 rounded-full" style={{ background: pt.primary }} />
                  <span className="text-xs text-zinc-400">{pt.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Colore Primario</label>
              <div className="flex items-center gap-2"><input type="color" value={theme.primary} onChange={e => setTheme(p => ({ ...p, primary: e.target.value, primaryLight: e.target.value + "26", primaryGlow: e.target.value + "33", accent: e.target.value }))} className="w-10 h-10 rounded-lg border-0 cursor-pointer" /><span className="text-xs text-zinc-500 font-mono">{theme.primary}</span></div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Sfondo</label>
              <div className="flex items-center gap-2"><input type="color" value={theme.bg} onChange={e => setTheme(p => ({ ...p, bg: e.target.value }))} className="w-10 h-10 rounded-lg border-0 cursor-pointer" /><span className="text-xs text-zinc-500 font-mono">{theme.bg}</span></div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pericolo</label>
              <div className="flex items-center gap-2"><input type="color" value={theme.danger} onChange={e => setTheme(p => ({ ...p, danger: e.target.value }))} className="w-10 h-10 rounded-lg border-0 cursor-pointer" /><span className="text-xs text-zinc-500 font-mono">{theme.danger}</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Select label="Font Titoli" value={theme.fontDisplay} onChange={e => setTheme(p => ({ ...p, fontDisplay: e.target.value }))}>
              <option value="'Bebas Neue', sans-serif">Bebas Neue</option>
              <option value="'Rajdhani', sans-serif">Rajdhani</option>
              <option value="'Arial Black', sans-serif">Arial Black</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Impact, sans-serif">Impact</option>
            </Select>
            <Select label="Border Radius" value={theme.borderRadius} onChange={e => setTheme(p => ({ ...p, borderRadius: e.target.value }))}>
              <option value="0px">Nessuno (0px)</option>
              <option value="6px">Leggero (6px)</option>
              <option value="12px">Medio (12px)</option>
              <option value="16px">Arrotondato (16px)</option>
              <option value="24px">Molto arrotondato (24px)</option>
            </Select>
          </div>
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-800/30 mb-4">
            <p className="text-xs text-zinc-500 mb-2">Anteprima:</p>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: theme.primary, borderRadius: theme.borderRadius }}>Pulsante Primario</div>
              <span className="text-sm" style={{ fontFamily: theme.fontDisplay, color: theme.primary, fontSize: "1.5rem" }}>TITOLO ESEMPIO</span>
              <Badge value="ATTIVO" />
            </div>
          </div>
          <div className="flex justify-end"><Btn icon={Save} onClick={saveTheme}>Salva Tema</Btn></div>
        </Card>
      )}

      {tab === "documenti" && (
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Prefissi Documenti</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prefisso Preventivi" value={company.prefissoPreventivo} onChange={e => setCompanyField("prefissoPreventivo", e.target.value)} />
            <Input label="Prefisso Ordini Lavoro" value={company.prefissoOrdine} onChange={e => setCompanyField("prefissoOrdine", e.target.value)} />
            <Input label="Prefisso Fatture" value={company.prefissoFattura} onChange={e => setCompanyField("prefissoFattura", e.target.value)} />
            <Input label="Prefisso DDT" value={company.prefissoDDT} onChange={e => setCompanyField("prefissoDDT", e.target.value)} />
          </div>
          <div className="flex justify-end mt-6"><Btn icon={Save} onClick={saveCompany}>Salva Prefissi</Btn></div>
        </Card>
      )}

      {tab === "ai" && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Provider AI</h3>
            <p className="text-xs text-zinc-500 mb-4">Scegli il provider e inserisci la API key. L'AI legge documenti (PDF, foto, CSV) per compilare i moduli e genera testi per preventivi, cartelli, verbali e descrizioni tecniche.</p>
            <div className="flex gap-3 mb-4">
              {[{ id: "gemini", name: "Google Gemini", desc: "Gemini 2.5 Flash — GRATUITO, consigliato" }, { id: "anthropic", name: "Anthropic Claude", desc: "Claude Sonnet 4" }, { id: "openai", name: "OpenAI GPT", desc: "GPT-4o (no lettura PDF)" }].map(p => (
                <button key={p.id} onClick={() => setAiField("provider", p.id)}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${aiConfig.provider === p.id ? "border-cyan-500 bg-cyan-500/10" : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-3 h-3 rounded-full border-2 ${aiConfig.provider === p.id ? "border-cyan-400 bg-cyan-400" : "border-zinc-600"}`} />
                    <span className={`text-sm font-bold ${aiConfig.provider === p.id ? "text-cyan-400" : "text-zinc-400"}`}>{p.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 ml-5">{p.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">API Keys</h3>
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${aiConfig.provider === "gemini" ? "border-cyan-500/30 bg-cyan-500/5" : "border-zinc-800 bg-zinc-800/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className={aiConfig.provider === "gemini" ? "text-cyan-400" : "text-zinc-600"} />
                  <span className={`text-sm font-bold ${aiConfig.provider === "gemini" ? "text-cyan-400" : "text-zinc-500"}`}>Google Gemini API Key</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">GRATUITA</span>
                  {aiConfig.provider === "gemini" && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">ATTIVO</span>}
                </div>
                <Input label="" type="password" value={aiConfig.geminiKey} onChange={e => setAiField("geminiKey", e.target.value)} placeholder="AIzaSy..." />
                <p className="text-[10px] text-zinc-600 mt-1">Key gratuita in 1 minuto: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">aistudio.google.com/apikey</a> → "Create API key" (serve solo un account Google, nessuna carta di credito)</p>
              </div>

              <div className={`p-4 rounded-lg border ${aiConfig.provider === "anthropic" ? "border-cyan-500/30 bg-cyan-500/5" : "border-zinc-800 bg-zinc-800/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={16} className={aiConfig.provider === "anthropic" ? "text-cyan-400" : "text-zinc-600"} />
                  <span className={`text-sm font-bold ${aiConfig.provider === "anthropic" ? "text-cyan-400" : "text-zinc-500"}`}>Anthropic API Key</span>
                  {aiConfig.provider === "anthropic" && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">ATTIVO</span>}
                </div>
                <Input label="" type="password" value={aiConfig.anthropicKey} onChange={e => setAiField("anthropicKey", e.target.value)} placeholder="sk-ant-api03-..." />
                <p className="text-[10px] text-zinc-600 mt-1">Ottieni la key da: console.anthropic.com → API Keys</p>
              </div>

              <div className={`p-4 rounded-lg border ${aiConfig.provider === "openai" ? "border-cyan-500/30 bg-cyan-500/5" : "border-zinc-800 bg-zinc-800/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className={aiConfig.provider === "openai" ? "text-cyan-400" : "text-zinc-600"} />
                  <span className={`text-sm font-bold ${aiConfig.provider === "openai" ? "text-cyan-400" : "text-zinc-500"}`}>OpenAI API Key</span>
                  {aiConfig.provider === "openai" && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">ATTIVO</span>}
                </div>
                <Input label="" type="password" value={aiConfig.openaiKey} onChange={e => setAiField("openaiKey", e.target.value)} placeholder="sk-proj-..." />
                <p className="text-[10px] text-zinc-600 mt-1">Ottieni la key da: platform.openai.com → API Keys</p>
              </div>
            </div>
            <div className="flex justify-end mt-4"><Btn icon={Save} onClick={saveAiConfig}>Salva Configurazione AI</Btn></div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Test Connessione AI</h3>
            <p className="text-xs text-zinc-500 mb-3">Verifica che la configurazione funzioni inviando una richiesta di test.</p>
            <Btn icon={Zap} onClick={testAi} loading={aiTesting} variant={aiConfig.testResult ? "secondary" : "primary"}>Testa AI</Btn>
            {aiConfig.testResult && (
              <div className={`mt-4 p-4 rounded-lg border text-sm ${aiConfig.testResult.startsWith("Errore") ? "border-red-500/30 bg-red-500/5 text-red-400" : "border-emerald-500/30 bg-emerald-500/5 text-zinc-300"}`}>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{aiConfig.testResult.startsWith("Errore") ? "Errore" : "Risposta AI"}</p>
                <p className="whitespace-pre-wrap">{aiConfig.testResult}</p>
              </div>
            )}
          </Card>

          <Card className="border-amber-500/20">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-2">Nota Importante</h3>
            <p className="text-xs text-zinc-500">Le API key vengono salvate nel browser locale e reinviate al server a ogni accesso. Per l'uso in produzione, configura le variabili d'ambiente <span className="font-mono text-cyan-400">GEMINI_API_KEY</span>, <span className="font-mono text-cyan-400">ANTHROPIC_API_KEY</span> o <span className="font-mono text-cyan-400">OPENAI_API_KEY</span> nel file <span className="font-mono">.env</span> del server. Le chiavi inserite qui sovrascrivono quelle del server quando presenti.</p>
          </Card>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═══════════════════════════════════════════════════════
const DashboardPage = () => {
  const [search, setSearch] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [ordini, setOrdini] = useState([]);
  const [impianti, setImpianti] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [dash, ord, imp] = await Promise.all([
          api.get("/dashboard").catch(() => null),
          api.get("/ordini?limit=10&sortBy=createdAt&sortDir=desc").catch(() => ({ data: [] })),
          api.get("/impianti?limit=100").catch(() => ({ data: [] })),
        ]);
        setDashboard(dash);
        setOrdini(ord?.data || []);
        setImpianti(imp?.data || []);
      } catch (e) { console.error("Dashboard load error:", e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const s = search.toLowerCase();
  const filteredOrdini = ordini.filter(o => !search || [o.numero, o.oggetto, o.stato].some(v => v && v.toLowerCase().includes(s)));
  const filteredImpianti = impianti.filter(i => !search || [i.matricola, i.marca, i.modello, i.indirizzo].some(v => v && v.toLowerCase().includes(s)));
  const cnt = dashboard?.contatori || {};
  const KPI = ({ icon: I, label, value, sub }) => (
    <Card><div className="flex items-start justify-between"><div><p className="text-zinc-500 text-[11px] uppercase tracking-wider mb-1">{label}</p><p className="text-3xl font-bold text-cyan-400">{value ?? "—"}</p>{sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}</div><div className="p-2.5 rounded-lg bg-cyan-500/10"><I size={20} className="text-cyan-400" /></div></div></Card>
  );
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>DASHBOARD</h1>
        <div className="w-72"><SearchBar value={search} onChange={setSearch} placeholder="Cerca ordini, impianti, tecnici..." /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Wrench} label="Impianti" value={cnt.impianti?.totale ?? impianti.length} sub={`${cnt.impianti?.attivi ?? 0} attivi`} />
        <KPI icon={Building2} label="Condomini" value={cnt.condomini ?? "—"} />
        <KPI icon={HardHat} label="Dipendenti" value={cnt.dipendenti ?? "—"} />
        <KPI icon={ClipboardList} label="Ordini" value={ordini.length} sub={`${ordini.filter(o => o.stato === "IN_LAVORO").length} in corso`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-500/30">
          <div className="flex items-center gap-2 mb-3"><AlertTriangle size={16} className="text-red-400" /><h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Alert</h3></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">Revisioni scadute</span><span className="text-red-400 font-bold">{dashboard?.alert?.revisioniScadute ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Revisioni entro 30gg</span><span className="text-amber-400 font-bold">{dashboard?.alert?.revisioniIn30gg ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Fatture non pagate</span><span className="text-orange-400 font-bold">{dashboard?.alert?.fattureNonPagate ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Sotto-scorta</span><span className="text-amber-400 font-bold">{dashboard?.alert?.articoliSottoscorta ?? 0}</span></div>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Ultimi Ordini</h3>
          <div className="space-y-2">{filteredOrdini.slice(0, 5).map(o => (
            <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
              <div><p className="text-sm font-medium text-zinc-200">{o.numero}</p><p className="text-xs text-zinc-500">{o.oggetto}</p></div>
              <div className="flex items-center gap-2"><Badge value={o.priorita} /><Badge value={o.stato} /></div>
            </div>
          ))}{filteredOrdini.length === 0 && <p className="text-zinc-600 text-sm text-center py-4">Nessun ordine</p>}</div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Revisioni Imminenti</h3>
          <div className="space-y-2">{filteredImpianti.filter(i => i.prossimaRevisione).sort((a, b) => new Date(a.prossimaRevisione) - new Date(b.prossimaRevisione)).slice(0, 5).map(i => {
            const d = Math.ceil((new Date(i.prossimaRevisione) - new Date()) / 86400000);
            return (
              <div key={i.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                <div className="flex items-center gap-3"><div className={`w-2 h-8 rounded-full ${d < 0 ? "bg-red-500" : d <= 30 ? "bg-amber-500" : "bg-emerald-500"}`} /><div><p className="text-sm font-medium">{i.matricola}</p><p className="text-xs text-zinc-500">{i.marca} {i.modello}</p></div></div>
                <span className={`text-sm font-bold ${d < 0 ? "text-red-400" : d <= 30 ? "text-amber-400" : "text-emerald-400"}`}>{d < 0 ? `${Math.abs(d)}gg scaduta` : `${d}gg`}</span>
              </div>
            );
          })}{filteredImpianti.length === 0 && <p className="text-zinc-600 text-sm text-center py-4">Nessun impianto</p>}</div>
        </Card>
      </div>
    </div>
  );
};

// AI ASSISTANT PAGE
const AIPage = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Ciao! Sono l'assistente AI. Posso generare descrizioni tecniche, testi preventivi, cartelli fuori servizio, verbali e molto altro. Come posso aiutarti?" }]);
  const [aiLoading, setAiLoading] = useState(false);
  const send = async () => {
    if (!input.trim() || aiLoading) return;
    const userMsg = input;
    setInput("");
    setMessages(p => [...p, { role: "user", text: userMsg }]);
    setAiLoading(true);
    try {
      const history = [...messages.slice(-8), { role: "user", text: userMsg }]
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const res = await api.post("/ai/chat", { messages: history });
      setMessages(p => [...p, { role: "assistant", text: res.content || "Nessuna risposta generata." }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", text: `Errore: ${e.message}. Verifica la configurazione AI in Impostazioni.` }]);
    } finally { setAiLoading(false); }
  };
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>AI ASSISTANT</h1>
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-3 p-4">{messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${m.role === "user" ? "bg-cyan-600 text-white rounded-br-md" : "bg-zinc-800 text-zinc-300 rounded-bl-md"}`}>{m.text}</div>
          </div>
        ))}</div>
        <div className="border-t border-zinc-800 p-4">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Scrivi..." className="flex-1 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50" />
            <Btn onClick={send} loading={aiLoading}>Invia</Btn>
          </div>
          <div className="flex gap-2 mt-2">{["Descrizione impianto", "Testo preventivo", "Cartello fuori servizio", "Verbale cantiere"].map(s => <button key={s} onClick={() => setInput(`Genera: ${s}`)} className="px-3 py-1 rounded-full text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">{s}</button>)}</div>
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PRINT UTILITY
// ═══════════════════════════════════════════════════════
const printDocument = (title, contentHtml) => {
  const w = window.open("", "_blank", "width=800,height=600");
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Rajdhani',Arial,sans-serif;color:#1a1a1a;padding:30px;font-size:13px}
    h1{font-size:22px;text-transform:uppercase;border-bottom:3px solid #0891b2;padding-bottom:8px;margin-bottom:16px;letter-spacing:2px}
    h2{font-size:16px;color:#0891b2;margin:16px 0 8px;text-transform:uppercase}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:1px solid #ddd;padding-bottom:12px}
    .header .company{font-size:11px;color:#666;text-align:right}
    .grid{display:grid;gap:6px}.grid-2{grid-template-columns:1fr 1fr}.grid-3{grid-template-columns:1fr 1fr 1fr}
    .field{padding:6px 10px;border:1px solid #ddd;border-radius:4px;background:#fafafa}
    .field label{display:block;font-size:10px;text-transform:uppercase;color:#888;letter-spacing:1px;font-weight:600}
    .field span{display:block;font-size:13px;font-weight:600;color:#1a1a1a}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background:#0891b2}
    .badge.urgente{background:#f59e0b}.badge.emergenza{background:#ef4444}
    table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}
    th{background:#f0f0f0;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:1px}
    .check-row td{height:32px}.note-box{border:1px solid #ccc;min-height:60px;padding:8px;margin:8px 0;border-radius:4px}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:30px}
    .sig-box{border-top:1px solid #333;padding-top:6px;text-align:center;font-size:11px;color:#666;min-height:50px}
    .footer{margin-top:30px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#888;text-align:center}
    @media print{body{padding:15px}@page{margin:15mm}}
  </style></head><body>${contentHtml}<div class="footer">Stampato da ERP Ascensori Enterprise — ${new Date().toLocaleString("it-IT")}</div></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
};

// ═══════════════════════════════════════════════════════
// PAGE: LAVORI (Programma lavori)
// ═══════════════════════════════════════════════════════
const LAVORI_FIELDS = [
  { key: "commessa", label: "N° Commessa", placeholder: "2026/XXX-X" },
  { key: "ordine", label: "Ordine di Lavoro", placeholder: "OL-XXXXX" },
  { key: "oggetto", label: "Oggetto", wide: true },
  { key: "indirizzo", label: "Indirizzo" },
  { key: "matricola", label: "Matricola impianto" },
  { key: "cliente", label: "Cliente" },
  { key: "cottimista", label: "Cottimista" },
  { key: "tecnico", label: "Tecnico" },
  { key: "stato", label: "Stato", type: "select", options: ["EMESSO", "CONFERMATO", "IN_LAVORO", "SOSPESO", "COMPLETATO"], default: "CONFERMATO" },
  { key: "priorita", label: "Priorità", type: "select", options: ["ORDINARIA", "URGENTE", "EMERGENZA"], default: "ORDINARIA" },
  { key: "dataInizio", label: "Data inizio", type: "date" },
  { key: "dataFinePrevista", label: "Fine prevista", type: "date" },
  { key: "dataFineEffettiva", label: "Fine effettiva", type: "date" },
  { key: "percentuale", label: "Avanzamento %", type: "number", default: 0 },
  { key: "note", label: "Note", type: "textarea", wide: true },
];

const LavoriPage = () => {
  const { data, loading, add, update, remove } = useApiData("/lavori");
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState("");
  const [filterCottimista, setFilterCottimista] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const setField = (k, v) => setFormData(p => ({ ...p, [k]: v }));

  const openCreate = () => { const e = {}; LAVORI_FIELDS.forEach(f => { e[f.key] = f.default ?? ""; }); setFormData(e); setSelectedId(null); setModalMode("create"); };
  const openEdit = (l) => { setFormData({ ...l }); setSelectedId(l.id); setModalMode("edit"); };
  const handleSave = async () => {
    setSaving(true);
    try {
      if (modalMode === "create") { await add(formData); setToast({ message: "Lavoro creato", type: "success" }); }
      else { await update(selectedId, formData); setToast({ message: "Lavoro aggiornato", type: "success" }); }
      setModalMode(null);
    } catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id) => {
    try { await remove(id); setDeleteConfirm(null); setToast({ message: "Lavoro eliminato", type: "info" }); }
    catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
  };

  const cottimisti = [...new Set(data.map(l => l.cottimista).filter(Boolean))];
  const filtered = data.filter(l => {
    if (filterStato && l.stato !== filterStato) return false;
    if (filterCottimista && l.cottimista !== filterCottimista) return false;
    if (search) {
      const s = search.toLowerCase();
      return [l.commessa, l.indirizzo, l.matricola, l.cottimista, l.tecnico, l.oggetto, l.cliente, l.ordine].some(v => v && v.toLowerCase().includes(s));
    }
    return true;
  });
  const attivi = filtered.filter(l => l.stato === "IN_LAVORO" || l.stato === "CONFERMATO");
  const completati = filtered.filter(l => l.stato === "COMPLETATO");

  const COLORS_PRIO = { ORDINARIA: "#71717a", URGENTE: "#f59e0b", EMERGENZA: "#ef4444" };
  const COLORS_STATO = { IN_LAVORO: "#f59e0b", CONFERMATO: "#06b6d4", COMPLETATO: "#10b981", EMESSO: "#3b82f6", SOSPESO: "#f97316" };

  const printProgrammaLavori = () => {
    const rows = filtered.map(l => `<tr>
      <td style="font-weight:700">${esc(l.commessa)}</td><td>${esc(l.indirizzo)}</td><td>${esc(l.matricola)}</td>
      <td>${esc(l.cottimista) || "—"}</td><td>${esc(l.tecnico) || "—"}</td>
      <td><span class="badge${l.priorita === "URGENTE" ? " urgente" : l.priorita === "EMERGENZA" ? " emergenza" : ""}">${esc((l.stato || "").replace(/_/g, " "))}</span></td>
      <td>${fmtD(l.dataInizio)} → ${fmtD(l.dataFinePrevista)}</td><td style="text-align:center;font-weight:700">${l.percentuale ?? 0}%</td>
    </tr>`).join("");
    printDocument("Programma Lavori", `<h1>Programma Lavori in Corso</h1>
      <table><thead><tr><th>Commessa</th><th>Indirizzo</th><th>Matr.</th><th>Cottimista</th><th>Tecnico</th><th>Stato</th><th>Periodo</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>PROGRAMMA LAVORI</h1><p className="text-zinc-500 text-sm">Tutti i lavori in corso e assegnati ai cottimisti</p></div>
        <div className="flex gap-2">
          <Btn size="sm" variant="secondary" icon={Download} onClick={printProgrammaLavori}>Stampa</Btn>
          <Btn icon={Plus} onClick={openCreate}>Nuovo Lavoro</Btn>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card className="!p-3"><p className="text-[10px] text-zinc-500 uppercase">Lavori Attivi</p><p className="text-2xl font-bold text-amber-400">{attivi.length}</p></Card>
        <Card className="!p-3"><p className="text-[10px] text-zinc-500 uppercase">Completati</p><p className="text-2xl font-bold text-emerald-400">{completati.length}</p></Card>
        <Card className="!p-3"><p className="text-[10px] text-zinc-500 uppercase">Cottimisti Impegnati</p><p className="text-2xl font-bold text-cyan-400">{cottimisti.length}</p></Card>
        <Card className="!p-3"><p className="text-[10px] text-zinc-500 uppercase">Emergenze</p><p className="text-2xl font-bold text-red-400">{data.filter(l => l.priorita === "EMERGENZA" && l.stato !== "COMPLETATO").length}</p></Card>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-[200px]"><SearchBar value={search} onChange={setSearch} placeholder="Cerca commessa, indirizzo, matricola, cottimista, tecnico..." /></div>
          <select value={filterStato} onChange={e => setFilterStato(e.target.value)} className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300">
            <option value="">Tutti gli stati</option>
            {["IN_LAVORO", "CONFERMATO", "EMESSO", "SOSPESO", "COMPLETATO"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={filterCottimista} onChange={e => setFilterCottimista(e.target.value)} className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300">
            <option value="">Tutti i cottimisti</option>
            {cottimisti.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Card>

      {/* Lavori Cards */}
      <div className="space-y-3">
        {filtered.map(l => {
          const totalDays = Math.max(1, Math.ceil((new Date(l.dataFinePrevista) - new Date(l.dataInizio)) / 86400000));
          const elapsed = Math.max(0, Math.ceil((new Date() - new Date(l.dataInizio)) / 86400000));
          const overdue = l.stato !== "COMPLETATO" && new Date() > new Date(l.dataFinePrevista);
          return (
            <Card key={l.id} className={`!p-0 overflow-hidden ${overdue ? "border-red-500/40" : ""}`}>
              <div className="flex">
                {/* Color bar */}
                <div className="w-1.5 shrink-0" style={{ background: COLORS_PRIO[l.priorita] || "#71717a" }} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-cyan-400 font-bold text-sm">{l.commessa}</span>
                        {l.ordine && <span className="text-xs text-zinc-600">({l.ordine})</span>}
                        <Badge value={l.priorita} />
                        <Badge value={l.stato} />
                        {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">IN RITARDO</span>}
                      </div>
                      <p className="text-zinc-200 font-medium">{l.oggetto}</p>
                      <p className="text-xs text-zinc-500 flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1"><MapPin size={12} />{l.indirizzo}</span>
                        <span className="flex items-center gap-1"><Hash size={12} />Matr. {l.matricola}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-start gap-2">
                      <p className="text-3xl font-bold" style={{ color: l.percentuale === 100 ? "#10b981" : l.percentuale > 50 ? "#06b6d4" : "#f59e0b" }}>{l.percentuale}%</p>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-amber-400" title="Modifica"><Edit size={14} /></button>
                        <button onClick={() => setDeleteConfirm(l.id)} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400" title="Elimina"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-zinc-800 rounded-full h-2 mb-3">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${l.percentuale}%`, background: l.percentuale === 100 ? "#10b981" : l.percentuale > 50 ? "#06b6d4" : "#f59e0b" }} />
                  </div>
                  {/* Details row */}
                  <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} />{fmtD(l.dataInizio)} → {fmtD(l.dataFinePrevista)}</span>
                    {l.cottimista && <span className="flex items-center gap-1 text-cyan-400"><HardHat size={12} />{l.cottimista}</span>}
                    {l.tecnico && <span className="flex items-center gap-1"><Wrench size={12} />{l.tecnico}</span>}
                    <span>{l.cliente}</span>
                    {l.dataFineEffettiva && <span className="text-emerald-400">Completato: {fmtD(l.dataFineEffettiva)}</span>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && !loading && <Card><p className="text-center text-zinc-600 py-8">Nessun lavoro trovato — crea il primo con "Nuovo Lavoro"</p></Card>}
      </div>

      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === "create" ? "Nuovo Lavoro" : "Modifica Lavoro"} wide>
        <AIAutoFillButton fields={LAVORI_FIELDS} formData={formData} setFormData={setFormData} context="Programma Lavori" />
        <div className="grid grid-cols-2 gap-4">
          {LAVORI_FIELDS.map(f => (
            <div key={f.key} className={f.wide ? "col-span-2" : ""}>
              {f.type === "select" ? <Select label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)}><option value="">—</option>{f.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</Select>
              : f.type === "textarea" ? <TextArea label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)} rows={3} />
              : <Input label={f.label} type={f.type || "text"} value={f.type === "date" ? fmtD(formData[f.key]) : formData[f.key] ?? ""} onChange={e => setField(f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} placeholder={f.placeholder} />}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
          <Btn variant="secondary" onClick={() => setModalMode(null)}>Annulla</Btn>
          <Btn icon={Save} onClick={handleSave} loading={saving}>{modalMode === "create" ? "Crea" : "Salva"}</Btn>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => handleDelete(deleteConfirm)} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGE: BUONO DI LAVORO
// ═══════════════════════════════════════════════════════
const BUONO_FIELDS = [
  { key: "numero", label: "Numero BDL", placeholder: "BDL-2026-XXX" },
  { key: "dataConferma", label: "Data conferma", type: "date" },
  { key: "ordine", label: "Ordine di Lavoro", placeholder: "OL-XXXXX" },
  { key: "offerta", label: "N° Offerta/Preventivo" },
  { key: "commessa", label: "N° Commessa" },
  { key: "matricola", label: "Matricola impianto" },
  { key: "ubicazione", label: "Ubicazione impianto", wide: true },
  { key: "geometra", label: "Geometra / Responsabile" },
  { key: "tecnicoCapo", label: "Capo Tecnico" },
  { key: "cottimista", label: "Cottimista / Subappaltatore" },
  { key: "posConsegnato", label: "P.O.S. consegnato", type: "checkbox", default: false },
  { key: "dataInizio", label: "Data inizio lavori", type: "date" },
  { key: "oraInizio", label: "Ora inizio", placeholder: "08:00" },
  { key: "dataFine", label: "Data fine lavori", type: "date" },
  { key: "oraFine", label: "Ora fine", placeholder: "17:00" },
  { key: "sequenzeLavoro", label: "Sequenze di lavoro (elenco attività)", type: "textarea", wide: true },
  { key: "controlliExtracorsa", label: "Prova extra-corsa", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "controlliLimitatore", label: "Prova limitatore velocità", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "controlliSicurezza", label: "Verifica organi sicurezza (cunei)", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "controlliSerrature", label: "Controllo serrature", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "controlliPorte", label: "Controllo sicurezza porte esterne", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "controlliCircuito", label: "Controllo circuito di cabina", type: "select", options: ["", "OK", "NON OK"], default: "" },
  { key: "noteEsecuzione", label: "Note e commenti esecuzione", type: "textarea", wide: true },
  { key: "noteSospensioni", label: "Eventuali sospensioni", type: "textarea", wide: true },
];
const BUONO_COLS = [
  { key: "numero", label: "Numero", render: r => <span className="font-mono text-cyan-400 font-bold">{r.numero}</span> },
  { key: "commessa", label: "Commessa", render: r => <span className="font-mono text-zinc-400">{r.commessa}</span> },
  { key: "matricola", label: "Matr.", render: r => <span className="font-mono">{r.matricola}</span> },
  { key: "ubicazione", label: "Ubicazione", render: r => <span className="text-zinc-400 max-w-[180px] truncate block">{r.ubicazione}</span> },
  { key: "cottimista", label: "Cottimista", render: r => <span className="text-cyan-400">{r.cottimista || "—"}</span> },
  { key: "tecnicoCapo", label: "Capo Tecnico" },
  { key: "dataInizio", label: "Inizio", render: r => <span className="text-zinc-500">{fmtD(r.dataInizio)}</span> },
  { key: "controlli", label: "Controlli", render: r => {
    const checks = [r.controlliExtracorsa, r.controlliLimitatore, r.controlliSicurezza, r.controlliSerrature, r.controlliPorte, r.controlliCircuito].filter(Boolean);
    const ok = checks.filter(c => c === "OK").length;
    return checks.length > 0 ? <span className={ok === checks.length ? "text-emerald-400" : "text-amber-400"}>{ok}/{checks.length} OK</span> : <span className="text-zinc-600">—</span>;
  }},
];

const printBuonoDiLavoro = (b) => {
  const cEsito = (v) => v === "OK" ? "✓ OK" : v === "NON OK" ? "✗ NON OK" : "";
  const seqRows = (b.sequenzeLavoro || "").split("\n").filter(Boolean).map((s, i) => `<tr><td style="width:30px;text-align:center">${i + 1}</td><td>${esc(s.replace(/^\d+[\.\)]\s*/, ""))}</td><td style="width:60px"></td><td style="width:60px"></td><td style="width:100px"></td><td style="width:120px"></td></tr>`).join("");
  printDocument(`Buono di Lavoro ${esc(b.numero)}`, `
    <h1>BUONO DI LAVORO</h1>
    <h2>Dati Generali</h2>
    <div class="grid grid-3">
      <div class="field"><label>Data conferma</label><span>${fmtD(b.dataConferma) || "—"}</span></div>
      <div class="field"><label>Geometra</label><span>${esc(b.geometra) || "—"}</span></div>
      <div class="field"><label>N° BDL</label><span>${esc(b.numero)}</span></div>
    </div>
    <div class="grid grid-3" style="margin-top:6px">
      <div class="field"><label>Ordine n°</label><span>${esc(b.ordine) || "—"} ${b.ordine ? "(Ordine da preventivo)" : ""}</span></div>
      <div class="field"><label>Offerta n°</label><span>${esc(b.offerta) || "—"}</span></div>
      <div class="field"><label>Commessa n°</label><span>${esc(b.commessa) || "—"}</span></div>
    </div>
    <div class="grid grid-2" style="margin-top:6px">
      <div class="field"><label>Matricola impianto</label><span>${esc(b.matricola) || "—"}</span></div>
      <div class="field"><label>Ubicazione</label><span>${esc(b.ubicazione) || "—"}</span></div>
    </div>
    <div class="grid grid-2" style="margin-top:6px">
      <div class="field"><label>Cottimista / Subappaltatore</label><span>${esc(b.cottimista) || "—"}</span></div>
      <div class="field"><label>P.O.S.</label><span>${b.posConsegnato ? "✓ Consegnato" : "☐ Non consegnato"}</span></div>
    </div>
    ${b.noteEsecuzione ? `<div class="field" style="margin-top:6px"><label>Note e commenti</label><span>${esc(b.noteEsecuzione)}</span></div>` : ""}

    <h2>Sequenze di Lavoro</h2>
    <table><thead><tr><th>N.</th><th>Descrizione attività</th><th>OK</th><th>NON OK</th><th>Data / Firma</th><th>Fornitore rif.</th></tr></thead><tbody>${seqRows || '<tr><td colspan="6" style="text-align:center;color:#999">Nessuna sequenza definita</td></tr>'}</tbody></table>

    <h2>Controlli</h2>
    <table>
      <thead><tr><th>Descrizione</th><th>Esito</th></tr></thead>
      <tbody>
        <tr><td>Prova degli extra-corsa</td><td>${cEsito(b.controlliExtracorsa)}</td></tr>
        <tr><td>Prova del limitatore di velocità</td><td>${cEsito(b.controlliLimitatore)}</td></tr>
        <tr><td>Verifica degli organi di sicurezza (cunei)</td><td>${cEsito(b.controlliSicurezza)}</td></tr>
        <tr><td colspan="2" style="font-weight:700;background:#f0f0f0">IN CASO DI SOSTITUZIONE QUADRO DI MANOVRA</td></tr>
        <tr><td>Controllo serrature</td><td>${cEsito(b.controlliSerrature)}</td></tr>
        <tr><td>Controllo sicurezza porte esterne</td><td>${cEsito(b.controlliPorte)}</td></tr>
        <tr><td>Controllo circuito di cabina</td><td>${cEsito(b.controlliCircuito)}</td></tr>
      </tbody>
    </table>
    ${b.noteSospensioni ? `<div class="field"><label>Eventuali sospensioni</label><span>${esc(b.noteSospensioni)}</span></div>` : ""}

    <h2>Resoconto Attività</h2>
    <div class="grid grid-2">
      <div class="field"><label>Data inizio lavori</label><span>${fmtD(b.dataInizio) || "___/___/______"} ore ${esc(b.oraInizio) || "____"}</span></div>
      <div class="field"><label>Data fine lavori</label><span>${fmtD(b.dataFine) || "___/___/______"} ore ${esc(b.oraFine) || "____"}</span></div>
    </div>

    <div class="signatures">
      <div class="sig-box">Firma del Custode / Responsabile in loco<br><br>${esc(b.firmaCustode) || ""}</div>
      <div class="sig-box">Cognome dei Tecnici<br><br>${esc(b.firmaTecnico) || ""}</div>
      <div class="sig-box">Firma del Capo Tecnico<br><br>${esc(b.tecnicoCapo) || ""}</div>
      <div class="sig-box">Firma del Geometra<br><br>${esc(b.firmaGeometra) || ""}</div>
    </div>
  `);
};

// Wrap CrudModulePage with print button for Preventivi
const PreventiviPageWithPrint = () => {
  const printPreventivo = (p) => {
    printDocument(`Preventivo ${p.numero}`, `
      <h1>PREVENTIVO ${esc(p.numero)}</h1>
      <div class="grid grid-2">
        <div class="field"><label>Numero</label><span>${esc(p.numero)}</span></div>
        <div class="field"><label>Data</label><span>${fmtD(p.data) || "—"}</span></div>
        <div class="field"><label>Stato</label><span class="badge">${esc(p.stato?.replace(/_/g, " "))}</span></div>
        <div class="field"><label>Amministratore</label><span>${esc(relName(p.amministratore)) || "—"}</span></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Oggetto</label><span>${esc(p.oggetto) || "—"}</span></div>
      <table style="margin-top:16px">
        <thead><tr><th style="width:60%">Descrizione</th><th>Importo</th></tr></thead>
        <tbody><tr><td>${esc(p.oggetto) || "—"}</td><td style="text-align:right;font-weight:700">€ ${Number(p.totaleLordo || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr></tbody>
        <tfoot><tr><td style="text-align:right;font-weight:700;border-top:2px solid #333">TOTALE LORDO</td><td style="text-align:right;font-weight:700;font-size:16px;border-top:2px solid #333">€ ${Number(p.totaleLordo || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr></tfoot>
      </table>
      ${p.note ? `<div class="field" style="margin-top:12px"><label>Note e condizioni</label><span style="white-space:pre-wrap">${esc(p.note)}</span></div>` : ""}
      <p style="margin-top:20px;font-size:11px;color:#888">Offerta valida 30 giorni dalla data di emissione.</p>
      <div class="signatures" style="margin-top:30px"><div class="sig-box">Timbro e Firma Azienda</div><div class="sig-box">Firma per Accettazione Cliente</div></div>
    `);
  };
  const PREV_COLS_PRINT = [
    ...PREVENTIVI_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printPreventivo(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  return <CrudModulePage title="PREVENTIVI" subtitle="Offerte commerciali — con stampa" store={preventiviStore} apiEndpoint="/preventivi" columns={PREV_COLS_PRINT} formFields={PREVENTIVI_FIELDS} entityName="Preventivo" filterField="stato" filterOptions={["BOZZA","INVIATO","APPROVATO","RIFIUTATO"]} />;
};

// Wrap CrudModulePage with print button for Fatture Emesse
const FattureEmessePageWithPrint = () => {
  const printFattura = (f) => {
    printDocument(`Fattura ${f.numero}`, `
      <h1>FATTURA ${esc(f.numero)}</h1>
      <div class="grid grid-2">
        <div class="field"><label>Numero</label><span>${esc(f.numero)}</span></div>
        <div class="field"><label>Data emissione</label><span>${fmtD(f.data) || "—"}</span></div>
        <div class="field"><label>Stato</label><span class="badge">${esc(f.stato?.replace(/_/g, " "))}</span></div>
        <div class="field"><label>Scadenza pagamento</label><span>${fmtD(f.dataScadenza) || "—"}</span></div>
      </div>
      <div class="grid grid-2" style="margin-top:8px">
        <div class="field"><label>Cliente</label><span>${esc(f.cliente || relName(f.amministratore)) || "—"}</span></div>
        <div class="field"><label>Metodo pagamento</label><span>${esc(f.metodoPagamento) || "—"}</span></div>
      </div>
      ${f.ordineLavoro ? `<div class="field" style="margin-top:8px"><label>Ordine di Lavoro</label><span>${esc(relName(f.ordineLavoro, "numero"))}</span></div>` : ""}
      <div class="field" style="margin-top:8px"><label>Oggetto</label><span>${esc(f.oggetto) || "—"}</span></div>
      <table style="margin-top:16px">
        <thead><tr><th style="width:60%">Descrizione</th><th>Importo</th></tr></thead>
        <tbody><tr><td>${esc(f.oggetto) || "—"}</td><td style="text-align:right">€ ${Number(f.totaleNetto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr></tbody>
        <tfoot>
          <tr><td style="text-align:right">Imponibile</td><td style="text-align:right">€ ${Number(f.totaleNetto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="text-align:right">IVA</td><td style="text-align:right">€ ${Number(f.totaleIva || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="text-align:right;font-weight:700;border-top:2px solid #333">TOTALE</td><td style="text-align:right;font-weight:700;font-size:16px;border-top:2px solid #333">€ ${Number(f.totaleLordo || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
        </tfoot>
      </table>
      ${f.note ? `<div class="field" style="margin-top:12px"><label>Note</label><span>${esc(f.note)}</span></div>` : ""}
      ${f.dataPagamento ? `<div class="field" style="margin-top:8px"><label>Pagata il</label><span>${fmtD(f.dataPagamento)}</span></div>` : ""}
    `);
  };
  const FE_COLS_PRINT = [
    ...FATTURE_EMESSE_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printFattura(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  return <CrudModulePage title="FATTURE EMESSE" subtitle="Fatture in uscita — con stampa" store={fattureEmesseStore} apiEndpoint="/fatture?tipo=EMESSA" columns={FE_COLS_PRINT} formFields={FATTURE_EMESSE_FIELDS} entityName="Fattura" filterField="stato" filterOptions={["BOZZA","EMESSA","INVIATA","PAGATA","SCADUTA","STORNATA"]} />;
};

// Wrap CrudModulePage with print button for Fatture Ricevute
const FattureRicevutePageWithPrint = () => {
  const printFattura = (f) => {
    printDocument(`Fattura Ricevuta ${f.numero}`, `
      <h1>FATTURA RICEVUTA ${esc(f.numero)}</h1>
      <div class="grid grid-2">
        <div class="field"><label>N. Interno</label><span>${esc(f.numero)}</span></div>
        <div class="field"><label>N. Fornitore</label><span>${esc(f.numeroFornitore) || "—"}</span></div>
        <div class="field"><label>Data ricezione</label><span>${fmtD(f.data) || "—"}</span></div>
        <div class="field"><label>Scadenza</label><span>${fmtD(f.dataScadenza) || "—"}</span></div>
      </div>
      <div class="grid grid-2" style="margin-top:8px">
        <div class="field"><label>Fornitore</label><span>${esc(f.fornitore) || "—"}</span></div>
        <div class="field"><label>Metodo pagamento</label><span>${esc(f.metodoPagamento) || "—"}</span></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Oggetto</label><span>${esc(f.oggetto) || "—"}</span></div>
      <table style="margin-top:16px">
        <thead><tr><th style="width:60%">Descrizione</th><th>Importo</th></tr></thead>
        <tbody><tr><td>${esc(f.oggetto) || "—"}</td><td style="text-align:right">€ ${Number(f.totaleNetto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr></tbody>
        <tfoot>
          <tr><td style="text-align:right">Imponibile</td><td style="text-align:right">€ ${Number(f.totaleNetto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="text-align:right">IVA</td><td style="text-align:right">€ ${Number(f.totaleIva || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="text-align:right;font-weight:700;border-top:2px solid #333">TOTALE</td><td style="text-align:right;font-weight:700;font-size:16px;border-top:2px solid #333">€ ${Number(f.totaleLordo || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>
        </tfoot>
      </table>
      ${f.note ? `<div class="field" style="margin-top:12px"><label>Note</label><span>${esc(f.note)}</span></div>` : ""}
      ${f.dataPagamento ? `<div class="field" style="margin-top:8px"><label>Pagata il</label><span>${fmtD(f.dataPagamento)}</span></div>` : ""}
    `);
  };
  const FR_COLS_PRINT = [
    ...FATTURE_RICEVUTE_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printFattura(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  return <CrudModulePage title="FATTURE RICEVUTE" subtitle="Fatture in entrata — con stampa" store={fattureRicevuteStore} apiEndpoint="/fatture?tipo=RICEVUTA" columns={FR_COLS_PRINT} formFields={FATTURE_RICEVUTE_FIELDS} entityName="Fattura" filterField="stato" filterOptions={["BOZZA","EMESSA","INVIATA","PAGATA","SCADUTA","STORNATA"]} />;
};

// Wrap CrudModulePage with print button for DDT
const DDTPageWithPrint = () => {
  const printDDT = (d) => {
    printDocument(`DDT ${d.numero}`, `
      <h1 style="text-align:center">DOCUMENTO DI TRASPORTO (DDT)</h1>
      <p style="text-align:center;font-size:11px;color:#888;margin-bottom:16px">D.P.R. 472 del 14/08/1996</p>
      <div class="grid grid-2">
        <div class="field"><label>Documento N.</label><span>${esc(d.numero)}</span></div>
        <div class="field"><label>Data</label><span>${fmtD(d.data) || "—"}</span></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Destinatario</label><span>${esc(d.destinatario) || "—"}</span></div>
      <div class="field" style="margin-top:8px"><label>Indirizzo consegna</label><span>${esc(d.indirizzoConsegna) || "—"}</span></div>
      <div class="grid grid-2" style="margin-top:8px">
        <div class="field"><label>Causale del trasporto</label><span>${esc(d.causale) || "—"}</span></div>
        <div class="field"><label>Vettore</label><span>${esc(d.vettore) || "Mittente"}</span></div>
      </div>
      <table style="margin-top:16px">
        <thead><tr><th>Qta</th><th style="width:70%">Descrizione dei beni</th><th>U.M.</th></tr></thead>
        <tbody><tr><td style="text-align:center">—</td><td>${esc(d.note) || "Materiale come da ordine"}</td><td>—</td></tr></tbody>
      </table>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="field"><label>Aspetto esteriore</label><span>Visibili</span></div>
        <div class="field"><label>N° Colli</label><span>—</span></div>
        <div class="field"><label>Peso Kg</label><span>—</span></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="field"><label>Inizio trasporto</label><span>Data: ____________  Ora: ________</span></div>
        <div class="field"><label>Targa</label><span>_________________________</span></div>
      </div>
      <div class="signatures" style="margin-top:30px">
        <div class="sig-box">Firma Conducente</div>
        <div class="sig-box">Firma Destinatario (leggibile)</div>
      </div>
      <p style="margin-top:20px;font-size:9px;color:#aaa;text-align:center">Copia mittente · Copia destinatario · Copia uso amministrativo</p>
    `);
  };
  const DDT_COLS_PRINT = [
    ...DDT_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printDDT(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  return <CrudModulePage title="DDT / BOLLE" subtitle="Documenti trasporto — con stampa" store={ddtStore} apiEndpoint="/ddt" columns={DDT_COLS_PRINT} formFields={DDT_FIELDS} entityName="DDT" />;
};

// Wrap CrudModulePage with print button for Ordini
const OrdiniPageWithPrint = () => {
  const printOrdine = (o) => {
    printDocument(`Ordine ${o.numero}`, `
      <h1>ORDINE DI LAVORO ${esc(o.numero)}</h1>
      <div class="grid grid-2">
        <div class="field"><label>Numero</label><span>${esc(o.numero)}</span></div>
        <div class="field"><label>Data</label><span>${fmtD(o.data) || "—"}</span></div>
        <div class="field"><label>Stato</label><span class="badge">${esc(o.stato?.replace(/_/g, " "))}</span></div>
        <div class="field"><label>Priorità</label><span class="badge ${o.priorita?.toLowerCase()}">${esc(o.priorita)}</span></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Oggetto</label><span>${esc(o.oggetto)}</span></div>
      <div class="grid grid-2" style="margin-top:8px">
        <div class="field"><label>Impianto</label><span>${esc(relName(o.impianto, "matricola")) || "—"}</span></div>
        <div class="field"><label>Tecnico</label><span>${esc(relName(o.tecnico)) || "Non assegnato"}</span></div>
        <div class="field"><label>Cottimista</label><span>${esc(relName(o.cottimista, "ragioneSociale")) || "—"}</span></div>
        <div class="field"><label>Commessa</label><span>${esc(o.commessa) || "—"}</span></div>
      </div>
      ${o.noteInterne ? `<div class="field" style="margin-top:8px"><label>Note interne</label><span>${esc(o.noteInterne)}</span></div>` : ""}
      ${o.noteCommittente ? `<div class="field" style="margin-top:8px"><label>Note committente</label><span>${esc(o.noteCommittente)}</span></div>` : ""}
      <div class="signatures"><div class="sig-box">Firma Responsabile</div><div class="sig-box">Firma Tecnico</div></div>
    `);
  };
  const ORDINI_COLS_PRINT = [
    ...ORDINI_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printOrdine(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  return <CrudModulePage title="ORDINI DI LAVORO" subtitle="Workflow 9 stati — con stampa" store={ordiniStore} apiEndpoint="/ordini" columns={ORDINI_COLS_PRINT} formFields={ORDINI_FIELDS} entityName="Ordine" filterField="stato" filterOptions={["BOZZA","EMESSO","CONFERMATO","IN_LAVORO","SOSPESO","COMPLETATO","CHIUSO","CONTESTATO","ANNULLATO"]} />;
};

// Wrap CrudModulePage with print button for Documenti
const DocumentiPageWithPrint = () => {
  const printDocumento = (d) => {
    let body = "";
    if (d.tipo === "CARTELLO_CANTIERE") {
      body = `<div style="border:3px solid #333;padding:30px;text-align:center">
        <h1 style="border:none;font-size:32px;margin-bottom:20px">LAVORI IN CORSO</h1>
        <div class="grid grid-3" style="text-align:left;margin-bottom:20px">
          <div class="field"><label>Data</label><span>${fmtD(d.data || d.createdAt) || "___/___/___"}</span></div>
          <div class="field"><label>Indirizzo</label><span>${esc(d.indirizzo) || ""}</span></div>
          <div class="field"><label>Città</label><span>${esc(d.citta) || ""}</span></div>
        </div>
        <h2 style="font-size:24px;color:#333;margin:30px 0">INFORMAZIONE AGLI UTENTI</h2>
        <p style="font-size:15px;line-height:1.8;text-align:left">${esc(d.contenuto) || "SI COMUNICA CHE DAL GIORNO ____________ VERRÀ SOSPESO IL FUNZIONAMENTO DELL'ELEVATORE MATR. ____________ A CAUSA LAVORI STRAORDINARI."}</p>
        <p style="font-size:15px;margin-top:10px;text-align:left">L'IMPIANTO SARÀ RIATTIVATO IN DATA: ____________</p>
        <p style="margin-top:30px;font-size:13px">CERTI DELLA VOSTRA COLLABORAZIONE, PORGIAMO I NOSTRI CORDIALI SALUTI</p>
        <div style="margin-top:40px;padding:20px;background:#ffff00;display:inline-block;font-size:28px;font-weight:700">AVVISO DI FERMO<br>IMPIANTO ASCENSORE</div>
      </div>`;
    } else {
      body = `<h1>${esc(d.tipo?.replace(/_/g, " "))} — ${esc(d.titolo)}</h1>
        <div class="grid grid-2"><div class="field"><label>Data</label><span>${fmtD(d.data || d.createdAt) || "—"}</span></div><div class="field"><label>Tipo</label><span>${esc(d.tipo?.replace(/_/g, " "))}</span></div></div>
        ${d.contenuto ? `<div class="field" style="margin-top:12px"><label>Contenuto</label><span style="white-space:pre-wrap">${esc(d.contenuto)}</span></div>` : ""}
        ${d.note ? `<div class="field" style="margin-top:8px"><label>Note</label><span>${esc(d.note)}</span></div>` : ""}
        <div class="signatures"><div class="sig-box">Firma Responsabile</div><div class="sig-box">Firma Tecnico</div></div>`;
    }
    printDocument(d.titolo, body);
  };
  const DOC_COLS_PRINT = [
    ...DOC_COLS,
    { key: "_print", label: "", render: r => <button onClick={(e) => { e.stopPropagation(); printDocumento(r); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button> },
  ];
  const DOC_FIELDS_EXT = [
    ...DOC_FIELDS.slice(0, 2),
    { key: "indirizzo", label: "Indirizzo (per cartello)", placeholder: "Via, N°" },
    { key: "citta", label: "Città" },
    ...DOC_FIELDS.slice(2),
  ];
  return <CrudModulePage title="DOCUMENTI" subtitle="Cartelli, verbali, certificati — con stampa" store={documentiStore} apiEndpoint="/documenti" columns={DOC_COLS_PRINT} formFields={DOC_FIELDS_EXT} entityName="Documento" filterField="tipo" filterOptions={["CARTELLO_CANTIERE","VERBALE_CANTIERE","CERTIFICATO","CONTRATTO","ALTRO"]} />;
};

// BuonoLavoroPage with CRUD + print
const BuonoLavoroPage = () => {
  const { data, add, update, remove } = useApiData("/buoni-lavoro");
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = data.filter(row => !search || Object.values(row).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase())));

  const openCreate = () => { const e = {}; BUONO_FIELDS.forEach(f => { e[f.key] = f.default ?? ""; }); setFormData(e); setSelectedId(null); setModalMode("create"); };
  const openEdit = (r) => { setFormData({ ...r }); setSelectedId(r.id); setModalMode("edit"); };
  const handleSave = async () => {
    setSaving(true);
    try {
      if (modalMode === "create") await add(formData); else await update(selectedId, formData);
      setModalMode(null); setToast({ message: modalMode === "create" ? "Buono creato" : "Buono aggiornato", type: "success" });
    } catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id) => {
    try { await remove(id); setDeleteConfirm(null); setToast({ message: "Buono eliminato", type: "info" }); }
    catch (e) { setToast({ message: `Errore: ${e.message}`, type: "error" }); }
  };
  const setField = (k, v) => setFormData(p => ({ ...p, [k]: v }));

  const actionCol = { key: "_actions", label: "", render: (row) => (
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={e => { e.stopPropagation(); printBuonoDiLavoro(row); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-cyan-400" title="Stampa"><Download size={14} /></button>
      <button onClick={e => { e.stopPropagation(); openEdit(row); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-amber-400" title="Modifica"><Edit size={14} /></button>
      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(row.id); }} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400" title="Elimina"><Trash2 size={14} /></button>
    </div>
  )};

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>BUONI DI LAVORO</h1><p className="text-zinc-500 text-sm">Modulo PO-05-3 — Sequenze lavoro, controlli e resoconto attività</p></div>
        <Btn icon={Plus} onClick={openCreate}>Nuovo Buono</Btn>
      </div>
      <Card className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cerca numero, commessa, ubicazione..." /></Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="border-b border-zinc-800">{[...BUONO_COLS, actionCol].map(c => <th key={c.key} className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{c.label}</th>)}</tr></thead>
          <tbody>{filtered.map(row => (
            <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group cursor-pointer" onDoubleClick={() => puòModificare ? openEdit(row) : openView(row)}>
              {[...BUONO_COLS, actionCol].map(c => <td key={c.key} className="px-4 py-3 text-sm text-zinc-300">{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}{filtered.length === 0 && <tr><td colSpan={BUONO_COLS.length + 1} className="text-center py-10 text-zinc-600">Nessun buono</td></tr>}</tbody></table>
        </div>
      </Card>

      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === "create" ? "Nuovo Buono di Lavoro" : "Modifica Buono di Lavoro"} wide>
        <AIAutoFillButton fields={BUONO_FIELDS} formData={formData} setFormData={setFormData} context="Buono di Lavoro" />
        <div className="grid grid-cols-2 gap-4">
          {BUONO_FIELDS.map(f => (
            <div key={f.key} className={f.wide ? "col-span-2" : ""}>
              {f.type === "select" ? <Select label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)}><option value="">—</option>{f.options?.map(o => <option key={o} value={o}>{o}</option>)}</Select>
              : f.type === "textarea" ? <TextArea label={f.label} value={formData[f.key] || ""} onChange={e => setField(f.key, e.target.value)} rows={4} />
              : f.type === "checkbox" ? <div className="space-y-1"><label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{f.label}</label><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!formData[f.key]} onChange={e => setField(f.key, e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-cyan-600" /><span className="text-sm text-zinc-300">{formData[f.key] ? "Sì" : "No"}</span></label></div>
              : <Input label={f.label} type={f.type || "text"} value={f.type === "date" ? fmtD(formData[f.key]) : formData[f.key] ?? ""} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-6 pt-4 border-t border-zinc-800">
          {modalMode === "edit" && <Btn variant="secondary" icon={Download} onClick={() => printBuonoDiLavoro(formData)}>Stampa BDL</Btn>}
          <div className="flex gap-2 ml-auto">
            <Btn variant="secondary" onClick={() => setModalMode(null)}>Annulla</Btn>
            <Btn icon={Save} onClick={handleSave} loading={saving}>{modalMode === "create" ? "Crea" : "Salva"}</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => handleDelete(deleteConfirm)} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// NAV CONFIG
// ═══════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "impianti", label: "Impianti", icon: Wrench },
  { id: "contratti", label: "Contratti", icon: FileText },
  { id: "visite", label: "Manutenzioni", icon: Activity },
  { id: "verifiche", label: "Verifiche DPR 162", icon: Shield },
  { id: "segnalazioni", label: "Segnalazioni", icon: AlertTriangle },
  { id: "condomini", label: "Condomini", icon: Building2 },
  { id: "amministratori", label: "Amministratori", icon: Users },
  { id: "dipendenti", label: "Dipendenti", icon: HardHat },
  { id: "automezzi", label: "Automezzi", icon: Truck },
  { id: "cottimisti", label: "Cottimisti", icon: Users },
  { id: "magazzino", label: "Magazzino", icon: Package },
  { id: "preventivi", label: "Preventivi", icon: FileText },
  { id: "lavori", label: "Programma Lavori", icon: Calendar },
  { id: "buoni_lavoro", label: "Buono di Lavoro", icon: FileText },
  { id: "ordini", label: "Ordini Lavoro", icon: ClipboardList },
  { id: "fatture_emesse", label: "Fatture Emesse", icon: Receipt },
  { id: "fatture_ricevute", label: "Fatture Ricevute", icon: Download },
  { id: "ddt", label: "DDT / Bolle", icon: FileOutput },
  { id: "documenti", label: "Documenti", icon: FolderOpen },
  { id: "audit", label: "Audit Log", icon: Shield, minRole: "ADMIN" },
  { id: "ai", label: "AI Assistant", icon: Bot },
  { id: "utenti", label: "Gestione Utenti", icon: Lock, minRole: "ADMIN" },
  { id: "settings", label: "Impostazioni", icon: Settings, minRole: "ADMIN" },
];

// ═══════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════
const LoginPage = ({ onLogin, theme }) => {
  const [email, setEmail] = useState("admin@erp-ascensori.it");
  const [password, setPassword] = useState("admin2025");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.login(email, password);
      onLogin(data.user);
    } catch (e) {
      setError(e.message || "Login fallito");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `radial-gradient(ellipse at 30% 20%, ${theme.primary}14 0%, transparent 50%), ${theme.bg}` }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            {theme.logoUrl ? <img src={theme.logoUrl} className="h-10 w-auto" alt="Logo" /> : <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: theme.primary }}><Wrench size={22} className="text-white" /></div>}
            <div className="text-left"><h1 className="text-xl font-bold text-white leading-none" style={{ fontFamily: theme.fontDisplay, letterSpacing: "0.08em" }}>{theme.companyName}</h1><p className="text-[10px] uppercase tracking-widest" style={{ color: theme.primary }}>{theme.companySubtitle}</p></div>
          </div>
        </div>
        <Card>
          <div className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <Btn className="w-full" size="lg" onClick={handleLogin} loading={loading}>Accedi</Btn>
            <p className="text-center text-xs text-zinc-600">admin@erp-ascensori.it / admin2025</p>
          </div>
        </Card>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════
// IL MIO ACCOUNT — ogni account vede cosa può fare
// ═══════════════════════════════════════════════════════
const MODULE_LABELS = {
  impianti: "Impianti", contratti: "Contratti", visite: "Manutenzioni", verifiche: "Verifiche DPR 162",
  segnalazioni: "Segnalazioni", condomini: "Condomini", amministratori: "Amministratori", dipendenti: "Dipendenti",
  automezzi: "Automezzi", cottimisti: "Cottimisti", magazzino: "Magazzino", movimenti: "Movimenti magazzino",
  preventivi: "Preventivi", lavori: "Programma Lavori", "buoni-lavoro": "Buoni di Lavoro", ordini: "Ordini di Lavoro",
  fatture: "Fatture", ddt: "DDT / Bolle", documenti: "Documenti", audit: "Audit Log", ai: "Assistente AI",
  utenti: "Gestione Utenti", settings: "Impostazioni",
};

const ProfiloModal = ({ open, onClose, user, onPreviewChange }) => {
  const [, force] = useState(0);
  if (!open) return null;
  const ruoloReale = realRole();
  const ruoloVisto = currentRole();
  const perms = PERM_DATA?.matrice?.[ruoloVisto] || {};
  const descr = PERM_DATA?.descrizioni?.[ruoloVisto] || "";
  const inAnteprima = !!localStorage.getItem("erp_role_preview");
  const setPreview = (r) => {
    if (!r || r === ruoloReale) localStorage.removeItem("erp_role_preview");
    else localStorage.setItem("erp_role_preview", r);
    force(x => x + 1);
    onPreviewChange?.();
  };
  const Mark = ({ ok }) => ok ? <Check size={13} className="text-emerald-400 mx-auto" /> : <span className="text-zinc-700 block text-center">—</span>;
  return (
    <Modal open={open} onClose={onClose} title="Il mio account" wide>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-lg font-bold text-white">{user?.nome} {user?.cognome}</p>
          <p className="text-sm text-zinc-500">{user?.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge value={ruoloVisto} />
            {inAnteprima && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">ANTEPRIMA — il tuo ruolo reale è {ruoloReale}</span>}
          </div>
          <p className="text-xs text-zinc-400 mt-2 max-w-md">{descr}</p>
        </div>
        {hasRoleReal("ADMIN") && (
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Anteprima ruolo (solo visuale)</label>
            <select value={inAnteprima ? ruoloVisto : ""} onChange={e => setPreview(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200">
              <option value="">— Il mio ruolo ({ruoloReale}) —</option>
              {Object.keys(ROLE_LEVELS_FE).filter(r => r !== ruoloReale).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="text-[10px] text-zinc-600 max-w-[220px]">Vedi l'app come la vedrebbe un altro ruolo. Il server applica sempre i permessi reali.</p>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead><tr className="bg-zinc-800/60">
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase">Modulo</th>
            {["Vedi", "Crea", "Modifica", "Elimina"].map(h => <th key={h} className="px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase text-center">{h}</th>)}
          </tr></thead>
          <tbody>
            {Object.entries(MODULE_LABELS).map(([k, label]) => {
              const p = perms[k] || {};
              return (
                <tr key={k} className={`border-t border-zinc-800/60 ${!p.view ? "opacity-40" : ""}`}>
                  <td className="px-3 py-1.5 text-zinc-300">{label}</td>
                  <td><Mark ok={p.view} /></td><td><Mark ok={p.create} /></td><td><Mark ok={p.edit} /></td><td><Mark ok={p.delete} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600 mt-3">I permessi sono definiti centralmente sul server e applicati sia all'interfaccia sia alle API.</p>
    </Modal>
  );
};
const hasRoleReal = (minRole) => (ROLE_LEVELS_FE[realRole()] ?? 9) <= (ROLE_LEVELS_FE[minRole] ?? 1);

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("erp_user")); } catch { return null; } });
  const [loggedIn, setLoggedIn] = useState(!!api.token);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState(() => { try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("erp_theme") || "{}") }; } catch { return DEFAULT_THEME; } });
  const now = new Date().toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleLogin = (userData) => { setUser(userData); setLoggedIn(true); };
  const handleLogout = () => { api.clearTokens(); setUser(null); setLoggedIn(false); };

  // Notifiche
  const [notifiche, setNotifiche] = useState([]);
  const [notificheOpen, setNotificheOpen] = useState(false);
  const nonLette = notifiche.filter(n => !n.letta).length;

  const [profiloOpen, setProfiloOpen] = useState(false);
  const [, forcePerm] = useState(0);

  // Carica i permessi del ruolo (guida NAV e pulsanti)
  useEffect(() => {
    if (!loggedIn) return;
    caricaPermessi().then(() => forcePerm(x => x + 1));
  }, [loggedIn]);

  // Reinvia al server la config AI salvata nel browser (il backend la perde al riavvio)
  useEffect(() => {
    if (!loggedIn) return;
    try {
      const saved = JSON.parse(localStorage.getItem("erp_ai_config") || "null");
      if (saved && (saved.geminiKey || saved.anthropicKey || saved.openaiKey)) {
        api.post("/ai/save-config", { provider: saved.provider, geminiKey: saved.geminiKey, anthropicKey: saved.anthropicKey, openaiKey: saved.openaiKey }).catch(() => {});
      }
    } catch {}
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    const loadNotifiche = async () => {
      try { const r = await api.get("/notifiche"); setNotifiche(r.data || []); } catch {}
    };
    loadNotifiche();
    const interval = setInterval(loadNotifiche, 30000);
    return () => clearInterval(interval);
  }, [loggedIn]);

  const segnaLetta = async (id) => {
    try { await api.post("/notifiche/leggi", { id }); setNotifiche(prev => id === "all" ? prev.map(n => ({ ...n, letta: true })) : prev.map(n => n.id === id ? { ...n, letta: true } : n)); } catch {}
  };

  if (!loggedIn) return <ThemeContext.Provider value={{ theme, setTheme }}><LoginPage onLogin={handleLogin} theme={theme} /></ThemeContext.Provider>;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage />;
      case "impianti": return <ImpiantiPage />;
      case "contratti": return <ContrattiPage />;
      case "visite": return <VisitePage />;
      case "segnalazioni": return <SegnalazioniPage />;
      case "verifiche": return <CrudModulePage title="VERIFICHE PERIODICHE" subtitle="Registro verifiche biennali Organismo Abilitato — DPR 162/99" apiEndpoint="/verifiche" columns={VERIFICHE_COLS} formFields={VERIFICHE_FIELDS} entityName="Verifica" />;
      case "condomini": return <CrudModulePage title="CONDOMINI" subtitle="Edifici e amministratori" store={condominiStore} apiEndpoint="/condomini" columns={CONDOMINI_COLS} formFields={CONDOMINI_FIELDS} entityName="Condominio" />;
      case "amministratori": return <CrudModulePage title="AMMINISTRATORI" subtitle="Persone e società" store={amministratoriStore} apiEndpoint="/amministratori" columns={AMMINISTRATORI_COLS} formFields={AMMINISTRATORI_FIELDS} entityName="Amministratore" filterField="tipo" filterOptions={["PERSONA_FISICA", "SOCIETA"]} />;
      case "dipendenti": return <CrudModulePage title="DIPENDENTI" subtitle="Personale attivo" store={dipendentiStore} apiEndpoint="/dipendenti" columns={DIPENDENTI_COLS} formFields={DIPENDENTI_FIELDS} entityName="Dipendente" filterField="tipo" filterOptions={["TECNICO", "AMMINISTRATIVO", "COMMERCIALE", "MAGAZZINIERE"]} />;
      case "automezzi": return <CrudModulePage title="AUTOMEZZI" subtitle="Flotta veicoli" store={automezziStore} apiEndpoint="/automezzi" columns={AUTOMEZZI_COLS} formFields={AUTOMEZZI_FIELDS} entityName="Automezzo" />;
      case "cottimisti": return <CrudModulePage title="COTTIMISTI" subtitle="Ditte esterne e squadre" store={cottimistiStore} apiEndpoint="/cottimisti" columns={COTTIMISTI_COLS} formFields={COTTIMISTI_FIELDS} entityName="Cottimista" />;
      case "magazzino": return <CrudModulePage title="MAGAZZINO" subtitle="Componenti e vendita" store={magazzinoStore} apiEndpoint="/magazzino" columns={MAGAZZINO_COLS} formFields={MAGAZZINO_FIELDS} entityName="Articolo" filterField="tipo" filterOptions={["COMPONENTI", "VENDITA"]} />;
      case "preventivi": return <PreventiviPageWithPrint />;
      case "lavori": return <LavoriPage />;
      case "buoni_lavoro": return <BuonoLavoroPage />;
      case "ordini": return <OrdiniPageWithPrint />;
      case "fatture_emesse": return <FattureEmessePageWithPrint />;
      case "fatture_ricevute": return <FattureRicevutePageWithPrint />;
      case "ddt": return <DDTPageWithPrint />;
      case "documenti": return <DocumentiPageWithPrint />;
      case "audit": return <CrudModulePage title="AUDIT LOG" subtitle="Registro immutabile HMAC-SHA256" store={makeStore([
        { id: "a1", azione: "LOGIN", entita: "users", utente: "admin@erp-ascensori.it", createdAt: "2025-03-25T08:30:00Z", ip: "192.168.1.100" },
        { id: "a2", azione: "CREATE", entita: "ordini_lavoro", utente: "admin@erp-ascensori.it", createdAt: "2025-03-25T09:15:00Z", dettagli: "OL-00005" },
        { id: "a3", azione: "STATE_CHANGE", entita: "ordini_lavoro", utente: "marco.rossi@erp.it", createdAt: "2025-03-25T10:00:00Z", dettagli: "CONFERMATO → IN_LAVORO" },
      ])} columns={[
        { key: "azione", label: "Azione", render: r => <Badge value={r.azione} /> },
        { key: "entita", label: "Entità", render: r => <span className="font-mono text-zinc-400">{r.entita}</span> },
        { key: "utente", label: "Utente" },
        { key: "createdAt", label: "Data", render: r => <span className="text-zinc-500">{new Date(r.createdAt).toLocaleString("it-IT")}</span> },
        { key: "ip", label: "IP", render: r => <span className="font-mono text-zinc-600">{r.ip || "—"}</span> },
      ]} formFields={[]} entityName="Log" />;
      case "ai": return <AIPage />;
      case "utenti": return <UsersPage />;
      case "settings": return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className="flex h-screen overflow-hidden" style={{ background: `radial-gradient(ellipse at 0% 0%, ${theme.primary}08 0%, transparent 50%), ${theme.bg}`, color: theme.text }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');body{font-family:${theme.fontBody};margin:0;}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#3f3f46;border-radius:3px}@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* SIDEBAR */}
        <aside className={`${sidebarOpen ? "w-56" : "w-14"} shrink-0 border-r flex flex-col transition-all duration-300 overflow-hidden`} style={{ background: theme.bg, borderColor: theme.border }}>
          <div className="p-3 border-b" style={{ borderColor: theme.border }}>
            <div className="flex items-center gap-2">
              {theme.logoUrl ? <img src={theme.logoUrl} className="h-7 w-auto shrink-0" alt="" /> : <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: theme.primary }}><Wrench size={14} className="text-white" /></div>}
              {sidebarOpen && <div className="overflow-hidden"><p className="text-xs font-bold text-white leading-none whitespace-nowrap" style={{ fontFamily: theme.fontDisplay, letterSpacing: "0.08em" }}>{theme.companyName}</p><p className="text-[8px] uppercase tracking-widest" style={{ color: theme.primary }}>{theme.companySubtitle}</p></div>}
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
            {NAV.filter(n => n.id === "dashboard" || può(NAV_MODULE[n.id] || n.id, "view")).map(n => {
              const I = n.icon; const a = page === n.id;
              return <button key={n.id} onClick={() => setPage(n.id)} className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all border ${a ? "text-white border-opacity-20" : "border-transparent hover:bg-white/5"}`} style={a ? { background: theme.primaryLight, color: theme.accent, borderColor: theme.primary + "33" } : { color: theme.textMuted }} title={!sidebarOpen ? n.label : undefined}><I size={16} className="shrink-0" />{sidebarOpen && <span className="truncate text-[13px]" style={{ fontWeight: 500 }}>{n.label}</span>}</button>;
            })}
          </nav>
          <div className="p-2 border-t" style={{ borderColor: theme.border }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center justify-center p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: theme.textMuted }}>{sidebarOpen ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-12 shrink-0 border-b flex items-center justify-between px-5" style={{ borderColor: theme.border }}>
            <p className="text-xs capitalize" style={{ color: theme.textMuted }}>{now}</p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button onClick={() => setNotificheOpen(!notificheOpen)} className="relative p-1.5 rounded-lg hover:bg-white/5">
                  <Bell size={16} style={{ color: theme.textMuted }} />
                  {nonLette > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] text-white font-bold px-1">{nonLette}</span>}
                </button>
                {notificheOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                      <span className="text-sm font-bold text-white">Notifiche</span>
                      {nonLette > 0 && <button onClick={() => segnaLetta("all")} className="text-[10px] text-cyan-400 hover:underline">Segna tutte lette</button>}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {notifiche.length === 0 && <p className="text-center text-zinc-600 text-sm py-8">Nessuna notifica</p>}
                      {notifiche.slice(0, 15).map(n => (
                        <div key={n.id} onClick={() => segnaLetta(n.id)} className={`px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer ${!n.letta ? "bg-cyan-500/5" : ""}`}>
                          <div className="flex items-center gap-2">
                            {!n.letta && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
                            <span className="text-xs font-bold text-zinc-300">{n.titolo}</span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{n.messaggio}</p>
                          <p className="text-[9px] text-zinc-600 mt-1">{new Date(n.createdAt).toLocaleString("it-IT")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: theme.border }}>
                <button onClick={() => setProfiloOpen(true)} className="flex items-center gap-2 hover:opacity-80" title="Il mio account: cosa posso fare">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: theme.primaryLight }}><span className="text-[10px] font-bold" style={{ color: theme.accent }}>{(user?.nome?.[0] || "")}{(user?.cognome?.[0] || "")}</span></div>
                  <div className="text-right"><p className="text-[11px] font-medium text-white">{user?.nome || "Utente"}</p><p className="text-[9px]" style={{ color: theme.textMuted }}>{currentRole()}</p></div>
                </button>
                <button onClick={handleLogout} className="p-1 rounded-lg hover:bg-white/5" style={{ color: theme.textMuted }}><LogOut size={14} /></button>
              </div>
            </div>
          </header>
          {localStorage.getItem("erp_role_preview") && (
            <div className="shrink-0 px-5 py-1.5 bg-purple-500/15 border-b border-purple-500/30 flex items-center justify-between">
              <span className="text-xs text-purple-300">👁 Anteprima ruolo <b>{currentRole()}</b> — stai vedendo l'app come la vedrebbe questo ruolo (i permessi reali restano i tuoi)</span>
              <button onClick={() => { localStorage.removeItem("erp_role_preview"); forcePerm(x => x + 1); }} className="text-xs text-purple-300 hover:text-white underline">Esci dall'anteprima</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5">{renderPage()}</div>
          <ProfiloModal open={profiloOpen} onClose={() => setProfiloOpen(false)} user={user} onPreviewChange={() => forcePerm(x => x + 1)} />
        </main>
      </div>
    </ThemeContext.Provider>
  );
}
