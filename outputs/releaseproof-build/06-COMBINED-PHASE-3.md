# Next phase: P3 — Recovery, proof, and product

Decision: ADR-09, requested by the user on 2026-09-14.
Sequence: **finish P2 gaps → combined P3 → P6 deployment and handoff**.
This file replaces the separate implementation scope of the original P3, P4, and P5. There is no separate P4 or P5 build assignment. This is an implementation plan; none of its unchecked gates claims completed work.

## The product we will demonstrate

**ReleaseProof keeps the release you approved intact, recovers when an API response disappears, and gives you a receipt you can verify.**

Build one excellent release workspace around that promise. A reviewer should understand the approved revision, observed revision, and unfinished work within seconds. The memorable moment is a release surviving an interruption while the evidence stays visible.

Keep the current TypeScript, Next.js, single Node worker, SQLite, GitHub, Slack, and Linear architecture. Keep one operator, one repository, one issue and linked PR per run, one Slack channel, and one Linear team. No stack migration or new provider is needed.

## Phase 2: actual starting point

Phase 2 is **implemented in fixtures but not fully accepted**. The last observed fixture run passed 11 tests; P1 passed five tests, and a production build passed. Subsequent hardening changes need current regression evidence. The older evidence digest does not certify every current change.

The current implementation includes the planner, immutable manifest, approval validation, approved-SHA executor, three provider adapters, persistence, and basic workspace/API. Recent work added the worker composition root, Slack approval button/app identity, Responses tool continuation, and stronger session checks. Those changes do not establish live integration success.

Remaining work belongs at the start of this combined phase, not in an invisible later backlog:

| Remaining item | Evidence / reason | Required closure |
| --- | --- | --- |
| Runnable configuration and real gate | `scripts/verify.ts` currently always blocks real verification; adding credentials alone cannot fix that | Load root configuration consistently for web, worker, doctor, and verification. Implement an actual gated runner with actionable prerequisites |
| Real access and model | GitHub token reported added by user; permissions and demo target not verified. Slack, Linear, and model setup pending | Verify target identities and individual reads; run a harmless real model/tool smoke; complete one real SC-01 with Slack approval when access arrives |
| Authority and provider edge cases | Green happy-path fixtures cover only a subset of authority boundaries | Close the concrete checks in P3.0 below and add focused regressions |
| Realistic provider behavior | Identity/auth responses currently overstate some capabilities; generic missing/invalid data handling is too permissive | Record observed read capabilities separately from advertised writes; fail safely on malformed payloads and incomplete readback |
| Current verification and Git handoff | Current worktree contains uncommitted implementation; previous phase evidence is stale for newer edits | Review the actual diff, run relevant gates, refresh source digest/evidence, then commit and verify the push |

Do not request credentials in chat. The user supplies secrets through local environment configuration. The source repository is `chinnuteja/ReleaseProof`; application release effects target `chinnuteja/ReleaseProof-demo`. Source push access and application API access are separate.

## What we keep, and what we cut

| Original phase | Keep in combined P3 | Defer beyond this delivery |
| --- | --- | --- |
| P3 recovery | Durable dispatch/outcome records, read-before-retry, lost-response recovery, one actual worker crash/restart test, partial outcomes, duplicate protection, cancellation/expiry boundaries | Broad failure permutations, generalized retry policy editor, operational telemetry |
| P4 verification | All five pure invariants, one baseline/corrected comparison, an authored replayable trace, one changed-identity holdout, compact evidence export | Automatic event-order exploration, automatic trace minimization, generic agent evaluation platform, Arga/twin integration |
| P5 experience | One polished workspace, exact approval card, live timeline, receipt with provider links, refresh/resume, accessible layouts, focused browser verification | Separate marketing site, multi-page analytics, live chaos console, elaborate graph visualizations, ornamental animations |

The authored trace is **not** an automatically discovered or minimized counterexample. Preserve scenario IDs and honest result labels. Deferred features are listed in the final README; they are not requirements quietly moved into P6.

The five rules remain unchanged: exact approval binding, authorized reviewer, checks on the approved commit, no blind retry after uncertainty, and no completion without observed outcomes.

## Build order inside this single phase

These are work checkpoints, not three new phases. Complete one runnable slice at a time.

### P3.0 — Close the P2 gaps before expanding the demo

- [ ] Make normal startup work from the documented root configuration, with one absolute database path and one environment registry shared by all processes. Missing settings must name the setting without printing its value.
- [ ] Implement the real verification path and real read probes. Report each provider separately; a successful auth call does not prove channel history, check reads, release access, comment support, or a Socket Mode interaction.
- [ ] Validate the requested issue's explicit PR URL against the configured repository, merged PR evidence, exact required-check set/producer/SHA, valid tag prefix, one unique issue, and configured destinations. A distractor link must not select a different PR.
- [ ] Enforce an actual bounded planner deadline and per-run model budget, including successive tool rounds. Test refusal, timeout, malformed JSON, omitted checks, and malicious issue text through the real validation path.
- [ ] Make approval capture, event insertion, and execution-command enqueue atomic. Reject old-manifest and cancelled-run interactions; duplicate delivery must not resurrect or reroute a run. Record authentic app/team/channel/message/action/reviewer and transport dedupe identity.
- [ ] Validate release title, prerelease flag, full expected body/digest and exact receipt marker in addition to resolved tag SHA. Resolve nested annotated tag objects correctly; unknown/unsupported lookups never authorize a new publish.
- [ ] Verify exact Slack message timestamps and channels; validate required Linear response data and configured predecessor state. Bound relevant collection reads; incomplete scans remain inconclusive.
- [ ] Exercise session protection on reads and writes, strict Origin/Host and CSRF checks, bounded request bodies, and valid command versions. Protect receipts and exports as well as mutations.
- [ ] Re-run P1/P2 fixtures and build after fixes. Save current evidence. Run the real SC-01 as soon as credentials and reviewer access are ready; independent fixture work can continue while that external gate remains open.

Acceptance: a normal request follows the production composition path into persisted approval state; negative cases cannot create protected effects. A real-test command must execute a real check or exit nonzero with the precise blocker.

### P3.1 — Make the interruption story work

Implement one operation protocol used by GitHub publish, Linear state/comment, Slack approval creation, and Slack final update:

1. Load immutable authority and operation state.
2. Reconcile any previous reserved/sent/unknown attempt before considering another write.
3. In a short transaction, reserve the stable effect and record the attempt/dispatch intent with current authority.
4. Call the provider outside the transaction, with automatic write retries disabled.
5. Persist the outcome, independent readback, events, and next work atomically.
6. Resume only unfinished operations; derive the receipt from verified observations.

- [ ] Recover unfinished commands and attempts on worker startup. Marking a command applied before its network work completes is not enough for crash recovery.
- [ ] For unknown GitHub writes, read repository visibility, tag, release, resolved commit, and expected content/marker. Adopt a single matching effect; conflicts stop. An ambiguous 404 or exhausted read budget must not trigger another create.
- [ ] Use persisted bounded readback scheduling and Retry-After. Manual Retry resumes reconciliation for unknown writes. Only proven not-sent or conclusive retryable rejection permits a fresh authorized attempt.
- [ ] Reconcile Slack approval creation and Linear comments using the persisted intent/operation marker. Adopt exactly one match, flag multiple, and stop if absence is unresolved.
- [ ] Show `partially_complete` when GitHub is verified but Linear or Slack is unfinished. Finish missing steps without republishing or duplicating comments.
- [ ] Make cancellation persistent and enforce its cutoff on subsequent commands. Check expiry immediately before new protected dispatch; reads may still record effects issued before expiry. Cancellation cannot be undone by Retry or a late approval.
- [ ] Keep the singleton guard; shutdown waits for active work before closing the database. Restart must use the same database and independent fixture-provider state.

Acceptance: SC-05 records exactly one publish attempt and one matching release after response loss; SC-08 recovers a known downstream failure; SC-09 kills/restarts the actual harness-owned worker and either recovers or reports an unresolved state without an extra publish.

### P3.2 — Produce a small, convincing proof

- [ ] Implement INV-01–05 as pure predicates over normalized provider observations, authority, attempts, and policy. The executor/model cannot grade its own success.
- [ ] Run SC-02 twice from reset fixture state: a fixture-only broken baseline resolves branch B after approval of A; the corrected executor publishes A. Keep inputs, actor permissions, and schedule equal.
- [ ] Export the actual **authored** schedule and observations as one versioned regression JSON. Replay it from reset through the adapters/executor; show the same baseline violation and corrected result.
- [ ] Replay files may select only supported scenario IDs, bounded actor events and synthetic data. Reject arbitrary remote URLs, credential references, unknown fields, executable content, oversized schedules, and invalid prerequisites.
- [ ] Run one held-out variant with different IDs, SHAs, tag and hook timing. Reuse the same implementation and declare which cases were replayed.
- [ ] Store counts from the journal and independent fixture observer: attempts, release objects, pending effects, rule results, mode, source digest and evidence references. Keep observer data unavailable to worker recovery.

Use a single named-hook harness for the fixed scenarios. No scheduler search engine, reducer, or arbitrary scenario editor.

Acceptance: a replay re-executes behavior rather than reading a prewritten success JSON. The paired result says “baseline violated approved revision; corrected run shipped approved revision.” No reliability percentage or universal guarantee is inferred.

### P3.3 — Make the evidence feel like a product

Build one workspace with an expandable “Proof” area:

| Area | What the operator sees |
| --- | --- |
| Header | ReleaseProof, current environment/mode, concise provider readiness |
| Request | Issue and release intent, one primary Prepare action, clear submitting/error state |
| Approval card | Repository, tag, proposed SHA before approval; approved SHA and reviewer only after accepted Slack approval |
| Timeline | Prepared → awaiting approval → publishing → reconciling/partial → verified; driven by persisted events |
| Receipt | Approved and observed SHA, each provider's outcome, source links, observation time, remaining work |
| Proof area | Baseline/corrected result, actual publish attempts and release count, five rule results, replay/export action |

Visual direction: restrained dark-neutral workspace, strong typography, clear spacing, one primary accent, amber for uncertainty and green only for verified state. Use a small exact-revision comparison as the focal point. Keep technical hashes, payloads, and operation details expandable; display short SHAs with full values available.

- [ ] Persist run navigation in the URL and restore from backend state on refresh. Reuse request keys on retried submissions; prevent accidental double-submit.
- [ ] Provide only server-authorized actions. Distinguish queued cancellation from applied cancellation. Retry must describe the actual recovery action.
- [ ] Poll persisted projections while active; do not re-probe external APIs on every browser poll. Handle stale responses, dropped network, session expiry, loading, empty, blocked, and partial states.
- [ ] Keep fixture results visibly labeled. The broken baseline and synthetic approval injection must be inaccessible to normal real execution.
- [ ] Verify keyboard use, focus, labels, text contrast, reduced motion, long identifiers and narrow layouts. Avoid new design-system dependencies unless needed.
- [ ] Capture actual completed, reconciling and partial states. Browser assertions plus visual inspection must agree with persisted observations.

Acceptance: a viewer can answer “who approved what, what actually shipped, and what remains” without opening a terminal. Proof data and UI use the same result schema.

### P3.4 — Freeze and hand off directly to P6

- [ ] Review integrated authority, persistence and UI behavior.
- [ ] Run the consolidated verification and export its current results.
- [ ] Update `evidence/P3.md`, build state, source digest and scope limitations.
- [ ] Commit and push the intended implementation to `chinnuteja/ReleaseProof`; verify remote SHA and CI for that commit.
- [ ] Move directly to P6. Do not reopen the deferred P4/P5 scope.

## Required verification, kept small

Keep existing P1/P2 tests. New test work uses a few parametrized integration cases rather than an exhaustive event-order matrix.

| Gate | Required evidence |
| --- | --- |
| P3-G1: P2 closure | Current P1/P2 checks pass; real registry/startup paths implemented; any still-missing real integration recorded separately |
| P3-G2: Recovery | SC-05 lost-response recovery, SC-08 partial recovery, SC-09 actual process restart |
| P3-G3: Boundaries | SC-10/11 duplicates/conflicts, SC-12/13 missing readback/GraphQL failure, SC-14 marker reconciliation, SC-15 isolation, SC-16 cancellation/expiry |
| P3-G4: Independent proof | INV-01–05; SC-02 paired comparison; authored export/replay; one changed-identity holdout; tampered replay rejected |
| P3-G5: Product | Browser journeys: normal/refresh, lost-response reconciliation, downstream partial/retry, session/CSRF rejection; visual review of three states |
| P3-G6: Handoff | Build passes; current redacted evidence and scope agree; commit/push verified; exact-commit CI recorded |

Required commands to implement and run:

```text
npm run check
npm run verify -- --phase P1 --mode fixture
npm run verify -- --phase P2 --mode fixture
npm run verify -- --phase P3 --mode fixture
npm run eval -- --suite core --mode fixture --seed 17
npm run eval -- --suite holdout --mode fixture --seed 91
npm run replay -- --file <actual-generated-export> --mode fixture
npm run test:browser
```

The P3 registry must assert the named required cases were discovered and executed. Core evaluation is a fixed corpus, not exploration. Reuse result files when wrappers cover the same run; do not rerun expensive identical suites just to inflate counts. Currently unimplemented commands must be implemented before claiming their gate. Legacy P4/P5 verification requests should report “superseded by P3” with a nonzero exit, not a fake pass.

When setup is ready, also run the real doctor/model smoke and real P2 SC-01 with `--allow-test-writes` and genuine Slack approval. Real response-loss demonstration is consolidated into P6's delivery run to avoid redundant live releases. Both real gates are required before final project completion.

## Deadline discipline

Reserve at least the final quarter of remaining time for P6. Allocate the combined-phase implementation window approximately: 20% P2 closure, 40% recovery, 15% proof/replay, 20% workspace, 5% integration handoff. These are allocation priorities, not a promised duration. If P2 repair grows, reduce presentation breadth first.

If time tightens further, cut in this order: interactive comparison controls (keep a view of recorded results), animated transitions, extra responsive refinements, extra seeds/model repetitions. Keep the exact-SHA receipt, actual response-loss recovery, one replay, and clear partial/error states. Boundary failures cannot be waived to fit the clock; report incomplete work explicitly.

The frontend may show persisted comparison results while replay is operated through the CLI; this is the approved smallest version. No upload screen or general scenario builder is needed.

## P6: the finish line

P6 covers deployment, README/setup, clean-checkout verification, final redacted evidence, a two-minute recording, and GitHub handoff. It does not implement the deferred explorer, reducer, analytics, or optional integrations.

Deploy web and one worker on the same persistent host with a shared local SQLite disk, HTTPS, operator authentication and secrets supplied at runtime. Validate native SQLite packaging, restart/resume, migrations and health on that host. Public hosting must not expose fixture mutation controls. No ephemeral serverless SQLite or multi-replica worker.

Select the actual host and deployment access during P6 using the available account and constraints. A read-only public receipt/demo can accompany a private operator workspace. If hosting is blocked, retain the runnable local delivery and explicitly mark hosted deployment incomplete.

The two-minute story:
1. Show the issue, proposed release and exact Slack approval.
2. Show the fixture-only baseline/corrected drift comparison with clear mode labels.
3. Demonstrate a hidden successful GitHub response; show reconciliation finding the same release.
4. Open the final GitHub/Linear/Slack receipt and replay the authored regression.

Keep SC-02 drift and SC-05 response loss as separate reproducible tests; a narrative may present them together, but must not imply an unexecuted combined scenario passed. A real SC-01 and one real SC-05 are required, with live side effects confined to the dedicated demo resources and reviewer interaction.

The result should be impressive because the product visibly earns its green receipt.
