#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Supreme Bot — Production Smoke Test Suite
# ═══════════════════════════════════════════════════════════════════════════════
# Validates critical endpoints after deploy. Run from VPS host after
# `docker compose up -d` completes.
#
# Usage:
#   chmod +x smoke-test.sh
#   ./smoke-test.sh
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed
# ═══════════════════════════════════════════════════════════════════════════════

set -u
BASE_URL="${BASE_URL:-http://localhost:8080}"
PASSED=0
FAILED=0

# ── Color output ─────────────────────────────────────────────────────────────
red()   { printf "\033[0;31m%s\033[0m" "$1"; }
green() { printf "\033[0;32m%s\033[0m" "$1"; }
cyan()  { printf "\033[0;36m%s\033[0m" "$1"; }
dim()   { printf "\033[0;90m%s\033[0m" "$1"; }

# ── Assert helpers ───────────────────────────────────────────────────────────
assert_status() {
  local url="$1" expected="$2" label="$3"
  local actual=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$actual" = "$expected" ]; then
    echo "  $(green "✓") $label $(dim "[$actual]")"
    PASSED=$((PASSED + 1))
  else
    echo "  $(red "✗") $label $(dim "[got $actual, expected $expected]") $url"
    FAILED=$((FAILED + 1))
  fi
}

assert_body_contains() {
  local url="$1" pattern="$2" label="$3"
  local body=$(curl -s "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -q "$pattern"; then
    echo "  $(green "✓") $label"
    PASSED=$((PASSED + 1))
  else
    echo "  $(red "✗") $label $(dim "- body did not match '$pattern'")"
    FAILED=$((FAILED + 1))
  fi
}

assert_json_field() {
  local url="$1" field="$2" expected="$3" label="$4"
  local actual=$(curl -s "$url" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null || echo "")
  if [ "$actual" = "$expected" ]; then
    echo "  $(green "✓") $label $(dim "[$field=$actual]")"
    PASSED=$((PASSED + 1))
  else
    echo "  $(red "✗") $label $(dim "[$field=$actual, expected $expected]")"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
echo "$(cyan "═══════════════════════════════════════════════════════════════")"
echo "$(cyan "  Supreme Bot Smoke Test — $BASE_URL")"
echo "$(cyan "═══════════════════════════════════════════════════════════════")"
echo ""

# ── 1. PUBLIC ENDPOINTS ──────────────────────────────────────────────────────
echo "$(cyan "[1/7] Public endpoints (no auth)")"
assert_status "$BASE_URL/"                   "200" "Landing page"
assert_status "$BASE_URL/robots.txt"         "200" "robots.txt"
assert_status "$BASE_URL/sitemap.xml"        "200" "sitemap.xml"
assert_status "$BASE_URL/site.webmanifest"   "200" "PWA manifest"
assert_status "$BASE_URL/favicon.svg"        "200" "favicon"
assert_status "$BASE_URL/og-image.svg"       "200" "OG image"
assert_body_contains "$BASE_URL/robots.txt" "Sitemap:"     "robots.txt has Sitemap directive"
assert_body_contains "$BASE_URL/sitemap.xml" "/status"     "sitemap includes /status"
assert_body_contains "$BASE_URL/sitemap.xml" "2026"        "sitemap has current year lastmod"
echo ""

# ── 2. SPA ROUTES ────────────────────────────────────────────────────────────
echo "$(cyan "[2/7] SPA routes (React Router fallback)")"
assert_status "$BASE_URL/status"            "200" "/status SPA page"
assert_status "$BASE_URL/terms"             "200" "/terms SPA page"
assert_status "$BASE_URL/privacy"           "200" "/privacy SPA page"
assert_status "$BASE_URL/cookies"           "200" "/cookies SPA page"
assert_status "$BASE_URL/eula"              "200" "/eula SPA page"
echo ""

# ── 3. STATUS ENDPOINT ───────────────────────────────────────────────────────
echo "$(cyan "[3/7] Public status API (no auth)")"
assert_status       "$BASE_URL/api/status" "200" "Status endpoint returns 200"
assert_json_field   "$BASE_URL/api/status" "status" "operational" "Overall status is operational"
assert_body_contains "$BASE_URL/api/status" "database"  "Status includes database service"
assert_body_contains "$BASE_URL/api/status" "bot"       "Status includes bot service"
assert_body_contains "$BASE_URL/api/status" "latencyMs" "Status includes latency metrics"
echo ""

# ── 4. AUTH BEHAVIOR ─────────────────────────────────────────────────────────
# Auth endpoints have stricter rate limit (20 req/15min per IP to prevent
# OAuth brute-force). If this test IP has hit the limit in recent runs,
# 429 is a VALID response indicating security is working correctly.
echo "$(cyan "[4/7] Auth endpoints")"
assert_auth_response() {
  local url="$1" expected="$2" label="$3"
  local actual=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$actual" = "$expected" ] || [ "$actual" = "429" ]; then
    local note=""
    [ "$actual" = "429" ] && note=" $(dim "(rate-limited — security active)")"
    echo "  $(green "✓") $label $(dim "[$actual]")$note"
    PASSED=$((PASSED + 1))
  else
    echo "  $(red "✗") $label $(dim "[got $actual, expected $expected or 429]") $url"
    FAILED=$((FAILED + 1))
  fi
}
assert_auth_response "$BASE_URL/api/auth/me"          "401" "/api/auth/me returns 401 without session"
assert_auth_response "$BASE_URL/api/auth/login"       "302" "/api/auth/login redirects to Discord"
logout_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/logout" 2>/dev/null || echo "000")
if [ "$logout_code" = "200" ] || [ "$logout_code" = "401" ] || [ "$logout_code" = "429" ]; then
  echo "  $(green "✓") POST /api/auth/logout accessible $(dim "[$logout_code]")"
  PASSED=$((PASSED + 1))
else
  echo "  $(red "✗") POST /api/auth/logout unexpected $(dim "[$logout_code]")"
  FAILED=$((FAILED + 1))
fi
echo ""

# ── 5. PROTECTED ENDPOINTS REJECT WITHOUT AUTH ───────────────────────────────
echo "$(cyan "[5/7] Protected endpoints reject unauthenticated requests")"
assert_status "$BASE_URL/api/servers"               "401" "GET /api/servers (no auth)"
assert_status "$BASE_URL/api/panels/fake"           "401" "GET /api/panels/:id (no auth)"
assert_status "$BASE_URL/api/tickets/fake"          "401" "GET /api/tickets/:id (no auth)"
assert_status "$BASE_URL/api/applications/fake"     "401" "GET /api/applications/:id (no auth)"
assert_status "$BASE_URL/api/admin/stats"           "401" "GET /api/admin/stats (no auth)"
assert_status "$BASE_URL/api/analytics/fake/overview" "401" "GET /api/analytics/:id/overview (no auth)"
assert_status "$BASE_URL/api/trial/fake"            "401" "GET /api/trial/:id (no auth)"
assert_status "$BASE_URL/api/affiliate/stats"       "401" "GET /api/affiliate/stats (no auth)"
echo ""

# ── 6. PUBLIC API REQUIRES BEARER TOKEN ──────────────────────────────────────
echo "$(cyan "[6/7] Public REST API (bearer auth)")"
assert_status "$BASE_URL/public/v1/me"          "401" "Public API rejects missing bearer token"
local_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer bpk_live_fake_invalid_key" "$BASE_URL/public/v1/me" 2>/dev/null || echo "000")
if [ "$local_code" = "401" ] || [ "$local_code" = "403" ]; then
  echo "  $(green "✓") Public API rejects invalid bearer token $(dim "[$local_code]")"
  PASSED=$((PASSED + 1))
else
  echo "  $(red "✗") Public API should reject invalid token $(dim "[got $local_code]")"
  FAILED=$((FAILED + 1))
fi
echo ""

# ── 7. ARCHIVE VIEWER ────────────────────────────────────────────────────────
echo "$(cyan "[7/7] Archive viewer")"
# Non-existent ticket should return friendly 404 page, not 500
assert_status "$BASE_URL/archive/ticket/nonexistent" "404" "Archive viewer returns 404 for missing ticket"
assert_body_contains "$BASE_URL/archive/ticket/nonexistent" "Archive not found" "Archive 404 page has friendly message"
echo ""

# ── SECURITY HEADERS ─────────────────────────────────────────────────────────
echo "$(cyan "[BONUS] Security headers")"
headers=$(curl -sI "$BASE_URL/" 2>/dev/null || echo "")
check_header() {
  local name="$1"
  if echo "$headers" | grep -iq "^${name}:"; then
    echo "  $(green "✓") $name present"
    PASSED=$((PASSED + 1))
  else
    echo "  $(red "✗") $name missing"
    FAILED=$((FAILED + 1))
  fi
}
check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "Referrer-Policy"
check_header "Permissions-Policy"
echo ""

# ── SUMMARY ──────────────────────────────────────────────────────────────────
TOTAL=$((PASSED + FAILED))
echo "$(cyan "═══════════════════════════════════════════════════════════════")"
if [ $FAILED -eq 0 ]; then
  echo "  $(green "✓ ALL TESTS PASSED") — $PASSED/$TOTAL"
  echo "$(cyan "═══════════════════════════════════════════════════════════════")"
  exit 0
else
  echo "  $(red "✗ TESTS FAILED") — $PASSED passed, $(red "$FAILED failed") ($TOTAL total)"
  echo "$(cyan "═══════════════════════════════════════════════════════════════")"
  exit 1
fi
