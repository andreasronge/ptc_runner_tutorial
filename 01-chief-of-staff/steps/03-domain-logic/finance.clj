(ns chief.finance
  "What the chief of staff can see: the company snapshot, and the financial
   data files."
  {:visibility :prompt})

;; Mission data is granted by the manifest but never rendered into the prompt,
;; so the model cannot discover it. Exposing it as a prompt-visible function is
;; what puts it on the map.
(defn snapshot
  "The company snapshot: cash, burn, ARR, headcount. High-level figures kept
   with the project, not measured from the source data."
  {:signature "() -> :any"}
  []
  data/snapshot)

(defn list-files
  "List the financial data files available to read."
  {:signature "() -> :any"}
  []
  (let [response (tool/files.list {"path" ""})]
    (if (= :ok (get response :status))
      (get response :value)
      (fail response))))

(defn read-page
  "Read one bounded page of a data file. Pass nil as the cursor first, then the
   next_cursor from the previous page, until next_cursor is nil. Concatenate
   each page's item text exactly to reconstruct the file."
  {:signature "(path :string, cursor :string?) -> :any"}
  [path cursor]
  (let [arguments (if cursor {"path" path "cursor" cursor} {"path" path})
        response (tool/files.read arguments)]
    (if (= :ok (get response :status))
      (get response :value)
      (fail response))))
