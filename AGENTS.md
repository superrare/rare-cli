# AGENTS.md

## Development Approach

Build around a functional core and an imperative shell.

The functional core is pure business logic: inputs in, outputs out. It owns validation, normalization, transformations, request/transaction planning, branching rules, and other domain decisions. It must not perform I/O, HTTP/RPC calls, contract writes, file access, logging, or `process.exit`.

The imperative shell is the thin orchestration layer. It reads config and environment, calls APIs/RPC/wallets, writes files, logs output, handles process behavior, and passes plain data into the functional core. In this repo, CLI command modules, API clients, wallet setup, config I/O, and output rendering are shell code. In NestJS-style codebases, services often play this role.

Tip: Compare sdk functionality against actual contract implementations in core repo:
- https://github.com/superrare/core
- https://github.com/superrare/core/blob/main/README.md

## Boundaries

- Put decisions in pure functions before wiring them into commands or SDK methods.
- Keep the CLI mostly as a thin wrapper around the SDK.
- Let the SDK own meaningful behavior and reusable flows.
- Pass dependencies into shell code instead of burying side effects inside core logic.
- Return structured data from core logic instead of printing, exiting, or mutating external state.

## SDK Write-Flow Policy

SDK methods that perform durable side effects should order work from cheapest and safest to most expensive and irreversible:

1. Local validation and planning.
2. Remote reads and simulation.
3. External API writes or uploads needed by the transaction.
4. Approval or allowance writes.
5. Final on-chain write.
6. Receipt parsing and post-write verification.

The goal is to fail before creating persistent external state whenever we reasonably can. Contract writes, approvals, uploads, and imports are product-visible actions; callers should not be surprised by a side effect that could have been avoided with local validation or a cheap remote preflight.

### Local validation and planning

- Normalize and validate user inputs before any RPC, HTTP, upload, wallet, or file side effect.
- Put business decisions in pure `plan*`, `build*`, `normalize*`, or `validate*` helpers in core modules.
- Plans should return structured data: normalized amounts, addresses, timestamps, roots, proofs, split recipients, write args, and branch decisions.
- Reject impossible or unsupported inputs in the plan layer: missing required fields, invalid amounts, unsupported modes, malformed roots/proofs, duplicate split recipients, mismatched artifacts, and unsafe numeric inputs.
- Keep SDK shell methods focused on dependency resolution, preflight reads, side effects, and result shaping.

### Remote preflight before writes

- Prefer remote validation before any durable write when the preflight is reliable and not more expensive than the write it protects.
- Use contract reads to check ownership, permissions, active config, current sale state, balances, limits, existing roots, allowlist status, and token/currency metadata when those conditions affect whether a write can succeed.
- Use `publicClient.simulateContract` before `walletClient.writeContract` for target writes when practical, especially for user-facing write flows, release configuration, marketplace actions, minting, and metadata/royalty mutations.
- Simulate the final target operation before approval writes when the target call can be simulated without the approval already being present. If simulation requires a missing approval, document that limitation in the flow and rely on the best available reads.
- Treat API-backed proof/root resolution as remote validation. Verify API results against local artifacts or on-chain active roots when possible before proceeding.
- Do not add simulation only for appearances. If a contract is nondeterministic, state-dependent in a way simulation cannot model, or requires side effects that have not happened yet, use explicit reads and clear error messages instead.

### Uploads, API writes, and other external side effects

- Defer uploads, imports, and other API writes until local planning and relevant remote preflight have passed.
- When an API write produces data consumed by an on-chain write, verify the API response against the local plan before writing on-chain. Examples: generated Merkle roots should match artifact roots; uploaded metadata should satisfy the planned token URI flow.
- Keep upload/API request body construction in pure builders where possible, and keep the HTTP call in shell code.
- If an upload must happen before the final transaction and the transaction later fails, return or throw enough context for the caller to retry without repeating expensive work when possible.

### Approvals and allowance side effects

- Approvals are persistent side effects. Only perform them after local validation and all feasible remote preflight for the target operation.
- Prefer checking existing allowance/approval first. Do not write an approval if the current state is already sufficient.
- Support `autoApprove: false` or an equivalent caller-controlled path for flows where users may want to stop before approval.
- Wrap target-operation failures after a mined approval with a catchable error that includes the approval transaction and approved target/spender/minter. `ApprovalSideEffectError` is the model.
- After writing an approval, verify that the approval or allowance is readable before continuing when the next operation depends on it.
- Avoid broad approvals unless the protocol flow requires them. If broad approval is required, make that behavior explicit in the helper and result shape.

### Final writes and post-write verification

- Keep final `writeContract` / `sendTransaction` calls as late as possible in the method.
- Parse receipts for expected events when the event is part of the public result contract.
- Verify post-write state when event logs are insufficient or when the contract/API can report the updated configuration directly.
- Throw with enough context to diagnose failed verification: operation name, contract, token/root/config, tx hash, and relevant observed values.
- Return structured results from SDK methods: tx hash, receipt, normalized inputs, derived amounts, addresses, approval tx hashes, and parsed event/config data.

### Acceptable exceptions

- Some target writes cannot be fully simulated before an approval because the approval is itself a precondition. In those cases, do every other cheap preflight first, perform the approval, verify it, and wrap later failures as approval side-effect errors.
- Some flows require uploads or API registration before an on-chain write because the transaction consumes a URI, CID, Merkle root, or server-generated proof. Validate everything available before the upload, verify the returned data, then proceed.
- Some writes are intentionally simple pass-through operations. Even then, perform local normalization first and consider simulation if the write is user-facing or likely to fail for predictable reasons.
- Reads used for status commands may be best-effort where contracts vary by generation. Do not apply best-effort swallowing to write preflight unless the write flow has a clear fallback and error story.

### Review questions for new SDK writes

- Did every input-dependent decision happen before the first side effect?
- Is there a pure planner/builder for the meaningful business logic?
- Can the final target write be simulated before approvals or uploads? If not, why not?
- Are ownership, permission, allowance, active config, root/proof, and amount assumptions checked before writing?
- Are durable pre-final side effects unavoidable, caller-controlled where appropriate, and surfaced in errors/results?
- Does the method verify the receipt or final state rather than assuming the write did what we expected?
- Would an SDK consumer have enough structured data to retry, recover, or clean up after a partial failure?

## Public SDK Design

Treat package exports as product APIs. Only export symbols that we intend consumers to import, document, test, and rely on across releases.

- Keep `@rareprotocol/rare-cli/client` focused on the high-level SDK client: `createRareClient`, public namespace params/results, public response model types, and catchable public errors.
- Put lower-level viem building blocks behind explicit subpaths such as `@rareprotocol/rare-cli/contracts` for addresses, chain metadata, and ABIs.
- Put standalone pure helpers behind explicit user-intent subpaths such as `@rareprotocol/rare-cli/utils`; also expose the same flows through `rare.utils.*` when they are part of the client experience.
- Do not export planners, write builders, shell helpers, validation internals, or implementation-shaped functions from the public client barrel. Keep those behind internal imports.
- Before adding an export, ask: would we document this, test it as public behavior, and treat changes to it as semver-significant? If not, keep it internal.

## Error Handling

The rule of thumb is: **if the caller wants to handle the failure differently in code, return it; if the failure should abort and surface to the user, throw it.**

### Throw when

- Crossing an I/O boundary — RPC, HTTP, filesystem, wallet, contract calls. Viem and `openapi-fetch` already throw rich errors with `.cause` chains; do not catch-and-wrap unless you have a specific reason. Let them flow to `printError` (`src/errors.ts`), which walks the cause chain, mines viem's `shortMessage` / `reason` / `metaMessages`, and honors `--json` mode.
- The failure is a bug-class invariant — impossible states, unreachable branches, programmer errors. `throw new Error('unreachable: ...')`.
- The failure is at the SDK's public surface. SDK consumers (the CLI and external users via `dist/client.js`) expect Promise rejections, not Result types. Throwing keeps the SDK ergonomic and consistent with the JS ecosystem.
- The failure is a user-input error inside a CLI command action. The top-level `program.parseAsync(...).catch(printError)` in `src/index.ts` is the single exit ramp. Do not call `console.error` + `process.exit(1)` inline — that bypasses `--json` mode and the unified formatting.

### Return a discriminated result when

- The failure is expected and part of the function's contract — input validation, parsing, business-rule checks. `src/liquid/curve-config.ts`'s `{ isValid: true, ... } | { isValid: false, error, errorMessage }` is the model.
- The caller often wants to branch on the failure mode (re-prompt, accumulate errors, try alternatives) rather than propagate.
- The function lives in the functional core. The core's whole point is that decisions return structured data. Throwing from the core makes outputs harder to test and reason about.
- The caller wants to enumerate failure cases at compile time. Pair a tagged union with `@typescript-eslint/switch-exhaustiveness-check` (already on) so new failure modes force handling.

### Return `undefined` / `null` when

- A lookup has a single "not found" mode and no useful "why." `find(...)`-style returns.
- Avoid when the absent value is ambiguous (not found vs not loaded vs intentionally empty).

### Anti-patterns

- **Try/catch as control flow inside the core.** If you find yourself doing `try { parseFoo(x) } catch { ... }` to pick a code path, `parseFoo` should return a Result instead.
- **Boolean returns for failure.** `function doThing(): boolean` discards the reason. Either throw or return a Result.
- **Catch-rewrap-rethrow without `cause`.** If you must wrap, always set `{ cause: original }` so `printError` can walk the chain.
- **Catching `unknown` and swallowing it.** `catch { return undefined }` silently hides real bugs.
- **`console.error` + `process.exit(1)` from shell code.** Throw instead and let `printError` handle it.
- **Domain errors with no `instanceof` discriminator.** If you add a custom error class, model it on `RareApiError` in `src/data-access/errors.ts` so `errors.ts` can pull specific fields out of it.

### Where the two patterns currently live

- Throwing: `src/sdk/**` (SDK methods, viem/API errors), `src/sdk/validation.ts` (parsers called from command setup), `src/commands/**` (action handlers).
- Returning: `src/liquid/curve-config.ts` (interactive wizard validators — re-prompts on failure rather than aborting).

Both are correct because they sit on opposite sides of the I/O boundary. Match new code to whichever side it belongs on.

## Testing Approach

The core/shell split guides test scope. Use the cheapest test that gives real confidence.

Bias heavily toward integration tests. If behavior is dead simple, do not add a unit test just for coverage; cover it through an integration test instead.

Unit and integration tests should focus on the SDK. The CLI should stay thin enough that it mostly needs E2E coverage for command wiring and user-visible behavior.

## Unit Tests

Write unit tests only for functional core logic. They should call pure functions directly with plain inputs and assert returned outputs. They should not need mocks.

Good unit-test targets:

- Domain validation.
- Amount, address, chain, and currency normalization.
- Metadata and attribute transformations.
- Transaction parameter construction.
- Error classification or result shaping, when pure.

Avoid unit tests for pass-through code, logging, formatting-only wrappers, HTTP/RPC calls, file access, or CLI process behavior.

## Integration Tests

Integration tests should carry most of the coverage and should focus on SDK behavior across module boundaries.

Avoid mocks in integration tests. Integration tests should exercise the real SDK shell against real or controlled external dependencies, such as the live Rare API, real viem clients, real RPC endpoints, forks, or dedicated testnet services. If a behavior only needs fake clients, fake fetches, or mocked contract calls, it is probably pure functional core logic and belongs in a unit test instead. If testing a behavior requires a real on-chain write transaction, it probably belongs in an E2E test.

Cover:

- Public SDK methods and exported client behavior.
- API request/response handling.
- Contract read flows.
- Transaction preparation and write orchestration.
- Realistic success and failure paths.
- Coverage for on-chain writes with local fork. 

## CLI E2E Tests

Test the built CLI as a user would. Assert observable behavior: exit codes, stdout/stderr, JSON output, config effects, and chain effects.

E2E tests should target the CLI as a user would.
E2E-live tests should cover all on-chain write commands against the CLI.

## Review Checklist

- Business rules live in pure functions.
- Core logic has unit tests only when it contains real decisions.
- SDK behavior has integration coverage for realistic flows.
- CLI write commands have E2E coverage when they affect on-chain state.
