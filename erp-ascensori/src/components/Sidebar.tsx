"use client";

// Странична навигация — групи по функционалните области от документацията.
// Ролевото скриване тук е само UX: сървърът проверява на всяка заявка.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SquaresFour,
  Elevator,
  Buildings,
  UserGear,
  Users,
  Truck,
  HardHat,
  UsersThree,
  Package,
  ArrowsLeftRight,
  FileText,
  Wrench,
  Receipt,
  FileArrowDown,
  Files,
  ShieldCheck,
  UserCircle,
  ClockCounterClockwise,
  Moon,
  Sun,
  SignOut,
  CalendarCheck,
} from "@phosphor-icons/react";
import { haPermesso, type Ruolo, RUOLO_LABEL, isRuolo } from "@/lib/roles";

interface Voce {
  href: string;
  label: string;
  icona: React.ReactNode;
  minimo?: Ruolo;
}

interface Gruppo {
  label: string | null;
  voci: Voce[];
}

const GRUPPI: Gruppo[] = [
  {
    label: null,
    voci: [{ href: "/dashboard", label: "Dashboard", icona: <SquaresFour size={18} /> }],
  },
  {
    label: "Anagrafiche",
    voci: [
      { href: "/impianti", label: "Impianti", icona: <Elevator size={18} /> },
      { href: "/scadenze", label: "Scadenze", icona: <CalendarCheck size={18} /> },
      { href: "/condomini", label: "Condomìni", icona: <Buildings size={18} /> },
      { href: "/amministratori", label: "Amministratori", icona: <UserGear size={18} /> },
      { href: "/dipendenti", label: "Dipendenti", icona: <Users size={18} /> },
      { href: "/automezzi", label: "Automezzi", icona: <Truck size={18} /> },
      { href: "/cottimisti", label: "Cottimisti", icona: <HardHat size={18} /> },
      { href: "/squadre", label: "Squadre", icona: <UsersThree size={18} /> },
    ],
  },
  {
    label: "Magazzino",
    voci: [
      { href: "/magazzino", label: "Articoli", icona: <Package size={18} /> },
      { href: "/movimenti", label: "Movimenti", icona: <ArrowsLeftRight size={18} /> },
    ],
  },
  {
    label: "Ciclo attivo",
    voci: [
      { href: "/preventivi", label: "Preventivi", icona: <FileText size={18} /> },
      { href: "/ordini", label: "Ordini di lavoro", icona: <Wrench size={18} /> },
    ],
  },
  {
    label: "Documentale",
    voci: [
      { href: "/fatture", label: "Fatture", icona: <Receipt size={18} />, minimo: "DIREZIONE" },
      { href: "/ddt", label: "DDT", icona: <FileArrowDown size={18} /> },
      { href: "/documenti", label: "Documenti", icona: <Files size={18} /> },
    ],
  },
  {
    label: "Sistema",
    voci: [
      { href: "/utenti", label: "Utenti", icona: <UserCircle size={18} />, minimo: "ADMIN" },
      {
        href: "/audit",
        label: "Registro operazioni",
        icona: <ClockCounterClockwise size={18} />,
        minimo: "ADMIN",
      },
      { href: "/aziende", label: "Aziende", icona: <ShieldCheck size={18} />, minimo: "ADMIN" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [utente, setUtente] = useState<{ nome: string; ruolo: Ruolo } | null>(null);
  const [scuro, setScuro] = useState(false);

  useEffect(() => {
    setScuro(document.documentElement.classList.contains("dark"));
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && isRuolo(d.ruolo)) setUtente({ nome: d.nome, ruolo: d.ruolo });
      })
      .catch(() => null);
  }, []);

  function cambiaTema() {
    const nuovo = !scuro;
    setScuro(nuovo);
    document.documentElement.classList.toggle("dark", nuovo);
    try {
      localStorage.setItem("ea:tema", nuovo ? "dark" : "light");
    } catch {}
  }

  async function esci() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const ruolo = utente?.ruolo;

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-text-inverse">
          EA
        </div>
        <div>
          <div className="text-sm font-semibold leading-4 text-text-1">ERP Ascensori</div>
          <div className="text-[11px] text-text-3">Enterprise</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {GRUPPI.map((g, i) => {
          const visibili = g.voci.filter(
            (v) => !v.minimo || (ruolo && haPermesso(ruolo, v.minimo))
          );
          if (visibili.length === 0) return null;
          return (
            <div key={i}>
              {g.label && (
                <div className="mb-1 mt-4 px-3 text-[11px] uppercase tracking-wide text-text-3">
                  {g.label}
                </div>
              )}
              {visibili.map((v) => {
                const attiva = pathname === v.href || pathname.startsWith(v.href + "/");
                return (
                  <Link
                    key={v.href}
                    href={v.href}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                      attiva
                        ? "bg-accent-subtle font-medium text-accent-text"
                        : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                    }`}
                  >
                    {v.icona}
                    {v.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-1">{utente?.nome ?? "…"}</div>
            <div className="text-[11px] text-text-3">
              {ruolo ? RUOLO_LABEL[ruolo] : ""}
            </div>
          </div>
          <button
            className="btn-ghost h-8 w-8 px-0"
            onClick={cambiaTema}
            aria-label={scuro ? "Tema chiaro" : "Tema scuro"}
            title={scuro ? "Tema chiaro" : "Tema scuro"}
          >
            {scuro ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <button className="btn-secondary h-8 w-full text-xs" onClick={() => void esci()}>
          <SignOut size={14} /> Esci
        </button>
      </div>
    </aside>
  );
}
