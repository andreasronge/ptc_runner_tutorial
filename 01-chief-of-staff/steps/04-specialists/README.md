# Chapter 4: specialists are missions

The cookbook's Feature 6 defines subagents as markdown files. Each
`.claude/agents/*.md` is a persona — responsibilities, evaluation criteria,
output format — plus a frontmatter line naming its tools: `Read, Bash,
WebSearch`. The chief delegates by calling the `Task` tool when a
description sounds relevant, and the subagent runs in a separate context
with the same ambient directory.

Here a specialist is a named mission, and the specialisation *is* the grant.

```console
cd 01-chief-of-staff
ptc run 04-specialists.ptc-project.json
```

## The task

```json
"input": {
  "value": {
    "task": "We need to ship faster without endangering the raise. How many senior engineers at $200,000 can we hire while keeping at least 18 months of runway, and which candidates should we hire?"
  }
}
```

Two questions, two specialists: the financial analyst decides *how many*,
the recruiter decides *who*.

## Two missions, two grants

```json
"missions": {
  "financial-analyst": {
    "components": [{"id": "chief.analyst", "path": "analyst.clj"}],
    "data": {"snapshot": {"cash_usd": 10000000, "monthly_burn_usd": 500000, ...}}
  },
  "recruiter": {
    "components": [{"id": "chief.recruiter", "path": "recruiter.clj"}],
    "data": {"candidates": [{"name": "Sarah Kim", ...}, ...]}
  }
}
```

`analyst.clj` is chapter 3's financial models plus a `snapshot` facade.
`recruiter.clj` is the talent scorer, finally owned by the recruiter. The
candidate pool is mission data only the recruiter receives. Each mission's
`(dir)` tells the whole story:

```text
financial-analyst:  ["chief.analyst"]
recruiter:          ["chief.recruiter"]
```

The analyst cannot see the candidate pool. The recruiter cannot see the
snapshot, the models, or the financial files. Where the cookbook's
`financial-analyst.md` politely lists which scripts to use — while `Bash`
lets it run anything — the manifest here *is* the list.

## The workflow is the delegation policy

The cookbook's chief decides to delegate when a subagent's description
matches, steered by a system prompt ("Delegate financial questions to the
financial-analyst subagent"). Here delegation is trusted workflow code:

```clojure
(defn run [input]
  (let [task (get input "task")
        analysis-outcome
        (agent.core/run-outcome
          (str "You are the financial analyst. " task
               " Decide only the affordable headcount, in one program: map"
               " chief.analyst/hiring-impact over the plausible headcounts"
               " (range 1 6), keep the largest whose new_runway_months meets"
               " the required floor, and call return with a map of headcount,"
               " salary_usd, new_runway_months and reasoning.")
          {"mission" "financial-analyst" "max_turns" 8
           "consolidate_at_turns_remaining" 3})
        analysis (returned-value analysis-outcome "financial-analyst")
        hiring-outcome
        (agent.core/run-outcome
          (str "You are the technical recruiter. The financial analyst"
               " approved this plan: " (json/generate-string analysis)
               " Rank the candidate pool in data/candidates with"
               " chief.recruiter/rank-candidates and pick exactly the"
               " approved headcount to hire. ...")
          {"mission" "recruiter" "max_turns" 8
           "consolidate_at_turns_remaining" 3})]
    (return
      {"analysis" analysis
       "hiring_plan" (returned-value hiring-outcome "recruiter")})))
```

The stages are sequential because the second depends on the first: the
analyst's returned map is JSON-encoded into the recruiter's task. Data flows
between specialists through the workflow, not through a shared context.

`agent.core/run-outcome` returns `{:status :returned :value ...}` or a
subject failure — the model ran out of turns, or its program failed
terminally. Provider outages, quota, and admission failures still fail the
whole workflow instead, so a failed specialist means the *specialist*
failed. `returned-value` unwraps the outcome or `fail`s with the specialist's
name attached.

## What the model wrote

Thirteen mission turns across the two loops, 82 seconds end to end:

```text
turn   model      tokens      program   eval  outcome
   0    3813ms   1555->79        39B     4ms  continued      ← analyst
   ...
   5    3648ms   2485->105      988B     4ms  evaluation_error
   6    8346ms   2774->414      824B     7ms  returned
   7    6898ms   3146->305      145B     1ms  continued      ← recruiter
   ...
  12    6039ms   2873->274     1127B     5ms  returned
```

The analyst probed `hiring-impact` for 1, 2, 3 engineers, then wrote its
answer as one program:

```clojure
(let [salary 200000.0
      floor 18.0
      results (filter some?
                (for [n (range 1 6)]
                  (let [r (chief.analyst/hiring-impact n salary)
                        runway (get r "new_runway_months")]
                    (if (>= runway floor)
                      {:headcount n :salary_usd salary :new_runway_months runway}
                      nil))))
      best (last (sort-by :headcount results))]
  (return {:headcount (get best :headcount) ...}))
```

Its first attempt at that program, turn 5, had one extra parenthesis. The
loop's feedback is worth reading, because three of its rules fire at once:

```text
The PTC-Lisp evaluation did not return successfully. outcome=:evaluation_error;
error_code=:parse_error; message=unbalanced parentheses: 1 extra ')' (first at
line 19, column 69). Send one corrected run_ptc_lisp call.

TURN BUDGET: 1 turn remains, including the next program.
FINAL TURN: the next program must call (return value) or (fail value).
```

Turn 6 was the corrected program, and it returned. The `CONSOLIDATE` line
visible in earlier turns comes from `consolidate_at_turns_remaining`: at
three remaining turns the loop starts telling the model to synthesize
rather than explore.

## The answer

The analyst: **2 engineers** — 2 keeps 18.4 months of runway, 3 would drop
to 17.7, under the floor. The recruiter ranks the pool with the chapter 3
scorer — Sarah Kim 91.4, Amara Diallo 87.3, Elena Petrov 84.9, Marcus Webb
70.4, Jordan Lee 61.0 — and hires the top two for $400k/year, passing over
Elena with a reason the scorer surfaced (salary over budget, 45-day notice).

## The grant is the guardrail

This chapter's first version gave the analyst mission chapter 2's file
capability, because the cookbook's analyst has it. Two runs in a row, the
analyst computed the answer by turn 3 — then spent every remaining turn
grazing through `hiring_costs.csv` and `revenue_forecast.json` and never
returned. A prompt instruction not to read the files unless necessary
changed nothing; the second run read *more* files than the first.

Removing the grant fixed it on the next run. The subtask needs the snapshot
and the models, so that is what the mission holds — and a capability that
does not exist cannot eat a turn budget. When a specialist wanders, the
first question is not "how do I prompt it better" but "why can it do that
at all".

## Raising limits, again

Two sequential loops need more wall clock than one. The chapter 2 rule:
the operator raises the ceiling, the manifest asks within it —

```json
// ptc-host.json
"limits": {"workflow_timeout_ms": 240000}

// ptc.json
"limits": {"workflow_timeout_ms": 240000}
```

## Coming from the Agent SDK

The notebook names three reasons for subagents: specialization, separate
context, parallelization. The port keeps all three and changes what they are
made of. Specialization is a grant, not a persona paragraph. Separate
context is a mission — not just a fresh conversation, a different world.
And the `description` field the chief matches on becomes workflow code that
always runs the same way.

What does not port is the `Task` tool itself: no model here decides whether
to delegate. That judgement moved into the trusted workflow, which is also
what makes the next chapter possible — code can fan specialists out in
parallel deliberately, under limits sized for the whole fan-out.

## Next

Chapter 5 runs specialists concurrently: `pmap` fan-out over missions, and
what the shared admission queue means for wall-clock time.
