import { describe, it, expect } from 'vitest';
import { sanitizeForModel, SanitizeError } from './sanitize';

// Usa i modelli reali dello schema Prisma (richiede `prisma generate`)
describe('sanitizeForModel', () => {
  it('scarta chiavi sconosciute, relazioni annidate e metadati', () => {
    const out = sanitizeForModel('impianto', {
      matricola: 'MI-1',
      marca: 'KONE',
      modello: 'Test',
      campoInventato: 'x',
      condominio: { id: 'abc', nome: 'Nested' },
      _count: { ordiniLavoro: 3 },
      id: 'should-be-dropped',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    expect(out).toEqual({ matricola: 'MI-1', marca: 'KONE', modello: 'Test' });
  });

  it('converte date YYYY-MM-DD in Date', () => {
    const out = sanitizeForModel('impianto', { prossimaRevisione: '2026-09-01' });
    expect(out.prossimaRevisione).toBeInstanceOf(Date);
    expect((out.prossimaRevisione as Date).getUTCFullYear()).toBe(2026);
  });

  it('converte stringhe numeriche in Int', () => {
    const out = sanitizeForModel('impianto', { anno: '2024', portata: 630.7 });
    expect(out.anno).toBe(2024);
    expect(out.portata).toBe(630);
  });

  it('converte stringa CSV in lista per i campi array', () => {
    const out = sanitizeForModel('dipendente', { specializzazioni: 'KONE, Otis' });
    expect(out.specializzazioni).toEqual(['KONE', 'Otis']);
  });

  it('"" diventa null sui campi opzionali', () => {
    const out = sanitizeForModel('impianto', { indirizzo: '', anno: '' });
    expect(out.indirizzo).toBeNull();
    expect(out.anno).toBeNull();
  });

  it('mantiene i valori Json', () => {
    const foto = [{ url: '/uploads/a.jpg', nome: 'a.jpg' }];
    const out = sanitizeForModel('impianto', { foto });
    expect(out.foto).toEqual(foto);
  });

  it('converte booleani da stringa', () => {
    const out = sanitizeForModel('dipendente', { attivo: 'true' });
    expect(out.attivo).toBe(true);
  });

  it('rifiuta date non valide con SanitizeError', () => {
    expect(() => sanitizeForModel('impianto', { prossimaRevisione: 'non-una-data' })).toThrow(SanitizeError);
  });

  it('mantiene la mappatura del campo relazione *Id', () => {
    const out = sanitizeForModel('impianto', { condominioId: 'uuid-123' });
    expect(out.condominioId).toBe('uuid-123');
  });

  it('rifiuta payload non-oggetto', () => {
    expect(() => sanitizeForModel('impianto', [1, 2])).toThrow(SanitizeError);
    expect(() => sanitizeForModel('impianto', null)).toThrow(SanitizeError);
  });
});
