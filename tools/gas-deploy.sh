#!/usr/bin/env bash
#
# Promote the Apps Script half of this repo, with the two gates named.
#
# WHY THIS EXISTS
#
# Vercel builds the client from source on every push, so the front end needs
# nothing. The backend needs two steps that nothing automates and that CI does
# not do:
#
#   1. clasp push   — updates the project, and @HEAD, which nothing calls
#   2. clasp deploy — repoints the PINNED deployment that api/gas.mjs calls
#
# Step 2 is the one that gets forgotten, and forgetting it looks exactly like a
# fix that did not work: the code is in the project, production serves the old
# version, and the absence of the change reads as the change being wrong. That
# happened on F-0043b.
#
# WHAT IT REFUSES TO DO
#
# `clasp push` overwrites the Apps Script project with this repo's root files.
# If anybody has ever edited in the Apps Script editor, that edit is gone with no
# warning and no record. So this pulls the project into a scratch directory first
# and diffs it, and by default that is ALL it does. Nothing is written without
# --deploy.
#
# The deployment id is DERIVED from api/gas.mjs rather than written here, and all
# four api/*.mjs are required to agree. A literal would be a sixth copy of the
# same fact, and four files disagreeing is the split-deployment fault KNOWN_ISSUES
# already warns about — worth aborting on rather than picking one.
#
# USAGE
#   tools/gas-deploy.sh                      # pull, diff, change nothing
#   tools/gas-deploy.sh --deploy "F-0043b"   # diff, then push and redeploy
#
# ONE-TIME, AND IT NEEDS A BROWSER, SO IT IS NOT AUTOMATABLE:
#   docker run --rm -it -v ~/.clasp-docker:/root -v "$PWD":/app -w /app \
#     node:22-alpine npx -y @google/clasp@3.4.1 login --no-localhost
#
set -euo pipefail

CLASP_VERSION=3.4.1
CRED_DIR="${CLASP_HOME:-$HOME/.clasp-docker}"
IMAGE=node:22-alpine

die() { printf '\n%s\n' "$*" >&2; exit 1; }

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository."
cd "$REPO"

# ── the tree this script belongs to ─────────────────────────────────────────────
# A guard has to validate the object the script will USE. Asking "is this an Apps
# Script project?" would be true of any checkout; the question is whether the
# project id next to this script is the one being pushed.
[ -f .clasp.json ] || die ".clasp.json is not here. Run this from the app repo."
SCRIPT_ID=$(node -e 'process.stdout.write(require("./.clasp.json").scriptId||"")' 2>/dev/null \
  || docker run --rm -v "$REPO":/app:ro -w /app "$IMAGE" \
       node -e 'process.stdout.write(require("./.clasp.json").scriptId||"")')
[ -n "$SCRIPT_ID" ] || die ".clasp.json carries no scriptId."

# ── the deployment production actually calls, derived not remembered ───────────
ids=$(grep -ho 'AKfycb[A-Za-z0-9_-]*' api/*.mjs | sort -u)
count=$(printf '%s\n' "$ids" | grep -c . || true)
[ "$count" = 1 ] || die "api/*.mjs name $count different deployments:
$ids
That is the split-deployment fault. Fix the literals before deploying."
DEPLOYMENT_ID=$ids

echo "script     $SCRIPT_ID"
echo "deployment $DEPLOYMENT_ID"
echo "credential $CRED_DIR"

if [ ! -f "$CRED_DIR/.clasprc.json" ]; then
  die "No clasp credential in $CRED_DIR.

clasp signs in as a Google USER through a browser consent screen, so this step
cannot be done for you. Once, then never again:

  mkdir -p $CRED_DIR
  docker run --rm -it -v $CRED_DIR:/root -v \"$REPO\":/app -w /app \\
    $IMAGE npx -y @google/clasp@$CLASP_VERSION login --no-localhost

It prints a URL. Open it, approve, paste the code back."
fi

clasp() {
  docker run --rm \
    -v "$CRED_DIR":/root \
    -v "$1":/app -w /app \
    -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/app \
    "$IMAGE" npx -y "@google/clasp@$CLASP_VERSION" "${@:2}"
}

# ── what is actually up there ─────────────────────────────────────────────────
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
printf '{"scriptId":"%s","rootDir":""}\n' "$SCRIPT_ID" > "$SCRATCH/.clasp.json"
echo
echo "pulling the live project into a scratch copy..."
clasp "$SCRATCH" pull >/dev/null 2>&1 || die "clasp pull failed. Credential expired? Re-run the login above."
rm -f "$SCRATCH/.clasp.json"

drift=0
echo
echo "--- live project vs this repo ---"
for f in "$SCRATCH"/*; do
  name=$(basename "$f")
  if [ ! -f "$name" ]; then
    echo "  ONLY LIVE   $name   <- exists in Apps Script and not here; a push DELETES it"
    drift=1
    continue
  fi
  if ! diff -q "$name" "$f" >/dev/null 2>&1; then
    added=$(diff "$f" "$name" | grep -c '^>' || true)
    removed=$(diff "$f" "$name" | grep -c '^<' || true)
    echo "  DIFFERS     $name   +$added -$removed lines (push sends this repo's copy)"
    drift=1
  fi
done
[ "$drift" = 0 ] && echo "  identical — the live project matches this repo"

if [ "${1:-}" != "--deploy" ]; then
  echo
  echo "Read-only. Nothing was written. Pass --deploy \"<description>\" to promote."
  exit 0
fi

DESC=${2:-}
[ -n "$DESC" ] || die "--deploy needs a description: tools/gas-deploy.sh --deploy \"F-0043b\""

echo
echo "pushing..."
clasp "$REPO" push --force
echo
echo "repointing $DEPLOYMENT_ID ..."
clasp "$REPO" deploy -i "$DEPLOYMENT_ID" -d "$DESC"
echo
echo "Done. The check is an observable, not this output: send a duel and look at"
echo "where the Accept Challenge button points."
