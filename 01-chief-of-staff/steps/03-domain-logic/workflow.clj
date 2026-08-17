(ns chief.workflow
  "Chapter 3. Still the shipped loop, unchanged: the new capability is the
   domain component granted to the mission, not anything here.")

(defn run [input]
  (agent.core/run (get input "task")
                  {"max_turns" 10}))
