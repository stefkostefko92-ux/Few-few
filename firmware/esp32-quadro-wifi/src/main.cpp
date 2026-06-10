/*
 * ============================================================================
 *  MODULO WiFi - QUADRO DI MANOVRA ASCENSORE  (PROTOTIPO DIDATTICO)
 * ============================================================================
 *  Web-server locale (Access Point) per la parametrizzazione del controller
 *  ascensore via RS485 / Modbus RTU.
 *
 *  REGOLE DI SICUREZZA IMPLEMENTATE (vedi docs/02-parametri-wifi.md):
 *   - Categoria NS  (non-safety)       : scrittura via WiFi con login operatore
 *   - Categoria SR  (safety-relevant)  : scrittura SOLO con CHIAVE FISICA inserita
 *                                        (GPIO EN_PAR) + login admin
 *   - Categoria SC  (safety-critical)  : sola lettura, MAI scrivibile da remoto
 *   - Categoria RO  (telemetria)       : sola lettura
 *   - Clamp + rifiuto valori fuori range, anche con chiave inserita
 *   - Audit log di ogni scrittura
 *
 *  ⚠ Questo firmware NON fa parte della catena di sicurezza dell'ascensore.
 *    La sicurezza e' garantita esclusivamente da dispositivi cablati/PESSRAL
 *    certificati. Non modificare mai parametri di sicurezza via wireless.
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>

// ----------------------------- CONFIG HW -----------------------------------
#define PIN_RS485_RX   16   // ESP32 RX2  <- MAX485 RO
#define PIN_RS485_TX   17   // ESP32 TX2  -> MAX485 DI
#define PIN_RS485_DE   4    // MAX485 DE/RE (direzione)
#define PIN_EN_PAR     5    // Ingresso CHIAVE "abilitazione parametri safety"
#define PIN_STATUS_LED 2    // LED di stato

#define MODBUS_SLAVE_ID 1
#define MODBUS_BAUD     19200

// ----------------------------- CONFIG WiFi ---------------------------------
static const char* AP_SSID = "QUADRO-ASC-MANUT";
static const char* AP_PASS = "Cambiami-Subito-2026!";   // WPA2, da cambiare

// Credenziali demo (in produzione: hash + storage sicuro, non in chiaro!)
static const char* OPERATOR_USER = "operator";
static const char* OPERATOR_PASS = "op-2026";
static const char* ADMIN_USER    = "admin";
static const char* ADMIN_PASS    = "admin-2026";

// ----------------------------- STATO ---------------------------------------
ModbusMaster   node;
AsyncWebServer server(80);
JsonDocument   paramDb;          // mappa parametri caricata da /parametri.json

// Sessione minimale a token (prototipo).
struct Session { String token; String role; uint32_t expiresMs; };
Session g_session = { "", "", 0 };
static const uint32_t SESSION_TTL_MS = 10UL * 60UL * 1000UL;  // 10 minuti

// ----------------------------- MODBUS DIR ----------------------------------
void preTx()  { digitalWrite(PIN_RS485_DE, HIGH); }
void postTx() { digitalWrite(PIN_RS485_DE, LOW); }

// ------------------------- HELPERS PARAMETRI -------------------------------
JsonObject findParam(const String& id) {
  for (JsonObject p : paramDb["parametri"].as<JsonArray>()) {
    if (id == p["id"].as<const char*>()) return p;
  }
  return JsonObject();  // null
}

bool keyInserted() { return digitalRead(PIN_EN_PAR) == HIGH; }

bool sessionValid(const String& token, const char* requiredRole) {
  if (g_session.token.isEmpty() || token != g_session.token) return false;
  if (millis() > g_session.expiresMs) return false;
  if (requiredRole && g_session.role != requiredRole) return false;
  return true;
}

String bearer(AsyncWebServerRequest* req) {
  if (!req->hasHeader("Authorization")) return "";
  String h = req->header("Authorization");
  if (h.startsWith("Bearer ")) return h.substring(7);
  return "";
}

void auditLog(const String& who, const String& id, float value, const char* result) {
  // Prototipo: log seriale. In produzione -> file append su LittleFS/NVS.
  Serial.printf("[AUDIT] user=%s param=%s value=%.3f result=%s t=%lu\n",
                who.c_str(), id.c_str(), value, result, millis());
}

// Legge un holding register dal controller. Ritorna true se ok.
bool modbusRead(uint16_t reg, uint16_t& out) {
  uint8_t r = node.readHoldingRegisters(reg, 1);
  if (r == node.ku8MBSuccess) { out = node.getResponseBuffer(0); return true; }
  return false;
}

bool modbusWrite(uint16_t reg, uint16_t value) {
  return node.writeSingleRegister(reg, value) == node.ku8MBSuccess;
}

// --------------------------- HANDLERS API ----------------------------------

// POST /api/login   { "user":"...", "pass":"..." }
void handleLogin(AsyncWebServerRequest* req, JsonVariant& body) {
  String user = body["user"] | "";
  String pass = body["pass"] | "";
  String role;
  if (user == ADMIN_USER && pass == ADMIN_PASS)            role = "admin";
  else if (user == OPERATOR_USER && pass == OPERATOR_PASS) role = "operator";
  else { req->send(401, "application/json", "{\"error\":\"credenziali non valide\"}"); return; }

  g_session.token     = String((uint32_t)esp_random(), HEX) + String((uint32_t)esp_random(), HEX);
  g_session.role      = role;
  g_session.expiresMs = millis() + SESSION_TTL_MS;

  JsonDocument res;
  res["token"] = g_session.token;
  res["role"]  = role;
  res["ttl_s"] = SESSION_TTL_MS / 1000;
  String out; serializeJson(res, out);
  req->send(200, "application/json", out);
}

// GET /api/params  -> elenco parametri + valore corrente letto da Modbus
void handleGetParams(AsyncWebServerRequest* req) {
  JsonDocument res;
  JsonArray arr = res["parametri"].to<JsonArray>();
  for (JsonObject p : paramDb["parametri"].as<JsonArray>()) {
    JsonObject o = arr.add<JsonObject>();
    o["id"]    = p["id"];
    o["label"] = p["label"];
    o["unit"]  = p["unit"];
    o["cat"]   = p["cat"];
    if (!p["min"].isNull()) o["min"] = p["min"];
    if (!p["max"].isNull()) o["max"] = p["max"];

    uint16_t raw;
    if (modbusRead(p["reg"].as<uint16_t>(), raw)) {
      float scale = p["scale"] | 1.0;
      o["value"] = raw / scale;
    } else {
      o["value"] = nullptr;
      o["comm_error"] = true;
    }
  }
  res["key_inserted"] = keyInserted();
  String out; serializeJson(res, out);
  req->send(200, "application/json", out);
}

// POST /api/param   { "id":"acc_rate", "value": 0.8 }
void handleSetParam(AsyncWebServerRequest* req, JsonVariant& body) {
  String token = bearer(req);
  String id    = body["id"]    | "";
  if (id.isEmpty() || body["value"].isNull()) {
    req->send(400, "application/json", "{\"error\":\"id/value mancanti\"}"); return;
  }
  float value = body["value"].as<float>();

  JsonObject p = findParam(id);
  if (p.isNull()) { req->send(404, "application/json", "{\"error\":\"parametro inesistente\"}"); return; }

  String cat = p["cat"].as<const char*>();

  // --- Gate categoria SC / RO: mai scrivibili da remoto ---
  if (cat == "SC" || cat == "RO") {
    auditLog("?", id, value, "DENY_READONLY");
    req->send(403, "application/json", "{\"error\":\"parametro in sola lettura (safety-critical)\"}");
    return;
  }

  // --- Autenticazione ---
  const char* needRole = (cat == "SR") ? "admin" : nullptr;  // SR -> admin, NS -> qualsiasi loggato
  if (!sessionValid(token, needRole)) {
    auditLog("?", id, value, "DENY_AUTH");
    req->send(401, "application/json", "{\"error\":\"non autorizzato per questa categoria\"}");
    return;
  }

  // --- Gate hardware chiave fisica per SR ---
  if (cat == "SR" && !keyInserted()) {
    auditLog(g_session.role, id, value, "DENY_NOKEY");
    req->send(423, "application/json",
              "{\"error\":\"chiave di abilitazione parametri non inserita in quadro\"}");
    return;
  }

  // --- Range enforcement (clamp + rifiuto) ---
  if (!p["min"].isNull() && !p["max"].isNull()) {
    float mn = p["min"].as<float>(), mx = p["max"].as<float>();
    if (value < mn || value > mx) {
      auditLog(g_session.role, id, value, "DENY_RANGE");
      JsonDocument e; e["error"] = "valore fuori range normativo";
      e["min"] = mn; e["max"] = mx;
      String out; serializeJson(e, out);
      req->send(422, "application/json", out);
      return;
    }
  }

  // --- Scrittura Modbus ---
  float scale = p["scale"] | 1.0;
  uint16_t raw = (uint16_t)lroundf(value * scale);
  if (!modbusWrite(p["reg"].as<uint16_t>(), raw)) {
    auditLog(g_session.role, id, value, "FAIL_MODBUS");
    req->send(502, "application/json", "{\"error\":\"errore comunicazione controller\"}");
    return;
  }

  auditLog(g_session.role, id, value, "OK");
  JsonDocument res; res["id"] = id; res["value"] = value; res["status"] = "ok";
  String out; serializeJson(res, out);
  req->send(200, "application/json", out);
}

// GET /api/status -> stato modulo
void handleStatus(AsyncWebServerRequest* req) {
  JsonDocument res;
  res["fw"]           = "esp32-quadro-wifi proto 1.0";
  res["key_inserted"] = keyInserted();
  res["clients"]      = WiFi.softAPgetStationNum();
  res["uptime_s"]     = millis() / 1000;
  String out; serializeJson(res, out);
  req->send(200, "application/json", out);
}

// GET /api/hmi -> stato sintetico per il pannello operatore (HMI)
// Legge alcuni registri diagnostici dal PLC/controller via Modbus.
void handleHmi(AsyncWebServerRequest* req) {
  uint16_t raw;
  auto rd = [&](const char* id) -> float {
    JsonObject p = findParam(id);
    if (p.isNull()) return -1;
    if (modbusRead(p["reg"].as<uint16_t>(), raw)) {
      float s = p["scale"] | 1.0;
      return raw / s;
    }
    return -1;
  };

  JsonDocument res;
  res["car_position"] = rd("car_position");   // mm
  res["car_speed"]    = rd("car_speed");       // m/s
  res["motor_current"]= rd("motor_current");   // A
  res["oil_temp"]     = rd("oil_temperature"); // C (idraulico)
  res["line_pressure"]= rd("line_pressure");   // bar (idraulico)
  res["trip_counter"] = (long)rd("trip_counter");
  res["fault_code"]   = (int)rd("fault_code");
  res["key_inserted"] = keyInserted();
  res["clients"]      = WiFi.softAPgetStationNum();
  res["uptime_s"]     = millis() / 1000;

  String out; serializeJson(res, out);
  req->send(200, "application/json", out);
}

// --------------------------- SETUP / LOOP ----------------------------------
bool loadParamDb() {
  File f = LittleFS.open("/parametri.json", "r");
  if (!f) { Serial.println("[ERR] /parametri.json non trovato in LittleFS"); return false; }
  DeserializationError e = deserializeJson(paramDb, f);
  f.close();
  if (e) { Serial.printf("[ERR] parse parametri.json: %s\n", e.c_str()); return false; }
  Serial.printf("[OK] %d parametri caricati\n", paramDb["parametri"].size());
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RS485_DE, OUTPUT); digitalWrite(PIN_RS485_DE, LOW);
  pinMode(PIN_EN_PAR, INPUT_PULLDOWN);
  pinMode(PIN_STATUS_LED, OUTPUT);

  if (!LittleFS.begin(true)) { Serial.println("[ERR] LittleFS"); }
  loadParamDb();

  // Modbus RTU su Serial2
  Serial2.begin(MODBUS_BAUD, SERIAL_8E1, PIN_RS485_RX, PIN_RS485_TX);
  node.begin(MODBUS_SLAVE_ID, Serial2);
  node.preTransmission(preTx);
  node.postTransmission(postTx);

  // WiFi in Access Point locale (nessuna esposizione a Internet)
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.printf("[OK] AP '%s' IP=%s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

  // Static web UI da LittleFS
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  // API
  server.on("/api/params", HTTP_GET, handleGetParams);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/hmi", HTTP_GET, handleHmi);

  auto* loginH = new AsyncCallbackJsonWebHandler("/api/login",
    [](AsyncWebServerRequest* r, JsonVariant& j){ handleLogin(r, j); });
  server.addHandler(loginH);

  auto* setH = new AsyncCallbackJsonWebHandler("/api/param",
    [](AsyncWebServerRequest* r, JsonVariant& j){ handleSetParam(r, j); });
  server.addHandler(setH);

  server.onNotFound([](AsyncWebServerRequest* r){
    r->send(404, "application/json", "{\"error\":\"not found\"}");
  });

  server.begin();
  Serial.println("[OK] Web-server avviato");
}

void loop() {
  // LED: acceso fisso se chiave inserita (parametri safety abilitati)
  digitalWrite(PIN_STATUS_LED, keyInserted() ? HIGH : (millis() / 1000) % 2);
  delay(50);
}
