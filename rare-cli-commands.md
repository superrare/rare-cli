# RARE CLI command map

Global behavior:
- `--json` is accepted globally.
- Write commands show a preflight summary and prompt `[y/N]` before submitting transactions, setting approvals, or making irreversible local changes.
- `--yes` means yes to all prompts for that command, including transaction submission and approval steps.
- Write command success output should include suggested next steps when a natural follow-up exists.
- `--split <addr=ratio>` is repeatable up to 5 times. Ratios must sum to 100.

rare configure [--chain <chain>] [--chain-id <id>] [--private-key <key>] [--private-key-ref <ref>] [--rpc-url <url>] [--default-chain <chain>] [--show]
rare configure delete [--yes]
rare wallet generate [--chain <chain>] [--chain-id <id>] [--save]
rare wallet address [--chain <chain>] [--chain-id <id>]
rare currencies [--chain <chain>] [--chain-id <id>]

rare status --contract <address> [--token-id <id>] [--chain <chain>] [--chain-id <id>]
rare search tokens [--chain <chain>] [--chain-id <id>] [--query <text>] [--owner <address>] [--mine] [--has-auction] [--auction-state <state>] [--auction-creator <address>] [--auction-bidder <address>] [--has-listing] [--listing-type <type>] [--has-offer] [--offer-buyer <address>] [--per-page <n>] [--page <n>]
rare search collections [--chain <chain>] [--chain-id <id>] [--query <text>] [--per-page <n>] [--page <n>]

rare collection list --account <address> [--chain <chain>] [--chain-id <id>] [--per-page <n>] [--page <n>]
rare collection deploy erc721 <name> <symbol> [--max-tokens <number>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection deploy lazy-batch-mint <name> <symbol> [--max-tokens <number>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection deploy sovereign <name> <symbol> [--max-tokens <number>] [--contract-type <type>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection deploy lazy-sovereign <name> <symbol> --max-tokens <number> [--contract-type <type>] [--chain <chain>] [--chain-id <id>] [--yes]
rare import erc721 --contract <address> [--chain <chain>] [--chain-id <id>] [--yes]

rare liquid-edition deploy <name> <symbol> [--curves-file <path>] [--curve-preset <preset>] [--write-curves-file <path>] [--initial-rare-liquidity <amount>] [--total-supply <amount>] [--preview] [--yes] [--token-uri <uri>] [--description <description>] [--image <path>] [--video <path>] [--tag <tag>] [--attribute <attr>] [--chain <chain>] [--chain-id <id>]
rare liquid-edition status --contract <address> [--chain <chain>] [--chain-id <id>]
rare liquid-edition token-uri --contract <address> [--chain <chain>] [--chain-id <id>]
rare liquid-edition set-render-contract --contract <address> --render-contract <address> [--chain <chain>] [--chain-id <id>] [--yes]

rare collection mint --contract <address> [--token-uri <uri>] [--name <name>] [--description <description>] [--image <path>] [--video <path>] [--tag <tag>] [--attribute <attr>] [--to <address>] [--royalty-receiver <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection mint-batch --contract <address> --base-uri <uri> --amount <number> [--chain <chain>] [--chain-id <id>] [--yes]
rare collection prepare-lazy-mint --contract <address> --base-uri <uri> --amount <number> [--minter <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection creator --contract <address> --token-id <id> [--chain <chain>] [--chain-id <id>]
rare collection metadata status --contract <address> [--chain <chain>] [--chain-id <id>]
rare collection metadata update-base-uri --contract <address> --base-uri <uri> [--chain <chain>] [--chain-id <id>] [--yes]
rare collection metadata update-token-uri --contract <address> --token-id <id> --token-uri <uri> [--chain <chain>] [--chain-id <id>] [--yes]
rare collection metadata lock-base-uri --contract <address> [--chain <chain>] [--chain-id <id>] [--yes]

rare collection royalty status --contract <address> --token-id <id> [--price <raw>] [--chain <chain>] [--chain-id <id>]
rare collection royalty set-default-receiver --contract <address> --receiver <address> [--chain <chain>] [--chain-id <id>] [--yes]
rare collection royalty set-token-receiver --contract <address> --token-id <id> --receiver <address> [--chain <chain>] [--chain-id <id>] [--yes]
rare collection royalty registry status --contract <address> --token-id <id> [--price <raw>] [--registry <address>] [--chain <chain>] [--chain-id <id>]
rare collection royalty registry set-receiver-override --receiver <address> [--registry <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection royalty registry set-contract-receiver --contract <address> --receiver <address> [--registry <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection royalty registry set-token-receiver --contract <address> --token-id <id> --receiver <address> [--registry <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare collection royalty registry set-contract-percentage --contract <address> --percentage <number> [--registry <address>] [--chain <chain>] [--chain-id <id>] [--yes]

rare listing list --account <address> [--chain <chain>] [--chain-id <id>] [--per-page <n>] [--page <n>]
rare listing create --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--target <address>] [--split <addr=ratio>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing buy --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing cancel --contract <address> --token-id <id> [--target <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing status --contract <address> --token-id <id> [--target <address>] [--chain <chain>] [--chain-id <id>]

rare listing release configure --contract <address> --price <amount> --amount <number> [--currency <currency>] [--start-time <time>] [--split <addr=ratio>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing release mint --contract <address> [--amount <number>] [--currency <currency>] [--price <amount>] [--proof <file>] [--recipient <address>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing release status --contract <address> [--account <address>] [--chain <chain>] [--chain-id <id>]
rare listing release allowlist build --input <file> [--format <format>] [--output <file>]
rare listing release allowlist proof --input <file> --account <address> [--output <file>]
rare listing release allowlist set --contract <address> --end-time <time> [--input <file>] [--root <bytes32>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing release allowlist clear --contract <address> [--chain <chain>] [--chain-id <id>] [--yes]
rare listing release limits set-mint --contract <address> --amount <number> [--chain <chain>] [--chain-id <id>] [--yes]
rare listing release limits set-tx --contract <address> --amount <number> [--chain <chain>] [--chain-id <id>] [--yes]

rare listing batch list --account <address> [--chain <chain>] [--chain-id <id>] [--per-page <n>] [--page <n>]
rare listing batch create --input <path> [--chain <chain>] [--chain-id <id>] [--yes]
rare listing batch buy [--proof <path>] [--root <hex>] [--contract <address>] [--token-id <id>] --creator <address> --currency <currency> --price <amount> [--chain <chain>] [--chain-id <id>] [--yes]
rare listing batch cancel --root <hexOrPath> [--chain <chain>] [--chain-id <id>] [--yes]
rare listing batch set-allowlist --root <hexOrPath> [--allowlist-root <hex>] [--end-time <time>] [--chain <chain>] [--chain-id <id>] [--yes]
rare listing batch status [--root <hexOrPath>] --creator <address> [--contract <address>] [--token-id <id>] [--proof <path>] [--chain <chain>] [--chain-id <id>]

rare offer list --account <address> --side <maker|taker> [--chain <chain>] [--chain-id <id>] [--per-page <n>] [--page <n>]
rare offer create --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--chain <chain>] [--chain-id <id>] [--yes]
rare offer accept --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--split <addr=ratio>] [--chain <chain>] [--chain-id <id>] [--yes]
rare offer cancel --contract <address> --token-id <id> [--currency <currency>] [--chain <chain>] [--chain-id <id>] [--yes]
rare offer status --contract <address> --token-id <id> [--currency <currency>] [--chain <chain>] [--chain-id <id>]

rare offer batch create [--root <bytes32>] [--input <path>] [--format <format>] [--chain-id <id>] --price <amount> [--currency <currency>] --end-time <time> [--chain <chain>] [--yes]
rare offer batch accept --creator <address> [--proof <path>] [--root <bytes32>] --contract <address> --token-id <id> [--split <addr=ratio>] [--chain <chain>] [--chain-id <id>] [--yes]
rare offer batch revoke [--root <bytes32>] [--input <path>] [--format <format>] [--chain-id <id>] [--chain <chain>] [--yes]
rare offer batch status --creator <address> [--root <bytes32>] [--input <path>] [--format <format>] [--chain-id <id>] [--chain <chain>]

rare auction list --account <address> --side <maker|taker> [--chain <chain>] [--chain-id <id>] [--per-page <n>] [--page <n>]
rare auction create --contract <address> --token-id <id> --price <amount> --end-time <time> [--type <type>] [--start-time <time>] [--currency <currency>] [--split <addr=ratio>] [--chain <chain>] [--chain-id <id>] [--yes]
rare auction bid --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--chain <chain>] [--chain-id <id>] [--yes]
rare auction settle --contract <address> --token-id <id> [--chain <chain>] [--chain-id <id>] [--yes]
rare auction cancel --contract <address> --token-id <id> [--chain <chain>] [--chain-id <id>] [--yes]
rare auction status --contract <address> --token-id <id> [--chain <chain>] [--chain-id <id>]

rare auction batch create [--root <bytes32>] [--input <path>] [--format <format>] [--chain-id <id>] --price <amount> [--currency <currency>] --end-time <time> [--split <addr=ratio>] [--chain <chain>] [--yes]
rare auction batch bid --creator <address> [--proof <path>] [--root <bytes32>] --contract <address> --token-id <id> --price <amount> [--currency <currency>] [--chain <chain>] [--chain-id <id>] [--yes]
rare auction batch settle --contract <address> --token-id <id> [--chain <chain>] [--chain-id <id>] [--yes]
rare auction batch cancel [--root <bytes32>] [--input <path>] [--format <format>] [--chain-id <id>] [--chain <chain>] [--yes]
rare auction batch status --contract <address> --token-id <id> [--creator <address>] [--root <bytes32>] [--input <path>] [--proof <path>] [--format <format>] [--chain-id <id>] [--chain <chain>]

rare swap buy-token --token <address> --eth-amount-in <amount> [--slippage-bps <bps>] [--min-amount-out <amount>] [--quote-only] [--yes] [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>]
rare swap sell-token --token <address> --amount-in <amount> [--slippage-bps <bps>] [--min-amount-out <amount>] [--quote-only] [--yes] [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>]
rare swap buy-rare --eth-amount-in <amount> [--slippage-bps <bps>] [--min-amount-out <amount>] [--quote-only] [--yes] [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>]
rare swap buy --token <address> --eth-amount-in <amount> --min-amount-out <amount> --commands <hex> --inputs-file <path> [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>] [--yes]
rare swap sell --token <address> --amount-in <amount> --min-amount-out <amount> --commands <hex> --inputs-file <path> [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>] [--yes]
rare swap swap --token-in <address> --amount-in <amount> --token-out <address> --min-amount-out <amount> --commands <hex> --inputs-file <path> [--recipient <address>] [--deadline <time>] [--chain <chain>] [--chain-id <id>] [--yes]

rare utils tree build --input <path> [--format <format>] [--chain <chain>] [--chain-id <id>] [--output <path>]
rare utils tree proof --input <path> --contract <address> --token-id <id> [--format <format>] [--chain <chain>] [--chain-id <id>] [--output <path>]
rare utils tree verify --input <path> --contract <address> --token-id <id> [--proof <path>] [--root <bytes32>] [--format <format>] [--chain <chain>] [--chain-id <id>]
rare utils merkle proof --input <path> --contract <address> --token-id <id> [--buyer <address>] [--output <path>]
