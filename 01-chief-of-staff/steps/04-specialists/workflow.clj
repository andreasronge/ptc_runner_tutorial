(ns chief.workflow
  "Chapter 4. One trusted workflow drives two specialists in sequence.
   Delegation is workflow code, not a model's tool call.")

(defn- returned-value [outcome specialist]
  (if (= :returned (get outcome :status))
    (get outcome :value)
    (fail {:status :error :kind :specialist-failed
           :specialist specialist :outcome outcome})))

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
               " approved headcount to hire. Return a map with hire (names"
               " best first), total_annual_salary_usd, passed_over (names"
               " with the one-line reason) and reasoning.")
          {"mission" "recruiter" "max_turns" 8
           "consolidate_at_turns_remaining" 3})]
    (return
      {"analysis" analysis
       "hiring_plan" (returned-value hiring-outcome "recruiter")})))
