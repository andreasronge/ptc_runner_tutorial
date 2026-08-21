# ptc-suite-mcp

Run host-owned validation cases against a PtcRunner project, and report which
assertions held. One binary, two front ends: `--check` for CI, and stdio MCP so
an agent can choose which cases to spend a run on.

`e2e.sh` answers "did every chapter exit 0". That is a weaker question than it
looks: a chapter whose agent gives up after one turn and returns the string
`"exploring"` exits 0 too. This answers "did the chapter still do the thing the
chapter is about", by running inputs the chapter never shows and checking the
value and the envelope against what the operator wrote down.

## Run it

```console
cd 01-chief-of-staff
node ../tools/ptc-suite-mcp/src/cli.js \
  --project-root . --suites suites --allow-live --retries 1 --check
```

```text
==> 01-one-bounded-run (01-one-bounded-run.ptc-project.json)
    PASS observed-runway (15.3s)
    PASS held-out-smaller-balance (14.4s)
    PASS held-out-larger-burn (11.9s)

3/3 cases passed, $0.0004 spent
```

`--check 04` runs one suite, `--check 04/held-out` one group of cases; both
halves match by prefix. Exit status is 1 if any case failed.

Every case needs `ptc` on PATH and the chapter's `.env` in place, exactly as
`e2e.sh` does. `--allow-live` is mandatory and says so out loud: a case
executes the project with its installed providers, contacts them, and spends
credit. Without it nothing runs.

## What a case is

A suite names one project document and one to 32 cases. Each case supplies an
input and says what must be true of the run:

```json
{
  "version": 1,
  "name": "03-domain-logic",
  "project": "03-domain-logic.ptc-project.json",
  "cases": [
    {
      "name": "held-out-hiring-impact",
      "description": "10,000,000 / 565,000 = 17.7 months, a 2.3 month reduction.",
      "input": { "task": "Call chief.domain/hiring-impact for 4 engineers at $150,000 and return the map." },
      "expect": {
        "result": [
          { "path": "value.new_runway_months", "equals": 17.7 },
          { "path": "value.recommendation", "contains": "MODERATE RISK" }
        ],
        "capabilities_called": ["mission/files.read"],
        "no_capability_refusals": true,
        "max_cost_usd": 0.05
      }
    }
  ]
}
```

`mix ptc.repair --validation-suite` compares a run's value to an exact
`expected`, which is the right contract for a deterministic target. A tutorial
chapter is not one: a model writes both the program and the prose, so the same
question yields a different value every run. `expected` is still here for the
deterministic case — a replay installation, or a question whose whole answer is
arithmetic — and `expect` adds bounded claims for everything else.

### Case fields

| Field | Meaning |
| --- | --- |
| `name` | `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, unique in the suite |
| `description` | What this case is for. Shown by `list_suites`. |
| `input` / `private_input` | Exactly one. The whole input object, as `--input` takes it. |
| `expected` | The published value must equal this exactly. |
| `expect` | Bounded assertions, below. At least one of `expected`/`expect`. |

### Expectations

| Key | Asserts |
| --- | --- |
| `exit_status` | The process exit status. Defaults to 0, asserted always. |
| `result_keys` | Each dotted path is present in the value. |
| `result` | Path checks: `equals`, `type`, `min`, `max`, `length`, `one_of`, `contains`, `matches`. |
| `capabilities_called` | The envelope records at least one call to each name. |
| `capabilities_not_called` | The envelope records none. |
| `no_capability_refusals` | The envelope's `capability_refusals` is empty. |
| `max_subordinate_evaluations` | The run used no more turns than this. |
| `max_cost_usd` | The run's reported provider cost. An unreported cost fails. |

A path is dot-separated, and a numeric segment indexes an array, so
`hiring_plan.hire.0` is the first name. `contains` and `matches` read the whole
subtree at the path, so "the answer mentions the CSV" holds whether the model
returned a sentence or a map. An unknown field anywhere in a suite is refused
at load: a misspelled `expects` would otherwise turn a case with real
assertions into one that checks nothing.

`capabilities_*` and the two ceilings read the run envelope rather than the
answer. That is the point of having them: the value is what the model chose to
say, while the envelope is what the Kernel let happen.

## Driving it from an agent

Install it into a mission the way any other MCP server is installed. Paths
resolve from the host document:

```json
"suite": {
  "source": "mcp",
  "installation_revision": "tutorial-suite-v1",
  "transport": {
    "type": "stdio",
    "command": "node",
    "cwd": ".",
    "args": [
      "../tools/ptc-suite-mcp/src/cli.js",
      "--project-root", ".",
      "--suites", "suites",
      "--allow-live",
      "--max-runs", "8",
      "--retries", "1"
    ],
    "inherit_environment": true,
    "env": {}
  },
  "tools": {
    "list_suites": { "as": "suite.list", "effect": "read" },
    "run_case": { "as": "suite.run", "effect": "write", "model_visible": true }
  }
}
```

`run_case` is a write: it starts a process that contacts providers and spends
money. Mapping it obliges every selecting manifest to carry a non-empty `allow`
list, which is the right amount of friction.

**Never install a suite whose project document is the checker's own project.**
Nothing here can detect that, and the result is a run that starts a run that
starts a run until the run budget stops it.

### Tools

`list_suites` returns the installed suites, their cases, and each case's
assertions rendered as short phrases, so a caller can see what a case would
prove before spending a run on it. It also reports `runs_remaining` and
`live_runs_allowed`.

`run_case` takes `{suite, case}` and returns the report: `status`, every
assertion with its verdict, `exit_status`, `reason`, `run_ref`, `duration_ms`,
what the run spent, the value (truncated past 8 KB), and the artifact paths.

Neither tool accepts a path, a command, or a budget. A caller selects one
installed case by name; everything else was fixed by the operator on the
command line. When a model is driving, the set of things it can cause to happen
should be readable from the installation, not from its arguments.

## Bounds

- Suites and project documents are fixed at startup. A project document that
  resolves outside `--project-root`, symlinks followed, is refused there rather
  than at call time.
- Cases run one at a time. Cost is the obvious reason; the load-bearing one is
  that a chapter's artifacts root is shared, so concurrent runs of the same
  project interleave in `.ptc/`.
- `--max-runs` (default 32) is a hard ceiling per process.
- `--timeout-ms` (default 300000) kills a case with SIGTERM, then SIGKILL. A
  killed case reports `timeout`, never a workflow that failed on its merits.
- `--retries` (default 0) reruns a case **only** when it exits 4, provider
  acquisition — a cold `npx` fetch of a stdio MCP server is the usual cause. A
  failed workflow (5) or an exceeded limit (6) is the thing under test and is
  never retried.
- Each case gets a fresh artifact directory under `--artifacts` (default
  `<project-root>/.ptc-suite`), emptied before every attempt, so a run that
  publishes nothing reports an unavailable result rather than the last one.

## Limits worth knowing

- Equality is JSON equality with JavaScript number semantics, so 42 and 42.0
  are the same value here and are not in `mix ptc.repair`. A case that must
  separate them needs an explicit `type` claim.
- Nothing checks that the host configuration stayed put mid-suite. The Elixir
  runner digests the manifest and the host inputs around every case; this does
  not.
- A key containing a dot is not addressable by a path. Assert on its parent.

## Tests

```console
npm install
npm test
```

The unit tests cover the loader and the checks. `test/stdio.test.mjs` speaks
JSON-RPC to the real binary over a pipe and covers discovery and refusal; it
starts the server without `--allow-live`, so it runs no case and costs nothing.
