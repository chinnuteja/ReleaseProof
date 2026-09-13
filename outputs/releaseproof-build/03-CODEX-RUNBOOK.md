**ReleaseProof Codex implementation runbook**

Use this procedure whenever assigned to build, fix, verify or continue ReleaseProof. For a documentation-only request, edit and verify the documents without starting application implementation. The current user instruction and higher-priority instructions take precedence over this runbook.

**R1. Every-session startup**

1. Confirm the working directory and read repository-root AGENTS.md plus any applicable nested instructions. Read 04-BUILD-STATE.md and the evidence for the last locally verified phase.
2. Inspect Git status, current branch, remotes/upstream and recent commits. Identify user changes and unfinished work before editing. Do not reset, stash, overwrite or commit unrelated changes merely to obtain a clean tree.
3. Read the current phase in 02-PHASED-BUILD-PLAN.md, its referenced architecture sections and the relevant evaluation IDs. Do not reload all market research unless it is necessary for a product decision.
4. Establish what actually exists. A checked box is not proof: locate the code and evidence, compare their implementation digest to changed files, and reproduce an unresolved failure. Rerun previously passed checks only when relevant changes, stale evidence or a failure justify it.
5. Pick the smallest incomplete dependency. Announce the phase, the next concrete outcome and its required checks. Implement from that point; do not restart the project or redesign the stack on every task.

Useful initial commands, from the verified repository root:

```powershell
Get-Location
git status --short --branch
git branch --show-current
git log -5 --oneline
git diff --stat
```

If Git says the directory is not a repository, inspect the named project directory before initializing anything. For an explicitly authorized new build, initialization is routine; the GitHub destination still has to be supplied or reliably identified. Do not guess a repository based on a similar name or silently change an existing remote. Do not print credential-bearing URLs.

**R2. Implementation loop**

Use: inspect -> implement one coherent behavior -> run focused verification -> inspect evidence -> fix -> update state. Build through real interfaces early. Keep placeholder adapters clearly marked and unavailable in real_test mode. A UI button that changes a local boolean is not implementation of a provider operation.

For each behavior, explain the expected business result and which observation proves it. Add tests for meaningful boundaries, state transitions and failure modes in the evaluation contract. Avoid tests that simply restate a helper's implementation. Do not modify an assertion to conceal a failure or count absent tests as passing.

Keep progress updates concise and regular. Report findings and the next uncertainty being resolved. Do not repeatedly ask for approval of routine implementation choices already settled in the architecture. If an external dependency is missing, identify the exact setting/account/resource and continue unrelated local work.

Do not cross a phase's required gate on the strength of fixture evidence when that gate explicitly requires real provider behavior. Use local_verified and external_gate_blocked separately. The implementation may continue on independent work while those states remain explicit.

**R3. Phase review before marking local completion**

Perform a separate review pass over the integrated diff. Trace one request through the interfaces and answer:

- Does the model propose only allowed objects and read tools, with authority enforced outside the model?
- Is each external write preceded by a durable operation reservation and followed by independent observation?
- What happens if the worker stops immediately before or after this write?
- Can a duplicate request or callback create another effect or change the intended object?
- Does the UI distinguish pending, unknown, partial and complete states using persisted evidence?
- Are real, twin and fixture modes accurately recorded? Could any unsupported test fall back to a real service?
- Are tests exercising the actual adapters and rules, with redacted, reproducible evidence?

These are targeted correctness checks for this product. Record actionable findings, fix them and rerun only the affected checks plus the phase gate. Keep broader redesign proposals outside the current scope unless they resolve a demonstrated problem.

**R4. State and evidence handoff**

Update 04-BUILD-STATE.md before each phase checkpoint or session end. Record current phase, locally verified gates, failed/unrun gates, tested implementation digest, actual commands and exits, evidence paths, modified components, unresolved dependencies and the next exact action.

Keep the phase evidence concise but sufficient to reproduce a finding. Separate expected result, observed result and interpretation. Use null/NOT_RUN for missing measurements. Never fabricate model calls, provider object IDs, benchmark percentages or GitHub links.

Record major deviations with a decision ID, reason, evidence, affected contracts and replacement verification. For example, choosing HTTP Slack callbacks instead of Socket Mode requires transport verification changes; it is not just an environment-variable change. Update the architecture and affected phase/evaluation contracts together.

**R5. Commit and push cadence**

The user requests GitHub synchronization during the build. Commit and push all intended project changes at each locally verified phase and at every safe session handoff containing meaningful changes. A temporary interruption may use a clearly labeled WIP commit on the task branch, with failed/unrun checks disclosed. Do not present that checkpoint as a completed phase.

“All intended project changes” includes source, migrations, configuration templates, tests, dependency lockfile, implementation documents and reviewed redacted evidence. It excludes secrets, .env files, SQLite/WAL/SHM files, node_modules, build outputs, raw account data, private traces and unrelated research/workspace files unless specifically included by the user. Keep large recordings out of ordinary Git blobs; commit a shareable location/index when appropriate.

One coordinator owns integration-branch pushes when several tasks work together. Each independently authorized task can push its own branch. Never force-push, rewrite shared history, bypass branch protections or merge a PR solely to satisfy checkpoint cadence. If a push is rejected due to newer remote work, fetch, inspect and integrate compatible changes deliberately; preserve others' work and rerun affected checks.

Before a commit:

1. Inspect git status and the full intended diff. Verify no unrelated user changes are being staged.
2. Confirm ignore rules and inspect publishable artifacts for actual credentials/private content. Do not print secret values to demonstrate their absence.
3. Stage explicit intended paths that exist. Avoid a blind repository-wide git add when the workspace also contains unrelated files.
4. Run git diff --cached --check and inspect git diff --cached --stat plus the staged content.
5. Commit with a concrete behavior-based subject. Include the phase evidence and state update in the same commit.

**R6. Remote verification procedure**

The following PowerShell example assumes the operator-approved remote is origin and the destination uses the current branch name. If the repository already tracks a different remote/branch mapping, preserve that mapping and adapt the verified names. A detached HEAD requires an explicit task branch before pushing.

```powershell
$releaseProofBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($releaseProofBranch)) {
  throw 'Resolve the task branch before pushing.'
}

git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Fix the staged diff before committing.' }

# Stage and commit the reviewed intended files before this next step.
git push --set-upstream origin $releaseProofBranch
if ($LASTEXITCODE -ne 0) { throw 'Push failed; retain local work and record the blocker.' }

$releaseProofLocalSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve local commit.' }
$releaseProofRemoteLine = git ls-remote --exit-code origin "refs/heads/$releaseProofBranch"
if ($LASTEXITCODE -ne 0) { throw 'Remote branch verification failed.' }
$releaseProofRemoteSha = ($releaseProofRemoteLine -split '\s+')[0]
if ($releaseProofLocalSha.Trim() -ne $releaseProofRemoteSha.Trim()) {
  throw 'Local and remote commits differ; do not report the checkpoint as synced.'
}

git status --short --branch
```

After a successful comparison, report the repository/branch and verified commit. If CI is required, inspect the workflow for that exact commit, not a previously green run. Wait with bounded intervals and continue useful independent work rather than narrating repeated unchanged polls. Remote synchronization and green CI are separate facts.

Do not create an endless sequence of commits just to write each commit's own SHA inside itself. Commit phase evidence with a tested source digest, then derive the current push status from Git. If useful, write a local ignored synchronization receipt containing commit, remote ref and verification time; summarize it in the final response and the next session's state update. Tracked build state explicitly treats current remote synchronization as live state to verify, not as a self-referential stored SHA.

If the repository URL is missing, retain the completed files and ask once for the destination when it becomes necessary to push. If authentication/network/branch protection blocks a push, preserve the commit, record its SHA and error category, continue independent work and clearly report not_synced. Never claim code is on GitHub based only on a successful local commit.

Normal pushes to an already configured authorized destination do not need repeated user confirmation. Creating a new repository requires its intended owner/name and visibility; do not silently make a project public. Publishing source does not authorize hackathon submission, production deployment, sending messages to external people or modifying unrelated provider resources.

**R7. Every-session final response**

Provide a short handoff containing:

```text
Phase and status:
Implemented behavior:
Checks actually run and their results:
Evidence location:
Commit / remote branch / verified remote SHA:
CI status for that commit:
Remaining blocker or next exact action:
```

If no implementation was requested, say that documents were updated and list their paths. Do not claim application tests, commits or pushes that were not performed.

**R8. How Codex discovers these instructions**

Keep AGENTS.md small and at the repository root; it points to the fuller documents. Applicable nested instructions may refine local work, while higher-priority instructions and the current user's request still govern. The official documentation describes instruction discovery and size limits. Do not copy this entire package into AGENTS.md. [Official AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

If the repository is moved, use the stable package paths under its new root. Do not modify global Codex settings or install a plugin merely to use this runbook. It is a repository work procedure, not a scheduler: it does not create automatic future runs or authorize unseen work by itself.
