# PtcRunner tutorials — series plan

A tutorial series that follows the [Claude Agent SDK
cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk)
scenario by scenario, rebuilt on [PtcRunner](https://github.com/andreasronge/ptc_runner).

## Approach

**Sequenced by PtcRunner's own axes, with a "coming from the Agent SDK?"
callout in each chapter.**

The cookbook teaches Claude Code's filesystem configuration surface — a
`CLAUDE.md` in the working directory, `.claude/agents/*.md`, `.claude/hooks/`,
output styles, and Bash running Python scripts. The agent is a chat loop with
ambient access to a directory.

PtcRunner is a different machine. The model writes one PTC-Lisp program per
turn; that program runs in a confined mission holding only the tools an
operator installed; the workflow decides whether to continue. There is no
`cwd`, no Bash, and no ambient filesystem.

So the series ports the *scenario*, not the code. Each chapter is organised
around what PtcRunner actually makes distinct, and ends with a short box naming
the cookbook feature it replaces and what changed. Two cookbook features get an
explicit "this does not port, and here is why" treatment rather than a forced
equivalent:

- **Slash commands** are a chat-time shortcut. The PtcRunner counterpart is a
  manifest plus an input contract, which is build-time.
- **Hooks** are advisory scripts that run after a tool call. PtcRunner splits
  that job in two: enforcement moves *before* the call into the capability
  grant and the `allow` list, and the audit trail is the structured trace,
  which is automatic rather than something you install.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| The cookbook's Python scripts (`hiring_impact.py`, `talent_scorer.py`, …) | Rewrite as a prompt-visible PTC-Lisp prelude component | Shows code mode's actual point: the model composes domain functions inside one program instead of relaying five tool calls |
| Company data | Read-only filesystem MCP over the CSVs, high-level context as mission `data` | Reproduces the notebook's own "high-level context vs. authoritative source" lesson as two grants rather than a prompt nudge |
| Specialist coordination | Parallel fan-out (`pmap`/`pcalls`) over named missions | The cookbook claims subagent parallelism; PtcRunner can demonstrate it under bounded limits |
| Read-side MCP server | [`ptc-fs-mcp@0.1.0`](https://www.npmjs.com/package/ptc-fs-mcp) via `npx` (replaced the in-repo `examples/mcp/filesystem` sample, which upstream removed) | Purpose-built for tutorials, MIT, pinned by version in the host document — needs Node 20.19+ and `npx`, downloaded on first use |
| Write-side MCP server | Same package — `ptc-fs-mcp` ships `write_text_file`; map it from a separate installation when a chapter needs writes | One server, and the host decides per installation which tools become capabilities |
| Model | OpenRouter + `deepseek/deepseek-v4-flash` | The repo's documented and tested path, and cheap enough to re-run a tutorial freely (chapter 1 costs about $0.0004). See [F1](FRICTION.md) for the direct-Anthropic gap |

## Tutorial 01 — The chief of staff agent

Ports
[`01_The_chief_of_staff_agent.ipynb`](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/01_The_chief_of_staff_agent.ipynb).
Same scenario: an AI chief of staff for TechStart Inc, a 50-person B2B SaaS
startup that raised a $10M Series A.

| # | Chapter | Teaches | Replaces |
| --- | --- | --- | --- |
| 1 | **One bounded run** | `ptc.json`, a workflow entry, a model writing one program, the result and trace | Cell 4 — the first "what's our runway?" query |
| 2 | **Granting data instead of assuming a directory** | Read-only filesystem MCP over `financial_data/`, mission `data` for standing context, and why the two differ | Feature 0 — `CLAUDE.md` and the CSV-preference lesson |
| 3 | **Domain logic as a mission API** | `finance.clj` with prompt-visible signatures; the model composes them in one program | Feature 1 — the Bash tool running Python scripts |
| 4 | **Specialists are missions** | `financial-analyst` and `recruiter` as named missions with different grants, driven from one workflow | Feature 6 — subagents via the `Task` tool |
| 5 | **Running specialists in parallel** | `pmap`/`pcalls` fan-out, and what the shared admission queue means | The cookbook's parallelism claim |
| 6 | **Plan and act are two authorities** | A plan phase on a read-only mission, then a write mission — the plan phase *has* no write tool | Feature 3 — `permission_mode="plan"` |
| 7 | **Contracts instead of parsing** | `result_schema` on the executive summary, contrasted with the notebook's four-source regex plan extraction | Cells 13–16 — `extract_plan_from_*` |
| 8 | **Shipping the report, and reading the trace** | Write-effect MCP, the mandatory `allow` list, no automatic retry; then the trace, Viewer, and `analysis` prelude | Feature 5 — hooks and `audit/report_history.json` |

Feature 2 (output styles) is folded into chapter 7 as a note on the
`agent.prompt` policy seam, and revisited properly in a later tutorial where
replay makes prompt changes measurable.

## The rest of the series

Sketch only; each gets its own plan once 01 lands.

| Cookbook notebook | PtcRunner story | Strength |
| --- | --- | --- |
| `00` One-liner research agent | Already close to the existing quickstart | Skip or fold into 01's chapter 1 |
| `02` Observability agent | The `analysis` prelude, `debug.nav`, and the Viewer — analysing a run is itself a bounded run | Strong; PtcRunner is unusually well set up here |
| `03` Site reliability agent | MCP effect metadata, write `allow` lists, indeterminate mutation on timeout | Strong — the effect model is the whole subject |
| `04` Migrating from the OpenAI Agents SDK | Little to port; the interesting version is "migrating a tool-loop agent to code mode" | Rewrite the framing or skip |
| `05` Session browser | `ptc_viewer` already exists | Low value as a build; possible as a tour |
| `06` Vulnerability detection agent | Untrusted input meeting a language with no escape hatches | Strong; the security argument in a concrete task |
| `07` Hosting the agent | Runtime-included release, host document ownership, credential sources | Useful, mostly operator-facing |
| `08` Dynamic workflows | Candidate components plus the replay provider — change agent behaviour and attribute the difference | Strong; no cookbook equivalent |

## Repository layout (proposed)

```text
ptc_runner_tutorial/
├── README.md               # series index and setup
├── PLAN.md
├── FRICTION.md
└── 01-chief-of-staff/
    ├── README.md           # the tutorial prose, chapter by chapter
    ├── ptc.json            # final manifest
    ├── ptc-host.json       # operator document
    ├── ptc-project.json
    ├── workflow.clj
    ├── finance.clj         # the ported "scripts"
    ├── analyst.clj         # financial-analyst mission API
    ├── recruiter.clj       # recruiter mission API
    ├── data/               # CSVs served through the read-only MCP server
    └── steps/              # one runnable manifest per chapter
```

Each chapter is runnable on its own from `steps/`, and the top-level manifest
is the assembled result — the cookbook's "Putting It All Together" cell.
