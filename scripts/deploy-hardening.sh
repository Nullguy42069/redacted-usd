#!/bin/bash
# deploy-hardening.sh — run on the Regxa VPS as anne (NOT yet stripped of sudo).
# Applies every infra-side finding from the Fable 5 audit 2026-06-10.
#
# Pre-flight: this script is idempotent and shows you what it will do BEFORE
# each step. You can re-run it; finished steps are no-ops.
#
# After this script: anne loses NOPASSWD root. Keep a backup terminal open or
# you may lock yourself out if something goes wrong mid-run.

set -euo pipefail

C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_RESET='\033[0m'

ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}!${C_RESET} $*"; }
fail() { echo -e "${C_RED}✗${C_RESET} $*"; exit 1; }
note() { echo -e "  $*"; }

confirm() {
  read -rp "  proceed? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { warn "skipped"; return 1; }
  return 0
}

# ───────────────────────────────────────────────────────────────────────────
# 1. SET ADMIN TOKEN FOR /api/v1/keys
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 1. REDACTED_ADMIN_TOKEN for /api/v1/keys ==="
ENV_FILE="/home/anne/private-safe/apps/web/.env.local"
if [[ -f "$ENV_FILE" ]] && grep -q "^REDACTED_ADMIN_TOKEN=" "$ENV_FILE"; then
  ok "REDACTED_ADMIN_TOKEN already set in $ENV_FILE — skipping"
else
  note "generating a random 32-byte hex token + appending to $ENV_FILE"
  if confirm; then
    TOKEN="$(openssl rand -hex 32)"
    mkdir -p "$(dirname "$ENV_FILE")"
    touch "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "REDACTED_ADMIN_TOKEN=$TOKEN" >> "$ENV_FILE"
    ok "wrote $ENV_FILE — token: $TOKEN"
    warn "save that token somewhere offline; the admin UI will need it"
  fi
fi

# ───────────────────────────────────────────────────────────────────────────
# 2. WIPE EXISTING PLAINTEXT KEY STORE
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 2. wipe .data/api-keys.json (cleartext keys on disk) ==="
KEYSTORE="/home/anne/private-safe/apps/web/.data/api-keys.json"
if [[ -f "$KEYSTORE" ]]; then
  warn "found $KEYSTORE — will replace with empty array"
  if confirm; then
    echo "[]" > "$KEYSTORE"
    chmod 600 "$KEYSTORE"
    ok "wiped"
  fi
else
  ok "no $KEYSTORE on disk — nothing to wipe"
fi

# ───────────────────────────────────────────────────────────────────────────
# 3. PNPM BUMP + REBUILD
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 3. install audit-fix dependencies + rebuild ==="
note "pnpm install applies the new pnpm.overrides (protobufjs, elliptic, bigint-buffer, uuid)"
note "then pnpm build for production"
if confirm; then
  cd /home/anne/private-safe
  pnpm install
  pnpm audit --audit-level high || warn "still some advisories — check above"
  pnpm build
  ok "build complete"
fi

# ───────────────────────────────────────────────────────────────────────────
# 4. CADDY CSP + SECURITY HEADERS + RATE LIMIT + BODY SIZE
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 4. Caddy: add CSP + headers + body cap ==="
CADDYFILE="/etc/caddy/Caddyfile"
if grep -q "Content-Security-Policy" "$CADDYFILE" 2>/dev/null; then
  ok "Caddyfile already has CSP — skipping"
else
  warn "appending hardening block — REVIEW BEFORE RELOADING"
  echo "current site block excerpt:"
  sudo grep -A 20 "redacted-usd" "$CADDYFILE" | head -25 || true
  if confirm; then
    sudo tee -a "$CADDYFILE" > /dev/null <<'CADDY'

# Hardening block appended 2026-06-10 (Fable 5 audit)
# Tighten the CSP host list to your actual endpoints.
(security_headers) {
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.helius-rpc.com https://quote-api.jup.ag https://*.jup.ag https://*.magicblock.app wss://*.magicblock.app; frame-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
        -Server
        -X-Powered-By
    }
    request_body {
        max_size 2MB
    }
}
CADDY
    warn "appended template — now MANUALLY add 'import security_headers' inside your redacted-usd site block"
    warn "then: sudo caddy validate --config $CADDYFILE && sudo systemctl reload caddy"
  fi
fi

# ───────────────────────────────────────────────────────────────────────────
# 5. SSH HARDENING
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 5. SSH: disable password auth + drop X11 ==="
if sudo sshd -T 2>/dev/null | grep -q "passwordauthentication no"; then
  ok "SSH password auth already disabled"
else
  warn "will disable password auth in /etc/ssh/sshd_config.d/50-cloud-init.conf"
  warn "MAKE SURE YOUR SSH KEY ALREADY WORKS — test in a SECOND terminal first"
  if confirm; then
    sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf
    sudo sed -i 's/^X11Forwarding yes/X11Forwarding no/' /etc/ssh/sshd_config 2>/dev/null || true
    sudo sshd -t && sudo systemctl reload ssh
    ok "SSH reloaded — verify in a new terminal: sudo sshd -T | grep passwordauth"
  fi
fi

# ───────────────────────────────────────────────────────────────────────────
# 6. NEXT.JS BIND TO LOOPBACK
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 6. Next.js: bind to 127.0.0.1 (currently *:3000) ==="
SVC="/etc/systemd/system/redacted-next.service"
if sudo test -f "$SVC" && sudo grep -q "ExecStart.*-H 127.0.0.1" "$SVC"; then
  ok "Next.js already bound to loopback — skipping"
else
  warn "you need to edit the Next.js launch command to add '-H 127.0.0.1'"
  warn "if systemd-managed, edit ExecStart in $SVC; if pm2, update the start command"
  warn "this is manual because we don't know your exact launch shape"
  note "verify after: sudo ss -tlnp | grep ':3000' — should show 127.0.0.1:3000, not *:3000"
fi

# ───────────────────────────────────────────────────────────────────────────
# 7. NOPASSWD ROOT REMOVAL  (DO THIS LAST)
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 7. remove NOPASSWD:ALL from anne (DESTRUCTIVE — do this LAST) ==="
if [[ ! -f /etc/sudoers.d/anne ]]; then
  ok "/etc/sudoers.d/anne already absent"
else
  warn "this removes passwordless root. anne will need a password for sudo."
  warn "you MUST have already set a password for anne before this step:"
  warn "  sudo passwd anne"
  note "after this: any RCE in the web app can no longer escalate to instant root"
  if confirm; then
    if ! passwd -S anne 2>/dev/null | grep -qE " P "; then
      fail "anne has no password set yet. run 'sudo passwd anne' first, then re-run this script"
    fi
    sudo rm /etc/sudoers.d/anne
    # Verify
    if sudo -n true 2>/dev/null; then
      fail "sudo -n still works — there's another NOPASSWD entry. inspect /etc/sudoers /etc/sudoers.d/"
    fi
    ok "NOPASSWD root removed — sudo now requires password"
  fi
fi

# ───────────────────────────────────────────────────────────────────────────
# 8. DEPLOY THE NEW BUILD
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 8. restart the app process to pick up the new build ==="
note "depends on your process manager — pm2 restart redacted, or sudo systemctl restart redacted-next"
warn "do this AFTER you've verified the build went OK (step 3)"

# ───────────────────────────────────────────────────────────────────────────
# 9. POST-DEPLOY VERIFY
# ───────────────────────────────────────────────────────────────────────────
echo
echo "=== 9. post-deploy verification ==="
URL="${REDACTED_DEPLOY_URL:-https://redacted-usd.xyz}"
echo "checking $URL ..."
echo "(a) keys endpoint — should be 503 (no token) or 401 (no auth header):"
curl -s -o /dev/null -w "    HTTP %{http_code}\n" "$URL/api/v1/keys"
echo "(b) CSP header present:"
curl -sI "$URL" | grep -i "content-security-policy" && ok "CSP present" || warn "CSP missing — Caddy not reloaded?"
echo "(c) HSTS preload directive:"
curl -sI "$URL" | grep -iE "strict-transport-security.*preload" && ok "HSTS preload set" || warn "HSTS preload missing"
echo "(d) server/x-powered-by headers stripped:"
curl -sI "$URL" | grep -iE "^(server|x-powered-by):" && warn "still leaking" || ok "no leaks"

echo
echo "─────────────────────────────────────────────────────"
echo "next manual steps not in this script:"
echo "  • sign the NSD zone (DNSSEC) and paste the DS record at Njalla"
echo "  • optionally: HSTS preload submission at hstspreload.org once you're confident"
echo "  • consider a second NS IP for redundancy (currently ns1+ns2 both point to one box)"
echo "─────────────────────────────────────────────────────"
ok "deploy-hardening.sh complete"
