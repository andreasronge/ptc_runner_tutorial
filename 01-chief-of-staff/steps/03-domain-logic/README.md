# Chapter 3: domain logic as a mission API

The cookbook's Feature 1 gives the agent a Bash tool and five Python scripts.
Every use is a subprocess: the model shells out, argparse parses flags, the
script prints JSON, and the model reads it back to decide the next call.

Here the five scripts become one prompt-visible component, and the model
composes the functions inside a single program.

```console
cd 01-chief-of-staff
ptc run 03-domain-logic.ptc-project.json
```

## The task

```json
"input": {
  "value": {
    "task": "Should we hire 3 senior engineers at $200k or 5 junior engineers at $130k? Model the hiring impact of each option, forecast ARR for the next 12 months at 15% monthly growth to see when revenue covers the new burn, and run a decision matrix over both options on cost, productivity, time_to_impact, team_growth and runway_impact (score them 1-10 yourself, justify the scores). Recommend one option with the numbers that support it."
  }
}
```

The workflow is unchanged from chapter 2. The new capability is a second
mission component, not anything in the loop:

```json
"components": [
  {"id": "chief.finance", "path": "finance.clj"},
  {"id": "chief.domain",  "path": "domain.clj"}
]
```

## The ported scripts

`domain.clj` carries the cookbook's five scripts as six functions:

| Cookbook script | Here | Notes |
| --- | --- | --- |
| `simple_calculation.py` | `metrics` | runway, quarterly and daily burn |
| `hiring_impact.py` | `hiring-impact` | loaded cost, new burn, new runway, risk call |
| `financial_forecast.py` | `forecast` | base/optimistic/pessimistic ARR scenarios |
| `decision_matrix.py` | `decision-matrix` | weighted scoring, winner, analysis |
| `talent_scorer.py` | `score-candidate`, `rank-candidates` | the recruiter's tool, waiting for chapter 4 |

Each port was checked against its Python original — same inputs, same numbers,
down to `runway_reduction_months 2.3` and `cash_required 986641`.

One deliberate change. `hiring_impact.py` hardcodes the company figures with a
comment saying they came from `CLAUDE.md`:

```python
CURRENT_BURN_MONTHLY = 500000  # $500K/month
CURRENT_RUNWAY_MONTHS = 20  # 20 months
CASH_IN_BANK = 10000000  # $10M
```

That is a copy that goes stale the day the numbers change. The port reads the
mission's granted snapshot instead, so the model, the prompt, and the domain
logic all see one source:

```clojure
(defn hiring-impact
  "Model hiring engineers against the company snapshot: loaded cost
   (salary x 1.3), new monthly burn, new runway, and a risk call."
  {:signature "(num_engineers :int, annual_salary_usd :float) -> :map"}
  [num-engineers salary]
  (let [burn (get data/snapshot "monthly_burn_usd")
        cash (get data/snapshot "cash_usd")
        ...]))
```

Two mechanics worth knowing:

- Helpers defined with `defn-` (`round2`, `compound-schedule`, `score-option`)
  stay private to the namespace and never reach the prompt. The model sees six
  functions, not fourteen.
- The `:signature` strings are a checked grammar, not documentation. The
  primitive types are `:string`, `:int`, `:float`, `:bool`, `:keyword`,
  `:datetime`, `:map`, and `:any`; a list is `[:map]`. There is no `:number`
  and no `:vector` — writing one fails the bundle compile.

## What the model wrote

```console
ptc repl --project 03-domain-logic.ptc-project.json \
         --profile run-analysis-v1 -l analysis.clj -e '(turns -1)'
```

```text
turn   model      tokens      program   eval  outcome
   0    2960ms   1813->94        48B     3ms  continued
   1    6287ms   2006->300      149B     6ms  continued
   2    6942ms   2443->320      178B    17ms  continued
   3    3223ms   3627->90       111B     4ms  continued
   4    5188ms   3873->176      226B     5ms  continued
   5   14795ms   4189->960      852B     7ms  continued
   6   28784ms   5037->1477    4305B     5ms  returned
```

The programs, from the private profile's `(source -1)`:

```clojure
;; turn 1 — both options in one program, sharing scope
(let [option-a (chief.domain/hiring-impact 3 200000)
      option-b (chief.domain/hiring-impact 5 130000)]
  {:option-a option-a :option-b option-b})

;; turn 2 — turn 1's new burn rates become forecast inputs
(def forecast-a (chief.domain/forecast 2400000 0.15 12 565000))
(def forecast-b (chief.domain/forecast 2400000 0.15 12 570416.67))
{:forecast-a forecast-a :forecast-b forecast-b}
```

This is the chapter's whole argument in two turns. `565000` and `570416.67`
are outputs of `hiring-impact` flowing into `forecast` as arguments. In the
cookbook that number makes the same trip through the model twice: once out of
one subprocess's stdout, once back in as a shell argument for the next.

The `def`s are the other half: committed definitions persist across turns, so
turns 3 and 4 read `forecast-a` and `forecast-b` without recomputing them.

Turn 5 is judgement meeting machinery. The scores are the model's own, with
its own weights; the arithmetic, ranking, and verdict come from the component:

```clojure
(def options [{:name "3 Senior Engineers @ $200K"
               :cost 8 :productivity 5 :time_to_impact 9 :team_growth 5 :runway_impact 7}
              {:name "5 Junior Engineers @ $130K"
               :cost 7 :productivity 7 :time_to_impact 5 :team_growth 8 :runway_impact 6}])

(def criteria [{:name "cost" :weight 0.15}
               {:name "productivity" :weight 0.25}
               {:name "time_to_impact" :weight 0.25}
               {:name "team_growth" :weight 0.15}
               {:name "runway_impact" :weight 0.20}])

(chief.domain/decision-matrix options criteria)
```

## The answer

Seniors win, 6.85 to 6.45 — inside the 0.5 margin the matrix calls a close
decision. The run's final report notices what makes the choice easy anyway:
at 15% monthly growth both options reach profitability in month 8, so the
runway risk that dominates chapter 2's answer barely differs between them,
and the seniors cost less in total ($780K against $845K loaded) while
shipping sooner.

## Coming from the Agent SDK

The notebook's framing is that Bash "enables access to procedural knowledge"
— and it does, at the price of a subprocess per use: five scripts, five
argparse interfaces, five JSON-over-stdout contracts, and the model relaying
every intermediate value from one stdout to the next argv.

Here procedural knowledge is a library in the language the model already
writes. A signature replaces argparse, a return value replaces stdout
parsing, and an intermediate value is a `let` binding. The scripts also stop
carrying their own copies of company figures: what the cookbook fixed with a
comment pointing at `CLAUDE.md`, the port fixes by reading the granted
snapshot.

`talent_scorer.py` is described in the notebook as the recruiter subagent's
tool. It compiles and works here, but nothing marks it as the recruiter's —
every function in the mission is equally available. Making that boundary real
is what named missions are for.

## Next

Chapter 4 splits the chief of staff into specialists: `financial-analyst` and
`recruiter` as named missions with different grants, driven from one workflow.
