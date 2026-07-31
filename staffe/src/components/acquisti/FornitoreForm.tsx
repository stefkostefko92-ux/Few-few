'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { chiama } from './client-api';

/**
 * Anagrafica fornitore.
 *
 * Il tempo di consegna dichiarato serve a pianificare il riordino; quello reale
 * lo misura il sistema sugli ordini chiusi (vedi scheda fornitore). Tenere i due
 * numeri separati è ciò che rende visibile un fornitore che promette 7 giorni e
 * ne impiega 20.
 */

export type FornitoreIniziale = {
  id: string;
  code: string;
  name: string;
  vatNumber: string | null;
  taxCode: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  country: string;
  paymentTerms: string | null;
  leadTimeDays: number;
  notes: string | null;
  active: boolean;
};

type Campi = {
  code: string;
  name: string;
  vatNumber: string;
  taxCode: string;
  email: string;
  phone: string;
  contactName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  paymentTerms: string;
  leadTimeDays: string;
  notes: string;
};

function daIniziale(f?: FornitoreIniziale): Campi {
  return {
    code: f?.code ?? '',
    name: f?.name ?? '',
    vatNumber: f?.vatNumber ?? '',
    taxCode: f?.taxCode ?? '',
    email: f?.email ?? '',
    phone: f?.phone ?? '',
    contactName: f?.contactName ?? '',
    addressLine: f?.addressLine ?? '',
    city: f?.city ?? '',
    postalCode: f?.postalCode ?? '',
    province: f?.province ?? '',
    country: f?.country ?? 'IT',
    paymentTerms: f?.paymentTerms ?? '',
    leadTimeDays: String(f?.leadTimeDays ?? 7),
    notes: f?.notes ?? '',
  };
}

export function FornitoreForm({ iniziale }: { iniziale?: FornitoreIniziale }) {
  const router = useRouter();
  const [campi, setCampi] = useState<Campi>(() => daIniziale(iniziale));
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  function imposta(nome: keyof Campi, valore: string) {
    setCampi((c) => ({ ...c, [nome]: valore }));
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    const giorni = Number(campi.leadTimeDays);
    if (!Number.isInteger(giorni) || giorni < 0 || giorni > 365) {
      setErrore('Il tempo di consegna è un numero intero di giorni (0–365).');
      return;
    }

    const corpo = {
      code: campi.code.trim(),
      name: campi.name.trim(),
      vatNumber: campi.vatNumber.trim() || null,
      taxCode: campi.taxCode.trim() || null,
      email: campi.email.trim() || null,
      phone: campi.phone.trim() || null,
      contactName: campi.contactName.trim() || null,
      addressLine: campi.addressLine.trim() || null,
      city: campi.city.trim() || null,
      postalCode: campi.postalCode.trim() || null,
      province: campi.province.trim() || null,
      country: campi.country.trim() || 'IT',
      paymentTerms: campi.paymentTerms.trim() || null,
      leadTimeDays: giorni,
      notes: campi.notes.trim() || null,
    };

    setInCorso(true);
    const esito = iniziale
      ? await chiama<{ id: string }>(`/api/fornitori/${iniziale.id}`, 'PATCH', corpo)
      : await chiama<{ id: string }>('/api/fornitori', 'POST', corpo);
    setInCorso(false);

    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }
    router.push(`/fornitori/${esito.dati.id}`);
    router.refresh();
  }

  async function disattiva() {
    if (!iniziale) return;
    setErrore(null);
    setInCorso(true);
    const esito = await chiama(`/api/fornitori/${iniziale.id}`, 'DELETE');
    setInCorso(false);
    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }
    router.refresh();
  }

  async function riattiva() {
    if (!iniziale) return;
    setErrore(null);
    setInCorso(true);
    const esito = await chiama(`/api/fornitori/${iniziale.id}`, 'PATCH', { active: true });
    setInCorso(false);
    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={salva} className="space-y-6">
      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Codice" htmlFor="codice" required hint="Lettere, cifre, punto, trattino">
          <Input
            id="codice"
            value={campi.code}
            required
            maxLength={32}
            onChange={(e) => imposta('code', e.target.value)}
          />
        </Field>
        <Field label="Ragione sociale" htmlFor="ragione" required>
          <Input
            id="ragione"
            value={campi.name}
            required
            maxLength={160}
            onChange={(e) => imposta('name', e.target.value)}
          />
        </Field>
        <Field label="Partita IVA" htmlFor="piva">
          <Input
            id="piva"
            value={campi.vatNumber}
            maxLength={20}
            onChange={(e) => imposta('vatNumber', e.target.value)}
          />
        </Field>
        <Field label="Codice fiscale" htmlFor="cf">
          <Input
            id="cf"
            value={campi.taxCode}
            maxLength={20}
            onChange={(e) => imposta('taxCode', e.target.value)}
          />
        </Field>
        <Field label="Referente" htmlFor="referente">
          <Input
            id="referente"
            value={campi.contactName}
            maxLength={120}
            onChange={(e) => imposta('contactName', e.target.value)}
          />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={campi.email}
            maxLength={160}
            onChange={(e) => imposta('email', e.target.value)}
          />
        </Field>
        <Field label="Telefono" htmlFor="telefono">
          <Input
            id="telefono"
            type="tel"
            value={campi.phone}
            maxLength={40}
            onChange={(e) => imposta('phone', e.target.value)}
          />
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Indirizzo" htmlFor="indirizzo">
          <Input
            id="indirizzo"
            value={campi.addressLine}
            maxLength={200}
            onChange={(e) => imposta('addressLine', e.target.value)}
          />
        </Field>
        <Field label="Città" htmlFor="citta">
          <Input
            id="citta"
            value={campi.city}
            maxLength={80}
            onChange={(e) => imposta('city', e.target.value)}
          />
        </Field>
        <Field label="CAP" htmlFor="cap">
          <Input
            id="cap"
            value={campi.postalCode}
            maxLength={12}
            onChange={(e) => imposta('postalCode', e.target.value)}
          />
        </Field>
        <Field label="Provincia" htmlFor="provincia">
          <Input
            id="provincia"
            value={campi.province}
            maxLength={4}
            onChange={(e) => imposta('province', e.target.value)}
          />
        </Field>
        <Field label="Paese" htmlFor="paese" hint="Codice ISO di 2 lettere">
          <Input
            id="paese"
            value={campi.country}
            maxLength={2}
            onChange={(e) => imposta('country', e.target.value)}
          />
        </Field>
        <Field label="Termini di pagamento" htmlFor="pagamento" hint="es. 30 gg d.f.f.m.">
          <Input
            id="pagamento"
            value={campi.paymentTerms}
            maxLength={120}
            onChange={(e) => imposta('paymentTerms', e.target.value)}
          />
        </Field>
        <Field
          label="Tempo di consegna dichiarato (giorni)"
          htmlFor="leadtime"
          hint="Usato per pianificare il riordino"
        >
          <Input
            id="leadtime"
            inputMode="numeric"
            value={campi.leadTimeDays}
            onChange={(e) => imposta('leadTimeDays', e.target.value)}
          />
        </Field>
      </Card>

      <Field label="Note" htmlFor="note-fornitore">
        <Textarea
          id="note-fornitore"
          value={campi.notes}
          maxLength={2000}
          onChange={(e) => imposta('notes', e.target.value)}
        />
      </Field>

      {errore && (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {errore}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : iniziale ? 'Salva modifiche' : 'Crea fornitore'}
        </Button>
        {iniziale &&
          (iniziale.active ? (
            <Button type="button" variant="pericolo" size="lg" disabled={inCorso} onClick={disattiva}>
              Disattiva
            </Button>
          ) : (
            <Button type="button" variant="secondario" size="lg" disabled={inCorso} onClick={riattiva}>
              Riattiva
            </Button>
          ))}
        <Button
          type="button"
          variant="fantasma"
          size="lg"
          disabled={inCorso}
          onClick={() => router.back()}
        >
          Torna indietro
        </Button>
      </div>
    </form>
  );
}
