(ns chief.workflow
  "Chapter 2. Same shipped loop, a bigger budget: the agent now has files to
   read, and reading them costs turns.")

(defn run [input]
  (agent.core/run (get input "task")
                  {"max_turns" 10}))
