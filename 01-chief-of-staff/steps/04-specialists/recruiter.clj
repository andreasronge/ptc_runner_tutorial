(ns chief.recruiter
  "The recruiter's candidate evaluation. The open role's candidate pool is
   data/candidates; senior engineer compensation benchmark is $180k-$220k."
  {:visibility :prompt})

(defn- round1 [x] (/ (round (* (double x) 10)) 10.0))

(defn- education-score [education]
  (get {"high_school" 40 "bachelors" 70 "masters" 85 "phd" 90} education 70))

(defn- experience-score [years]
  (cond (<= years 2) 40
        (<= years 5) 70
        (<= years 8) 90
        :else 85))

(defn- candidate-risks [candidate scores]
  (vec (concat
        (if (< (get scores "technical_skills") 60)
          ["Technical skills below requirement"] [])
        (if (< (get candidate "years_experience" 0) 2)
          ["Limited experience, will need mentorship"] [])
        (if (get candidate "has_startup_exp" false)
          [] ["No startup experience, may struggle with ambiguity"])
        (if (< (get scores "salary_fit") 50)
          ["Salary expectations misaligned"] [])
        (let [notice (get candidate "notice_period_days" 14)]
          (if (> notice 30)
            [(str "Long notice period: " notice " days")] [])))))

(defn score-candidate
  "Score one candidate on weighted criteria. Reads keys: name,
   years_experience, tech_skills_match (0-100), has_startup_exp, education,
   culture_score, salary_expectation, target_salary, notice_period_days.
   Missing keys fall back to sensible defaults."
  {:signature "(candidate :map) -> :map"}
  [candidate]
  (let [scores
        {"technical_skills" (min 100 (get candidate "tech_skills_match" 70))
         "experience_years" (experience-score
                             (get candidate "years_experience" 5))
         "startup_experience" (if (get candidate "has_startup_exp" false)
                                100 50)
         "education" (education-score (get candidate "education" "bachelors"))
         "culture_fit" (get candidate "culture_score" 75)
         "salary_fit" (let [salary (get candidate "salary_expectation" 150000)
                            target (get candidate "target_salary" 160000)
                            diff (/ (abs (- salary target)) (double target))]
                        (max 0 (- 100 (* diff 200))))}
        weights {"technical_skills" 0.30 "experience_years" 0.20
                 "startup_experience" 0.15 "education" 0.10
                 "culture_fit" 0.15 "salary_fit" 0.10}
        total (round1 (reduce (fn [acc entry]
                                (+ acc (* (val entry)
                                          (get weights (key entry)))))
                              0.0
                              scores))]
    {"name" (get candidate "name" "Unknown")
     "total_score" total
     "scores" scores
     "recommendation"
     (cond
       (>= total 85) "STRONG HIRE - Extend offer immediately"
       (>= total 75) "HIRE - Good candidate, proceed with offer"
       (>= total 65) "MAYBE - Consider if no better options"
       (>= total 50) "WEAK - Significant concerns, likely pass"
       :else "NO HIRE - Does not meet requirements")
     "risk_factors" (candidate-risks candidate scores)}))

(defn rank-candidates
  "Score many candidates and rank them best first."
  {:signature "(candidates [:map]) -> [:map]"}
  [candidates]
  (vec (reverse (sort-by (fn [result] (get result "total_score"))
                         (map score-candidate candidates)))))
