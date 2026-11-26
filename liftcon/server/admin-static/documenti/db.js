// IndexedDB на устройството: документите (работно копие + версия на сървъра), снимките (blob до качването),
// опашката за триене и метаданните (каталог, сесия). Изтрива се изцяло при изход (спецификация D9).
const NOME = "liftcon-documenti";
let dbp;

function apri() {
  dbp ??= new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("documenti", { keyPath: "id" });
      db.createObjectStore("foto", { keyPath: "id" }).createIndex("doc", "docId");
      db.createObjectStore("coda", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("meta", { keyPath: "k" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbp;
}

async function tx(store, modo, fn) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let risultato;
    Promise.resolve(fn(s)).then((r) => (risultato = r));
    t.oncomplete = () => ok(risultato);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}
const req = (r) => new Promise((ok, ko) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => ko(r.error))));

export const db = {
  documento: (id) => tx("documenti", "readonly", (s) => req(s.get(id))),
  documenti: () => tx("documenti", "readonly", (s) => req(s.getAll())),
  salvaDocumento: (rec) => tx("documenti", "readwrite", (s) => req(s.put(rec))),
  eliminaDocumento: async (id) => {
    await tx("documenti", "readwrite", (s) => req(s.delete(id)));
    for (const f of await db.fotoDi(id)) await db.eliminaFotoLocale(f.id);
  },
  foto: (id) => tx("foto", "readonly", (s) => req(s.get(id))),
  fotoDi: (docId) => tx("foto", "readonly", (s) => req(s.index("doc").getAll(docId))),
  tutteFoto: () => tx("foto", "readonly", (s) => req(s.getAll())),
  salvaFoto: (rec) => tx("foto", "readwrite", (s) => req(s.put(rec))),
  eliminaFotoLocale: (id) => tx("foto", "readwrite", (s) => req(s.delete(id))),
  accoda: (op) => tx("coda", "readwrite", (s) => req(s.add(op))),
  coda: () => tx("coda", "readonly", (s) => req(s.getAll())),
  togliDaCoda: (id) => tx("coda", "readwrite", (s) => req(s.delete(id))),
  meta: async (k) => (await tx("meta", "readonly", (s) => req(s.get(k))))?.v,
  salvaMeta: (k, v) => tx("meta", "readwrite", (s) => req(s.put({ k, v }))),
  /** Има ли нещо, което още не е на сървъра (за предупреждението при изход). */
  async inSospeso() {
    const [d, f, c] = await Promise.all([db.documenti(), db.tutteFoto(), db.coda()]);
    return d.filter((x) => x.sporco).length + f.filter((x) => !x.caricata).length + c.length;
  },
  async cancellaTutto() {
    (await apri()).close();
    dbp = undefined;
    await new Promise((ok) => {
      const r = indexedDB.deleteDatabase(NOME);
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    });
  },
};
