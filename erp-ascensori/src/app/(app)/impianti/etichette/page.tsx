// Лист с QR етикети за печат.
//
// Стикерите се лепят в машинното помещение веднъж, при въвеждане на импианта в
// системата — затова листът е за ПАРТИДА, не за единичен код. Печата се от
// браузъра върху обикновена самозалепваща хартия A4.

import { prisma } from "@/lib/prisma";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { qrSvg, urlImpianto, basePubblica } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const s = await richiedeRuolo("TECNICO");
  const { q } = await searchParams;

  const impianti = await prisma.impianto.findMany({
    where: {
      ...filtroTenant(s),
      ...(q
        ? {
            OR: [
              { matricola: { contains: q, mode: "insensitive" } },
              { condominio: { nome: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      matricola: true,
      marca: true,
      condominio: { select: { nome: true, indirizzo: true, citta: true } },
    },
    orderBy: { matricola: "asc" },
    // Таван: без него „печатай всичко" на фирма с 4000 машини вдига страница,
    // която браузърът не може да покаже.
    take: 200,
  });

  const base = basePubblica();

  return (
    <div>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">Etichette QR</h1>
        <p className="mt-1 text-sm text-text-3">
          Da applicare in sala macchine. Il tecnico inquadra il codice e apre direttamente
          l&apos;impianto: nessuna ricerca per matricola sul telefono.
        </p>

        <form className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-56">
            <label className="label" htmlFor="q">
              Filtra per matricola o condominio
            </label>
            <input id="q" name="q" className="input" defaultValue={q ?? ""} />
          </div>
          <button className="btn-secondary" type="submit">
            Filtra
          </button>
        </form>

        {!base && (
          <p className="mt-4 rounded-md bg-danger-subtle px-4 py-3 text-sm text-danger-text">
            <strong>APP_URL non configurato.</strong> Senza indirizzo pubblico le etichette
            porterebbero a un link non valido: sono quattrocento adesivi da rifare. Impostarlo
            sul server prima di stampare.
          </p>
        )}

        {impianti.length === 200 && (
          <p className="mt-4 text-sm text-text-3">
            Mostrati i primi 200 impianti. Usare il filtro per stampare il resto.
          </p>
        )}
      </div>

      {base && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {impianti.map((i) => (
            <div
              key={i.id}
              className="flex break-inside-avoid items-center gap-3 rounded-lg border border-border p-3 print:border-black/40"
            >
              <div
                className="h-24 w-24 shrink-0"
                // SVG-то се сглобява на сървъра от нашата функция върху данни от
                // базата; няма потребителски вход в него.
                dangerouslySetInnerHTML={{
                  __html: qrSvg(urlImpianto(base, i.matricola), { modulo: 3, margine: 2 }),
                }}
              />
              <div className="min-w-0 text-xs leading-tight">
                <p className="font-mono text-sm font-semibold text-text-1">{i.matricola}</p>
                <p className="truncate text-text-2">{i.condominio?.nome ?? "—"}</p>
                <p className="truncate text-text-3">
                  {i.condominio?.indirizzo ?? ""}
                  {i.condominio?.citta ? `, ${i.condominio.citta}` : ""}
                </p>
                {i.marca && <p className="truncate text-text-3">{i.marca}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {impianti.length === 0 && (
        <p className="text-sm text-text-3 print:hidden">Nessun impianto corrisponde al filtro.</p>
      )}
    </div>
  );
}
