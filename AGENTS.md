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

## CLI E2E Tests

Test the built CLI as a user would. Assert observable behavior: exit codes, stdout/stderr, JSON output, config effects, and chain effects.

E2E tests should target the CLI as a user would.
E2E-live tests should cover all on-chain write commands against the CLI.

Tip: Running full E2E live test flight can take 30+ minutes. Move faster by only running the individual tests relevant to your code changes.

## Review Checklist

- Business rules live in pure functions.
- Core logic has unit tests only when it contains real decisions.
- SDK behavior has integration coverage for realistic flows.
- CLI write commands have E2E coverage when they affect on-chain state.
