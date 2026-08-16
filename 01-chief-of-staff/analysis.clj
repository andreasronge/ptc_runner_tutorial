;; Navigating a captured trace directory from the REPL.
;;
;;   cd 01-chief-of-staff
;;   ptc repl --profile run-analysis-v1 --resource traces=.ptc/traces -l analysis.clj
;;
;; Runs are numbered on load, so you never type a run id:
;;
;;   (runs)        ; numbered list, oldest first
;;   (run 8)       ; one run in detail
;;   (turns 8)     ; how each turn of run 8 ended
;;   (turns -1)    ; ...negative indexes count back from the newest
;;   (failed)      ; only the runs that ended in an error
;;   (id 8)        ; the full run id, when you need the string itself
;;
;; Every function taking an index also accepts a run-id string.
;;
;; The capture is frozen for the session, so the list is read once at load
;; time. Restart the session to pick up newer runs.

(def all-runs
  (sort-by #(get % "start_timestamp")
           (get (analysis/runs {"limit" 100}) "items")))

;; --- selecting a run ---------------------------------------------------------

(defn idx
  "Normalize an index; negative counts back from the newest run."
  [n]
  (if (< n 0) (+ (count all-runs) n) n))

(defn at
  "The run map at an index, or the run with this id."
  [x]
  (if (string? x)
    (first (filter #(= x (get % "run_id")) all-runs))
    (nth all-runs (idx x))))

(defn id
  "The full run id at an index."
  [x]
  (get (at x) "run_id"))

;; --- column padding ----------------------------------------------------------
;; PTC-Lisp's `format` accepts width flags like %-8s but silently ignores them,
;; so pad by hand.

(def blanks "                              ")

(defn rpad [v n]
  (let [s (str v)]
    (if (>= (count s) n) s (subs (str s blanks) 0 n))))

(defn lpad [v n]
  (let [s (str v)]
    (if (>= (count s) n)
      s
      (subs (str blanks s) (- (+ (count blanks) (count s)) n)))))

;; --- listing -----------------------------------------------------------------

(defn fmt-run [r]
  (str (rpad (subs (get r "run_id") 4 14) 12)
       (rpad (get r "status") 7)
       (rpad (str "turns=" (get r "llm_calls")) 9)
       (rpad (str "evals=" (get r "evaluations")) 9)
       (lpad (get r "duration_ms") 6) "ms  "
       (or (get r "terminal_reason") "")))

(defn show
  "Print one line per item. The REPL renders prints as real lines."
  [lines]
  (doseq [l lines] (println l)))

(defn runs
  "Numbered list of every captured run, oldest first."
  []
  (show (map-indexed (fn [i r] (format "%2s  %s" i (fmt-run r))) all-runs)))

(defn failed
  "Only the runs that ended in an error. Indexes match (runs)."
  []
  (show (keep identity
              (map-indexed (fn [i r]
                             (if (= "ok" (get r "status"))
                               nil
                               (format "%2s  %s" i (fmt-run r))))
                           all-runs))))

;; --- one run -----------------------------------------------------------------

;; `analysis/read` returns one bounded page plus a `next_cursor`. Follow the
;; cursor until it is nil.
(defn read-all
  "Every item in one collection of one run."
  [x collection]
  (let [run-id (id x)]
    (loop [cursor nil
           acc []]
      (let [opts (if cursor
                   {"collection" collection "cursor" cursor}
                   {"collection" collection})
            page (analysis/read run-id opts)
            acc (concat acc (get page "items"))
            next (get page "next_cursor")]
        (if next
          (recur next acc)
          acc)))))

(defn events
  "Every public activity event for one run, in sequence order."
  [x]
  (read-all x "activity"))

(defn source
  "The PTC-Lisp the model wrote each turn.
   Needs the private profile and an inspection artifact:
     ptc repl --profile private-run-analysis-v1 \\
              --resource traces=.ptc/traces --resource inspection=.ptc/inspection \\
              --private-unattended -l analysis.clj"
  [x]
  (show (map-indexed (fn [i r] (str "turn " i ":  " (get r "source")))
                     (read-all x "generated_sources"))))

;; One turn is: ask the model (llm-request), then evaluate what it wrote.
;; The trace carries no source, but it does carry the program's *size* — which
;; is enough to see the shape of a run. A handful of 5-15 byte programs is the
;; model probing single values; the turn that solves the task is much larger.
(defn llm-calls [evs]
  (filter #(and (= "capability-stopped" (get % "type"))
                (= "llm-request" (get-in % ["data" "name"])))
          evs))

(defn mission-evals [evs kind]
  (filter #(and (= kind (get % "type"))
                (= "mission" (get-in % ["data" "environment"])))
          evs))

;; Closures take at most 3 parameters, so zip into triples first and let
;; map-indexed supply the turn number.
(defn fmt-turn [i t]
  (let [llm (nth t 0)
        u (get-in llm ["data" "usage"])]
    (str (lpad i 4) "  "
         (lpad (get-in llm ["data" "duration_ms"]) 6) "ms  "
         (lpad (get u "input") 5) "->" (rpad (get u "output") 5)
         (lpad (get-in (nth t 1) ["data" "source_bytes"]) 6) "B  "
         (lpad (get-in (nth t 2) ["data" "duration_ms"]) 4) "ms  "
         (get-in (nth t 2) ["data" "status"]))))

(defn turns
  "Per-turn detail: model latency, tokens, program size, evaluation outcome."
  [x]
  (let [evs (events x)
        triples (map (fn [llm started stopped] [llm started stopped])
                     (llm-calls evs)
                     (mission-evals evs "evaluation-started")
                     (mission-evals evs "evaluation-stopped"))]
    (show
     (concat
      ["turn   model      tokens     program    eval  outcome"]
      (map-indexed fmt-turn triples)))))

(defn outcomes
  "Just how each turn ended, as data."
  [x]
  (map #(get-in % ["data" "status"])
       (mission-evals (events x) "evaluation-stopped")))

(defn run
  "One run in detail, including how each of its turns ended."
  [x]
  (let [r (at x)]
    (show
     [(format "run       %s" (get r "run_id"))
     (format "status    %s %s" (get r "status") (or (get r "terminal_reason") ""))
     (format "started   %s" (get r "start_timestamp"))
     (format "duration  %sms" (get r "duration_ms"))
     (format "model     %s calls" (get r "llm_calls"))
     (format "evals     %s (%s in missions)" (get r "evaluations") (get r "subordinate_evaluations"))
     (format "capability workflow=%s mission=%s"
             (get r "workflow_capability_calls")
             (get r "mission_capability_calls"))
     (format "outcomes  %s" (outcomes x))])
    (turns x)))
