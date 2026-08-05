/**
 * Типовете на активната проверка живеят ОТДЕЛНО от нейната реализация.
 *
 * `sources/probe.ts` носи `import "server-only"` и отваря мрежови връзки —
 * клиентският компонент не бива да го докосва дори за тип. Затова договорът е
 * тук, в модул без нито един страничен ефект.
 */

export interface PortState {
  port: number;
  service: string;
  /** `open` = ръкостискането мина; `closed` = отказано; `filtered` = мълчание. */
  state: "open" | "closed" | "filtered";
  ms: number;
}

export interface TlsCertificate {
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  /** Имената в SAN — най-ценното поле: издава кой стои зад адреса. */
  names: string[];
  /** Изтекъл ли е сертификатът към момента на проверката. */
  expired: boolean;
  /** Договорената версия на протокола. */
  protocol?: string;
}

export interface ProbeResult {
  ports: PortState[];
  tls?: TlsCertificate;
  /** Заглавието `Server:` от HTTP отговор, ако има такъв. */
  httpServer?: string;
  totalMs: number;
}
