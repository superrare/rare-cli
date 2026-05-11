# AGENTS.md

## Development Approach

Build around a functional core and an imperative shell.

The functional core is pure business logic: inputs in, outputs out. It owns validation, normalization, transformations, request/transaction planning, branching rules, and other domain decisions. It must not perform I/O, HTTP/RPC calls, contract writes, file access, logging, or `process.exit`.

The imperative shell is the thin orchestration layer. It reads config and environment, calls APIs/RPC/wallets, writes files, logs output, handles process behavior, and passes plain data into the functional core. In this repo, CLI command modules, API clients, wallet setup, config I/O, and output rendering are shell code. In NestJS-style codebases, services often play this role.

## Boundaries

- Put decisions in pure functions before wiring them into commands or SDK methods.
- Keep the CLI mostly as a thin wrapper around the SDK.
- Let the SDK own meaningful behavior and reusable flows.
- Pass dependencies into shell code instead of burying side effects inside core logic.
- Return structured data from core logic instead of printing, exiting, or mutating external state.

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

CLI E2E tests should cover all on-chain write commands.

## Review Checklist

- Business rules live in pure functions.
- Core logic has unit tests only when it contains real decisions.
- SDK behavior has integration coverage for realistic flows.
- CLI write commands have E2E coverage when they affect on-chain state.
