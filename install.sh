#!/usr/bin/env bash
#
# Build the PtcRunner release and put `ptc` on your PATH.
#
# The release bundles its own Erlang runtime, so once this has run you can work
# through the tutorials without Elixir or Erlang installed. Building it does
# need them — see https://github.com/andreasronge/ptc_runner for setup.
#
# Usage:
#   ./install.sh              # build, then add ptc to PATH in ~/.zshrc
#   ./install.sh --no-path    # build only, leave shell config alone
#
# Override the checkout location with PTC_RUNNER_DIR if it is not ../ptc_runner.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PTC_RUNNER_DIR="${PTC_RUNNER_DIR:-$(cd "$REPO_ROOT/.." && pwd)/ptc_runner}"
BIN_DIR="$PTC_RUNNER_DIR/_build/prod/rel/ptc_runner/bin"
MARKER="# added by ptc_runner_tutorial/install.sh"

EDIT_PATH=1
for arg in "$@"; do
  case "$arg" in
    --no-path) EDIT_PATH=0 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- checks ------------------------------------------------------------------

if [ ! -f "$PTC_RUNNER_DIR/mix.exs" ]; then
  cat >&2 <<EOF
error: no PtcRunner checkout at
  $PTC_RUNNER_DIR

Clone it next to this repository:
  git clone https://github.com/andreasronge/ptc_runner "$PTC_RUNNER_DIR"

Or point this script somewhere else:
  PTC_RUNNER_DIR=/path/to/ptc_runner ./install.sh
EOF
  exit 1
fi

if ! command -v mix >/dev/null 2>&1; then
  cat >&2 <<'EOF'
error: `mix` not found.

Building the release needs Elixir and Erlang; running it afterwards does not.
The PtcRunner checkout ships a mise.toml, so from that directory:
  mise install
EOF
  exit 1
fi

# --- build -------------------------------------------------------------------

echo "==> Building the release in $PTC_RUNNER_DIR"
echo "    (first build compiles the whole project and takes a few minutes)"
(
  cd "$PTC_RUNNER_DIR"
  mix deps.get
  MIX_ENV=prod mix release --overwrite
)

if [ ! -x "$BIN_DIR/ptc" ]; then
  echo "error: build finished but $BIN_DIR/ptc is missing" >&2
  exit 1
fi

echo
echo "==> Built $("$BIN_DIR/ptc" --version) at"
echo "    $BIN_DIR/ptc"

# --- MCP file server ---------------------------------------------------------
# Tutorials from chapter 2 onward read files through MCP, which is the only way
# to give a project a tool. The host documents launch the published ptc-fs-mcp
# npm package through npx, which downloads it on first use — nothing to copy,
# but Node.js and npx must be on your PATH when you run those chapters.

if command -v npx >/dev/null 2>&1; then
  echo
  echo "==> node $(node --version) and npx found — chapters 2+ launch the"
  echo "    ptc-fs-mcp file server through npx (downloaded on first use)"
else
  echo
  echo "==> NOTE: npx not found. Chapter 1 runs without it; later chapters"
  echo "    launch the ptc-fs-mcp file server through npx and need Node.js 20.19+."
fi

# --- PATH --------------------------------------------------------------------

if [ "$EDIT_PATH" -eq 0 ]; then
  echo
  echo "Skipped the PATH change (--no-path). Run it with the full path above,"
  echo "or add this to your shell profile yourself:"
  echo "    export PATH=\"$BIN_DIR:\$PATH\""
  exit 0
fi

ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"

# Keep the entry portable across machines when the checkout sits in $HOME.
case "$BIN_DIR" in
  "$HOME"/*) ENTRY="\$HOME${BIN_DIR#"$HOME"}" ;;
  *)         ENTRY="$BIN_DIR" ;;
esac

# Match either form, so re-running is a no-op whichever one is already there.
if [ -f "$ZSHRC" ] && grep -qF -e "$ENTRY" -e "$BIN_DIR" "$ZSHRC"; then
  echo
  echo "==> $ZSHRC already puts this directory on PATH — leaving it alone."
else
  {
    printf '\n%s\n' "$MARKER"
    printf 'export PATH="%s:$PATH"\n' "$ENTRY"
  } >> "$ZSHRC"

  echo
  echo "==> Appended to $ZSHRC:"
  echo "        export PATH=\"$ENTRY:\$PATH\""
fi

cat <<EOF

Open a new terminal (or run: source "$ZSHRC"), then:

    cd "$REPO_ROOT"
    cp 01-chief-of-staff/.env.example 01-chief-of-staff/.env
    chmod 600 01-chief-of-staff/.env    # then add your OpenRouter key
    ptc run 01-chief-of-staff/01-one-bounded-run.ptc-project.json
EOF
