// backend/src/i18n/it.js
export default {
  "error.generic": "Qualcosa è andato storto.",
  "error.notFound": "Non trovato.",
  "error.unauthorized": "Non hai l'autorizzazione.",

  "ticket.opened": "✅ Il tuo ticket è stato creato: {{channel}}",
  "ticket.closed": "🔒 Ticket chiuso da {{user}}.\n**Motivo:** {{reason}}",
  "ticket.claimed": "🛡️ Ticket preso in carico da {{user}}.",
  "ticket.unclaimed": "🔓 Ticket rilasciato. Qualsiasi membro dello staff può assistere.",
  "ticket.notATicket": "❌ Questo non è un canale ticket.",
  "ticket.limitReached": "❌ Hai già {{count}} ticket aperti. Chiudine uno prima di aprirne un altro.",
  "ticket.renamed": "✏️ Canale rinominato in `{{name}}`.",
  "ticket.escalated": "⬆️ Ticket escalato a {{panel}}.",
  "ticket.feedback.prompt": "Grazie per aver usato il nostro supporto! Valuta la tua esperienza:",
  "ticket.autoClosedInactivity": "⏱️ Questo ticket è stato chiuso automaticamente dopo {{hours}} ore di inattività.",
  "ticket.autoClosedLeave": "👋 Questo ticket è stato chiuso automaticamente perché il creatore ha lasciato il server.",

  "panel.spawned": "Pannello creato in {{channel}}.",
  "panel.defaultButtonLabel": "Apri Ticket",

  "form.started": "Controlla i tuoi DM per rispondere al modulo.",
  "form.submitted": "✅ Grazie! La tua risposta è stata ricevuta.",
  "form.cooldownActive": "❌ Puoi inviare di nuovo tra {{time}}.",
  "form.closedByAdmin": "❌ Questo modulo è attualmente chiuso.",
  "form.invalidAnswer": "❌ Risposta non valida. {{reason}}",
  "application.approved": "✅ La tua candidatura è stata approvata.",
  "application.denied": "❌ La tua candidatura è stata rifiutata.",

  "verify.success": "✅ Sei stato verificato! Benvenuto.",
  "verify.wrongAnswer": "❌ Risposta sbagliata. Riprova.",
  "verify.rateLimited": "❌ Troppi tentativi. Riprova tra {{minutes}} minuti.",
  "verify.accountTooNew": "❌ Il tuo account deve avere almeno {{days}} giorni.",
  "verify.gateBlocked": "❌ Devi prima verificarti. Visita il canale di verifica.",

  "poll.voted": "✅ Voto registrato.",
  "poll.voteRemoved": "Voto rimosso.",
  "poll.closed": "Questo sondaggio è chiuso.",
  "giveaway.entered": "🎉 Sei iscritto! Buona fortuna!",
  "giveaway.left": "Hai lasciato il giveaway.",
  "giveaway.missingRoles": "❌ Ti servono questi ruoli per partecipare: {{roles}}",
  "giveaway.ended": "Il giveaway è finito.",
  "giveaway.winnersAnnounce": "🎉 Congratulazioni {{winners}}! Hai vinto **{{prize}}**!",
  "giveaway.noWinners": "😔 Il giveaway per **{{prize}}** è finito senza partecipanti idonei.",

  "sticky.set": "📌 Messaggio fisso impostato per questo canale.",
  "sticky.removed": "🗑️ Messaggio fisso rimosso.",
  "schedule.added": "📅 Programmato per {{time}}",

  "premium.required": "❌ Questa funzione richiede Premium.",
  "premium.limitReached": "❌ Limite raggiunto: {{resource}} ({{limit}}). Passa a Premium.",
  "premium.trialStarted": "✨ La tua prova gratuita di 14 giorni è iniziata!",
  "premium.trialEndingSoon": "⏰ La prova gratuita scade tra {{days}} giorni.",

  "welcomer.default": "Benvenuto {{user}} in {{server}}! Siamo ora {{memberCount}} membri.",
};
