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

then open a REPL over the captured runs. `analyze` wraps `ptc repl` with the
profile, resource directories and privacy flag it needs, and loads
`analysis.clj`:

```console
./analyze --private -e '(source -1)'
```

```clojure
turn 0:  (return {"runway_months" (int (/ 10000000 500000)) "cash_usd" 10000000 "monthly_burn_usd" 500000})
```

98 bytes, one turn.

Private queries run one at a time, because an interactive private session is
not allowed to load a setup file. The public view has no such limit: `./analyze`
opens a normal REPL where `(runs)`, `(turns n)` and `(failed)` work from the
trace alone, with no inspection artifact.

```text
turn   model      tokens     program    eval  outcome
   0    2528ms   1044->131      75B     2ms  returned
```

2.5 seconds of model time, 2 milliseconds to run the program. The division
never went to the model.

## Or use the Viewer

The same evidence, in a browser. From the PtcRunner checkout:

```console
cd ~/projects/ptc_runner
mix ptc.viewer ../ptc_runner_tutorial/01-chief-of-staff/01-one-bounded-run.ptc-project.json
```

It reads the trace and inspection directories named by the project file, and
serves on `127.0.0.1:4123`. The `viewer` block in that file controls the port,
whether a browser opens, and whether private evidence is authorized:

```json
"viewer": {"port": 4123, "open": true, "repl": true, "private": true}
```

`"private": true` is what unlocks the generated program and the model
conversation. Without it you get run summaries and canonical events only.

The **Model conversation** panel shows the exchange itself: the task as the
model received it, the `run_ptc_lisp` tool call it replied with, and the
program inside it.

![The Viewer's Model conversation panel, showing the task, the run_ptc_lisp
tool call, and the generated PTC-Lisp program](viewer-model-conversation.png)

Note the `TURN BUDGET: 6 turns remain` appended to the task, and that the
assistant's `content` is empty: the whole reply is the tool call.

The Viewer shows more than the REPL does. Alongside each run it lists the
effective components in load order, and with an inspection artifact every
entry opens its exact captured source:

```text
agent.feedback     workflow   5170B
agent.native       workflow   3365B
agent.retry        workflow    460B
kernel             workflow   2576B
agent.prompt       workflow  12384B
llm                workflow    389B
result             workflow    441B
workflow.event     workflow    257B
agent.core         workflow  17140B
chief.workflow     workflow    188B
```

Nine of those are the shipped libraries. The last is `workflow.clj` from this
chapter. `agent.core` is the agent loop and `agent.prompt` builds the system
prompt shown above, both readable in full. Generated programs carry statically
analyzed prelude calls, so a call in the model's program links to the component
function it invoked.

The Viewer needs the PtcRunner source checkout. There is no `viewer`
subcommand in the release binary, so `./analyze` is the option that works
everywhere.

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
