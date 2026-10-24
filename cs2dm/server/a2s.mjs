// a2s.mjs — минимален A2S_INFO клиент (Valve server query) без зависимости.
//
// Протоколът: заявка 0xFFFFFFFF 'T' "Source Engine Query\0"; сървърът може да върне първо
// предизвикателство (0x41 + 4 байта), което се добавя към повторната заявка; отговорът е 0x49.
import dgram from "node:dgram";

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const INFO_PAYLOAD = Buffer.from("TSource Engine Query\0", "latin1");
const S2C_CHALLENGE = 0x41;
const S2A_INFO = 0x49;

/**
 * @param {Buffer} [challenge] 4 байта от отговор 0x41
 * @returns {Buffer}
 */
export function buildInfoRequest(challenge) {
  return challenge ? Buffer.concat([HEADER, INFO_PAYLOAD, challenge]) : Buffer.concat([HEADER, INFO_PAYLOAD]);
}

/**
 * @param {Buffer} buf
 * @returns {Buffer | null} предизвикателството, ако пакетът е 0x41
 */
export function readChallenge(buf) {
  if (buf.length >= 9 && buf.readInt32LE(0) === -1 && buf[4] === S2C_CHALLENGE) return buf.subarray(5, 9);
  return null;
}

/**
 * @typedef {{ protocol: number, name: string, map: string, folder: string, game: string, appId: number,
 *   players: number, maxPlayers: number, bots: number, serverType: string, environment: string,
 *   passwordProtected: boolean, vac: boolean, version: string }} ServerInfo
 */

/**
 * @param {Buffer} buf
 * @returns {ServerInfo}
 */
export function parseInfo(buf) {
  if (buf.length < 6 || buf.readInt32LE(0) !== -1 || buf[4] !== S2A_INFO) {
    throw new Error("пакетът не е A2S_INFO отговор");
  }
  let o = 5;
  const readString = () => {
    const end = buf.indexOf(0, o);
    if (end < 0) throw new Error("отрязан A2S_INFO отговор (низ без край)");
    const s = buf.toString("utf8", o, end);
    o = end + 1;
    return s;
  };
  const protocol = buf[o++];
  const name = readString();
  const map = readString();
  const folder = readString();
  const game = readString();
  if (o + 9 > buf.length) throw new Error("отрязан A2S_INFO отговор (липсват полета)");
  const appId = buf.readUInt16LE(o);
  o += 2;
  const players = buf[o++];
  const maxPlayers = buf[o++];
  const bots = buf[o++];
  const serverType = String.fromCharCode(buf[o++]);
  const environment = String.fromCharCode(buf[o++]);
  const passwordProtected = buf[o++] === 1;
  const vac = buf[o++] === 1;
  const version = readString();
  return { protocol, name, map, folder, game, appId, players, maxPlayers, bots, serverType, environment, passwordProtected, vac, version };
}

/**
 * Пита сървъра за A2S_INFO; следва най-много едно предизвикателство на опит.
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<ServerInfo>}
 */
export function queryInfo(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    let settled = false;
    const finish = (/** @type {() => void} */ fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.close();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`няма A2S отговор от ${host}:${port} за ${timeoutMs} ms`))), timeoutMs);
    sock.on("error", (err) => finish(() => reject(err)));
    sock.on("message", (msg) => {
      const challenge = readChallenge(msg);
      if (challenge) {
        sock.send(buildInfoRequest(challenge), port, host);
        return;
      }
      try {
        const info = parseInfo(msg);
        finish(() => resolve(info));
      } catch (err) {
        finish(() => reject(err));
      }
    });
    sock.send(buildInfoRequest(), port, host);
  });
}
