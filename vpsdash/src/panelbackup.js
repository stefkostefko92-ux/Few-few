// Бекъп на САМИЯ панел — конфигът и паметта му.
//
// Дупката, която това затваря, е ирония: панелът снима базите на всеки продукт,
// архивира томовете и праща копия на другия VPS — а собственият му конфиг
// (/etc/vps-dashboard/config.json: паролата, sessionSecret, peerToken, Telegram
// токените — тайни, които НЕ съществуват никъде другаде) и собствената му памет
// (/var/lib/vps-dashboard: одитът, базовите линии, историята на метриките,
// трафикът) не влизаха в нито един бекъп. Мъртъв диск връщаше продуктите и
// убиваше самоличността на пазача им.
//
// Три решения:
//
//  1. **Архивът е ШИФРИРАН (openssl aes-256-cbc, pbkdf2).** Той пътува към
//     другия VPS по правилата на offsite изнасянето — а носи тайните на панела.
//     Копие с тайни в чужда машина без шифър би превърнало бекъпа в пробив.
//  2. **Ключът се пази в конфига И у човека.** Шифроването го чете от конфига;
//     но конфигът е ВЪТРЕ в архива — при мъртъв диск ключът загива с него.
//     Затова при генериране ключът се ПОКАЗВА ВЕДНЪЖ (като резервните кодове на
//     2FA) с изричното „запиши го извън тази машина". Без записан ключ offsite
//     копието е нечетимо — и панелът го казва, вместо да се преструва.
//  3. **`offsite/` и `restore/` се ИЗКЛЮЧВАТ.** Иначе архивът поглъща чуждите
//     бекъпи (рекурсия: нашият архив утре съдържа днешния) и разопакованите
//     прегледи. Пази се панелът, не дъмповете — те имат собствен път.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DUMP_DIR } from './databases.js';
import { CONFIG_PATH } from './config.js';

// Името минава по offsite пътя → трябва да се разпознава от SHIP_RX (разширен
// с .tar.gz.enc). „panel-" префиксът го държи извън възстановяването на томове
// (RESTORABLE_RX иска vol-/dir-) и извън възрастта на дъмповете (не е .sql.gz).
export const PANEL_RX = /^panel-[\w.-]+-\d{8}-\d{6}\.tar\.gz\.enc$/;

export function ensurePanelKey(cfg, saveConfig) {
  if (cfg.backups?.panelKey) return { key: cfg.backups.panelKey, fresh: false };
  // 32 байта base64url — достатъчно за aes-256 парола, а се преписва на ръка.
  const key = crypto.randomBytes(32).toString('base64url');
  saveConfig(cfg, { backups: { ...cfg.backups, panelKey: key } });
  return { key, fresh: true };
}

// Редовете за нощния бекъп — влизат в СЪЩИЯ скрипт като снимката на базите,
// значи същият график, същата аларма при провал и същото offsite пътуване.
export function panelBackupLines(cfg) {
  const stateDir = cfg.paths?.stateDir || '/var/lib/vps-dashboard';
  const etcDir = path.dirname(CONFIG_PATH);
  const node = String(cfg.nodeId || 'local').replace(/[^\w.-]/g, '_');
  return [
    'echo "▸ Панелът (конфиг + state, шифрирано)…"',
    `if [ -n "\${CSD_PANEL_KEY:-}" ] && [ -d ${JSON.stringify(etcDir)} ]; then`,
    // tar чете от корена с --exclude по ПЪЛEN път: offsite/ (чужди бекъпи —
    // иначе рекурсия) и restore/ (разопаковани прегледи) не влизат.
    `  if tar czf - --exclude=${JSON.stringify(`${stateDir}/offsite`)} --exclude=${JSON.stringify(`${stateDir}/restore`)} ` +
      `-C / ${JSON.stringify(etcDir.replace(/^\//, ''))} ${JSON.stringify(stateDir.replace(/^\//, ''))} 2>/dev/null ` +
      `| openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:CSD_PANEL_KEY ` +
      `-out "${DUMP_DIR}/panel-${node}-$TS.tar.gz.enc" && [ -s "${DUMP_DIR}/panel-${node}-$TS.tar.gz.enc" ]; then`,
    '    echo "  ✔ панелът е сниман (шифрирано)"',
    '  else echo "  ✘ снимката на панела се провали"; rc=1; fi',
    // Пазим последните 5 — панелният архив е малък, но е на всеки бекъп.
    `  ls -1t ${DUMP_DIR}/panel-${node}-*.tar.gz.enc 2>/dev/null | tail -n +6 | xargs -r rm -f`,
    'else echo "  (пропуснато — няма ключ или конфиг папка)"; fi',
  ];
}

// Възстановяването е СЪЗНАТЕЛНО ръчно: то презаписва конфига и тайните на живия
// панел — точно операцията, при която искаш човек с терминал, не бутон. Панелът
// показва командата, не я изпълнява.
export function restoreInstructions(name) {
  const base = path.basename(String(name || 'panel-<възел>-<дата>.tar.gz.enc'));
  return [
    `# 1) Разшифровай (ключът е от „запиши го извън машината" — или от конфига, ако е жив):`,
    `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'<КЛЮЧЪТ>' -in ${DUMP_DIR}/${base} | tar tzf -   # първо ПРЕГЛЕД`,
    `# 2) Спри панела, разопаковай в КОРЕНА (възстановява /etc/vps-dashboard и /var/lib/vps-dashboard), пусни:`,
    `systemctl stop vps-dashboard`,
    `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'<КЛЮЧЪТ>' -in ${DUMP_DIR}/${base} | tar xzf - -C /`,
    `systemctl start vps-dashboard`,
  ].join('\n');
}

export function listPanelBackups() {
  try {
    return fs
      .readdirSync(DUMP_DIR)
      .filter((n) => PANEL_RX.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(DUMP_DIR, name));
        return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}
