---
title: Compatibility shims
---

# Deprecated SDK compatibility shims

The SDK is owned and documented by [`@rareprotocol/rare-sdk`](https://github.com/superrare/rare-sdk#readme). This CLI package retains the following subpaths only so existing applications can migrate without an immediate breaking change:

| Deprecated CLI subpath | Replacement |
| --- | --- |
| `@rareprotocol/rare-cli/client` | `@rareprotocol/rare-sdk/client` |
| `@rareprotocol/rare-cli/contracts` | `@rareprotocol/rare-sdk/contracts` |
| `@rareprotocol/rare-cli/utils` | `@rareprotocol/rare-sdk/utils` |

The generated declarations for each compatibility entry point include a formal `@deprecated` annotation. New code should import the replacement directly.
