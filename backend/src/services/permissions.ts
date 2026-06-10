import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

// ═══════════════════════════════════════════════════════
// MATRICE PERMESSI — unica fonte di verità per backend E frontend.
// Livelli: 1=MASTER 2=ADMIN 3=DIREZIONE 4=RESPONSABILE 5=TECNICO 6=OPERATORE 7=CLIENTE
// Il numero è il livello MASSIMO (più permissivo) che può eseguire l'azione.
// NB: CLIENTE (7) non ha accesso alla piattaforma: il login lo rifiuta e la matrice non gli concede nulla.
// ═══════════════════════════════════════════════════════

export const ROLE_LEVELS: Record<string, number> = {
  MASTER: 1, ADMIN: 2, DIREZIONE: 3, RESPONSABILE: 4, TECNICO: 5, OPERATORE: 6, CLIENTE: 7,
};

export interface ModulePerms { view: number; create: number; edit: number; delete: number }

// Chiavi canoniche = endpoint frontend
export const PERMISSION_MATRIX: Record<string, ModulePerms> = {
  dashboard:       { view: 6, create: 1, edit: 1, delete: 1 },
  impianti:        { view: 6, create: 4, edit: 4, delete: 2 },
  contratti:       { view: 4, create: 3, edit: 3, delete: 2 },
  visite:          { view: 6, create: 4, edit: 5, delete: 2 },
  verifiche:       { view: 6, create: 4, edit: 4, delete: 2 },
  segnalazioni:    { view: 6, create: 6, edit: 5, delete: 2 },
  condomini:       { view: 5, create: 4, edit: 4, delete: 2 },
  amministratori:  { view: 5, create: 4, edit: 4, delete: 2 },
  dipendenti:      { view: 4, create: 2, edit: 2, delete: 2 },
  automezzi:       { view: 5, create: 4, edit: 4, delete: 2 },
  cottimisti:      { view: 4, create: 3, edit: 3, delete: 2 },
  squadre:         { view: 4, create: 3, edit: 3, delete: 2 },
  magazzino:       { view: 5, create: 4, edit: 4, delete: 2 },
  movimenti:       { view: 5, create: 5, edit: 4, delete: 2 },
  preventivi:      { view: 4, create: 3, edit: 3, delete: 2 },
  lavori:          { view: 5, create: 4, edit: 4, delete: 2 },
  'buoni-lavoro':  { view: 5, create: 5, edit: 5, delete: 2 },
  ordini:          { view: 5, create: 4, edit: 5, delete: 2 },
  fatture:         { view: 3, create: 3, edit: 3, delete: 2 },
  ddt:             { view: 5, create: 4, edit: 4, delete: 2 },
  documenti:       { view: 5, create: 5, edit: 5, delete: 2 },
  audit:           { view: 2, create: 0, edit: 0, delete: 0 },
  ai:              { view: 6, create: 6, edit: 6, delete: 0 },
  utenti:          { view: 2, create: 2, edit: 2, delete: 1 },
  settings:        { view: 2, create: 2, edit: 2, delete: 2 },
};

// entityName usato da createCrudRouter → chiave canonica
const ENTITY_TO_MODULE: Record<string, string> = {
  impianti: 'impianti', condomini: 'condomini', amministratori: 'amministratori',
  dipendenti: 'dipendenti', automezzi: 'automezzi', cottimisti: 'cottimisti', squadre: 'squadre',
  articoli_magazzino: 'magazzino', movimenti_magazzino: 'movimenti',
  preventivi: 'preventivi', ordini_lavoro: 'ordini', fatture: 'fatture', ddt: 'ddt',
  documenti: 'documenti', audit_log: 'audit', lavori: 'lavori', buoni_lavoro: 'buoni-lavoro',
  contratti: 'contratti', visite_manutenzione: 'visite', verifiche_periodiche: 'verifiche',
  segnalazioni: 'segnalazioni',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  MASTER: 'Accesso totale al sistema, inclusa l\'eliminazione degli utenti.',
  ADMIN: 'Amministrazione completa: utenti, impostazioni, eliminazioni, import dati.',
  DIREZIONE: 'Gestione commerciale e finanziaria: contratti, preventivi, fatture, cottimisti. Nessuna eliminazione.',
  RESPONSABILE: 'Coordinamento operativo: impianti, visite, ordini, lavori, magazzino, anagrafiche.',
  TECNICO: 'Operatività sul campo: esegue visite e ordini, compila buoni di lavoro, registra movimenti di magazzino e segnalazioni.',
  OPERATORE: 'Consultazione operativa e apertura segnalazioni; usa l\'assistente AI.',
  CLIENTE: 'Accesso disabilitato: i clienti non accedono alla piattaforma.',
};

export function moduleForEntity(entityName: string): string {
  return ENTITY_TO_MODULE[entityName] || entityName;
}

export function can(ruolo: string | undefined, module: string, action: keyof ModulePerms): boolean {
  const level = ROLE_LEVELS[ruolo || ''] ?? 99;
  const perms = PERMISSION_MATRIX[module];
  if (!perms) return level <= 2; // modulo sconosciuto: solo ADMIN+
  return perms[action] > 0 && level <= perms[action];
}

// Mappa completa { ruolo: { modulo: { view/create/edit/delete: bool } } }
// Servita al frontend: guida NAV, pulsanti e l'anteprima ruolo.
export function fullPermissionMap(): Record<string, Record<string, Record<string, boolean>>> {
  const out: Record<string, any> = {};
  for (const ruolo of Object.keys(ROLE_LEVELS)) {
    out[ruolo] = {};
    for (const [module, perms] of Object.entries(PERMISSION_MATRIX)) {
      out[ruolo][module] = {
        view: can(ruolo, module, 'view'),
        create: can(ruolo, module, 'create'),
        edit: can(ruolo, module, 'edit'),
        delete: can(ruolo, module, 'delete'),
      };
    }
  }
  return out;
}

export function requirePermission(module: string, action: keyof ModulePerms) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }
    if (!can(req.user.ruolo, module, action)) {
      res.status(403).json({ error: `Il tuo ruolo (${req.user.ruolo}) non può eseguire "${action}" su "${module}"` });
      return;
    }
    next();
  };
}
