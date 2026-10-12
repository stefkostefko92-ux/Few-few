import { filesKeks, type Config } from '../config.js';
import { Keyring } from './envelope.js';
import { FileAttachmentStore, type StoreCrypto } from './file-store.js';

type FilesSettings = Pick<
  Config,
  'ATTACHMENTS_DIR' | 'FILES_ENCRYPTION' | 'FILES_KEK' | 'FILES_KEK_PREVIOUS' | 'FILES_PLAINTEXT'
>;

/** Шифроването на хранилището по настройките (валидирани в config.ts — тук не се преценява). */
export function storeCryptoFrom(cfg: FilesSettings): StoreCrypto {
  const keks = filesKeks(cfg);
  if (!keks) return { keyring: null, plaintext: 'allow' };
  return { keyring: new Keyring(keks.current, keks.previous), plaintext: cfg.FILES_PLAINTEXT };
}

/** ЕДИНСТВЕНОТО място, където приложението и CLI-тата правят файловото хранилище. */
export function attachmentStoreFrom(
  cfg: FilesSettings,
  root = cfg.ATTACHMENTS_DIR,
): FileAttachmentStore {
  return new FileAttachmentStore(root, storeCryptoFrom(cfg));
}
