**ReleaseProof evaluation contract**

This document defines the evidence required to claim the application works. All results are initially NOT_RUN. Expected outcomes are specifications, not achieved measurements. Keep scenario IDs stable across code changes and reference them from phase evidence.

**E1. Five independently checked rules**

| ID | Rule | Data required | Failure condition |
| --- | --- | --- | --- |
| INV-01 | Approval binding | Frozen manifest, accepted approval, published release and resolved tag | An observed release differs from the approved repository, SHA, release kind, tag or release-critical content |
| INV-02 | Approval authority | Transport provenance, workspace/channel/message identity, reviewer allowlist, nonce and attempt time | A protected effect is attempted without authority valid at its reservation/dispatch boundary |
| INV-03 | Check binding | Configured required check identities and observed check runs/statuses | Publication proceeds without required successful evidence for the exact target SHA and expected producer |
| INV-04 | Retry integrity | Stable effect key, operation attempts, outcomes, remote objects | An unknown outcome causes a blind new write, or retries change the intended release object |
| INV-05 | Completion integrity | GitHub release observation, Linear state/annotation, Slack message observation | The application claims overall completion while a required postcondition is false or unobserved |

Return pass, fail, inconclusive or not_applicable. A denied invalid request has no release object; publication-binding checks can be not_applicable while the scenario's required no-publish assertion passes. Missing evidence does not pass a rule by default. Run-level completion requires all applicable completion evidence, not a high average score.

The predicate library is pure code with no model client or provider write client. The agent cannot redefine its rules. Each result names the evidence that supports it, the policy version and any observation limitation.

**E2. Core scenario matrix**

| ID | Setup and injected event | Required outcome | Phase |
| --- | --- | --- | --- |
| SC-01 | Valid linked issue/PR at A; required checks pass; allowlisted reviewer approves A | One matching prerelease; correct issue state and annotation; final Slack state read back; run completed | P2 |
| SC-02 | After approval for A, permitted maintainer advances candidate branch to B; A remains valid | A may complete; B is never published by corrected executor; no false block merely because branch advanced | P2/P4 |
| SC-03 | User changes the intended release to B after A was approved | New manifest/approval required; original approval cannot publish B | P2 |
| SC-04 | Existing tag resolves to B while manifest approves A; include an annotated-tag variant | Detect conflict before publication; no silently reused conflicting tag; run needs attention | P2 |
| SC-05 | Transport applies valid GitHub release at A and hides its response from worker | Worker reads back and adopts A; exactly one publish attempt in this controlled case; downstream steps complete | P3 |
| SC-06 | Approval variants: wrong reviewer, wrong channel/team/message, expired nonce, repeated delivery | Invalid authority never reaches publish; duplicate accepted delivery does not create another protected attempt | P2 |
| SC-07 | Check variants: pass on wrong SHA, wrong check producer, pending check, failed check | No publish; reason identifies missing/invalid required evidence | P2 |
| SC-08 | GitHub succeeds, then Linear state or receipt annotation fails once | Partial result is visible; no premature completed state; recovery finishes missing steps without republishing | P3 |

SC-02 must run against both a deliberately broken baseline and the corrected implementation in fixtures. The baseline resolves a mutable branch at execution and violates INV-01. The corrected implementation completes the valid release at A. Expected baseline failure is a successful test of the checker, not a successful business workflow. Keep the baseline inaccessible from normal real-test execution.

**E3. Persistence and boundary cases**

| ID | Fault or trigger | Required outcome | Phase |
| --- | --- | --- | --- |
| SC-09 | Kill worker after a publish reaches provider but before outcome persistence; restart with same database | Reconcile before any new publish; same release retained; eventual downstream completion or explicit unresolved state | P3 |
| SC-10 | Double-submit requestKey; repeat Slack callback; launch a second worker process | Same run for same request; conflicting payload rejected; no extra protected attempt; second worker exits before processing | P1/P3 |
| SC-11 | Two requests target same environment/repository/tag with different manifests | Stable effect reservation rejects conflict; manifest hash cannot defeat effect uniqueness | P2/P3 |
| SC-12 | Provider readback unavailable after apparent successful writes | Receipt exposes missing observation; overall completion remains unverified | P3/P5 |
| SC-13 | Linear returns HTTP 200 with GraphQL errors or required data missing | Adapter classifies failure/unknown appropriately; no false verified issue update | P1/P3 |
| SC-14 | Slack approval message or Linear annotation is created but its response is lost | Lookup stable marker; adopt one match; flag multiple; unresolved absence never causes blind duplicate create | P3 |
| SC-15 | Unsupported twin endpoint or real URL injected into a fixture environment | Explicit unsupported/denied result; zero fallback traffic to real services | P1/P4 |
| SC-16 | Cancel before reservation; cancel after dispatch; approval expires during reconciliation | Respect declared cutoff; record already-issued effects; do not authorize a fresh expired publish | P3 |

Also exercise schema-invalid model output, model refusal/timeout, malicious instructions in issue text, operator session/CSRF rejection and redaction of sentinel credentials. They are boundary assertions grouped under the relevant phase checks, not additional product features.

**E4. Harness and fair comparison**

Use a stateful fixture HTTP service independent of the acting agent. It stores repositories/tags/releases, messages and issue state and validates request payloads. The production adapter code must send actual HTTP requests to that service. Replacing every adapter with a function that returns the expected answer is insufficient for integration evidence.

For a paired baseline/corrected comparison, reset the environment and database for each run; use the same inputs, policy, actor permissions, fault schedule, mode and resource budget. Record both implementation digests. Never imply that results from different fixtures or budgets constitute a controlled improvement measurement.

FaultController supports named hooks rather than sleeps chosen to happen near a guessed moment. At minimum: after_manifest_frozen, after_approval_accepted, before_publish, after_provider_apply_before_worker_response, before_linear_update and before_completion_projection. A schedule names actor, event, hook and prerequisites. The harness pauses/resumes deterministically at these hooks in fixtures. Real injected response loss is a separately labeled demonstration.

The ordinary worker cannot read the private fault observer. Hidden successful responses must not supply their remote IDs to reconciliation. The worker must discover the existing object through its normal read adapter.

**E5. Search and minimization scope**

The small model explorer enumerates valid actor/event orders under the stated caps. A model-state failure is only a candidate until reproduced against the application. Report candidate counts, executed replays, failures, unsupported paths, timeouts and pruned paths separately.

Reduce a failing schedule by removing an event or contiguous segment, checking dependency/actor validity, resetting the environment and replaying the same rule. Retain a removal only when the same failure reproduces. Stop at a local reduced result within budget. Do not call it the globally shortest sequence without exhaustive proof in the declared model.

Regression JSON must contain schemaVersion, scenarioId, seed, fixedSetup, eventSchedule, actors, environment capabilities, provider modes, policyVersion, manifest fields with synthetic identities, implementationDigest, predicate ID and expected outcome. Exports remove credentials, cookies, private message contents and unnecessary personal data. A replay must not read credentials or arbitrary base URLs out of its file.

**E6. Replay versus a new model run**

Deterministic trace replay supplies recorded synthetic planner/tool decisions to the actual executor and verifies the outcome under a reset fixture. It establishes reproducibility of that execution path. A fresh model run calls the configured model again and can choose different steps; report it separately.

Use one held-out seed that changes IDs, commit SHAs, tag names and fault timing after the first passing implementation. A seeded trace remains synthetic evidence. For final evaluation, repeat SC-01, SC-02 and SC-05 with fresh model planning three times if runtime and API access permit. If any repetitions are not run, show the actual count and the missing work; do not replace them with deterministic replays.

Keep the claim small: these tests establish behavior in this corpus, environment and code version. No statistical production reliability percentage follows from a handful of scenarios.

**E7. Result format and truthful aggregate metrics**

```json
{
  "schemaVersion": 1,
  "scenarioId": "SC-05",
  "seed": 17,
  "implementationDigest": "computed-from-tested-files",
  "gitCommit": null,
  "executionKind": "adapter-integration",
  "modes": {"github": "fixture", "slack": "fixture", "linear": "fixture"},
  "expectedBusinessOutcome": "completed-approved-A",
  "actualBusinessOutcome": "NOT_RUN",
  "testStatus": "NOT_RUN",
  "publishAttempts": null,
  "observedReleaseCount": null,
  "falseCompletionClaims": null,
  "ruleResults": [],
  "evidenceRefs": [],
  "durationMs": null,
  "modelCalls": null,
  "inputTokens": null,
  "outputTokens": null,
  "limitations": []
}
```

This example intentionally has no passing values. Generated results replace each field with actual observations. The implementation digest covers runtime source, contracts, migrations, dependency lockfile, test definitions and relevant nonsecret configuration. Record whether the worktree was dirty when measured. A subsequent documentation-only commit may share a source digest but has a different Git SHA; final CI must identify the actual pushed commit.

Report exact numerators and denominators for legitimate completions, unsafe publications, false blocks, successful reconciliations and replay reproduction. Keep publish attempts separate from release objects. For invalid scenarios, success means the expected rejection occurred, not that a release completed. Count inconclusive, skipped and unsupported cases separately from pass/fail. Cost is measured from usage and a dated configured pricing source, or labeled unavailable; do not invent dollar estimates.

**E8. Acceptance and evidence publication**

P2 needs an actual three-app happy path with a real model and Slack approval. P3 needs SC-05/08/09 to pass through adapters in fixtures and SC-05 to be demonstrated on dedicated real-test resources. P4 needs SC-02's paired comparison, a reduced replayable counterexample and the held-out seed. P5 needs browser behavior to agree with evidence. P6 needs the complete applicable fixture corpus and a current real three-app demonstration, with missing cases explicit.

CLI exit behavior is strict: a verification command exits nonzero when a required assertion fails, no required tests are discovered, or a required real check was skipped. Evaluation exploration can successfully find a failing baseline, but its machine-readable result must distinguish testStatus=PASS from actualBusinessOutcome=unsafe. Unimplemented future checks fail clearly when invoked; no placeholder script may return success.

Commit compact redacted results, phase evidence and replay fixtures. Keep raw traces, credentials, SQLite files, private account data and unreviewed screenshots out of Git. A human-readable reliability brief must use the exact same result records as the dashboard and machine-readable export.
