# PtcRunner tutorials

The [Claude Agent SDK cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk)
scenarios, rebuilt on [PtcRunner](https://github.com/andreasronge/ptc_runner).

In the cookbook, an agent calls one tool at a time and has ambient access to a
working directory. In PtcRunner the model writes **one program per turn**, that
program runs in a confined mission holding only the tools an operator
installed, and the workflow decides whether to continue. Same scenarios, a
different machine underneath.

Each chapter is a runnable project. See [PLAN.md](PLAN.md) for the full series
outline and the design decisions behind it.

## Setup

Every command in these tutorials uses the `ptc` executable. Clone both
repositories side by side and build it once:

```console
git clone https://github.com/andreasronge/ptc_runner
git clone https://github.com/andreasronge/ptc_runner_tutorial
cd ptc_runner_tutorial && ./install.sh
```

`install.sh` builds PtcRunner's runtime-included release and puts `ptc` on
your PATH. The build needs Elixir and Erlang (the checkout pins them in
`mise.toml`; `mise install` provides both); running `ptc` afterwards does not.
Chapter 2 onward reads files through the published
[`ptc-fs-mcp`](https://www.npmjs.com/package/ptc-fs-mcp) MCP server, which the
host documents launch through `npx` — Node.js 20.19+ must be on your PATH, and
the first run downloads the package.

Supply a model credential for the tutorial you're running:

```console
cp 01-chief-of-staff/.env.example 01-chief-of-staff/.env
chmod 600 01-chief-of-staff/.env
```

Fill in an [OpenRouter](https://openrouter.ai/keys) key. Nothing is loaded
implicitly — each project document names the exact file it reads.

To check that every chapter still runs end-to-end, `./e2e.sh` executes each
project document against live providers and asserts success — the whole pass
costs well under a cent. CI runs the same script weekly and on pushes to
`main` (it needs an `OPENROUTER_API_KEY` repository secret).

## Tutorials

| # | Tutorial | Ports | Status |
| --- | --- | --- | --- |
| 01 | [The chief of staff agent](01-chief-of-staff/) | `01_The_chief_of_staff_agent.ipynb` | Chapters 1-4 of 8 |

### 01 — The chief of staff agent

An AI chief of staff for TechStart Inc, a 50-person B2B SaaS startup that
raised a $10M Series A.

| # | Chapter | Teaches |
| --- | --- | --- |
| 1 | [One bounded run](01-chief-of-staff/steps/01-one-bounded-run/) | The manifest, the shipped agent loop, the turn protocol, the real system prompt |
| 2 | [Granting data instead of assuming a directory](01-chief-of-staff/steps/02-granting-data/) | Read-only filesystem MCP over the financial data; mission data vs. authoritative source |
| 3 | [Domain logic as a mission API](01-chief-of-staff/steps/03-domain-logic/) | The cookbook's five Python scripts as prompt-visible PTC-Lisp the model composes in one program |
| 4 | [Specialists are missions](01-chief-of-staff/steps/04-specialists/) | `financial-analyst` and `recruiter` as named missions with different grants, driven from one workflow |
| 5 | Running specialists in parallel | `pmap` fan-out and the shared admission queue |
| 6 | Plan and act are two authorities | A plan phase whose mission has no write tool |
| 7 | Contracts instead of parsing | `result_schema` on the executive summary |
| 8 | Shipping the report, and reading the trace | Write effects, `allow` lists, and the analysis prelude |

## Notes for PtcRunner maintainers

[FRICTION.md](FRICTION.md) records everything that was slow, surprising, or
required reading source while building these — including things that work
exactly as specified. It is meant to become issues.
