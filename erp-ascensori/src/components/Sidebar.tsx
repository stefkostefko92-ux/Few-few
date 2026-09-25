"use client";

// Странична навигация — групи по функционалните области от документацията.
// Ролевото скриване тук е само UX: сървърът проверява на всяка заявка.
//
// ПОД `lg` МЕНЮТО Е ЧЕКМЕДЖЕ, НЕ КОЛОНА. Дотогава беше постоянно отворено и на
// телефон взимаше 60 % от ширината: заглавията се пренасяха на три реда,
// бутоните се режеха отгоре и отдолу, таблицата — насред думата. Точно на
// телефона работи техникът, който сканира QR стикера пред машинното помещение.
// Мобилният E2E тест не го хвана, защото гледаше само за хоризонтален скрол —
// а съдържанието не се скролваше, то се РЕЖЕШЕ.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  Handshake,
  Wrench,
  Receipt,
  FileArrowDown,
  Files,
  ShieldCheck,
  ChartLineUp,
  Coins,
  Archive,
  PlugsConnected,
  QrCode,
  UserCircle,
  UserFocus,
  ClockCounterClockwise,
  Gear,
  Moon,
  Sun,
  SignOut,
  CalendarCheck,
  CalendarBlank,
  List,
  X,
} from "@phosphor-icons/react";
import { DIM } from "@/components/icone";
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
    voci: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icona: <SquaresFour size={DIM.navigazione} />,
      },
    ],
  },
  {
    label: "Anagrafiche",
    voci: [
      {
        href: "/impianti",
        label: "Impianti",
        icona: <Elevator size={DIM.navigazione} />,
      },
      {
        href: "/scadenze",
        label: "Scadenze",
        icona: <CalendarCheck size={DIM.navigazione} />,
      },
      {
        href: "/condomini",
        label: "Condomìni",
        icona: <Buildings size={DIM.navigazione} />,
      },
      {
        href: "/amministratori",
        label: "Amministratori",
        icona: <UserGear size={DIM.navigazione} />,
      },
      {
        href: "/dipendenti",
        label: "Dipendenti",
        icona: <Users size={DIM.navigazione} />,
      },
      {
        href: "/automezzi",
        label: "Automezzi",
        icona: <Truck size={DIM.navigazione} />,
      },
      {
        href: "/cottimisti",
        label: "Cottimisti",
        icona: <HardHat size={DIM.navigazione} />,
      },
      {
        href: "/squadre",
        label: "Squadre",
        icona: <UsersThree size={DIM.navigazione} />,
      },
    ],
  },
  {
    label: "Magazzino",
    voci: [
      {
        href: "/magazzino",
        label: "Articoli",
        icona: <Package size={DIM.navigazione} />,
      },
      {
        href: "/movimenti",
        label: "Movimenti",
        icona: <ArrowsLeftRight size={DIM.navigazione} />,
      },
    ],
  },
  {
    label: "Commesse",
    voci: [
      {
        href: "/contratti",
        label: "Contratti",
        icona: <Handshake size={DIM.navigazione} />,
      },
      {
        href: "/preventivi",
        label: "Preventivi",
        icona: <FileText size={DIM.navigazione} />,
      },
      {
        href: "/ordini",
        label: "Ordini di lavoro",
        icona: <Wrench size={DIM.navigazione} />,
      },
      {
        href: "/impianti/etichette",
        label: "Etichette QR",
        icona: <QrCode size={DIM.navigazione} />,
        minimo: "TECNICO",
      },
    ],
  },
  {
    label: "Documentale",
    voci: [
      {
        href: "/fatture",
        label: "Fatture",
        icona: <Receipt size={DIM.navigazione} />,
        minimo: "DIREZIONE",
      },
      {
        href: "/ddt",
        label: "DDT",
        icona: <FileArrowDown size={DIM.navigazione} />,
      },
      {
        href: "/documenti",
        label: "Documenti",
        icona: <Files size={DIM.navigazione} />,
      },
      {
        href: "/calendario",
        label: "Calendario",
        icona: <CalendarBlank size={DIM.navigazione} />,
      },
      {
        href: "/scadenzario",
        label: "Scadenzario",
        icona: <Coins size={DIM.navigazione} />,
        minimo: "DIREZIONE",
      },
      {
        href: "/conservazione",
        label: "Conservazione",
        icona: <Archive size={DIM.navigazione} />,
        minimo: "DIREZIONE",
      },
      {
        href: "/redditivita",
        label: "Redditività",
        icona: <ChartLineUp size={DIM.navigazione} />,
        minimo: "DIREZIONE",
      },
    ],
  },
  {
    label: "Sistema",
    voci: [
      {
        href: "/utenti",
        label: "Utenti",
        icona: <UserCircle size={DIM.navigazione} />,
        minimo: "ADMIN",
      },
      {
        href: "/audit",
        label: "Registro operazioni",
        icona: <ClockCounterClockwise size={DIM.navigazione} />,
        minimo: "ADMIN",
      },
      {
        href: "/impostazioni",
        label: "Dati aziendali",
        icona: <Gear size={DIM.navigazione} />,
        minimo: "ADMIN",
      },
      {
        href: "/integrazioni",
        label: "Integrazioni",
        icona: <PlugsConnected size={DIM.navigazione} />,
        minimo: "ADMIN",
      },
      {
        href: "/privacy",
        label: "Diritti privacy",
        icona: <UserFocus size={DIM.navigazione} />,
        minimo: "ADMIN",
      },
      {
        href: "/aziende",
        label: "Aziende",
        icona: <ShieldCheck size={DIM.navigazione} />,
        minimo: "MASTER",
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [utente, setUtente] = useState<{ nome: string; ruolo: Ruolo } | null>(
    null,
  );
  const [scuro, setScuro] = useState(false);
  /** Само под `lg`: отворено ли е чекмеджето. Над `lg` менюто е винаги видимо. */
  const [aperto, setAperto] = useState(false);
  const bottoneMenu = useRef<HTMLButtonElement>(null);
  const bottoneChiudi = useRef<HTMLButtonElement>(null);
  const eraAperto = useRef(false);

  // Навигацията затваря чекмеджето: иначе новата страница се отваря ПОД него
  // и техникът не вижда, че е стигнал. И активната връзка се показва: менюто
  // е по-дълго от екрана, а „Integrazioni" стои под сгъвката — без това човек
  // не вижда къде е.
  useEffect(() => {
    setAperto(false);
    document
      .querySelector('#navigazione-principale [aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  // Фокусът влиза в чекмеджето и се връща на бутона, който го е отворил
  // (WCAG 2.4.3). Escape го затваря (2.1.2 — никакъв капан за клавиатурата).
  useEffect(() => {
    if (aperto) {
      bottoneChiudi.current?.focus();
      const tasto = (e: KeyboardEvent) => {
        if (e.key === "Escape") setAperto(false);
      };
      window.addEventListener("keydown", tasto);
      eraAperto.current = true;
      return () => window.removeEventListener("keydown", tasto);
    }
    if (eraAperto.current) {
      eraAperto.current = false;
      bottoneMenu.current?.focus();
    }
  }, [aperto]);

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
    <>
      {/* Горна лента — само под `lg`. Фиксирана, защото главното съдържание е
          това, което се скролва (`main`), не документът. */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 lg:hidden">
        <button
          ref={bottoneMenu}
          type="button"
          className="btn-ghost h-11 w-11 px-0"
          aria-label="Apri il menu"
          aria-expanded={aperto}
          aria-controls="navigazione-principale"
          onClick={() => setAperto(true)}
        >
          <List size={DIM.navigazione} aria-hidden />
        </button>
        <Marchio />
      </header>

      {/* Фонът затваря чекмеджето при докосване извън него. За екранния четец
          е без значение (`aria-hidden`) — там затварянето е с бутона или Esc. */}
      {aperto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden
          onClick={() => setAperto(false)}
        />
      )}

      {/* `invisible` при затворено: не само плъзга менюто извън екрана, а го
          маха и от реда на табулация и от дървото за достъпност — иначе
          клавиатурата минава през трийсет невидими връзки. */}
      <aside
        id="navigazione-principale"
        aria-label="Navigazione principale"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface transition-transform duration-200 motion-reduce:transition-none lg:static lg:z-auto lg:h-screen lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:visible ${
          aperto ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Marchio />
          <button
            ref={bottoneChiudi}
            type="button"
            className="btn-ghost ml-auto h-11 w-11 px-0 lg:hidden"
            aria-label="Chiudi il menu"
            onClick={() => setAperto(false)}
          >
            <X size={DIM.navigazione} aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {GRUPPI.map((g, i) => {
            const visibili = g.voci.filter(
              (v) => !v.minimo || (ruolo && haPermesso(ruolo, v.minimo)),
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
                  const attiva =
                    pathname === v.href || pathname.startsWith(v.href + "/");
                  return (
                    <Link
                      key={v.href}
                      href={v.href}
                      onClick={() => setAperto(false)}
                      aria-current={attiva ? "page" : undefined}
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
              <div className="truncate text-sm font-medium text-text-1">
                {utente?.nome ?? "…"}
              </div>
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
              {scuro ? <Sun size={DIM.bottone} /> : <Moon size={DIM.bottone} />}
            </button>
          </div>
          <button
            className="btn-secondary h-8 w-full text-xs"
            onClick={() => void esci()}
          >
            <SignOut size={DIM.bottone} /> Esci
          </button>
        </div>
      </aside>
    </>
  );
}

/** Знакът и името — един компонент, защото стоят на две места. */
function Marchio() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Същият знак като иконата в раздела на браузъра — една марка, не две. */}
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-text-inverse">
        <Elevator size={DIM.navigazione} weight="light" aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold leading-4 text-text-1">
          ERP Ascensori
        </div>
        <div className="text-[11px] text-text-3">Enterprise</div>
      </div>
    </div>
  );
}
