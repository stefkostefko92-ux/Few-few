// Писма за акаунта: потвърждение на имейла и известия по сигурността
// (смяна на парола, 2FA). Чисто — тества се. Езиците без превод → английски.

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export type SecurityNoticeKind =
  | 'password'
  | 'mfa-on'
  | 'mfa-off'
  | 'backup-used'
  | 'backup-new'
  | 'sessions'
  | 'admin-email'
  | 'admin-password';

type Strings = {
  verifySubject: string;
  verifyBody: string;
  verifyButton: string;
  verifyIgnore: string;
  noticeSubject: string;
  notice: Record<SecurityNoticeKind, string>;
  notYou: string;
  /** ЗЕТ чл. 10, ал. 2: потвърждение на регистрацията + ОУ (версия, връзка); без превод → английски. */
  registered?: (version: string, link: string) => string;
  /** „Забравена парола“ (docs/password-reset-spec.md); без превод → английски. */
  reset?: { subject: string; body: string; button: string; ignore: string };
};

const STRINGS: Record<string, Strings> = {
  bg: {
    registered: (version, link) =>
      `Регистрацията ти в Linketto е получена — акаунтът е създаден при <a href="${link}">Общите условия</a> (версия от ${version}).`,
    reset: {
      subject: 'Linketto: нова парола',
      body: 'Някой (надяваме се ти) поиска нова парола за акаунта ти. Натисни бутона, за да зададеш нова. Връзката важи 60 минути и е еднократна.',
      button: 'Задай нова парола',
      ignore: 'Не си искал(а) нова парола? Не прави нищо — паролата ти остава същата.',
    },
    verifySubject: 'Linketto: потвърди имейла си',
    verifyBody: 'Натисни бутона, за да потвърдиш, че този имейл е твой. Връзката важи 48 часа и е еднократна.',
    verifyButton: 'Потвърди имейла',
    verifyIgnore: 'Ако не си се регистрирал в Linketto, просто игнорирай това писмо.',
    noticeSubject: 'Linketto: промяна в сигурността на акаунта ти',
    notice: {
      password: 'Паролата на акаунта ти беше сменена. Всички други устройства са изведени от акаунта.',
      'mfa-on': 'Двуфакторното удостоверяване (2FA) беше включено за акаунта ти.',
      'mfa-off': 'Двуфакторното удостоверяване (2FA) беше изключено за акаунта ти.',
      'backup-used': 'При вход в акаунта ти беше използван резервен код за 2FA. Остават ти {left}.',
      'backup-new': 'Бяха създадени нови резервни кодове за 2FA — старите вече не важат.',
      sessions: 'Акаунтът ти беше изведен от всички устройства.',
      'admin-email': 'Администратор на Linketto смени имейла за вход на акаунта ти. Писмата вече отиват на новия адрес.',
      'admin-password': 'Администратор на Linketto зададе нова парола за акаунта ти. Всички устройства са изведени.',
    },
    notYou: 'Ако не си бил ти, смени паролата си веднага и ни пиши на info@carbonstealth.eu.',
  },
  en: {
    registered: (version, link) =>
      `Your Linketto registration has been received — the account was created under the <a href="${link}">Terms of Service</a> (version of ${version}).`,
    reset: {
      subject: 'Linketto: reset your password',
      body: 'Someone (hopefully you) asked for a new password for your account. Press the button to set a new one. The link is valid for 60 minutes and works once.',
      button: 'Set a new password',
      ignore: 'Didn’t ask for a new password? Do nothing — your password stays the same.',
    },
    verifySubject: 'Linketto: confirm your email',
    verifyBody: 'Press the button to confirm that this email is yours. The link is valid for 48 hours and works once.',
    verifyButton: 'Confirm email',
    verifyIgnore: 'If you did not sign up for Linketto, just ignore this email.',
    noticeSubject: 'Linketto: a security change on your account',
    notice: {
      password: 'The password of your account was changed. All other devices have been signed out.',
      'mfa-on': 'Two-factor authentication (2FA) was turned on for your account.',
      'mfa-off': 'Two-factor authentication (2FA) was turned off for your account.',
      'backup-used': 'A 2FA backup code was used to sign in to your account. You have {left} left.',
      'backup-new': 'New 2FA backup codes were created — the old ones no longer work.',
      sessions: 'Your account was signed out of all devices.',
      'admin-email': 'A Linketto administrator changed the sign-in email of your account. Emails now go to the new address.',
      'admin-password': 'A Linketto administrator set a new password for your account. All devices have been signed out.',
    },
    notYou: 'If this was not you, change your password right away and write to info@carbonstealth.eu.',
  },
  it: {
    registered: (version, link) =>
      `La tua registrazione a Linketto è stata ricevuta — l’account è stato creato alle condizioni dei <a href="${link}">Termini di servizio</a> (versione del ${version}).`,
    reset: {
      subject: 'Linketto: imposta una nuova password',
      body: 'Qualcuno (speriamo tu) ha chiesto una nuova password per il tuo account. Premi il pulsante per impostarne una nuova. Il link è valido 60 minuti e si può usare una sola volta.',
      button: 'Imposta una nuova password',
      ignore: 'Non hai chiesto una nuova password? Non fare nulla — la tua password resta la stessa.',
    },
    verifySubject: 'Linketto: conferma la tua email',
    verifyBody: 'Premi il pulsante per confermare che questa email è tua. Il link è valido 48 ore e si può usare una sola volta.',
    verifyButton: 'Conferma l’email',
    verifyIgnore: 'Se non ti sei registrato su Linketto, ignora semplicemente questa email.',
    noticeSubject: 'Linketto: una modifica alla sicurezza del tuo account',
    notice: {
      password: 'La password del tuo account è stata cambiata. Tutti gli altri dispositivi sono stati disconnessi dall’account.',
      'mfa-on': 'L’autenticazione a due fattori (2FA) è stata attivata per il tuo account.',
      'mfa-off': 'L’autenticazione a due fattori (2FA) è stata disattivata per il tuo account.',
      'backup-used': 'Per accedere al tuo account è stato usato un codice di backup 2FA. Te ne restano {left}.',
      'backup-new': 'Sono stati creati nuovi codici di backup 2FA — quelli vecchi non valgono più.',
      sessions: 'Il tuo account è stato disconnesso da tutti i dispositivi.',
      'admin-email': 'Un amministratore di Linketto ha cambiato l’email di accesso del tuo account. I messaggi ora arrivano al nuovo indirizzo.',
      'admin-password': 'Un amministratore di Linketto ha impostato una nuova password per il tuo account. Tutti i dispositivi sono stati disconnessi.',
    },
    notYou: 'Se non sei stato tu, cambia subito la password e scrivici a info@carbonstealth.eu.',
  },
  es: {
    registered: (version, link) =>
      `Hemos recibido tu registro en Linketto — la cuenta se ha creado conforme a los <a href="${link}">Términos del servicio</a> (versión del ${version}).`,
    reset: {
      subject: 'Linketto: establece una nueva contraseña',
      body: 'Alguien (esperamos que tú) ha pedido una nueva contraseña para tu cuenta. Pulsa el botón para establecer una nueva. El enlace es válido durante 60 minutos y solo se puede usar una vez.',
      button: 'Establecer una nueva contraseña',
      ignore: '¿No has pedido una nueva contraseña? No hagas nada — tu contraseña sigue siendo la misma.',
    },
    verifySubject: 'Linketto: confirma tu email',
    verifyBody: 'Pulsa el botón para confirmar que este email es tuyo. El enlace es válido durante 48 horas y solo se puede usar una vez.',
    verifyButton: 'Confirmar el email',
    verifyIgnore: 'Si no te has registrado en Linketto, simplemente ignora este mensaje.',
    noticeSubject: 'Linketto: un cambio en la seguridad de tu cuenta',
    notice: {
      password: 'Se ha cambiado la contraseña de tu cuenta. Se ha cerrado la sesión en todos los demás dispositivos.',
      'mfa-on': 'Se ha activado la autenticación de dos factores (2FA) en tu cuenta.',
      'mfa-off': 'Se ha desactivado la autenticación de dos factores (2FA) en tu cuenta.',
      'backup-used': 'Se ha usado un código de respaldo de 2FA para iniciar sesión en tu cuenta. Te quedan {left}.',
      'backup-new': 'Se han creado nuevos códigos de respaldo de 2FA — los anteriores ya no valen.',
      sessions: 'Se ha cerrado la sesión de tu cuenta en todos los dispositivos.',
      'admin-email': 'Un administrador de Linketto ha cambiado el email de acceso de tu cuenta. Los mensajes llegan ahora a la nueva dirección.',
      'admin-password': 'Un administrador de Linketto ha establecido una nueva contraseña para tu cuenta. Se ha cerrado la sesión en todos los dispositivos.',
    },
    notYou: 'Si no has sido tú, cambia tu contraseña de inmediato y escríbenos a info@carbonstealth.eu.',
  },
  de: {
    registered: (version, link) =>
      `Deine Registrierung bei Linketto ist eingegangen — das Konto wurde zu den <a href="${link}">Nutzungsbedingungen</a> (Fassung vom ${version}) angelegt.`,
    reset: {
      subject: 'Linketto: Lege ein neues Passwort fest',
      body: 'Jemand (hoffentlich du) hat ein neues Passwort für dein Konto angefordert. Klicke auf den Button, um ein neues festzulegen. Der Link ist 60 Minuten gültig und funktioniert nur einmal.',
      button: 'Neues Passwort festlegen',
      ignore: 'Du hast kein neues Passwort angefordert? Dann musst du nichts tun — dein Passwort bleibt unverändert.',
    },
    verifySubject: 'Linketto: Bestätige deine E-Mail-Adresse',
    verifyBody: 'Klicke auf den Button, um zu bestätigen, dass diese E-Mail-Adresse dir gehört. Der Link ist 48 Stunden gültig und funktioniert nur einmal.',
    verifyButton: 'E-Mail-Adresse bestätigen',
    verifyIgnore: 'Wenn du dich nicht bei Linketto registriert hast, ignoriere diese E-Mail einfach.',
    noticeSubject: 'Linketto: eine Sicherheitsänderung an deinem Konto',
    notice: {
      password: 'Das Passwort deines Kontos wurde geändert. Alle anderen Geräte wurden vom Konto abgemeldet.',
      'mfa-on': 'Die Zwei-Faktor-Authentifizierung (2FA) wurde für dein Konto eingeschaltet.',
      'mfa-off': 'Die Zwei-Faktor-Authentifizierung (2FA) wurde für dein Konto ausgeschaltet.',
      'backup-used': 'Bei der Anmeldung in deinem Konto wurde ein 2FA-Backup-Code verwendet. Du hast noch {left}.',
      'backup-new': 'Es wurden neue 2FA-Backup-Codes erstellt — die alten gelten nicht mehr.',
      sessions: 'Dein Konto wurde auf allen Geräten abgemeldet.',
      'admin-email': 'Ein Linketto-Administrator hat die Anmelde-E-Mail-Adresse deines Kontos geändert. E-Mails gehen jetzt an die neue Adresse.',
      'admin-password': 'Ein Linketto-Administrator hat ein neues Passwort für dein Konto festgelegt. Alle Geräte wurden abgemeldet.',
    },
    notYou: 'Wenn du das nicht warst, ändere sofort dein Passwort und schreib uns an info@carbonstealth.eu.',
  },
  fr: {
    registered: (version, link) =>
      `Votre inscription à Linketto a bien été reçue — le compte a été créé selon les <a href="${link}">Conditions d’utilisation</a> (version du ${version}).`,
    reset: {
      subject: 'Linketto : définissez un nouveau mot de passe',
      body: 'Quelqu’un (vous, espérons-le) a demandé un nouveau mot de passe pour votre compte. Cliquez sur le bouton pour en définir un nouveau. Le lien est valable 60 minutes et ne fonctionne qu’une seule fois.',
      button: 'Définir un nouveau mot de passe',
      ignore: 'Vous n’avez pas demandé de nouveau mot de passe ? Ne faites rien — votre mot de passe reste inchangé.',
    },
    verifySubject: 'Linketto : confirmez votre e-mail',
    verifyBody: 'Cliquez sur le bouton pour confirmer que cette adresse e-mail est bien la vôtre. Le lien est valable 48 heures et ne fonctionne qu’une seule fois.',
    verifyButton: 'Confirmer l’e-mail',
    verifyIgnore: 'Si vous ne vous êtes pas inscrit sur Linketto, ignorez simplement cet e-mail.',
    noticeSubject: 'Linketto : une modification de la sécurité de votre compte',
    notice: {
      password: 'Le mot de passe de votre compte a été changé. Tous les autres appareils ont été déconnectés du compte.',
      'mfa-on': 'L’authentification à deux facteurs (2FA) a été activée pour votre compte.',
      'mfa-off': 'L’authentification à deux facteurs (2FA) a été désactivée pour votre compte.',
      'backup-used': 'Un code de secours 2FA a été utilisé lors d’une connexion à votre compte. Il vous en reste {left}.',
      'backup-new': 'De nouveaux codes de secours 2FA ont été créés — les anciens ne sont plus valables.',
      sessions: 'Votre compte a été déconnecté de tous les appareils.',
      'admin-email': 'Un administrateur de Linketto a modifié l’e-mail de connexion de votre compte. Les e-mails sont désormais envoyés à la nouvelle adresse.',
      'admin-password': 'Un administrateur de Linketto a défini un nouveau mot de passe pour votre compte. Tous les appareils ont été déconnectés.',
    },
    notYou: 'Si ce n’était pas vous, changez immédiatement votre mot de passe et écrivez-nous à info@carbonstealth.eu.',
  },
};

function pick(locale: string): Strings {
  return STRINGS[locale] ?? STRINGS.en!;
}

const frame = (body: string) => `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.55">
  <h1 style="font-size:20px">Linketto</h1>
  ${body}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · info@carbonstealth.eu</p>
</div>`;

export function verifyEmailMessage(input: {
  locale: string;
  url: string;
  termsUrl?: string;
  termsVersion?: string;
}): { subject: string; html: string } {
  const s = pick(input.locale);
  const url = esc(input.url);
  const registered = s.registered ?? STRINGS.en!.registered!;
  const receipt =
    input.termsUrl && input.termsVersion ? `<p>${registered(esc(input.termsVersion), esc(input.termsUrl))}</p>\n  ` : '';
  return {
    subject: s.verifySubject,
    html: frame(`${receipt}<p>${s.verifyBody}</p>
  <p><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">${s.verifyButton}</a></p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">${url}</p>
  <p style="font-size:14px">${s.verifyIgnore}</p>`),
  };
}

export function securityNoticeMessage(input: {
  locale: string;
  kind: SecurityNoticeKind;
  left?: number;
}): { subject: string; html: string } {
  const s = pick(input.locale);
  const line = s.notice[input.kind].replace('{left}', String(input.left ?? 0));
  return { subject: s.noticeSubject, html: frame(`<p>${esc(line)}</p><p>${s.notYou}</p>`) };
}

export function resetPasswordMessage(input: { locale: string; url: string }): { subject: string; html: string } {
  const r = pick(input.locale).reset ?? STRINGS.en!.reset!;
  const url = esc(input.url);
  return {
    subject: r.subject,
    html: frame(`<p>${esc(r.body)}</p>
  <p><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">${esc(r.button)}</a></p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">${url}</p>
  <p style="font-size:14px">${esc(r.ignore)}</p>`),
  };
}
