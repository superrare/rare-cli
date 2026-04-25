import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { isHex, formatEther, formatUnits } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient, type BuyRareQuote, type TokenTradeQuote } from '../sdk/client.js';
import { output, log, isJsonMode } from '../output.js';

export function parseInputsJson(raw: string, label: string): readonly `0x${string}`[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in inputs file: ${label}`);
  }

  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string' || !isHex(value))) {
    throw new Error(`Inputs file must be a JSON array of hex strings: ${label}`);
  }

  return parsed as readonly `0x${string}`[];
}

async function readInputsFile(path: string): Promise<readonly `0x${string}`[]> {
  return parseInputsJson(await readFile(path, 'utf-8'), path);
}

export function ensureHex(value: string, label: string): `0x${string}` {
  if (!isHex(value)) {
    throw new Error(`${label} must be a hex string.`);
  }
  return value as `0x${string}`;
}

export function isAffirmativeResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

export function shouldPromptForConfirmation(
  opts: { yes?: boolean; quoteOnly?: boolean },
  isTty: boolean,
  jsonMode: boolean,
): boolean {
  return isTty && !jsonMode && !opts.yes && !opts.quoteOnly;
}

export function formatBuyRareQuoteLines(params: {
  chain: string;
  router?: string;
  eth: string;
  quote: BuyRareQuote;
  recipient?: string;
  usedMinRareOutOverride: boolean;
}): string[] {
  const lines = [
    `Quote for buying RARE on ${params.chain}:`,
    ...(params.router ? [`  Router: ${params.router}`] : []),
    `  ETH in: ${params.eth}`,
    `  Estimated RARE out: ${formatEther(params.quote.estimatedRareOut)}`,
    `  Min RARE out: ${formatEther(params.quote.minRareOut)}`,
    params.usedMinRareOutOverride
      ? '  Min out source: manual override'
      : `  Slippage: ${params.quote.slippageBps} bps`,
    ...(params.recipient ? [`  Recipient: ${params.recipient}`] : []),
  ];

  return lines;
}

function formatQuotedAmount(amount: bigint, decimals: number): string {
  return decimals === 18 ? formatEther(amount) : formatUnits(amount, decimals);
}

export function formatTokenTradeQuoteLines(params: {
  chain: string;
  direction: 'buy' | 'sell';
  token: string;
  amountLabel: string;
  amountIn: string;
  quote: TokenTradeQuote;
  recipient?: string;
  usedMinOutOverride: boolean;
}): string[] {
  const outputLabel = params.direction === 'buy' ? 'Estimated token out' : 'Estimated ETH out';
  const minOutputLabel = params.direction === 'buy' ? 'Min token out' : 'Min ETH out';

  return [
    `Quote for ${params.direction === 'buy' ? 'buying' : 'selling'} ${params.token} on ${params.chain}:`,
    `  Route source: ${params.quote.routeSource}`,
    `  Execution: ${params.quote.execution}`,
    `  Route: ${params.quote.routeDescription}`,
    `  ${params.amountLabel}: ${params.amountIn}`,
    `  ${outputLabel}: ${formatQuotedAmount(params.quote.estimatedAmountOut, params.quote.outputDecimals)}`,
    `  ${minOutputLabel}: ${formatQuotedAmount(params.quote.minAmountOut, params.quote.outputDecimals)}`,
    params.usedMinOutOverride
      ? '  Min out source: manual override'
      : `  Slippage: ${params.quote.slippageBps} bps`,
    ...(params.recipient ? [`  Recipient: ${params.recipient}`] : []),
  ];
}

async function confirmProceed(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return isAffirmativeResponse(await rl.question('Proceed? [y/N] '));
  } finally {
    rl.close();
  }
}

function swapBuyCommand(): Command {
  const cmd = new Command('buy');
  cmd.description('Execute a raw ETH -> token router buy');

  cmd
    .requiredOption('--token <address>', 'token address to buy')
    .requiredOption('--eth <amount>', 'ETH amount to spend')
    .requiredOption('--min-out <amount>', 'minimum token amount out')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .action(async (opts: {
      token: string;
      eth: string;
      minOut: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');

      log(`Buying token via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token: ${opts.token}`);
      log(`  ETH in: ${opts.eth}`);
      log(`  Min out: ${opts.minOut}`);

      const result = await rare.swap.buy({
        token: opts.token as `0x${string}`,
        ethAmount: opts.eth,
        minTokensOut: opts.minOut,
        commands,
        inputs,
        recipient: opts.recipient as `0x${string}` | undefined,
        deadline: opts.deadlineSeconds,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    });

  return cmd;
}

function swapSellCommand(): Command {
  const cmd = new Command('sell');
  cmd.description('Execute a raw token -> ETH router sell');

  cmd
    .requiredOption('--token <address>', 'token address to sell')
    .requiredOption('--amount <amount>', 'token amount to sell')
    .requiredOption('--min-out <amount>', 'minimum ETH amount out')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .action(async (opts: {
      token: string;
      amount: string;
      minOut: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');

      log(`Selling token via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token: ${opts.token}`);
      log(`  Amount: ${opts.amount}`);
      log(`  Min ETH out: ${opts.minOut}`);

      const result = await rare.swap.sell({
        token: opts.token as `0x${string}`,
        tokenAmount: opts.amount,
        minEthOut: opts.minOut,
        commands,
        inputs,
        recipient: opts.recipient as `0x${string}` | undefined,
        deadline: opts.deadlineSeconds,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    });

  return cmd;
}

function swapSwapCommand(): Command {
  const cmd = new Command('swap');
  cmd.description('Execute a raw router token swap');

  cmd
    .requiredOption('--token-in <address>', 'input token address')
    .requiredOption('--amount-in <amount>', 'amount of the input token')
    .requiredOption('--token-out <address>', 'output token address')
    .requiredOption('--min-out <amount>', 'minimum output token amount')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .action(async (opts: {
      tokenIn: string;
      amountIn: string;
      tokenOut: string;
      minOut: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');

      log(`Swapping via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token in: ${opts.tokenIn}`);
      log(`  Amount in: ${opts.amountIn}`);
      log(`  Token out: ${opts.tokenOut}`);
      log(`  Min out: ${opts.minOut}`);

      const result = await rare.swap.swap({
        tokenIn: opts.tokenIn as `0x${string}`,
        amountIn: opts.amountIn,
        tokenOut: opts.tokenOut as `0x${string}`,
        minAmountOut: opts.minOut,
        commands,
        inputs,
        recipient: opts.recipient as `0x${string}` | undefined,
        deadline: opts.deadlineSeconds,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    });

  return cmd;
}

function swapBuyTokenCommand(): Command {
  const cmd = new Command('buy-token');
  cmd.description('Buy a token with ETH using a canonical liquid route or Uniswap fallback');

  cmd
    .requiredOption('--token <address>', 'token address to buy')
    .requiredOption('--eth <amount>', 'ETH amount to spend')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-out <amount>', 'override minimum token amount out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'skip the interactive confirmation prompt')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use')
    .action(async (opts: {
      token: string;
      eth: string;
      slippageBps?: string;
      minOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = getWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: wallet.client });
      const recipient = opts.recipient ?? wallet.account.address;
      const quote = await rare.swap.quoteBuyToken({
        token: opts.token as `0x${string}`,
        ethAmount: opts.eth,
        minTokensOut: opts.minOut,
        slippageBps: opts.slippageBps,
        recipient: recipient as `0x${string}`,
      });
      const promptNeeded = shouldPromptForConfirmation(opts, Boolean(process.stdin.isTTY), isJsonMode());
      const quoteLines = formatTokenTradeQuoteLines({
        chain,
        direction: 'buy',
        token: opts.token,
        amountLabel: 'ETH in',
        amountIn: opts.eth,
        quote,
        recipient,
        usedMinOutOverride: opts.minOut !== undefined,
      });

      if (opts.quoteOnly) {
        output(
          {
            chain,
            token: opts.token,
            recipient,
            execution: quote.execution,
            routeSource: quote.routeSource,
            routeDescription: quote.routeDescription,
            ethIn: opts.eth,
            estimatedAmountOut: quote.estimatedAmountOut.toString(),
            minAmountOut: quote.minAmountOut.toString(),
            slippageBps: quote.slippageBps,
            commands: quote.commands ?? null,
            inputs: quote.inputs ?? null,
          },
          () => {
            for (const line of quoteLines) {
              console.log(line);
            }
          },
        );
        return;
      }

      if (!isJsonMode()) {
        for (const line of quoteLines) {
          console.log(line);
        }
      }

      if (promptNeeded && !(await confirmProceed())) {
        console.log('Aborted.');
        return;
      }

      log(`Submitting token buy on ${chain}...`);

      const result = await rare.swap.buyToken({
        token: opts.token as `0x${string}`,
        ethAmount: opts.eth,
        minTokensOut: quote.minAmountOut,
        recipient: recipient as `0x${string}`,
        deadline: opts.deadlineSeconds,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          execution: result.execution,
          routeSource: result.routeSource,
          estimatedAmountOut: result.estimatedAmountOut.toString(),
          minAmountOut: result.minAmountOut.toString(),
          commands: result.commands ?? null,
          inputs: result.inputs ?? null,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Estimated token out: ${formatQuotedAmount(result.estimatedAmountOut, quote.outputDecimals)}`);
          console.log(`Min token out: ${formatQuotedAmount(result.minAmountOut, quote.outputDecimals)}`);
        },
      );
    });

  return cmd;
}

function swapSellTokenCommand(): Command {
  const cmd = new Command('sell-token');
  cmd.description('Sell a token for ETH using a canonical liquid route or Uniswap fallback');

  cmd
    .requiredOption('--token <address>', 'token address to sell')
    .requiredOption('--amount <amount>', 'token amount to sell')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-out <amount>', 'override minimum ETH amount out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'skip the interactive confirmation prompt')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use')
    .action(async (opts: {
      token: string;
      amount: string;
      slippageBps?: string;
      minOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = getWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: wallet.client });
      const recipient = opts.recipient ?? wallet.account.address;
      const quote = await rare.swap.quoteSellToken({
        token: opts.token as `0x${string}`,
        tokenAmount: opts.amount,
        minEthOut: opts.minOut,
        slippageBps: opts.slippageBps,
        recipient: recipient as `0x${string}`,
      });
      const promptNeeded = shouldPromptForConfirmation(opts, Boolean(process.stdin.isTTY), isJsonMode());
      const quoteLines = formatTokenTradeQuoteLines({
        chain,
        direction: 'sell',
        token: opts.token,
        amountLabel: 'Token in',
        amountIn: opts.amount,
        quote,
        recipient,
        usedMinOutOverride: opts.minOut !== undefined,
      });

      if (opts.quoteOnly) {
        output(
          {
            chain,
            token: opts.token,
            recipient,
            execution: quote.execution,
            routeSource: quote.routeSource,
            routeDescription: quote.routeDescription,
            tokenIn: opts.amount,
            estimatedAmountOut: quote.estimatedAmountOut.toString(),
            minAmountOut: quote.minAmountOut.toString(),
            slippageBps: quote.slippageBps,
            commands: quote.commands ?? null,
            inputs: quote.inputs ?? null,
          },
          () => {
            for (const line of quoteLines) {
              console.log(line);
            }
          },
        );
        return;
      }

      if (!isJsonMode()) {
        for (const line of quoteLines) {
          console.log(line);
        }
      }

      if (promptNeeded && !(await confirmProceed())) {
        console.log('Aborted.');
        return;
      }

      log(`Submitting token sell on ${chain}...`);

      const result = await rare.swap.sellToken({
        token: opts.token as `0x${string}`,
        tokenAmount: opts.amount,
        minEthOut: quote.minAmountOut,
        recipient: recipient as `0x${string}`,
        deadline: opts.deadlineSeconds,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          execution: result.execution,
          routeSource: result.routeSource,
          estimatedAmountOut: result.estimatedAmountOut.toString(),
          minAmountOut: result.minAmountOut.toString(),
          approvalTxHash: result.approvalTxHash ?? null,
          approvalResetTxHash: result.approvalResetTxHash ?? null,
          commands: result.commands ?? null,
          inputs: result.inputs ?? null,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Estimated ETH out: ${formatEther(result.estimatedAmountOut)}`);
          console.log(`Min ETH out: ${formatEther(result.minAmountOut)}`);
        },
      );
    });

  return cmd;
}

function swapBuyRareCommand(): Command {
  const cmd = new Command('buy-rare');
  cmd.description('Buy RARE with ETH using the curated canonical route');

  cmd
    .requiredOption('--eth <amount>', 'ETH amount to spend')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-rare-out <amount>', 'override minimum RARE out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'skip the interactive confirmation prompt')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline-seconds <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .action(async (opts: {
      eth: string;
      slippageBps?: string;
      minRareOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadlineSeconds?: string;
      chain?: string;
    }) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const quoteClient = createRareClient({ publicClient });
      const quote = await quoteClient.swap.quoteBuyRare({
        ethAmount: opts.eth,
        minRareOut: opts.minRareOut,
        slippageBps: opts.slippageBps,
      });
      const promptNeeded = shouldPromptForConfirmation(opts, Boolean(process.stdin.isTTY), isJsonMode());
      const wallet = promptNeeded || !opts.quoteOnly ? getWalletClient(chain) : undefined;
      const recipient = opts.recipient ?? wallet?.account.address;
      const quoteLines = formatBuyRareQuoteLines({
        chain,
        router: quoteClient.contracts.swapRouter,
        eth: opts.eth,
        quote,
        recipient,
        usedMinRareOutOverride: opts.minRareOut !== undefined,
      });

      if (opts.quoteOnly) {
        output(
          {
            chain,
            router: quoteClient.contracts.swapRouter ?? null,
            ethIn: opts.eth,
            recipient: recipient ?? null,
            estimatedRareOut: quote.estimatedRareOut.toString(),
            minRareOut: quote.minRareOut.toString(),
            slippageBps: quote.slippageBps,
            commands: quote.commands,
            inputs: quote.inputs,
          },
          () => {
            for (const line of quoteLines) {
              console.log(line);
            }
          },
        );
        return;
      }

      if (!isJsonMode()) {
        for (const line of quoteLines) {
          console.log(line);
        }
      }

      if (promptNeeded && !(await confirmProceed())) {
        console.log('Aborted.');
        return;
      }

      const walletForSubmit = wallet ?? getWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: walletForSubmit.client });

      log(`Submitting RARE buy on ${chain}...`);

      const result = await rare.swap.buyRare({
        ethAmount: opts.eth,
        minRareOut: quote.minRareOut,
        recipient: recipient as `0x${string}` | undefined,
        deadline: opts.deadlineSeconds,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          estimatedRareOut: result.estimatedRareOut.toString(),
          minRareOut: result.minRareOut.toString(),
          commands: result.commands,
          inputs: result.inputs,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Estimated RARE out: ${formatEther(result.estimatedRareOut)}`);
          console.log(`Min RARE out: ${formatEther(result.minRareOut)}`);
        },
      );
    });

  return cmd;
}

export function swapCommand(): Command {
  const cmd = new Command('swap');
  cmd.description('Interact with token swap routes');

  cmd.addCommand(swapBuyCommand());
  cmd.addCommand(swapSellCommand());
  cmd.addCommand(swapSwapCommand());
  cmd.addCommand(swapBuyTokenCommand());
  cmd.addCommand(swapSellTokenCommand());
  cmd.addCommand(swapBuyRareCommand());

  return cmd;
}
