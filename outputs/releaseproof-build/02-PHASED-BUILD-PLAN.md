**ReleaseProof implementation plan — revised delivery scope**

ADR-09 (2026-09-14, user-requested): execute **P1 → P2 → combined P3 → P6**. [Combined P3 plan](06-COMBINED-PHASE-3.md) is the authoritative next-phase scope. It replaces standalone P3/P4/P5 tasks and gates; P4 and P5 are superseded, not completed. Preserve the original authority and truthful-evidence rules.

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
| npm run verify -- --phase P1 --mode fixture | Run that phase's registered applicable checks; active phase IDs are P1, P2, P3 and P6; legacy P4/P5 report superseded |
| npm run verify -- --phase P2 --mode real_test --env demo --allow-test-writes | Run gated real checks; uses scoped configured resources and genuine approval |
| npm run eval -- --suite core --mode fixture --seed 17 | Execute core and persistence scenarios; export normalized result records |
| npm run eval -- --suite holdout --mode fixture --seed 91 | Execute reserved changed-identity/timing cases |
| npm run replay -- --file PATH --mode fixture | Validate and replay a redacted exported counterexample with safe local configuration |
| npm run test:browser | Run focused Playwright product journeys using fixture mode |
| npm run export:evidence -- --run RUN_ID | Redact and export observations, receipt and result records |

Use npm.cmd in PowerShell if npm.ps1 is blocked by local execution policy; do not weaken machine-wide execution policy. Every verification command has a nonzero exit for a failed required assertion, no discovered tests, or a required check skipped for missing credentials. The registry must explicitly distinguish not-yet-implemented phase checks from completed ones.

**P1. Foundation, contracts and provider access**

Result: a reproducible repository and durable local runtime that can identify the three configured external apps. Architecture references: A2–A7, A10, A12. Evaluation references: SC-10, SC-13, SC-15 and E4.

Entry: documents are available. Run the runbook's repository discovery first. The configured source target is `chinnuteja/ReleaseProof`; the disposable release target is `chinnuteja/ReleaseProof-demo`. Verify live remotes and credentials rather than inferring access from these names.

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

**P3. Combined recovery, proof, and product**

Implement [06-COMBINED-PHASE-3.md](06-COMBINED-PHASE-3.md), including its P2 closure checkpoint and P3-G1–G6. Do not execute the former P3, P4 and P5 as separate phases.

| Checkpoint | Outcome |
| --- | --- |
| P3.0 | Repair and re-verify P2 integration/authority gaps; close live gates as credentials arrive |
| P3.1 | Durable operations, lost-response and crash recovery, partial completion, cancellation and expiry |
| P3.2 | Five independent rules, fixed baseline/corrected comparison, authored replay and one holdout |
| P3.3 | One polished workspace with persisted timeline, exact-SHA receipt, provider links and focused browser checks |
| P3.4 | Consolidated verification, evidence, source digest and Git handoff; proceed to P6 |

Cut automatic exploration/minimization, the general evaluation platform, Arga, extra dashboards, live chaos controls and marketing pages. Keep the underlying safety semantics and existing regression coverage. The replay trace is authored, not discovered or minimized.

Evidence: `evidence/P3.md`, current P1/P2 regression results, normalized comparison/recovery records, replay JSON and screenshots. Real P2 completion remains mandatory for final delivery. Real SC-05 is exercised once during P6; fixture P3 completion does not satisfy that real gate.

**P4 and P5. Superseded by combined P3**

No separate implementation, phase evidence, or completion claim is required for these IDs. Preserve old references as historical context; use ADR-09 and the combined plan for current scope.

**P6. Deployment, final evaluation, documentation and GitHub handoff**

Result: a reviewer can obtain the repository, run the fixture demonstration, inspect measured evidence and understand the actual three-app run. References: A16; E6–E8.

Entry: P1/P2 and combined P3 local gates pass; remaining access, provider or Git synchronization issues are explicitly recorded. Unresolved essential real-integration gates must be repaired before calling the project complete.

Implementation tasks:

- [ ] P6.1 Run the full applicable fixture corpus and held-out suite. Repeat selected fresh model runs where time/access permit; record actual counts and missing repetitions.
- [ ] P6.2 Run a current real SC-01 and one real SC-05 response-loss demonstration with provider observations. Use the fixture-only paired SC-02 result for the drift comparison; a live drift variant is optional. Keep the deliberately unsafe baseline fixture-only and clearly labeled.
- [ ] P6.3 Write README setup, architecture overview, exact commands, environment requirements and troubleshooting. Export a concise reliability brief directly from result records.
- [ ] P6.4 Record a two-minute demonstration: task, plan, approval, drift, corrected execution, lost-response recovery, receipt and authored regression replay. Label edited waiting periods and simulated/real sections.
- [ ] P6.5 In a new temporary checkout, install from the lockfile, migrate, build, run fixture checks and start the project without relying on the original database or untracked files.
- [ ] P6.6 Review all publishable artifacts, commit intended source/docs/tests, push, verify remote SHA and inspect required CI for that exact commit. Record the repository URL, branch, commit, demo location and known limitations in the handoff.
- [ ] P6.7 Deploy web and a single worker on one persistent host with local shared SQLite, HTTPS and operator authentication. Verify hosted startup, health, migrations, secret isolation, native SQLite loading and restart/resume. Record the actual URL and hosting status; a local-only delivery must not be labeled deployed.

Completion checkpoints:

- [ ] P6-G1 No required test is silently skipped, unsupported or inconclusive while counted as passed. Current results match the tested implementation digest.
- [ ] P6-G2 Clean-checkout setup works with fixture mode and no private credentials. Real mode fails helpfully without credentials rather than pretending to connect.
- [ ] P6-G3 The real receipt establishes all three app outcomes. The recorded demo depicts actual implementation behavior.
- [ ] P6-G4 README, dashboard and reliability brief agree on scope, modes, counts and limitations. Prerelease is never described as production deployment.
- [ ] P6-G5 All intended project files are committed; secrets/raw artifacts are excluded; the configured remote branch equals the committed SHA. Required CI is green or a concrete blocker is reported.
- [ ] P6-G6 Final response identifies what was built, what was tested, real vs fixture evidence, repository/commit and unresolved limitations. Event submission itself occurs only under the user's submission instruction.
- [ ] P6-G7 Hosted application passes the deployment smoke and persistence checks on its actual host, or hosted deployment is explicitly BLOCKED with local delivery separately identified.

Verification: `npm ci`, `npm run db:migrate`, `npm run check`, `npm run verify -- --phase P6 --mode fixture`, full eval, held-out eval, browser checks, real checks and the runbook Git verification. Run clean-checkout checks once; repeat only if relevant changes or failures justify it.

Evidence: P6.md, final results, actual demo file/link, reliability brief, clean-checkout result and final remote/CI identifiers. Git milestone subject: `docs: ship verified releaseproof demo and reproducible evidence`.

**B2. Deadline allocation and approved cuts**

Use the deadline discipline in the combined P3 plan: reserve at least the final quarter of remaining time for P6. No new deadline or implementation duration has been supplied; allocation percentages are priorities, not completion estimates.

The new phase replaces three separate build phases. P6 packages, deploys and verifies the retained product; deferred exploration, minimization, Arga and decorative surfaces must not reappear there. Preserve the real three-app flow, exact approval binding, response-loss recovery, authored replay and an observed receipt.

If a required boundary or live gate remains unresolved, record the project as incomplete for that gate. Do not relabel an authored trace as discovered/minimized or count absent observations as success.

**B3. Work ownership if multiple coding tasks are used**

Default to one implementing task and a deliberate review pass. If parallel coding is explicitly arranged, one lead owns contracts, migrations, build state and integration. A backend worker owns core/application/providers; a frontend worker owns web/components against frozen DTOs; an evaluation worker owns fixtures/scenarios and predicates. Assign disjoint files and a clear base commit. Only the lead updates shared contracts, integrates changes and records phase completion.

Separate worktrees may have their own branches and commits; each task may push its own authorized branch at a handoff. The lead verifies integrated behavior and pushes the integration branch at each phase. Do not have several tasks modifying the same migration, lockfile, state document or provider credentials concurrently. Parallel work must not replace the phase dependency gates.
