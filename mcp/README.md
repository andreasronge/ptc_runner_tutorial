# Shared MCP servers

MCP is the only way to give a PtcRunner project a tool — there is no plugin API
and no code to register. Every tutorial here that reads files does it through a
server in this directory.

## `filesystem/`

A read-only file server, copied by `install.sh` from
`ptc_runner/examples/mcp/filesystem`. It is **not committed** — run
`./install.sh` to populate it, or copy it yourself:

```console
cp ../ptc_runner/examples/mcp/filesystem/dist/server.js mcp/filesystem/server.js
```

It needs **Node.js 22 or newer**, but no `npm install` — the committed bundle
inlines its dependencies. `NOTICE` travels with the bundle and reproduces their
upstream licenses; the sample's own source is MIT.

### What it does

At startup it streams one host-supplied root into an immutable private
snapshot, then answers five read-only tools from that frozen capture:

| Tool | Returns |
| --- | --- |
| `list_directory` | Sorted, paginated entries under a relative prefix |
| `search_files` | Paginated paths containing a literal substring |
| `search_text` | Paginated literal matches with path and line evidence |
| `read_text_file` | Paginated exact UTF-8 byte chunks |
| `snapshot_info` | Content hash and inventory statistics |

Every page carries the same `snapshot_hash`, so a number the agent cites is
bound to the exact bytes it read. That is what makes "which source did you
use?" answerable rather than a matter of trust.

`--include` is mandatory and repeatable; the default is **no files**, so a
server started without it exposes nothing. Symlinks are skipped rather than
followed, and nothing is ever written.

### Wiring it into a host document

The operator names the command, the root, and the public tool names. A project
manifest can select the installed name and narrow it, but cannot point it at a
different directory:

```json
"financials": {
  "source": "mcp",
  "installation_revision": "chief-of-staff-financials-v1",
  "transport": {
    "type": "stdio",
    "command": "node",
    "cwd": ".",
    "args": ["../mcp/filesystem/server.js", "--root", "data", "--include", "**"],
    "inherit_environment": true,
    "env": {}
  },
  "tools": {
    "list_directory": {"as": "files.list", "effect": "read"},
    "read_text_file": {"as": "files.read", "effect": "read"}
  }
}
```

Paths in `transport` resolve relative to the host document, so `cwd: "."` means
the directory holding `ptc-host.json` and `--root data` is that directory's
`data/`.

**This server is a non-production sample.** It exists so tutorials and
integration tests have a deterministic MCP server in another language. Do not
deploy it.
