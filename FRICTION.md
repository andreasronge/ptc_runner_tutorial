# PtcRunner friction log

Notes taken while building this tutorial series, from the point of view of
someone arriving at PtcRunner from the [Claude Agent SDK
cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk).

The bar for an entry here is **friction**, not a bug. If PtcRunner behaves
exactly as specified and documented but the path was still slow, surprising, or
required reading Elixir source, it belongs here. Each entry should be
actionable enough to become a `ptc_runner` issue.

Format:

- **Hit while** — the concrete thing being attempted.
- **What happened** — observed behaviour, with file/line evidence.
- **Why it's friction** — the cost to a reader who does not know the codebase.
- **Possible improvement** — a suggestion, not a demand.
- **Status** — `open`, `filed #NNN`, `fixed`, or `wontfix — reason`.

**Status:** F1 to F10, F12 and F13 were fixed in PtcRunner 0.13.0
(`bd067d3f`, "feat(dx): address tutorial friction"). F11 and F14 remain open.
Each entry keeps its original text so the fix has something to read against.

---

## 2026-08-16 — Series planning and scaffolding

### F1. No documented model provider other than OpenRouter/DeepSeek

- **Hit while** choosing a model alias for a port of a *Claude* cookbook, where
  using a Claude model is the natural choice.
- **What happened** `docs/guides/quickstart.md` and
  `docs/guides/host-configuration.md` show only
  `"model": "openrouter:deepseek/deepseek-v4-flash"`. `grep -rl anthropic docs/`
  returns nothing. Support for a direct `anthropic:` model ID exists but is
  only discoverable in Elixir source — `lib/ptc_runner/llm/req_llm_adapter.ex:871`
  branches on `String.starts_with?(model, "anthropic:")` and enables prompt
  caching for it.
  `.env.example` does list `ANTHROPIC_API_KEY` as an optional direct provider
  key, so the credential half is hinted; the model-ID half is not. Separately,
  the pinned `req_llm` catalog at
  `deps/req_llm/priv/supported_models.json` tops out at
  `anthropic:claude-opus-4-8` and `anthropic:claude-sonnet-4-6` — it has no
  entry for the current `claude-opus-5` / `claude-sonnet-5` — and an ID absent
  from that catalog is **not** rejected: it is passed straight through to the
  provider and fails there (see [F6](#f6-a-failed-provider-call-gives-no-diagnosable-reason)).
  The direct `anthropic:` path was not exercised end to end here: the available
  Anthropic key had no credit, so the tutorial uses the documented
  OpenRouter path instead.
- **Why it's friction** The model ID is operator-owned configuration in
  `ptc-host.json`, so getting it wrong is a setup failure rather than something
  the manifest can recover from. There is no documented grammar for the ID, no
  list of supported provider prefixes, and no statement of which providers are
  tested. A reader either copies the DeepSeek line and stays on it, or reads
  the adapter.
- **Possible improvement** A short "supported model providers" table in
  `host-configuration.md` listing the accepted prefixes and one example ID
  each, plus a note on which ones enable prompt caching.
- **Status** fixed in 0.13.0 (bd067d3f). `host-configuration.md` now carries a provider table listing the `anthropic:` prefix and its credential.

### F2. No reusable write-capable MCP sample

- **Hit while** planning the chapter where the agent saves a report — the
  cookbook's `output_reports/hiring_decision.md` step.
- **What happened** `examples/mcp/filesystem` is read-only by design and says
  so ("Nothing is written"). The only write server in the repository is
  `examples/named-mission-reader-writer/writer_server.exs`: a single inline
  `.exs` file with no README of its own, accepting only one-segment lowercase
  basenames and capping content at 65,536 bytes.
  `docs/guides/connecting-tools-with-mcp.md` documents the *rules* for write
  installations (mandatory `allow` list, no automatic retry, indeterminate
  mutation on timeout) but links to no runnable write server.
- **Why it's friction** Write is where PtcRunner's effect model gets
  interesting, and it is the half a tutorial most wants to demonstrate. Right
  now anyone building a project that produces an artifact must either copy an
  undocumented file out of an unrelated example or write an MCP server before
  they can finish chapter one.
- **Possible improvement** Promote a write sample to `examples/mcp/` alongside
  the filesystem reader, with its own README covering confinement, the `allow`
  list requirement, and the retry/effect consequences. It does not need to be
  larger than the existing `.exs` — it needs to be findable and explained.
- **Status** fixed in 0.13.0 (bd067d3f). `examples/mcp/writer` now ships alongside the filesystem sample.

### F3. Using PtcRunner from a project that lives outside the checkout

- **Hit while** deciding where this tutorial repository sits relative to
  `../ptc_runner`, and how its `ptc-host.json` should reach the sample MCP
  server bundle.
- **What happened** `README.md`'s availability table lists "Hex dependency for
  Elixir applications" as *Next 0.x release*, so today the options are running
  `mix ptc` from a source checkout or building a local release.
  `examples/named-mission-reader-writer/ptc-host.json` resolves its transport
  paths relative to the host document (`"args": ["../mcp/filesystem/dist/server.js", ...]`),
  which works because it lives inside the repo. No guide covers the case where
  the project is a separate repository.
- **Why it's friction** This is the first decision an external reader makes and
  there is no documented answer: vendor the server bundle, use a relative path
  across repositories, or require a release install. Each has different
  implications for whether the tutorial is runnable from a clean clone.
- **Possible improvement** A short section in `running-and-debugging.md` or
  `host-configuration.md` on projects outside the checkout: how transport paths
  resolve, what a release install changes, and the recommended layout.
- **Status** fixed in 0.13.0 (bd067d3f). `host-configuration.md` covers an application in a separate repository.

### F4. `building-agents.md` does not mention running more than one agent

- **Hit while** looking for the PtcRunner answer to the cookbook's subagent
  feature (`Task` tool + `.claude/agents/*.md`).
- **What happened** The answer is named missions plus several `agent.core`
  calls from one workflow, which is exactly what
  `examples/named-mission-reader-writer` does. But
  `docs/guides/building-agents.md` never mentions named missions, multiple
  agents, or delegation, and does not link that example. The concept only
  appears under "Supply input and named missions" in
  `manifests-and-capabilities.md`, framed as a manifest feature rather than as
  the multi-agent composition story.
- **Why it's friction** "How do I give my agent specialists?" is one of the
  most common questions someone brings from any agent framework, and the guide
  named *Building agents* does not answer it or point at the answer.
- **Possible improvement** A "Compose several agents" section in
  `building-agents.md` showing two `agent.core/run-outcome` calls against two
  missions, linking to the existing example.
- **Status** fixed in 0.13.0 (bd067d3f). `building-agents.md` has a "Compose several agents" section.

### F5. Concurrent agents are asserted but not demonstrated

- **Hit while** planning the parallel-specialists chapter — the cookbook claims
  parallelism for subagents, and PtcRunner can actually show it.
- **What happened** `docs/guides/building-agents.md` states in one sentence
  that "Concurrent agents can overlap provider calls, but their mission
  evaluations share the run's bounded admission queue." `pmap` and `pcalls` are
  documented in `docs/function-reference.md:306-307` with bounded-parallelism
  semantics. No example runs several agent loops concurrently, and it is not
  spelled out whether workflow code is expected to use `pmap`/`pcalls` over
  `agent.core/run-outcome` for this, or something else.
- **Why it's friction** The reader is told concurrency exists and is bounded,
  but not the idiom for it, and the admission-queue caveat is exactly the kind
  of thing that turns into a confusing timeout when guessed at.
- **Possible improvement** Either a runnable fan-out example or a paragraph in
  `building-agents.md` showing the intended shape and explaining what the
  shared admission queue means for wall-clock time.
- **Status** fixed in 0.13.0 (bd067d3f). `building-agents.md` documents `pmap` for parallel loops and what they share.

### F6. A failed provider call gives no diagnosable reason

- **Hit while** running the first chapter for the first time, against a model
  alias whose credential turned out to have no credit.
- **What happened** `mix ptc run` printed exactly one line:
  `** (Mix) error: execution/workflow_failed: the workflow failed (run_ref: cmd-…)`.
  Nothing in it says a provider call failed, and nothing points at the flags
  that would say more. Adding `--envelope` gives an `error` object whose
  `message` is again `"the workflow failed"`, with `source`, `subject`, `path`,
  and `notes` all null or empty; the only real signal is
  `provider_activity: true` plus `successful_calls: 0` under `llm_usage_by_model`.
  Adding `--trace-dir` gives one more word: `failure_kind: "llm-provider-error"`.
  No HTTP status, no provider message, no distinction between causes. Three
  different failures — an unknown model ID, an invalid key, and an
  out-of-credit account — produced byte-identical output. I diagnosed it by
  leaving PtcRunner entirely and curling the provider directly, which returned
  the actual reason in one line ("Your credit balance is too low…").
- **Why it's friction** This is the first thing a new user does, and the
  failure most likely to greet them is a credential or model-ID problem. The
  design reason is sound and deliberate — traces and public errors carry no
  provider payloads — but the *class* of failure is not a payload. A first-run
  setup error currently costs a detour outside the product to identify.
- **Possible improvement** Keep payloads out, but publish the bounded
  provider-error class in the envelope: HTTP status, or a small closed
  vocabulary (`unauthorized`, `payment_required`, `model_not_found`,
  `rate_limited`, `timeout`, `other`). Even without that, the terminal message
  could name the failing alias and mention `--envelope` / `--trace-dir`.
  A `mix ptc doctor --connect` hint on this specific failure would also work.
- **Status** fixed in 0.13.0 (bd067d3f). A rejected request now reports `execution/llm_request_invalid` instead of `workflow_failed`.

### F7. Nothing catches a model ID the pinned catalog doesn't know

- **Hit while** trying a current Claude model ID (`anthropic:claude-sonnet-5`)
  in the host document.
- **What happened** `mix ptc validate` passed (it reports
  `provider_activity: false`, so it never touches the provider). The run then
  failed at the first model call, reporting only `llm-provider-error` per F6.
  The envelope's `resolved_model` echoed `anthropic:claude-sonnet-5` back,
  confirming PtcRunner had accepted and forwarded an ID its pinned `req_llm`
  catalog has no entry for.
- **Why it's friction** The host document is operator-owned configuration that
  a manifest cannot correct, so a typo or a too-new model ID is a pure setup
  failure — exactly the class of mistake worth catching before a run spends a
  provider call. The catalog to check against is already vendored in `deps/`.
- **Possible improvement** Have `mix ptc validate` (or `doctor`) check each
  installed `llm` model ID against the resolver's catalog and warn on a miss —
  a warning rather than an error, so a legitimately newer model still runs.
- **Status** fixed in 0.13.0 (bd067d3f). `host-configuration.md` documents that a selector absent from the bundled catalog stays usable, so pass-through is deliberate and stated.

### F8. A missing `.env` reports a constraint instead of the problem

- **Hit while** running a chapter for the first time after cloning, before
  copying `.env.example` to `.env`.
- **What happened** The run failed with:

  ```text
  error: local_preflight/environment_file_unavailable: the named environment
  file must be readable UTF-8 under 1 MB
  ```

  The `--envelope` output adds nothing: `path`, `source`, and `subject` are all
  `null` and `notes` is empty. The message states the constraint the file must
  satisfy, but never says **which** file was named, where it was resolved
  from, or that it simply does not exist. A missing file, an unreadable one, a
  non-UTF-8 one, and one over 1 MB are indistinguishable.
- **Why it's friction** This is the single most likely first-run error for
  anyone following a README, and the fix — `cp .env.example .env` — is
  trivial once you know. The message sends you looking for an encoding or size
  problem in a file that isn't there. It is also the second failure class
  (with [F6](#f6-a-failed-provider-call-gives-no-diagnosable-reason)) whose
  envelope carries a `path` field that stays null exactly when a path would
  resolve it.
- **Possible improvement** Populate `path` with the resolved location, and
  distinguish the causes in the message — "no such file" reads very
  differently from "not valid UTF-8". Both are safe to disclose: the path comes
  from the project document the caller wrote, not from file contents.
- **Status** fixed in 0.13.0 (bd067d3f). Now reports `environment_file_not_found: the named environment file does not exist`.

### F9. `analysis/runs` prints a wall of text for a first look

- **Hit while** answering "what happened in that run?" from the public
  analysis profile:
  `ptc repl --profile run-analysis-v1 --resource traces=.ptc/traces -e '(analysis/runs {})'`.
- **What happened** It worked, and returned every field of every run in one
  unpaginated Clojure map — roughly 9,000 characters for nine short runs,
  with inline truncation markers like `"openrouter:d..." (12/37 chars)` and
  `{...} (3/5)` woven through it. The fields that answer the question
  (`status`, `llm_calls`, `evaluations`, `duration_ms`, `terminal_reason`) are
  there, but scattered inside per-run maps of ~30 keys. Reading it meant
  piping the output through a script.
- **Why it's friction** This is the documented first command for looking at a
  run, and its default output is a firehose. The truncation markers make it
  worse rather than better: the content is elided but the key is still printed,
  so the volume stays high while the values stop being useful.
- **Possible improvement** A compact default projection for `runs` (id, status,
  duration, llm calls, terminal reason) with the full map available on request,
  or a documented projection argument in the guide's example so the first
  command a reader runs returns something readable.
- **Status** fixed in 0.13.0 (bd067d3f). `analysis/runs` returns a compact projection by default; `{"view" "full"}` opts back in.

### F10. `format` silently ignores width and alignment flags

- **Hit while** formatting an aligned per-turn table in a REPL analysis
  session.
- **What happened** Width and alignment flags are accepted and dropped:

  ```clojure
  (format "[%5s][%-8s][%3s]" "ab" "cd" 7)
  ;; => "[ab][cd][7]"
  ;; Clojure/Java: "[   ab][cd      ][  7]"
  ```

  No error, no warning — the string just comes back unpadded, so a column
  layout collapses into ragged output and you go looking for a bug in your own
  data extraction first.
- **Why it's friction** `docs/function-reference.md` describes `format` as a
  "Java-style format string" and documents exactly one divergence (DIV-21, nil
  rendering as `""`). Padding is the most common reason to reach for `format`
  over `str`, and this is the one divergence that produces wrong output rather
  than an error. Building any aligned output — a REPL table, a report, a
  fixed-width record — needs hand-rolled padding helpers.
- **Possible improvement** Support the width/precision/alignment flags, or, if
  they are deliberately out of scope, reject them at compile time instead of
  dropping them, and record the divergence in
  `docs/clojure-conformance-gaps.md` alongside DIV-21.
- **Status** fixed in 0.13.0 (bd067d3f). `(format "[%5s][%-8s]" "ab" "cd")` now returns `"[   ab][cd      ]"`.

### F11. There is no on-ramp to a file-serving MCP installation

- **Hit while** planning the first chapter that reads real data, and realising
  the runtime-included release cannot run it.
- **What happened** MCP is the only way to give a project a tool, so the first
  interesting thing anyone builds needs an MCP server. PtcRunner ships one that
  fits — `examples/mcp/filesystem`, read-only, paginated, `dist/server.js`
  committed — but reaching it means knowing it exists, knowing it lives under
  `examples/`, and writing a host document with a `node` command and a
  relative path into the checkout. **The `mix release` output does not include
  it**, so someone who installed PtcRunner as a self-contained binary (no
  Elixir, no repo) has no server to point at, and no obvious way to get one.
  `mix ptc init` scaffolds a provider-free project and says nothing about tools.
- **Why it's friction** This is the gap between "hello world runs" and "my
  agent can do something", and it is the step where the value proposition
  actually lands — narrow, effect-labelled, operator-installed capability. The
  README's own framing ("External tools arrive through exactly one door")
  raises the question of how to open that door, and the answer today is a
  guided tour of the examples directory.
- **Possible improvement** Worth deciding deliberately rather than by default.
  Options, roughly in order of effort: (a) mention the sample and a copyable
  host-document stanza in the MCP guide's opening rather than mid-document;
  (b) have `mix ptc init --with-files DIR` scaffold a project already wired to
  a read-only file grant; (c) ship the sample bundle inside the release under
  `rel/overlays` so a release install can serve files out of the box — it is
  ~1 MB of committed JavaScript, but it does add a Node dependency to an
  otherwise self-contained artifact; (d) treat a bounded read-only file
  capability as a built-in source alongside `llm` and `mcp`, which removes the
  Node dependency entirely but widens the trusted runtime.
  (a) and (b) are cheap and would have saved this tutorial the detour.
- **Status** open

### F12. Mission `data` is granted but invisible, and the discovery API the prompt advertises returns `[]`

- **Hit while** trying to ask the plain question "What's our runway?" against a
  mission whose manifest granted `data` but no tools.
- **What happened** The agent burned its whole turn budget and returned `nil`.
  A `--inspect` run shows exactly why. The rendered system prompt tells the
  model:

  > The API below is the prompt-visible subset: `(dir)` lists namespaces,
  > `(dir "ns")` its exports, `(apropos "term")` searches, `(doc "ns/name")`
  > prints documentation… Exports found this way are callable.
  > Fixed namespaces: … `data`, `tool`, and `json`.

  and then ends with an **empty** `Available API` section. Nothing anywhere in
  the prompt mentions that `data/cash_usd` and friends exist.

  The model did the reasonable thing and used the advertised discovery calls.
  All five returned an empty vector:

  | turn | program | observation |
  | --- | --- | --- |
  | 0 | `(dir)` | `[]` |
  | 1 | `(apropos "runway")` | `[]` |
  | 2 | `(dir "data")` | `[]` |
  | 3 | `(dir "tool")` | `[]` |
  | 4 | `(dir "core")` | `[]` |
  | 5 | `(return (get data/input "runway"))` | `nil` |

  On the final turn it fell back to `data/input` — the key used in the prompt's
  own worked example — which this manifest does not define. The run reported
  `{"ok":true,"value":null}`: a successful run with a wrong answer.
- **Why it's friction** Two separate problems, and the second is the serious
  one. First, mission `data` is a documented manifest feature that the default
  prompt never advertises, so a task that does not name the keys cannot
  succeed. Second, the prompt actively directs the model toward a discovery
  API that answers `[]` — for `data`, for `core`, for everything. Following the
  system prompt's own instructions is a guaranteed dead end, and it costs the
  entire budget before the model resorts to guessing. The `data/input` example
  then primes a specific wrong guess.
- **Possible improvement** Render the mission's `data` keys (names and types,
  not values) into the `Available API` section — they are manifest-authored,
  so this discloses nothing untrusted. Separately, make `(dir)` / `(dir "ns")`
  return something real, or stop advertising them when they cannot. If an empty
  `Available API` is a legitimate state, say so in the section rather than
  leaving it blank under a heading.
- **Status** fixed in 0.13.0 (bd067d3f). Mission data renders into `Available API` with name, type and effect, and the prompt now states what `dir`/`apropos` do and do not cover. An empty section says so explicitly.

### F13. Analysing a project's own runs cannot reuse its project document

- **Hit while** writing the tutorial step that inspects what just happened.
- **What happened** Opening the analysis REPL over a project's captured runs
  takes this, every time:

  ```console
  ptc repl --profile private-run-analysis-v1 \
           --resource traces=.ptc/traces \
           --resource inspection=.ptc/inspection \
           --private-unattended -l analysis.clj
  ```

  Every one of those paths is already declared in the project document that
  produced the runs:

  ```json
  "artifacts": {"root": ".ptc", "trace": true, "inspection": true}
  ```

  `--project` does not help: it selects a different mode (a REPL inside the
  application's own environment, where the `analysis/` namespace does not
  exist) and is rejected alongside `--profile` with
  `arguments/conflicting_arguments`. Profile mode never consults the project
  document, so the artifact root has to be retyped as resource flags.
- **Why it's friction** Looking at the run you just did is the most common
  reason to open the analysis REPL, and it is the case with the most
  information already on disk. The tutorial ended up shipping a wrapper script
  purely to hide the argument list, which is a smell: the CLI has the
  information and is not using it.
- **Possible improvement** Allow `--profile` together with `--project`, and
  derive `traces` and `inspection` from the project's `artifacts.root` (still
  overridable by explicit `--resource`). Failing that, a documented shorthand
  for "the analysis profile over this project's artifacts" would remove the
  need for a wrapper.
- **Status** fixed in 0.13.0 (bd067d3f). `ptc repl --project P --profile run-analysis-v1` works and derives the artifact directories.

  **Related, and worse for the private profile.** `--private-terminal`
  authorizes an interactive session but "rejects scripts, stdin, `--eval`,
  `--load`, JSON Lines, and detached execution"
  (`docs/guides/kernel-repl.md`). There is no `:load` meta-command either; the
  session offers only `:doc`, `:find`, and `:help`. So an interactive private
  session cannot load helper definitions, and reading generated source
  interactively means typing raw
  `(analysis/read "cmd-…" {"collection" "generated_sources"})` calls with the
  run id spelled out. Anything with helpers has to run one shot under
  `--private-unattended`. Passing `-l` with `--private-terminal` fails with
  `repl/command_failed: selected profile is interactive-only`, which does not
  hint that `--load` is the rejected part. The restriction on the *sink* is
  understandable; applying it to a local setup file that only defines functions
  is what makes the private profile awkward to use interactively.

  **The restriction does not hold anything back.** Pasting the entire contents
  of that same file into the interactive session works: the definitions take,
  and the helpers behave exactly as they would have with `--load`. So the rule
  blocks the convenient path to a result it permits by hand, which suggests it
  is over-broad rather than protective. Either allow `--load` in private
  terminal mode, or say in the error which switch was refused so the reader
  reaches the paste workaround without reading the guide.

### F14. Private artifacts land outside the documented artifact root

- **Hit while** preparing this repository for publication and auditing what git
  was about to commit.
- **What happened** A `.gitignore` with `.ptc/` looks sufficient: the project
  document says `"artifacts": {"root": ".ptc"}`, and traces, envelopes and the
  inspection capture all appear there. But an aborted private run had left

  ```text
  01-chief-of-staff/.ptc-private-6e6ead99bef2/artifact
  ```

  a sibling of `.ptc`, not a child, so `.ptc/` does not match it and git
  offered to commit it. In this case the reservation was empty and mode `0600`,
  so nothing leaked. A completed one would hold prompts, model responses and
  generated source.
- **Why it's friction** The owner-only permissions protect against other users
  on the machine, which is not the threat when the working tree is about to be
  pushed to a public remote. The single most likely mistake, committing private
  evidence, is the one the naming makes easy: the obvious ignore rule derived
  from the project document does not cover it, and the directory is hidden so
  it is not noticed while working.
- **Possible improvement** Write private reservations under the configured
  artifact root (`.ptc/private-*/`) so one ignore rule covers everything a run
  can produce. Failing that, have `mix ptc init` scaffold a `.gitignore`
  containing every pattern a run can create, and mention the `.ptc-private-*`
  prefix in the private-inspection section of `running-and-debugging.md`.
- **Status** open

