#!/usr/bin/env bash
#
# Run every tutorial project end-to-end against live providers and assert the
# run succeeded. This spends real OpenRouter credit — well under a cent for
# all chapters on the default DeepSeek flash model.
#
# Usage:
#   ./e2e.sh            # every */NN-*.ptc-project.json
#   ./e2e.sh 02 04      # only project documents whose filename starts with these
#
# Needs `ptc` on PATH, Node.js 20.19+ with npx (chapters 2 onward launch the
# ptc-fs-mcp file server through it), and each tutorial's .env in place — see
# the Setup section of README.md.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

command -v ptc >/dev/null 2>&1 || { echo "error: ptc not on PATH — run ./install.sh first" >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "error: npx not on PATH — chapters 2+ need Node.js 20.19+" >&2; exit 1; }

# Collect project documents, optionally filtered by filename prefix.
DOCS=()
for doc in "$REPO_ROOT"/*/[0-9]*.ptc-project.json; do
  [ -f "$doc" ] || continue
  if [ "$#" -gt 0 ]; then
    base="$(basename "$doc")"
    keep=0
    for prefix in "$@"; do
      case "$base" in "$prefix"*) keep=1 ;; esac
    done
    [ "$keep" -eq 1 ] || continue
  fi
  DOCS+=("$doc")
done

if [ "${#DOCS[@]}" -eq 0 ]; then
  echo "error: no project documents matched" >&2
  exit 1
fi

# Every project document names a .env next to it; fail early with a hint
# rather than once per chapter.
for doc in "${DOCS[@]}"; do
  dir="$(dirname "$doc")"
  if [ ! -f "$dir/.env" ]; then
    echo "error: $dir/.env is missing — copy $dir/.env.example and add your OpenRouter key" >&2
    exit 1
  fi
done

# The run result is the last JSON document on stdout. The exit status is the
# success contract; on top of it, require that the result parses, and that a
# result carrying an "ok" key (a workflow returning an agent.core/run result)
# carries "ok": true — a workflow can return such a value even when the inner
# run failed, and that exits 0.
assert_ok() {
  python3 - "$1" <<'PY'
import json, sys

with open(sys.argv[1]) as f:
    text = f.read().strip()
try:
    doc = json.loads(text)
except json.JSONDecodeError:
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        sys.exit(1)
    try:
        doc = json.loads(lines[-1])
    except json.JSONDecodeError:
        sys.exit(1)
if isinstance(doc, dict) and "ok" in doc and doc["ok"] is not True:
    sys.exit(1)
sys.exit(0)
PY
}

FAILED=0

for doc in "${DOCS[@]}"; do
  dir="$(dirname "$doc")"
  base="$(basename "$doc")"
  name="${base%.ptc-project.json}"
  out="$SCRATCH/$name.out"
  err="$SCRATCH/$name.err"

  printf '==> %s\n' "$base"
  started=$SECONDS
  status=0
  for attempt in 1 2; do
    (cd "$dir" && ptc run "$base") >"$out" 2>"$err"
    status=$?
    [ "$status" -eq 0 ] && break
    # 4 = provider acquisition (a cold npm cache is the usual cause),
    # 5 = the workflow failed, 6 = limit or duration exceeded. All three can
    # be transient in a live-model run, so retry once. 2/3 are deterministic
    # document errors — retrying cannot help.
    case "$status" in
      4|5|6)
        if [ "$attempt" -eq 1 ]; then
          echo "    attempt 1 exited $status — retrying"
        fi
        ;;
      *) break ;;
    esac
  done

  elapsed=$((SECONDS - started))
  if [ "$status" -eq 0 ] && assert_ok "$out"; then
    printf '    PASS (%ss)\n' "$elapsed"
  else
    printf '    FAIL (exit %s, %ss)\n' "$status" "$elapsed"
    sed 's/^/    stdout: /' "$out" | tail -5
    sed 's/^/    stderr: /' "$err" | tail -10
    FAILED=$((FAILED + 1))
  fi
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED of ${#DOCS[@]} project(s) failed"
  exit 1
fi
echo "all ${#DOCS[@]} project(s) passed"
