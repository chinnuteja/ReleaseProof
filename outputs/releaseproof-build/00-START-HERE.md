**ReleaseProof implementation package**

Build a release agent that prepares a GitHub prerelease from a Linear issue, obtains an exact approval in Slack, recovers interrupted operations, and produces evidence of what actually completed. Keep its verification engine separable so it can eventually evaluate another agent through an adapter.

This package specifies the implementation. It does not represent implemented software or passing tests. All implementation phases initially remain NOT_STARTED. The current planning workspace has no Git repository or configured remote.

**Read these files in order.**

| File | Purpose |
| --- | --- |
| [Architecture](01-ARCHITECTURE.md) | Components, trust boundaries, data model, API contracts, state machines and recovery algorithms |
| [Six-phase build plan](02-PHASED-BUILD-PLAN.md) | Ordered tasks, phase entry requirements, commands, evidence and exit gates |
| [Codex runbook](03-CODEX-RUNBOOK.md) | Every-session startup, work selection, review, Git synchronization and handoff |
| [Build state](04-BUILD-STATE.md) | Current phase, unresolved dependencies, evidence index and next action |
| [Evaluation contract](05-EVALUATION-CONTRACT.md) | Scenario IDs, exact assertions, replay semantics and result schema |

The repository-root [AGENTS.md](../../AGENTS.md) tells Codex to use these documents when assigned implementation work. Keep the package under `outputs/releaseproof-build/` if moving it to another repository; resolve instruction paths relative to that repository root.

**The six phases produce usable milestones.**

| Phase | Result |
| --- | --- |
| P1 | Reproducible project, persistent journal, isolated environments and verified provider access |
| P2 | A complete three-app release with real model planning and genuine Slack approval |
| P3 | Durable recovery after lost responses, restart and partial completion |
| P4 | Independent invariants, bounded exploration, reduced counterexample and regression replay |
| P5 | An understandable product screen, evidence receipt and browser verification |
| P6 | Measured evaluation, clean-clone verification, demo and GitHub handoff |

Each phase has a local verification gate and a separate Git synchronization status. Passing tests is not evidence that files reached GitHub. A failed push does not erase locally completed work.

**The main demonstration is one coherent release.**

An issue leads to revision A. A reviewer approves A. A permitted branch update introduces B. A seeded baseline demonstrates the approval mistake. The corrected agent preserves A. A test transport hides the successful publish response; the agent reconciles GitHub, finishes Linear and Slack, and exposes a linked receipt. Exported counterexample replay establishes how the failure is reproduced. A separate scenario covers Linear failing after GitHub succeeds.

**Scope decisions are fixed unless implementation evidence requires a change.**

Use TypeScript, Next.js, one Node worker, SQLite, typed provider adapters, one application model and deterministic assertions. Default to a local persistent host and Slack Socket Mode. Build one workspace, one repository, one configured Slack channel and one Linear team. The terminal action is a prerelease in a dedicated repository, not a production deployment.

The backend architecture is a modular application with durable execution. Do not expand into microservices, distributed queues, a universal simulator, autonomous code patching or additional integrations during the event. The product's depth comes from its handling of state and uncertainty.

**A fresh implementation task can begin with this prompt.**

```text
Implement ReleaseProof using the repository-root AGENTS.md and the documents in
outputs/releaseproof-build/. Read 04-BUILD-STATE.md first and inspect the repository.
Resume the first incomplete phase in 02-PHASED-BUILD-PLAN.md. Implement its complete
scope, run its specified checks, and record actual evidence. Fix failed checks
before advancing. Commit and push all intended project changes at each verified
phase and at each safe session handoff, following 03-CODEX-RUNBOOK.md. Verify the
remote commit. Continue through the authorized phases without routine approval
questions. Report missing credentials or repository configuration precisely while
continuing independent local work. Do not mark unrun checks as passed.
```

This is an implementation prompt to use when building is authorized. Preparing these documents does not itself start implementation, send Slack messages, create external resources or submit the project.

**Document precedence.**

The current user request and applicable higher-priority instructions govern. Within the project, this package supersedes implementation details in the earlier combined build plan. The evaluation contract defines measured claims; the architecture defines component behavior; the phase plan defines build order; the runbook defines execution procedure; build state records evidence rather than overriding requirements. Research files remain background. Record justified architecture changes and update all affected contracts before relying on them.
