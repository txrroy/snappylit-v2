# Agentic News App: Feature List

Features are ordered by impact. Each row lists the job to be done and what the feature showcases.

## Summary

| # | Feature | Group |
|---|---|---|
| 1 | Approval queue with human-only publish | Oversight |
| 2 | Judge scores, flags, and claim evidence | Oversight |
| 3 | Per-article pipeline trace | Oversight |
| 4 | Agent Instructions panel on each draft | Steering |
| 5 | Regenerate with new instructions | Steering |
| 6 | Global policy settings in three tiers | Steering |
| 7 | Test before save, version history, rollback | Governance |
| 8 | Approval rate per prompt version | Governance |
| 9 | Source management | Governance |

## Feature table

| # | Feature | JTBD | Agentic AI showcase | Agentic UX showcase | Traditional UX showcase |
|---|---|---|---|---|---|
| 1 | Approval queue with human-only publish | When drafts arrive, I want to approve, edit, or reject each one, so nothing reaches children without my decision. | Agents have a defined authority limit. They can draft but cannot publish. | Human keeps final authority. The agent's role is stated in the UI. | Triage layout. Lowest scores sorted first. Three clear actions. |
| 2 | Judge scores, flags, and claim evidence | When I review a draft, I want to see what the Judge found and the proof, so I can decide in seconds. | One model evaluates another. Each claim is checked against quoted source text. | Explainable scores. The editor can verify the AI's reasoning. | Badges for flags. Side-by-side comparison of claim and source. |
| 3 | Per-article pipeline trace | When a draft looks wrong, I want to see each agent's step, so I can find where the error started. | Multi-agent pipeline with a recorded handoff at each step. | Full transparency of agent actions and reasons. | Step timeline with details shown on demand. |
| 4 | Agent Instructions panel on each draft | When I judge a draft, I want to read the instructions the agent followed, so I can tell if it succeeded. | Each draft is stamped with its prompt version. | Visible system logic. The editor evaluates the agent against its brief. | Collapsible panel. Read-only state. |
| 5 | Regenerate with new instructions | When a draft misses the mark, I want to redirect the agent, so I avoid rewriting by hand. | Live regeneration followed by an automatic second Judge review. | Editor steers the agent on one task. Locked rules still apply. | Slider and text input. Loading state. Before and after comparison. |
| 6 | Global policy settings in three tiers | When our standards change, I want to update the agents' rules, so every future run follows them. | Prompts are built from settings, admin text, and a locked core. | Editors manage agent behavior through policy controls. Role sets the level of control. | Form controls. Role-based permissions. Error prevention. |
| 7 | Test before save, version history, rollback | When I change a rule, I want to preview the effect and undo it, so a bad edit never reaches production. | Prompt versions are tested on past articles before release. | Safe experimentation with agent behavior. | Preview, undo, and audit log. |
| 8 | Approval rate per prompt version | When I review performance, I want to see which versions editors approve most, so I can improve the agents with evidence. | Human decisions become evaluation data for each prompt version. | Feedback loop. Editor decisions measurably improve the agents. | Simple chart with a clear comparison. |
| 9 | Source management | When a feed is unreliable, I want to turn it on or off, so I control what enters the pipeline. | N/A | Human controls the agents' inputs. | Toggle list with status per source. |

## Rules that apply across features

1. Every regenerated draft goes through the Judge again.
2. The locked core applies to every run and every regeneration. It contains the G-rated definition, the "use only source facts" rule, and the output format.
3. Policy settings have three tiers:
   - Settings: any editor, through form controls.
   - Free-text instructions: admin role only.
   - Locked core: code change only.
4. A policy change applies on the next run. It never alters drafts already in the queue.
5. Only a human can publish.

## Presentation order for the summit talk

1. Oversight: features 1 to 3.
2. Steering: features 4 to 6.
3. Governance: features 7 to 9.
