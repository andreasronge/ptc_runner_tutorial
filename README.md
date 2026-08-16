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

These tutorials run from a PtcRunner source checkout. Clone both repositories
side by side:

```console
git clone https://github.com/andreasronge/ptc_runner
git clone https://github.com/andreasronge/ptc_runner_tutorial
cd ptc_runner && mix deps.get
```

Supply a model credential for the tutorial you're running:

```console
cp ../ptc_runner_tutorial/01-chief-of-staff/.env.example \
   ../ptc_runner_tutorial/01-chief-of-staff/.env
chmod 600 ../ptc_runner_tutorial/01-chief-of-staff/.env
```

Fill in an [OpenRouter](https://openrouter.ai/keys) key. Nothing is loaded
implicitly — each project document names the exact file it reads.

## Tutorials

| # | Tutorial | Ports | Status |
| --- | --- | --- | --- |
| 01 | [The chief of staff agent](01-chief-of-staff/) | `01_The_chief_of_staff_agent.ipynb` | Chapters 1-2 of 8 |

### 01 — The chief of staff agent

An AI chief of staff for TechStart Inc, a 50-person B2B SaaS startup that
raised a $10M Series A.

| # | Chapter | Teaches |
| --- | --- | --- |
| 1 | [One bounded run](01-chief-of-staff/steps/01-one-bounded-run/) | The manifest, the shipped agent loop, the turn protocol, the real system prompt |
| 2 | [Granting data instead of assuming a directory](01-chief-of-staff/steps/02-granting-data/) | Read-only filesystem MCP over the financial data; mission data vs. authoritative source |
| 3 | Domain logic as a mission API | The cookbook's Python scripts as prompt-visible PTC-Lisp |
| 4 | Specialists are missions | `financial-analyst` and `recruiter` as named missions with different grants |
| 5 | Running specialists in parallel | `pmap` fan-out and the shared admission queue |
| 6 | Plan and act are two authorities | A plan phase whose mission has no write tool |
| 7 | Contracts instead of parsing | `result_schema` on the executive summary |
| 8 | Shipping the report, and reading the trace | Write effects, `allow` lists, and the analysis prelude |

## Notes for PtcRunner maintainers

[FRICTION.md](FRICTION.md) records everything that was slow, surprising, or
required reading source while building these — including things that work
exactly as specified. It is meant to become issues.
