# ReleaseProof contributor instructions

Before implementation work, read these files in order:

1. `outputs/releaseproof-build/04-BUILD-STATE.md`
2. `outputs/releaseproof-build/03-CODEX-RUNBOOK.md`
3. The current phase in `outputs/releaseproof-build/02-PHASED-BUILD-PLAN.md`
4. Its referenced sections in `outputs/releaseproof-build/01-ARCHITECTURE.md`
5. Its scenario and invariant IDs in `outputs/releaseproof-build/05-EVALUATION-CONTRACT.md`

Follow the architecture boundaries, phase gates, evidence rules, and Git handoff procedure exactly. Never mark an unrun check as passed, treat fixture evidence as real-provider evidence, expose secrets, or let the planner authorize external writes. Preserve unrelated user changes.
