(ns chief.analyst
  "The financial analyst's models. Compose these in one program: outputs are
   plain maps, so a result feeds the next call directly. Keep runway above
   12 months in any recommendation."
  {:visibility :prompt})

(defn- round2 [x] (/ (round (* (double x) 100)) 100.0))
(defn- round1 [x] (/ (round (* (double x) 10)) 10.0))

(defn snapshot
  "The company snapshot: cash, burn, ARR, headcount. A value, already loaded."
  {:signature "() -> :map"}
  []
  data/snapshot)

(defn metrics
  "Quick metrics from cash on hand and monthly burn: runway in months,
   quarterly burn, daily burn."
  {:signature "(cash_usd :float, monthly_burn_usd :float) -> :map"}
  [cash monthly-burn]
  {"monthly_burn" monthly-burn
   "runway_months" (/ cash (double monthly-burn))
   "total_runway_dollars" cash
   "quarterly_burn" (* monthly-burn 3)
   "burn_rate_daily" (round2 (/ monthly-burn 30.0))})

(defn hiring-impact
  "Model hiring engineers against the company snapshot: loaded cost
   (salary x 1.3), new monthly burn, new runway, and a risk call."
  {:signature "(num_engineers :int, annual_salary_usd :float) -> :map"}
  [num-engineers salary]
  (let [burn (get data/snapshot "monthly_burn_usd")
        cash (get data/snapshot "cash_usd")
        current-runway (get data/snapshot "runway_months")
        monthly-per-engineer (/ (* salary 1.3) 12.0)
        total-increase (* monthly-per-engineer num-engineers)
        new-burn (+ burn total-increase)
        new-runway (/ cash new-burn)
        reduction (- current-runway new-runway)]
    {"num_engineers" num-engineers
     "salary_per_engineer" salary
     "monthly_cost_per_engineer" (round2 monthly-per-engineer)
     "total_monthly_increase" (round2 total-increase)
     "current_burn_monthly" burn
     "new_burn_monthly" (round2 new-burn)
     "current_runway_months" current-runway
     "new_runway_months" (round2 new-runway)
     "runway_reduction_months" (round2 reduction)
     "velocity_increase_percent" (round1 (* 100 (* 0.15 (/ num-engineers 5.0))))
     "recommendation"
     (cond
       (> reduction 3)
       "HIGH RISK: Significant runway reduction. Consider phased hiring."
       (> reduction 1.5)
       "MODERATE RISK: Manageable if revenue growth accelerates."
       :else
       "LOW RISK: Minimal impact on runway. Proceed if talent is available.")}))

(defn- compound-schedule [start growth months]
  (second
   (reduce (fn [acc month]
             (let [arr (* (first acc) (+ 1.0 growth))]
               [arr (conj (second acc) {"month" month "arr" (round arr)})]))
           [(double start) []]
           (range 1 (inc months)))))

(defn- base-rows [start growth months burn cash]
  (second
   (reduce (fn [acc month]
             (let [arr (* (first acc) (+ 1.0 growth))
                   revenue (/ arr 12.0)
                   net (- burn revenue)]
               [arr (conj (second acc)
                          {"month" month
                           "arr" (round arr)
                           "monthly_revenue" (round revenue)
                           "net_burn" (round net)
                           "runway_months" (if (pos? net)
                                             (round1 (/ cash net))
                                             "infinite")})]))
           [(double start) []]
           (range 1 (inc months)))))

(defn forecast
  "ARR scenarios from a monthly growth rate: base case with net burn and
   runway per month, optimistic (1.5x growth), pessimistic (0.5x), and
   summary metrics. Cash comes from the snapshot."
  {:signature "(current_arr :float, monthly_growth_rate :float, months :int, monthly_burn :float) -> :map"}
  [current-arr growth months burn]
  (let [cash (get data/snapshot "cash_usd")
        base (base-rows current-arr growth months burn cash)
        profitable (first (filter (fn [row] (<= (get row "net_burn") 0)) base))]
    {"base_case" base
     "optimistic" (compound-schedule current-arr (* growth 1.5) months)
     "pessimistic" (compound-schedule current-arr (* growth 0.5) months)
     "metrics"
     {"months_to_profitability" (if profitable (get profitable "month") -1)
      "cash_required"
      (reduce + 0 (take-while pos? (map (fn [row] (get row "net_burn")) base)))
      "break_even_arr" (* burn 12)
      "current_burn_multiple" (round2 (/ (double burn)
                                         (/ (double current-arr) 12.0)))}}))

(defn- score-option [option criteria]
  (let [scored
        (reduce
         (fn [acc criterion]
           (let [cname (get criterion "name")
                 score (get option cname 5)
                 weighted (* score (get criterion "weight"))]
             {"scores" (assoc (get acc "scores") cname score)
              "weighted_scores" (assoc (get acc "weighted_scores")
                                       cname (round2 weighted))
              "total" (+ (get acc "total") weighted)
              "pros" (cond
                       (>= score 8) (conj (get acc "pros") (str "Excellent " cname))
                       (>= score 6) (conj (get acc "pros") (str "Good " cname))
                       :else (get acc "pros"))
              "cons" (cond
                       (<= score 3) (conj (get acc "cons") (str "Poor " cname))
                       (<= score 5) (conj (get acc "cons") (str "Weak " cname))
                       :else (get acc "cons"))}))
         {"scores" {} "weighted_scores" {} "total" 0.0 "pros" [] "cons" []}
         criteria)
        total (round2 (get scored "total"))]
    (assoc scored
           "name" (get option "name")
           "total" total
           "verdict" (cond
                       (>= total 8) "STRONGLY RECOMMENDED"
                       (>= total 6.5) "RECOMMENDED"
                       (>= total 5) "ACCEPTABLE"
                       :else "NOT RECOMMENDED"))))

(defn- analyse [scored]
  (if (< (count scored) 2)
    {"clear_winner" false "margin" 0 "recommendation" ""
     "key_differentiators" [] "risks" []}
    (let [top (first scored)
          runner-up (second scored)
          margin (round2 (- (get top "total") (get runner-up "total")))]
      {"clear_winner" (> margin 1.5)
       "margin" margin
       "recommendation"
       (cond
         (> margin 1.5) (str "Strongly recommend " (get top "name")
                             " with " margin " point advantage")
         (> margin 0.5) (str "Recommend " (get top "name") " but consider "
                             (get runner-up "name") " as viable alternative")
         :else (str "Close decision between " (get top "name") " and "
                    (get runner-up "name") " - consider additional factors"))
       "key_differentiators"
       (vec (map key (filter (fn [entry] (>= (val entry) 8))
                             (get top "scores"))))
       "risks"
       (vec (concat
             (if (< (get top "total") 6)
               ["Overall score below recommended threshold"] [])
             (if (> (count (get top "cons")) (count (get top "pros")))
               ["More weaknesses than strengths"] [])))})))

(defn decision-matrix
  "Weighted decision matrix. options: maps with a \"name\" and a 1-10 score
   per criterion. criteria: maps of \"name\" and \"weight\" (weights sum to
   1). Returns scored options best first, the winner, and an analysis."
  {:signature "(options [:map], criteria [:map]) -> :map"}
  [options criteria]
  (let [scored (vec (reverse (sort-by (fn [option] (get option "total"))
                                      (map (fn [option]
                                             (score-option option criteria))
                                           options))))]
    {"options" scored
     "winner" (get (first scored) "name")
     "analysis" (analyse scored)}))
