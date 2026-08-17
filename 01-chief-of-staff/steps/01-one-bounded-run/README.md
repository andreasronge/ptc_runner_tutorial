# Chapter 1: one bounded run

A task goes in, a value comes out, and the run leaves a trace you can inspect.
No tools, no files. Everything the agent needs is in the task.

```console
cd 01-chief-of-staff
ptc run 01-one-bounded-run.ptc-project.json
```

```json
{"ok":true,"value":{"cash_usd":10000000,"monthly_burn_usd":500000,"runway_months":20}}
```

## The task

The task is data, not code. It lives in `ptc.json` under `input`:

```json
"input": {
  "value": {
    "task": "TechStart Inc has $10,000,000 in the bank and burns $500,000 a month. Compute the runway in whole months and return a map with the keys \"runway_months\", \"cash_usd\" and \"monthly_burn_usd\"."
  }
}
```

That whole `value` object is passed to the workflow entry function as its one
argument.

## Starting the loop

`ptc.json` names the entry point:

```json
"workflow": {"entry": "chief.workflow/run"}
```

and `workflow.clj` is the whole workflow:

```clojure
(ns chief.workflow)

(defn run [input]
  (agent.core/run (get input "task")
                  {"max_turns" 6}))
```

`input` is the `value` object above, so `(get input "task")` is the task string.
`agent.core/run` starts the agent loop with it. `agent.core` is the shipped
loop, selected in `ptc.json` as `{"library": "agent.core"}`. It owns the prompt,
the turn budget, and the retry rules.

Each turn, the loop asks the model for one program, runs it, and looks at what
came back. An ordinary value becomes an observation and costs another turn.
`(return v)` ends the loop. `(fail v)` reports that the task cannot be done.

## What the model wrote

The model does not answer the question. It writes a program that answers it.
Turn on the inspection artifact in the project file:

```json
"artifacts": {"trace": true, "inspection": true}
```

then open a REPL over the captured runs. `--project` reuses the chapter's
artifact directories, so there is nothing to retype:

```console
ptc repl --project 01-one-bounded-run.ptc-project.json \
         --profile private-run-analysis-v1 --private-unattended \
         -l analysis.clj -e '(source -1)'
```

```clojure
turn 0:  (return {"runway_months" (int (/ 10000000 500000)) "cash_usd" 10000000 "monthly_burn_usd" 500000})
```

98 bytes, one turn.

Private queries run one at a time, because an interactive private session is
not allowed to load a setup file. The public profile has no such limit, and
works from the trace alone with no inspection artifact:

```console
ptc repl --project 01-one-bounded-run.ptc-project.json \
         --profile run-analysis-v1 -l analysis.clj
```

That opens an interactive session where `(runs)`, `(turns n)` and `(failed)`
are available.

```text
turn   model      tokens     program    eval  outcome
   0    2528ms   1044->131      75B     2ms  returned
```

2.5 seconds of model time, 2 milliseconds to run the program. The division
never went to the model.

## Or use the Viewer

The same evidence, in a browser:

```console
cd 01-chief-of-staff
ptc viewer 01-one-bounded-run.ptc-project.json
```

It reads the trace and inspection directories named by the project file, and
serves on `127.0.0.1:4123`. The `viewer` block in that file controls the port,
whether a browser opens, and whether private evidence is authorized:

```json
"viewer": {"port": 4123, "open": true, "repl": true, "private": true}
```

`"private": true` authorizes the inspection artifact, which is what makes the
generated program and the model conversation visible.

Two panels carry most of the value. **Environment** is what the run was given,
and **Execution transcript** is what it did with it.

![The Viewer showing the Environment panel with workflow and mission preludes,
mission inventory and connector fingerprints, above the Execution transcript
listing capability calls in canonical order](viewer.png)

The screenshot is from chapter 2, which has more to show. Reading it:

- **Workflow prelude**, 10 components in load order, dependencies before
  dependants. Nine are shipped libraries; `chief.workflow` at the end is the
  four lines above. Each has a `source` link, and `agent.core` lists the eight
  components it needs.
- **Mission prelude**, separately, holding only what mission code may call.
  Chapter 1 has none, so the model gets nothing but the language.
- **Connectors**, with the protocol each speaks and how many tools it exposes.
  `financials` reports `mcp-2026-07-28 · 2 tools`, which is the whole grant.
- **Execution transcript**, every capability call in order with its duration.
  The repeating `kernel-mission-model-context`, `llm-request`,
  `workflow-annotate`, `kernel-eval` group is one turn of the loop.

The `PRIVATE EVIDENCE` badges mark what came from the inspection artifact
rather than the trace. Without `"private": true` those panels still list the
components, but the `source` links are not there.

## About PTC-Lisp

PTC-Lisp is a small subset of Clojure. It has `let`, `fn`, `defn`, `if`,
`map`/`filter`/`reduce`, strings, regex, math, and JSON. It has no `eval`, no
macros, no host interop, no filesystem, and no network. Generated code cannot
reach anything that was not handed to it.

You normally do not write PTC-Lisp. The model does. What you write is the
manifest, the short workflow above, and later the small facade that decides
what the model is allowed to see.

## Coming from the Agent SDK

The notebook sets `cwd="chief_of_staff_agent"` and the agent picks up
`CLAUDE.md` on its own. Nothing is automatic here. There is no working
directory, and no file is readable unless a provider was installed and
selected. Chapter 1 avoids the question by putting the numbers in the task.
Chapter 2 grants them properly.

## Next

[Chapter 2: granting data](../02-granting-data/) gives the agent the company
snapshot and the cookbook's financial data files, and they disagree.
