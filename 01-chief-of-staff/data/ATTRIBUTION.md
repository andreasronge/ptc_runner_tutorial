# Dataset provenance

`burn_rate.csv`, `hiring_costs.csv`, and `revenue_forecast.json` are copied
unmodified from the [Claude Agent SDK
cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/chief_of_staff_agent/financial_data),
which is MIT licensed. Keeping them byte-identical is deliberate: this tutorial
answers the same questions as the notebook, so the numbers have to match.

They are fictional data for TechStart Inc, the cookbook's example startup.

## The disagreement is the point

The company snapshot (the cookbook's `CLAUDE.md`, this tutorial's mission data)
says a ~$500K monthly burn and 20 months of runway. `burn_rate.csv` says
something else for the same month:

| Source | Monthly burn | Runway on $10M |
| --- | --- | --- |
| Snapshot | $500,000 | 20.0 months |
| `burn_rate.csv`, gross (`Burn_Rate`) | $525,000 | 19.0 months |
| `burn_rate.csv`, net (`Net_Burn`) | $235,000 | 42.6 months |

A two-fold spread depending on which source and which column. The notebook hits
this too, and treats it as a prompt-phrasing problem — its commentary notes
that agents "naturally seek the most authoritative data sources" and suggests
wording the request to steer them. Chapter 2 treats it as what it is here: two
different grants, one of which carries a content hash.
