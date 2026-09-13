**ReleaseProof six-phase implementation plan**

Execute phases in dependency order. Within a phase, complete the smallest runnable vertical slice before expanding it. A phase is locally verified only when its required checks have actual evidence. Git synchronization is a separate mandatory handoff check in 03-CODEX-RUNBOOK.md. All checkboxes below start unchecked.

The design references A1–A16 in 01-ARCHITECTURE.md and E1–E8 in 05-EVALUATION-CONTRACT.md. Build state lives in 04-BUILD-STATE.md. Commands in this plan are a required CLI contract to implement, not commands that currently exist.

**B0. Shared rules for every phase**

Start by reading build state, current architecture decisions, Git status and the previous phase's evidence. Identify the earliest incomplete requirement, reproduce any recorded failure and implement that requirement. Keep useful independent work moving if an external credential or push is blocked; do not pretend the dependent gate passed.

At each phase end: run its checks, inspect the product or output, correct failures, write evidence, update build state, review the complete intended diff, commit, push to the configured GitHub branch and verify the remote SHA. Run the required CI for that exact commit where configured. No routine user confirmation is needed for already-authorized local work or normal pushes to the configured destination. Missing repository identity or account access must be surfaced precisely.

The phase evidence file is `evidence/P1.md` through `evidence/P6.md`. Each contains the tested implementation digest, environment modes, command invocations, actual exit codes, scenario outcomes, redacted artifact paths, unresolved issues and next action. Never use a checkbox or screenshot alone as proof of a backend property.

**B1. Required command surface**

| Command | Required behavior |
| --- | --- |
| npm run dev | Start web and worker with graceful shutdown; no external mutation at startup |
| npm run build | Compile contracts/core/worker and build the web application in dependency order |
| npm run typecheck | Strict TypeScript checking across all workspaces |
| npm run lint | Source checks and forbidden-import boundaries |
| npm run check | typecheck, lint and build; succeeds without real provider credentials |
| npm run db:migrate | Apply pending migrations; fail on checksum or incompatible schema |
| npm run doctor -- --mode fixture | Verify runtime, SQLite, fixture configuration and local dependencies |
| npm run doctor -- --mode real_test --env demo | Verify configured identities and advertised endpoint access without publishing a release |
| npm run verify -- --phase P1 --mode fixture | Run that phase's registered applicable checks; phase argument supports P1–P6 |
| npm run verify -- --phase P2 --mode real_test --env demo --allow-test-writes | Run gated real checks; uses scoped configured resources and genuine approval |
| npm run eval -- --suite core --mode fixture --seed 17 | Execute core and persistence scenarios; export normalized result records |
| npm run eval -- --suite holdout --mode fixture --seed 91 | Execute reserved changed-identity/timing cases |
| npm run replay -- --file PATH --mode fixture | Validate and replay a redacted exported counterexample with safe local configuration |
| npm run test:browser | Run focused Playwright product journeys using fixture mode |
| npm run export:evidence -- --run RUN_ID | Redact and export observations, receipt and result records |

Use npm.cmd in PowerShell if npm.ps1 is blocked by local execution policy; do not weaken machine-wide execution policy. Every verification command has a nonzero exit for a failed required assertion, no discovered tests, or a required check skipped for missing credentials. The registry must explicitly distinguish not-yet-implemented phase checks from completed ones.

**P1. Foundation, contracts and provider access**

Result: a reproducible repository and durable local runtime that can identify the three configured external apps. Architecture references: A2–A7, A10, A12. Evaluation references: SC-10, SC-13, SC-15 and E4.

Entry: documents are available; no assumption that a repository, tokens or scaffold already exists. Run the runbook's repository discovery first. The current planning folder has no remote; record the actual target once supplied or discovered in an implementation project. Never invent an owner/repository.

Implementation tasks:

- [ ] P1.1 Inspect installed runtime and Git tooling; choose a supported exact Node patch; create npm workspaces, package scripts, lockfile and strict contracts package. Record dependency decisions.
- [ ] P1.2 Create typed environment registry, harmless .env.example and .gitignore. Separate demo repository from source repository. Create a central redactor and reject absent/invalid required configuration without printing secrets.
- [ ] P1.3 Add migrations and transactional run/command/event storage. Implement read-only health, worker heartbeat, singleton startup guard and restart-safe command consumption. Keep external writes out of startup.
- [ ] P1.4 Implement provider identity and capability probes. Confirm GitHub PR/check/release/tag reads, Slack channel history and Socket Mode delivery, and Linear issue state/comment reads. Record write scopes and schema support separately from actual successful writes, which P2 must exercise. Implement the fixed Linear comment annotation method if supported; record a justified alternate before P2 if necessary.
- [ ] P1.5 Build the independent fixture HTTP service and minimal adapter error normalization. Start with authentic request validation and persistent fixture state. Add HTTP 200 + GraphQL error and unsupported-capability fixtures.
- [ ] P1.6 Implement operator session/CSRF checks and a basic connection-status screen. Add CI for dependency install, typecheck, lint and the implemented foundation checks with fixture credentials only.

Completion checkpoints:

- [ ] P1-G1 Clean installation and build work from the lockfile on the selected Node version; package versions and runtime are recorded.
- [ ] P1-G2 A persisted command survives worker shutdown and is processed once after restart; same request key/body resolves to the same run.
- [ ] P1-G3 A second worker exits before processing; database migrations apply once and fail on checksum inconsistency.
- [ ] P1-G4 Fixture mode refuses a real-provider URL and never falls back to it. Sentinel secrets are absent from public logs, responses and browser bundles.
- [ ] P1-G5 Each real provider identity and required read capability is recorded as confirmed, unavailable or unsupported; write permissions/schema are recorded as advertised until actually exercised in P2. Missing required access leaves P1's external gate incomplete.
- [ ] P1-G6 A configured application model returns one schema-valid proposal/tool interaction in a harmless smoke test. A missing key is an explicit dependency, not a fake model response.

Verification: `npm ci`, `npm run db:migrate`, `npm run check`, `npm run doctor -- --mode fixture`, `npm run verify -- --phase P1 --mode fixture`, then the real-test doctor. Inspect connection status and a restarted run projection. The model smoke check belongs in P1's real verification registry and must not run in ordinary secret-free CI.

Evidence: P1.md, sanitized capability matrix, runtime/dependency versions, actual CI URL when available, schema version and startup/restart result. Git milestone subject: `chore: establish releaseproof runtime and provider contracts`.

Stop rule: if an essential integration cannot authenticate, continue fixture/core work and identify the exact missing setting. Do not spend the build window creating a replacement for Slack or pretending a local fixture satisfies the real-app gate.

**P2. Complete and authorized three-app release**

Result: a real user request reaches a verified GitHub prerelease, Linear update and Slack outcome through genuine approval. References: A6, A8–A10, A12; SC-01–04, SC-06–07 and SC-11.

Entry: P1's local foundation passes; required real resources and the application model are available for the real completion gate. Safe implementation can proceed in fixtures while real access is pending.

Implementation tasks:

- [ ] P2.1 Build the bounded read-tool planner. Retrieve the requested issue, explicit PR link and check evidence; handle distractors. Validate structured outputs and construct the manifest on the server.
- [ ] P2.2 Implement canonical manifest hashing and persisted immutable content, with release body, issue destinations and environment binding. Same tag/different manifest is an explicit conflict.
- [ ] P2.3 Post the approval summary with a persisted intent marker. Receive Socket Mode interactions, validate the allowlisted reviewer and exact message identity, persist/deduplicate the decision and acknowledge promptly.
- [ ] P2.4 Add transactional effect reservation and the serial executor. Publish only the approved SHA. Resolve existing tags including annotated tags and validate exact check identity/SHA.
- [ ] P2.5 Update the configured Linear state, create its stable receipt comment, update Slack and read each relevant object back. The initial receipt uses actual observations even before the polished UI exists.
- [ ] P2.6 Expose run, events, command status and receipt APIs. The browser displays approval required, active work, failed preconditions and actual completion.

Completion checkpoints:

- [ ] P2-G1 SC-01 completes with the actual model, real GitHub/Linear writes and a genuine allowlisted Slack approval. Record the provider objects without exposing credentials.
- [ ] P2-G2 SC-02 publishes still-valid A after unrelated branch drift. SC-03 cannot use A's approval to publish a newly intended B.
- [ ] P2-G3 SC-04 rejects the conflicting existing tag; SC-07 refuses wrong-SHA or wrong-producer check evidence.
- [ ] P2-G4 SC-06 rejects incorrect reviewer/team/channel/message/nonce and expiry; no browser API can forge an approval.
- [ ] P2-G5 SC-11 cannot reserve the same tag with a different manifest. Changes to bound release content require a new approval.
- [ ] P2-G6 Invalid/incomplete/refused model output produces a clear state and no mutation. Instructions embedded in an issue cannot expand tools or authorize execution.

Verification: `npm run check`, `npm run verify -- --phase P2 --mode fixture`, and `npm run verify -- --phase P2 --mode real_test --env demo --allow-test-writes`. Watch the actual Slack decision and inspect the actual release/issue links. A fixture approval is valid only in fixture evidence. External approval is an expected product interaction, not a reason to fake a reviewer action.

Evidence: P2.md, SC-01 receipt, matched manifest/approval/tag observations and the negative-case results. Git milestone subject: `feat: complete approved releases across github slack and linear`.

Stop rule: do not add more planner tools, release types or policy languages before SC-01 works. If the happy path is still broken at the event's midpoint, resolve it before expanding search or visuals.

**P3. Durable execution and useful recovery**

Result: the worker can distinguish rejected writes, unknown writes and observed effects, including after restart. References: A7–A8, A11, A14; SC-05, SC-08–14 and SC-16.

Entry: a complete approved workflow exists. Do not retrofit recovery around a sequence of unjournaled SDK calls; refactor the executor to the operation protocol before extending it.

Implementation tasks:

- [ ] P3.1 Persist unique operations and attempts before dispatch; normalize not_sent/rejected/unknown/observed outcomes; remove hidden automatic write retries.
- [ ] P3.2 Implement GitHub tag/manifest-marker reconciliation, bounded readback and conflict detection. Retry on the UI resumes reconciliation for unknown writes.
- [ ] P3.3 Implement the after-apply/before-response fault hook below the real adapter. Ensure the worker cannot read the observer's successful response.
- [ ] P3.4 On startup, reconcile interrupted reserved/sent operations before considering new writes. Test a real process termination against the same fixture state/database.
- [ ] P3.5 Add partial completion and independent pending steps for Linear and Slack. Reconcile uncertain Slack message and Linear comment creation using stable markers.
- [ ] P3.6 Implement and display cancellation cutoff, approval expiry during recovery, provider backoff and budget exhaustion. No blind repeat on an ambiguous 404/5xx path.

Completion checkpoints:

- [ ] P3-G1 SC-05 completes after an injected successful-response loss. The controlled run records one publish attempt and one observed matching release; no remote ID leaked from the fault observer.
- [ ] P3-G2 SC-09 survives worker termination with the same outcome and correct operation history. Restart does not manufacture another approval or silently rerun a publish.
- [ ] P3-G3 SC-08 exposes partial completion and recovers only the unfinished steps. Linear HTTP 200 errors cannot become success.
- [ ] P3-G4 SC-10 and SC-11 preserve idempotency and effect uniqueness. Record the actual provider behavior when duplicate requests are rejected; do not call it a duplicate release if none exists.
- [ ] P3-G5 SC-12 remains unverified when observations are missing; SC-14 does not blindly duplicate messages/comments after uncertain results.
- [ ] P3-G6 SC-16 respects the cutoff and expires authority for new attempts while preserving already-observed effects.
- [ ] P3-G7 SC-05 is also demonstrated with a real test-account release and openly labeled injected response loss. Fixture-only success does not satisfy this external gate.

Verification: `npm run check`, `npm run verify -- --phase P3 --mode fixture`, and the P3 real-test verification command with the explicit test-write flag. Review attempts and provider objects together. Restart the actual worker process; a function-level mocked exception is not a process-recovery test.

The crash-test harness may terminate only its own recorded child worker PID after verifying that worker's instance and fixture database path. Never kill every node process or a process belonging to Codex, the browser or unrelated work.

Evidence: P3.md, redacted attempt history, SC-05/08/09/14 observations, actual restart result and real receipt. Git milestone subject: `feat: reconcile uncertain writes and recover partial releases`.

Stop rule: unresolved reads result in needs_attention. Never add a second release tag or overwrite approval data to make recovery appear successful.

**P4. Verification engine and regression evidence**

Result: independently checked failures can be discovered in a bounded model, reproduced against the application, reduced and replayed. References: A13–A14; E1–E7.

Entry: the real executor and recovery code are stable enough to test. Model exploration operates on fixtures/abstract state, not customer services.

Implementation tasks:

- [ ] P4.1 Implement INV-01–05 as pure predicates with evidence references and inconclusive handling. They cannot import the agent/model module or provider mutation code.
- [ ] P4.2 Implement actor-valid event schedules at declared hooks, fixed seed/clock, reset and the declared exploration caps. Report model candidates separately from application replays.
- [ ] P4.3 Add a deliberately broken fixture-only baseline that re-resolves a mutable branch. Run SC-02 against baseline and corrected code under identical conditions.
- [ ] P4.4 Implement dependency-preserving reduction and safe JSON export/replay. Reproduction must re-execute the relevant adapter/executor path after reset.
- [ ] P4.5 Create the held-out IDs/timing case, keep original fixture data separate and verify the result is not tied to hardcoded A/B strings or issue IDs.
- [ ] P4.6 If available endpoints work, reproduce one relevant case in Arga. Record per-method gaps and provider modes. Arga support is optional; truthful labels are mandatory.

Completion checkpoints:

- [ ] P4-G1 SC-02 exposes INV-01 in the seeded baseline and passes with useful completion in the corrected implementation.
- [ ] P4-G2 The exported reduced sequence reproduces the same predicate failure after reset. The file identifies setup, actors, seed, code digest and mode.
- [ ] P4-G3 Removing an actor prerequisite invalidates a schedule; the reducer cannot create impossible authority to shorten a trace.
- [ ] P4-G4 The held-out fixture passes. Recorded decision replay and fresh model execution are labeled separately.
- [ ] P4-G5 Unsupported endpoints, timeouts, pruned paths and inconclusive observations are included in counts, not silently treated as passes.
- [ ] P4-G6 A tampered export with arbitrary remote URLs or credential references is rejected. No test-mode production fallback exists.

Verification: `npm run check`, `npm run verify -- --phase P4 --mode fixture`, `npm run eval -- --suite core --mode fixture --seed 17`, `npm run eval -- --suite holdout --mode fixture --seed 91`, and `npm run replay -- --file <actual-export-path> --mode fixture`. Replace the placeholder with a real generated file; record the exact invocation.

Evidence: P4.md, paired comparison records, reduced and parent schedules, redacted regression JSON and held-out results. Git milestone subject: `feat: add independent workflow verification and replay`.

Stop rule: when the bounded counterexample and replay work, resist adding a generic solver, autonomous patch agent or more integrations. Those additions do not replace missing evidence.

**P5. Product experience and visible correctness**

Result: the interface makes authority, progress, uncertainty and completion understandable without reading logs. References: A12, A15; SC-01/02/05/08/12 and E8.

Entry: backend APIs and evidence schemas are stable. Frontend shell work may have started earlier against frozen contracts, but this phase closes only against working backend behavior.

Implementation tasks:

- [ ] P5.1 Finish one release workspace: request input, connection status, candidate summary, Slack approval state and ordered timeline.
- [ ] P5.2 Build the expandable receipt showing request, approved SHA, observed SHA, reviewer, app outcomes, pending steps and source links.
- [ ] P5.3 Derive controls from server-provided valid actions. Show queued cancellation separately from applied cancellation; label reconciliation and partial completion honestly.
- [ ] P5.4 Add the scenario comparison and replay view with persistent provider-mode labels. Raw technical evidence remains expandable.
- [ ] P5.5 Verify empty/loading/error states, keyboard operation, visible focus, readable narrow layouts and browser refresh during execution. Add optional fault controls only after core views work.

Completion checkpoints:

- [ ] P5-G1 Browser journey creates a run, displays genuine approval state and shows a receipt matching the backend/provider observations.
- [ ] P5-G2 SC-05 visibly moves through uncertain/reconciling to observed completion; no hardcoded green animation substitutes for state.
- [ ] P5-G3 SC-08 and SC-12 visibly show partial or unverified outcomes with actionable next steps.
- [ ] P5-G4 Reloading or navigating away during a run reconstructs the correct state; polling does not repeatedly call external provider APIs.
- [ ] P5-G5 Session/CSRF controls protect mutations and receipts. Browser bundles and screenshots contain no secrets.
- [ ] P5-G6 A reviewer can identify the approved revision, published revision and pending work from the first receipt view without opening a terminal.

Verification: `npm run check`, `npm run verify -- --phase P5 --mode fixture`, `npm run test:browser`, then one manual walk-through of the real run. Capture actual screenshots for normal, reconciling and partial states. Visual inspection is required in addition to passing browser assertions.

Evidence: P5.md, redacted screenshots, Playwright results and any measured UI/acknowledgment latency. Git milestone subject: `feat: deliver release workspace and inspectable receipts`.

Stop rule: cut decorative graphs, marketing pages and animation before sacrificing the receipt, error states or an inspectable demonstration.

**P6. Final evaluation, clean-clone delivery and GitHub handoff**

Result: a reviewer can obtain the repository, run the fixture demonstration, inspect measured evidence and understand the actual three-app run. References: A16; E6–E8.

Entry: previous local phase gates pass; remaining access, provider or Git synchronization issues are explicitly recorded. Unresolved essential real-integration gates must be repaired before calling the project complete.

Implementation tasks:

- [ ] P6.1 Run the full applicable fixture corpus and held-out suite. Repeat selected fresh model runs where time/access permit; record actual counts and missing repetitions.
- [ ] P6.2 Run a current real SC-01 and the main SC-02/05 demonstration with provider observations. Keep the deliberately unsafe baseline fixture-only and clearly labeled.
- [ ] P6.3 Write README setup, architecture overview, exact commands, environment requirements and troubleshooting. Export a concise reliability brief directly from result records.
- [ ] P6.4 Record a two-minute demonstration: task, plan, approval, drift, corrected execution, lost-response recovery, receipt and replay. Label edited waiting periods and simulated/real sections.
- [ ] P6.5 In a new temporary checkout, install from the lockfile, migrate, build, run fixture checks and start the project without relying on the original database or untracked files.
- [ ] P6.6 Review all publishable artifacts, commit intended source/docs/tests, push, verify remote SHA and inspect required CI for that exact commit. Record the repository URL, branch, commit, demo location and known limitations in the handoff.

Completion checkpoints:

- [ ] P6-G1 No required test is silently skipped, unsupported or inconclusive while counted as passed. Current results match the tested implementation digest.
- [ ] P6-G2 Clean-checkout setup works with fixture mode and no private credentials. Real mode fails helpfully without credentials rather than pretending to connect.
- [ ] P6-G3 The real receipt establishes all three app outcomes. The recorded demo depicts actual implementation behavior.
- [ ] P6-G4 README, dashboard and reliability brief agree on scope, modes, counts and limitations. Prerelease is never described as production deployment.
- [ ] P6-G5 All intended project files are committed; secrets/raw artifacts are excluded; the configured remote branch equals the committed SHA. Required CI is green or a concrete blocker is reported.
- [ ] P6-G6 Final response identifies what was built, what was tested, real vs fixture evidence, repository/commit and unresolved limitations. Event submission itself occurs only under the user's submission instruction.

Verification: `npm ci`, `npm run db:migrate`, `npm run check`, `npm run verify -- --phase P6 --mode fixture`, full eval, held-out eval, browser checks, real checks and the runbook Git verification. Run clean-checkout checks once; repeat only if relevant changes or failures justify it.

Evidence: P6.md, final results, actual demo file/link, reliability brief, clean-checkout result and final remote/CI identifiers. Git milestone subject: `docs: ship verified releaseproof demo and reproducible evidence`.

**B2. Event time allocation and scope cuts**

For a six-and-a-half-hour build window, use the following aggressive planning budget, not a completion prediction: P1 40 minutes, P2 60, P3 70, P4 50, P5 50, P6 80, plus 40 minutes of contingency. Integration setup and a beginner's learning time may exceed these allocations. Evidence gates remain truthful regardless of time spent.

Start the thin UI during P2 and capture screenshots/notes as features work. Reserve the final hour for recording, clean-clone verification and delivery. If behind, cut optional Arga integration where unsupported, broad exploration, live chaos controls, telemetry, decorative views and extra fresh-model repetitions, explicitly recording the cuts. Preserve the real three-app flow, exact approval binding, response-loss recovery, one reproducible counterexample and an honest receipt.

If a required feature cannot be completed, identify the project as partial and record the missing gate. A deadline is not permission to fake an integration, weaken a failing test or change a rule solely to obtain a green result.

**B3. Work ownership if multiple coding tasks are used**

Default to one implementing task and a deliberate review pass. If parallel coding is explicitly arranged, one lead owns contracts, migrations, build state and integration. A backend worker owns core/application/providers; a frontend worker owns web/components against frozen DTOs; an evaluation worker owns fixtures/scenarios and predicates. Assign disjoint files and a clear base commit. Only the lead updates shared contracts, integrates changes and records phase completion.

Separate worktrees may have their own branches and commits; each task may push its own authorized branch at a handoff. The lead verifies integrated behavior and pushes the integration branch at each phase. Do not have several tasks modifying the same migration, lockfile, state document or provider credentials concurrently. Parallel work must not replace the phase dependency gates.
