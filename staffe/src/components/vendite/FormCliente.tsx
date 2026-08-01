'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseEuroToCents } from '@/lib/money';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { invia } from './client';

export type ClienteIniziale = {
  id: string;
  code: string;
  name: string;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  country: string;
  shipAddressLine: string | null;
  shipCity: string | null;
  shipPostalCode: string | null;
  shipProvince: string | null;
  shipCountry: string | null;
  paymentTerms: string | null;
  discountBp: number;
  notes: string | null;
  active: boolean;
};

type Campi = Record<string, string>;

function daCliente(c?: ClienteIniziale): Campi {
  return {
    code: c?.code ?? '',
    name: c?.name ?? '',
    vatNumber: c?.vatNumber ?? '',
    taxCode: c?.taxCode ?? '',
    sdiCode: c?.sdiCode ?? '',
    pec: c?.pec ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    contactName: c?.contactName ?? '',
    addressLine: c?.addressLine ?? '',
    city: c?.city ?? '',
    postalCode: c?.postalCode ?? '',
    province: c?.province ?? '',
    country: c?.country ?? 'IT',
    shipAddressLine: c?.shipAddressLine ?? '',
    shipCity: c?.shipCity ?? '',
    shipPostalCode: c?.shipPostalCode ?? '',
    shipProvince: c?.shipProvince ?? '',
    shipCountry: c?.shipCountry ?? '',
    paymentTerms: c?.paymentTerms ?? '',
    sconto: c ? String(c.discountBp / 100).replace('.', ',') : '0',
    notes: c?.notes ?? '',
  };
}

/**
 * Anagrafica cliente. Il codice destinatario SDI e la PEC non sono decorazioni:
 * senza uno dei due la fattura elettronica non arriva a destinazione.
 */
export function FormCliente({ cliente }: { cliente?: ClienteIniziale }) {
  const router = useRouter();
  const [campi, setCampi] = useState<Campi>(() => daCliente(cliente));
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  function set(nome: string, valore: string) {
    setCampi((p) => ({ ...p, [nome]: valore }));
  }

  function testo(nome: string, etichetta: string, extra?: { hint?: string; required?: boolean }) {
    return (
      <Field label={etichetta} htmlFor={`c-${nome}`} hint={extra?.hint} required={extra?.required}>
        <Input
          id={`c-${nome}`}
          value={campi[nome]}
          onChange={(e) => set(nome, e.target.value)}
        />
      </Field>
    );
  }

  async function salva() {
    setErrore(null);
    if (campi.name.trim().length < 2) {
      setErrore('La ragione sociale è obbligatoria.');
      return;
    }
    const scontoBp = parseEuroToCents(campi.sconto || '0');
    if (scontoBp === null || scontoBp < 0 || scontoBp > 10_000) {
      setErrore('Lo sconto di listino deve essere una percentuale fra 0 e 100.');
      return;
    }

    setInvio(true);
    try {
      const corpo = {
        code: campi.code.trim() || null,
        name: campi.name.trim(),
        vatNumber: campi.vatNumber.trim(),
        taxCode: campi.taxCode.trim(),
        sdiCode: campi.sdiCode.trim(),
        pec: campi.pec.trim(),
        email: campi.email.trim(),
        phone: campi.phone.trim(),
        contactName: campi.contactName.trim(),
        addressLine: campi.addressLine.trim(),
        city: campi.city.trim(),
        postalCode: campi.postalCode.trim(),
        province: campi.province.trim(),
        country: campi.country.trim() || 'IT',
        shipAddressLine: campi.shipAddressLine.trim(),
        shipCity: campi.shipCity.trim(),
        shipPostalCode: campi.shipPostalCode.trim(),
        shipProvince: campi.shipProvince.trim(),
        shipCountry: campi.shipCountry.trim(),
        paymentTerms: campi.paymentTerms.trim(),
        discountBp: scontoBp,
        notes: campi.notes.trim(),
      };

      if (cliente) {
        await invia(`/api/clienti/${cliente.id}`, 'PATCH', corpo);
        router.refresh();
      } else {
        const creato = await invia<{ id: string }>('/api/clienti', 'POST', corpo);
        router.push(`/clienti/${creato.id}`);
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="space-y-4">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted sm:col-span-2 lg:col-span-3">
          Anagrafica
        </h2>
        {testo('code', 'Codice', { hint: 'Vuoto = progressivo automatico (CLI-0001).' })}
        {testo('name', 'Ragione sociale', { required: true })}
        {testo('contactName', 'Referente')}
        {testo('vatNumber', 'Partita IVA')}
        {testo('taxCode', 'Codice fiscale')}
        {testo('sdiCode', 'Codice destinatario SDI', { hint: '7 caratteri (6 per la PA).' })}
        {testo('pec', 'PEC')}
        {testo('email', 'E-mail')}
        {testo('phone', 'Telefono')}
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted sm:col-span-2 lg:col-span-3">
          Indirizzo di fatturazione
        </h2>
        {testo('addressLine', 'Indirizzo')}
        {testo('city', 'Città')}
        {testo('postalCode', 'CAP')}
        {testo('province', 'Provincia')}
        {testo('country', 'Paese', { hint: 'Codice ISO di 2 lettere.' })}
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted sm:col-span-2 lg:col-span-3">
          Indirizzo di spedizione
        </h2>
        <p className="text-sm text-fg-muted sm:col-span-2 lg:col-span-3">
          Lasciare vuoto se coincide con la fatturazione.
        </p>
        {testo('shipAddressLine', 'Indirizzo')}
        {testo('shipCity', 'Città')}
        {testo('shipPostalCode', 'CAP')}
        {testo('shipProvince', 'Provincia')}
        {testo('shipCountry', 'Paese')}
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted sm:col-span-2 lg:col-span-3">
          Condizioni commerciali
        </h2>
        {testo('paymentTerms', 'Termini di pagamento', { hint: 'Es. «30 gg d.f.f.m.».' })}
        <Field
          label="Sconto di listino (%)"
          htmlFor="c-sconto"
          hint="Applicato in automatico alle nuove righe d’ordine."
        >
          <Input
            id="c-sconto"
            inputMode="decimal"
            value={campi.sconto}
            onChange={(e) => set('sconto', e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="c-notes">
          <Textarea
            id="c-notes"
            value={campi.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </Card>

      <Button type="button" onClick={salva} disabled={invio}>
        {invio ? 'Salvataggio…' : cliente ? 'Salva modifiche' : 'Crea cliente'}
      </Button>
    </div>
  );
}
