"use client";

// Единственият начин, по който интерфейсът говори със сървъра.
//
// Три неща, които преди липсваха и всяко от тях се усещаше при реална работа:
//
//  1. НИКОЙ не викаше `/api/auth/refresh`. Access бисквитката живее 15 минути,
//     refresh — 7 дни. На петнайсетата минута техник, който попълва ордин,
//     получаваше „Non autenticato" в таблицата и губеше нишката. Тук 401 се
//     обработва веднъж: подновяваме и повтаряме заявката.
//  2. `fetch` при паднала мрежа хвърля, а извикващият не хващаше — списъкът
//     оставаше на „зареждане", а формата на „запис" завинаги, с незаписани данни.
//     Тук мрежовата грешка се превръща в нормален отговор с италианско съобщение.
//  3. Едновременните подновявания се сливат в едно: десет заявки, изтекли
//     заедно, не бива да пуснат десет refresh-а (и да изгорят rate limit-а).

let rinnovoInCorso: Promise<boolean> | null = null;

async function rinnova(): Promise<boolean> {
  rinnovoInCorso ??= (async () => {
    try {
      const r = await fetch("/api/auth/refresh", { method: "POST" });
      return r.ok;
    } catch {
      return false;
    } finally {
      // Освобождава се СЛЕД като всички чакащи са прочели резултата.
      queueMicrotask(() => {
        rinnovoInCorso = null;
      });
    }
  })();
  return rinnovoInCorso;
}

export interface Risposta<T = Record<string, unknown>> {
  ok: boolean;
  stato: number;
  dati: T;
}

/** Праща заявката; при 401 подновява сесията веднъж и опитва пак. */
export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<Risposta<T>> {
  const esegui = () =>
    fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

  let res: Response;
  try {
    res = await esegui();
    if (res.status === 401 && (await rinnova())) res = await esegui();
  } catch {
    return {
      ok: false,
      stato: 0,
      dati: {
        error: "Errore di rete. Verificare la connessione e riprovare.",
      } as T,
    };
  }

  // Изтекла и невъзстановима сесия → на входа, вместо мълчаливо празен изглед.
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }

  const dati = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, stato: res.status, dati };
}
