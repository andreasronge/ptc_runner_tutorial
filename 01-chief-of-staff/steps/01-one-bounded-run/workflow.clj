(ns chief.workflow
  "Chapter 1. The whole workflow: hand the task to the shipped agent loop.")

(defn run [input]
  (agent.core/run (get input "task")
                  {"max_turns" 6}))
