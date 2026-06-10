#!/bin/bash
set -e
APP_DIR="/var/www/erp-ascensori"
DOMAIN="erp.carbonstealth.eu"

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   ERP Ascensori Enterprise v3 — DEPLOY PRODUCTION     ║"
echo "╚═══════════════════════════════════════════════════════╝"

cd "$APP_DIR"

# 1. ENV
echo "[1/7] Configurazione .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|HMAC_SECRET=.*|HMAC_SECRET=$(openssl rand -hex 32)|" .env
  echo "  ✅ .env creato"
else
  echo "  ✅ .env esistente"
fi

# 2. BUILD
echo "[2/7] Build containers..."
docker compose build --no-cache
echo "  ✅ Build completato"

# 3. START
echo "[3/7] Avvio..."
docker compose up -d
echo "  ✅ Containers avviati"

# 4. WAIT DB
echo "[4/7] Attendo database..."
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U erp_admin -d erp_ascensori >/dev/null 2>&1 && break
  sleep 1
done
sleep 5
echo "  ✅ PostgreSQL pronto"

# 5. SEED
echo "[5/7] Seed database..."
docker compose exec -T backend sh << 'SEEDBLOCK'
cat > /app/seed-production.js << 'JSEOF'
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const p = new PrismaClient();

async function main() {
  console.log("  Seed avviato...");

  // Users
  const pw1 = await bcrypt.hash("admin2025", 10);
  const u = await p.user.upsert({ where: { email: "admin@erp-ascensori.it" }, update: {}, create: { email: "admin@erp-ascensori.it", password: pw1, nome: "Amministratore", cognome: "Sistema", ruolo: "MASTER" } });
  const pw2 = await bcrypt.hash("tecnico2025", 10);
  await p.user.upsert({ where: { email: "tecnico@erp-ascensori.it" }, update: {}, create: { email: "tecnico@erp-ascensori.it", password: pw2, nome: "Marco", cognome: "Rossi", ruolo: "TECNICO" } });
  console.log("    Users OK");

  // Amministratori
  const a1 = await p.amministratore.upsert({ where: { id: "seed-a1" }, update: {}, create: { id: "seed-a1", tipo: "SOCIETA", nome: "Giuseppe", cognome: "Verdi", ragioneSociale: "Verdi Gestioni SRL", email: "info@verdigestioni.it", telefono: "+39 02 1234567", partitaIva: "12345678901", indirizzo: "Via Roma 15", citta: "Milano", cap: "20121" } });
  const a2 = await p.amministratore.upsert({ where: { id: "seed-a2" }, update: {}, create: { id: "seed-a2", tipo: "PERSONA_FISICA", nome: "Anna", cognome: "Bianchi", email: "anna.bianchi@pec.it", telefono: "+39 02 7654321", indirizzo: "Corso Buenos Aires 42", citta: "Milano", cap: "20124" } });
  console.log("    Amministratori OK");

  // Condomini
  const c1 = await p.condominio.upsert({ where: { id: "seed-c1" }, update: {}, create: { id: "seed-c1", nome: "Residenza del Parco", indirizzo: "Via Garibaldi 22", citta: "Milano", cap: "20121", provincia: "MI", unitaImmobiliari: 24, amministratoreId: a1.id } });
  const c2 = await p.condominio.upsert({ where: { id: "seed-c2" }, update: {}, create: { id: "seed-c2", nome: "Palazzo Duomo Center", indirizzo: "Piazza Duomo 3", citta: "Milano", cap: "20122", provincia: "MI", unitaImmobiliari: 16, amministratoreId: a2.id } });
  console.log("    Condomini OK");

  // Impianti
  await p.impianto.upsert({ where: { matricola: "MI-2024-001" }, update: {}, create: { matricola: "MI-2024-001", marca: "KONE", modello: "MonoSpace 500", anno: 2020, portata: 630, fermate: 8, stato: "ATTIVO", indirizzo: "Via Garibaldi 22, Milano", prossimaRevisione: new Date("2025-06-15"), condominioId: c1.id, amministratoreId: a1.id } });
  await p.impianto.upsert({ where: { matricola: "MI-2024-002" }, update: {}, create: { matricola: "MI-2024-002", marca: "Otis", modello: "Gen2 Comfort", anno: 2018, portata: 480, fermate: 6, stato: "ATTIVO", indirizzo: "Piazza Duomo 3, Milano", prossimaRevisione: new Date("2025-05-01"), condominioId: c2.id, amministratoreId: a2.id } });
  await p.impianto.upsert({ where: { matricola: "MI-2024-003" }, update: {}, create: { matricola: "MI-2024-003", marca: "Schindler", modello: "3300", anno: 2015, portata: 1000, fermate: 12, stato: "MANUTENZIONE", indirizzo: "Via Garibaldi 22, Milano", prossimaRevisione: new Date("2025-04-10"), condominioId: c1.id, amministratoreId: a1.id } });
  console.log("    Impianti OK");

  // Dipendenti
  const d1 = await p.dipendente.upsert({ where: { id: "seed-d1" }, update: {}, create: { id: "seed-d1", nome: "Marco", cognome: "Rossi", tipo: "TECNICO", email: "marco.rossi@erp.it", telefono: "+39 333 1111111", specializzazioni: ["KONE", "Otis"], patente: "B" } });
  const d2 = await p.dipendente.upsert({ where: { id: "seed-d2" }, update: {}, create: { id: "seed-d2", nome: "Luca", cognome: "Ferrari", tipo: "TECNICO", email: "luca.ferrari@erp.it", telefono: "+39 333 2222222", specializzazioni: ["Schindler", "ThyssenKrupp"], patente: "B" } });
  await p.dipendente.upsert({ where: { id: "seed-d3" }, update: {}, create: { id: "seed-d3", nome: "Elena", cognome: "Conti", tipo: "AMMINISTRATIVO", email: "elena.conti@erp.it", telefono: "+39 333 3333333" } });
  console.log("    Dipendenti OK");

  // Automezzi
  await p.automezzo.upsert({ where: { targa: "FG123AB" }, update: {}, create: { targa: "FG123AB", marca: "Fiat", modello: "Ducato", anno: 2022, chilometraggio: 45000, scadenzaRevisione: new Date("2025-06-30"), scadenzaAssicurazione: new Date("2025-12-31"), stato: "verde", conducenteId: d1.id } });
  await p.automezzo.upsert({ where: { targa: "HJ456CD" }, update: {}, create: { targa: "HJ456CD", marca: "Iveco", modello: "Daily", anno: 2021, chilometraggio: 68000, scadenzaRevisione: new Date("2025-05-15"), stato: "giallo", conducenteId: d2.id } });
  console.log("    Automezzi OK");

  // Cottimisti
  await p.cottimista.upsert({ where: { id: "seed-ct1" }, update: {}, create: { id: "seed-ct1", ragioneSociale: "Ascensori Rapidi SNC", tipo: "AZIENDA", partitaIva: "98765432101", email: "info@ascensorirapidi.it", telefono: "+39 02 9999999" } });
  await p.cottimista.upsert({ where: { id: "seed-ct2" }, update: {}, create: { id: "seed-ct2", ragioneSociale: "Panev Ascensori", tipo: "DITTA_INDIVIDUALE", partitaIva: "3926848978", email: "ivo.y.panev@gmail.com" } });
  console.log("    Cottimisti OK");

  // Magazzino
  const ex = await p.articoloMagazzino.findFirst({ where: { codice: "COMP-001" } });
  if (!ex) {
    await p.articoloMagazzino.createMany({ data: [
      { codice: "COMP-001", nome: "Fune portante 8mm", tipo: "COMPONENTI", categoria: "Funi", quantita: 50, sogliaMinima: 10, prezzoAcquisto: 12.50, prezzoVendita: 25.00, ubicazione: "A1-01" },
      { codice: "COMP-002", nome: "Pattino guida cabina", tipo: "COMPONENTI", categoria: "Guide", quantita: 30, sogliaMinima: 5, prezzoAcquisto: 45, prezzoVendita: 85, ubicazione: "A1-02" },
      { codice: "COMP-003", nome: "Pulsantiera cabina 8P", tipo: "COMPONENTI", categoria: "Elettronica", quantita: 3, sogliaMinima: 3, prezzoAcquisto: 180, prezzoVendita: 350, ubicazione: "B2-01" },
      { codice: "COMP-004", nome: "Motore asincrono 7.5kW", tipo: "COMPONENTI", categoria: "Motori", quantita: 2, sogliaMinima: 1, prezzoAcquisto: 1200, prezzoVendita: 2200, ubicazione: "C1-01" },
      { codice: "VEND-001", nome: "Kit manutenzione base", tipo: "VENDITA", categoria: "Kit", quantita: 15, sogliaMinima: 5, prezzoAcquisto: 85, prezzoVendita: 180, ubicazione: "D1-01" },
      { codice: "VEND-002", nome: "Olio idraulico 20L", tipo: "VENDITA", categoria: "Lubrificanti", quantita: 2, sogliaMinima: 8, prezzoAcquisto: 65, prezzoVendita: 120, ubicazione: "D2-01" },
    ] });
    console.log("    Magazzino OK");
  } else { console.log("    Magazzino skip (esiste)"); }

  // Preventivi
  await p.preventivo.upsert({ where: { numero: "PRV-00001" }, update: {}, create: { numero: "PRV-00001", oggetto: "Manutenzione straordinaria KONE", stato: "APPROVATO", totaleNetto: 4500, totaleIva: 990, totaleLordo: 5490, amministratoreId: a1.id, utenteId: u.id } });
  console.log("    Preventivi OK");

  // Ordini
  await p.ordineLavoro.upsert({ where: { numero: "OL-00001" }, update: {}, create: { numero: "OL-00001", oggetto: "Manutenzione straordinaria KONE MonoSpace", stato: "IN_LAVORO", priorita: "URGENTE", tecnicoId: d1.id, utenteId: u.id } });
  await p.ordineLavoro.upsert({ where: { numero: "OL-00002" }, update: {}, create: { numero: "OL-00002", oggetto: "Revisione periodica Otis Gen2", stato: "CONFERMATO", priorita: "ORDINARIA", tecnicoId: d2.id, utenteId: u.id } });
  console.log("    Ordini OK");

  // Fatture
  await p.fattura.upsert({ where: { numero: "FT-2025-001" }, update: {}, create: { numero: "FT-2025-001", tipo: "EMESSA", stato: "PAGATA", oggetto: "Manutenzione ordinaria Q1", totaleNetto: 2622.95, totaleIva: 577.05, totaleLordo: 3200, amministratoreId: a1.id, utenteId: u.id } });
  await p.fattura.upsert({ where: { numero: "FR-2025-001" }, update: {}, create: { numero: "FR-2025-001", tipo: "RICEVUTA", stato: "PAGATA", oggetto: "Acquisto componenti KONE", totaleNetto: 3688.52, totaleIva: 811.48, totaleLordo: 4500, utenteId: u.id } });
  console.log("    Fatture OK");

  // DDT
  await p.dDT.upsert({ where: { numero: "DDT-2025-001" }, update: {}, create: { numero: "DDT-2025-001", causale: "Trasporto componenti", destinatario: "Residenza del Parco", indirizzoConsegna: "Via Garibaldi 22, Milano" } });
  console.log("    DDT OK");

  // Documenti
  await p.documento.upsert({ where: { id: "seed-doc1" }, update: {}, create: { id: "seed-doc1", tipo: "CARTELLO_CANTIERE", titolo: "Cartello Fuori Servizio MI-2024-003", utenteId: u.id } });
  console.log("    Documenti OK");

  console.log("  ✅ SEED COMPLETO!");
}

main().catch(e => console.error("  ❌ ERRORE:", e.message)).finally(() => p.$disconnect());
JSEOF
cd /app && node seed-production.js
SEEDBLOCK
echo "  ✅ Database pronto"

# 6. NGINX
echo "[6/7] Nginx..."
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  cp "$APP_DIR/nginx/erp-ascensori.conf" /etc/nginx/sites-available/erp-ascensori
else
  cat > /etc/nginx/sites-available/erp-ascensori << 'NGXEOF'
server {
    listen 80;
    server_name erp.carbonstealth.eu;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location /api/ { proxy_pass http://127.0.0.1:4100; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /socket.io/ { proxy_pass http://127.0.0.1:4100; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
    location / { proxy_pass http://127.0.0.1:3100; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
NGXEOF
fi
ln -sf /etc/nginx/sites-available/erp-ascensori /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "  ✅ Nginx configurato"

# 7. SSL
echo "[7/7] SSL..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  mkdir -p /var/www/certbot
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@carbonstealth.eu 2>/dev/null && echo "  ✅ SSL installato" || echo "  ⚠️  SSL: certbot --nginx -d $DOMAIN"
else
  echo "  ✅ SSL presente"
fi

# DONE
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   ✅ DEPLOY COMPLETATO!                               ║"
echo "║                                                       ║"
echo "║   🌐 https://erp.carbonstealth.eu                     ║"
echo "║   📧 admin@erp-ascensori.it / admin2025               ║"
echo "║                                                       ║"
echo "║   docker compose logs -f     (log live)               ║"
echo "║   docker compose restart     (riavvia)                ║"
echo "║   ./scripts/backup.sh        (backup DB)              ║"
echo "╚═══════════════════════════════════════════════════════╝"
