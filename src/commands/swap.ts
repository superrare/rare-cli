import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import { output, log, isJsonMode } from '../output.js';
import {
  ensureHex,
  formatBuyRareQuoteLines,
  formatQuotedAmount,
  formatTokenTradeQuoteLines,
  parseAddress,
  parseInputsJson,
  parseOptionalAddress,
} from './swap-core.js';

export {
  ensureHex,
  formatBuyRareQuoteLines,
  formatTokenTradeQuoteLines,
  parseAddress,
  parseInputsJson,
  parseOptionalAddress,
} from './swap-core.js';

async function readInputsFile(path: string): Promise<readonly `0x${string}`[]> {
  return parseInputsJson(await readFile(path, 'utf-8'), path);
}

function withErrorHandling<Args extends unknown[]>(action: (...args: Args) => Promise<void>): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await action(...args);
    } catch (error) {
      printError(error);
    }
  };
}

async function confirmQuotedSwapExecution(commandName: string): Promise<void> {
  if (isJsonMode()) {
    throw new Error(`${commandName} requires --yes when submitting a quoted swap.`);
  }
  if (!process.stdin.isTTY) {
    throw new Error(`${commandName} requires --yes in non-interactive mode.`);
  }
  if (await confirmProceed()) {
    return;
  }

  throw new Error('Aborted.');
}

async function confirmProceed(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const normalized = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

function swapBuyCommand(): Command {
  const cmd = new Command('buy');
  cmd.description('Execute a raw ETH -> token router buy');

  cmd
    .requiredOption('--token <address>', 'token address to buy')
    .option('--amount-in <amount>', 'ETH amount to spend')
    .option('--min-amount-out <amount>', 'minimum token amount out')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--yes', 'skip the interactive transaction confirmation')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(withErrorHandling(async (opts: {
      token: string;
      amountIn?: string;
      minAmountOut?: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadline?: string;
      yes?: boolean;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const amountIn = opts.amountIn;
      const minAmountOut = opts.minAmountOut;
      if (amountIn === undefined) throw new Error('swap buy requires --amount-in.');
      if (minAmountOut === undefined) throw new Error('swap buy requires --min-amount-out.');
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');
      const token = parseAddress(opts.token, 'token');
      const recipient = parseOptionalAddress(opts.recipient, 'recipient');

      log(`Buying token via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token: ${token}`);
      log(`  Amount in: ${amountIn}`);
      log(`  Min out: ${minAmountOut}`);

      const result = await rare.swap.buy({
        token,
        amountIn,
        minAmountOut,
        commands,
        inputs,
        recipient,
        deadline: opts.deadline,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    }));

  return cmd;
}

function swapSellCommand(): Command {
  const cmd = new Command('sell');
  cmd.description('Execute a raw token -> ETH router sell');

  cmd
    .requiredOption('--token <address>', 'token address to sell')
    .option('--amount-in <amount>', 'token amount to sell')
    .option('--min-amount-out <amount>', 'minimum ETH amount out')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--yes', 'skip the interactive transaction confirmation')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(withErrorHandling(async (opts: {
      token: string;
      amountIn?: string;
      minAmountOut?: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadline?: string;
      yes?: boolean;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const amountIn = opts.amountIn;
      const minAmountOut = opts.minAmountOut;
      if (amountIn === undefined) throw new Error('swap sell requires --amount-in.');
      if (minAmountOut === undefined) throw new Error('swap sell requires --min-amount-out.');
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');
      const token = parseAddress(opts.token, 'token');
      const recipient = parseOptionalAddress(opts.recipient, 'recipient');

      log(`Selling token via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token: ${token}`);
      log(`  Amount: ${amountIn}`);
      log(`  Min ETH out: ${minAmountOut}`);

      const result = await rare.swap.sell({
        token,
        amountIn,
        minAmountOut,
        commands,
        inputs,
        recipient,
        deadline: opts.deadline,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    }));

  return cmd;
}

function swapTokensCommand(): Command {
  const cmd = new Command('tokens');
  cmd.alias('swap');
  cmd.description('Execute a raw router token swap');

  cmd
    .requiredOption('--token-in <address>', 'input token address')
    .requiredOption('--amount-in <amount>', 'amount of the input token')
    .requiredOption('--token-out <address>', 'output token address')
    .option('--min-amount-out <amount>', 'minimum output token amount')
    .requiredOption('--commands <hex>', 'raw router commands hex')
    .requiredOption('--inputs-file <path>', 'JSON file containing router input calldata array')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--yes', 'skip the interactive transaction confirmation')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(withErrorHandling(async (opts: {
      tokenIn: string;
      amountIn: string;
      tokenOut: string;
      minAmountOut?: string;
      commands: string;
      inputsFile: string;
      recipient?: string;
      deadline?: string;
      yes?: boolean;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const minAmountOut = opts.minAmountOut;
      if (minAmountOut === undefined) throw new Error('swap swap requires --min-amount-out.');
      const inputs = await readInputsFile(opts.inputsFile);
      const commands = ensureHex(opts.commands, 'commands');
      const tokenIn = parseAddress(opts.tokenIn, 'token-in');
      const tokenOut = parseAddress(opts.tokenOut, 'token-out');
      const recipient = parseOptionalAddress(opts.recipient, 'recipient');

      log(`Swapping via router on ${chain}...`);
      log(`  Router: ${rare.contracts.swapRouter}`);
      log(`  Token in: ${tokenIn}`);
      log(`  Amount in: ${opts.amountIn}`);
      log(`  Token out: ${tokenOut}`);
      log(`  Min out: ${minAmountOut}`);

      const result = await rare.swap.swapTokens({
        tokenIn,
        amountIn: opts.amountIn,
        tokenOut,
        minAmountOut,
        commands,
        inputs,
        recipient,
        deadline: opts.deadline,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
        },
      );
    }));

  return cmd;
}

function swapBuyTokenCommand(): Command {
  const cmd = new Command('buy-token');
  cmd.description('Buy a token with ETH using a canonical liquid route or Uniswap fallback');

  cmd
    .requiredOption('--token <address>', 'token address to buy')
    .option('--amount-in <amount>', 'ETH amount to spend')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-amount-out <amount>', 'override minimum token amount out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'submit the quoted swap and any required approvals without an interactive confirmation')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(withErrorHandling(async (opts: {
      token: string;
      amountIn?: string;
      slippageBps?: string;
      minAmountOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadline?: string;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const quoteOnly = opts.quoteOnly === true;
      const wallet = quoteOnly ? undefined : getWalletClient(chain);
      const rare = wallet === undefined
        ? createRareClient({ publicClient })
        : createRareClient({ publicClient, walletClient: wallet.client });
      const amountIn = opts.amountIn;
      if (amountIn === undefined) throw new Error('swap buy-token requires --amount-in.');
      const token = parseAddress(opts.token, 'token');
      const recipient = opts.recipient ? parseAddress(opts.recipient, 'recipient') : wallet?.account.address;
      const quote = await rare.swap.quoteBuyToken({
        token,
        amountIn,
        minAmountOut: opts.minAmountOut,
        slippageBps: opts.slippageBps,
        recipient,
      });
      const quoteLines = formatTokenTradeQuoteLines({
        chain,
        direction: 'buy',
        token,
        amountLabel: 'ETH in',
        amountIn,
        quote,
        recipient,
        usedMinOutOverride: opts.minAmountOut !== undefined,
      });

      if (quoteOnly) {
        output(
          {
            chain,
            token,
            recipient,
            execution: quote.execution,
            routeSource: quote.routeSource,
            routeDescription: quote.routeDescription,
            ethIn: amountIn,
            estimatedAmountOut: quote.estimatedAmountOut.toString(),
            minAmountOut: quote.minAmountOut.toString(),
            slippageBps: quote.slippageBps,
            commands: quote.execution === 'liquid-router' ? quote.commands : null,
            inputs: quote.execution === 'liquid-router' ? quote.inputs : null,
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
      if (opts.yes !== true) {
        await confirmQuotedSwapExecution('rare swap buy-token');
      }

      log(`Submitting token buy on ${chain}...`);

      const result = await rare.swap.buyToken({
        token,
        amountIn,
        minAmountOut: quote.minAmountOut,
        recipient,
        deadline: opts.deadline,
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
    }));

  return cmd;
}

function swapSellTokenCommand(): Command {
  const cmd = new Command('sell-token');
  cmd.description('Sell a token for ETH using a canonical liquid route or Uniswap fallback');

  cmd
    .requiredOption('--token <address>', 'token address to sell')
    .option('--amount-in <amount>', 'token amount to sell')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-amount-out <amount>', 'override minimum ETH amount out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'submit the quoted swap and any required approvals without an interactive confirmation')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(withErrorHandling(async (opts: {
      token: string;
      amountIn?: string;
      slippageBps?: string;
      minAmountOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadline?: string;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const quoteOnly = opts.quoteOnly === true;
      const wallet = quoteOnly ? undefined : getWalletClient(chain);
      const rare = wallet === undefined
        ? createRareClient({ publicClient })
        : createRareClient({ publicClient, walletClient: wallet.client });
      const amountIn = opts.amountIn;
      if (amountIn === undefined) throw new Error('swap sell-token requires --amount-in.');
      const token = parseAddress(opts.token, 'token');
      const recipient = opts.recipient ? parseAddress(opts.recipient, 'recipient') : wallet?.account.address;
      const quote = await rare.swap.quoteSellToken({
        token,
        amountIn,
        minAmountOut: opts.minAmountOut,
        slippageBps: opts.slippageBps,
        recipient,
      });
      const quoteLines = formatTokenTradeQuoteLines({
        chain,
        direction: 'sell',
        token,
        amountLabel: 'Token in',
        amountIn,
        quote,
        recipient,
        usedMinOutOverride: opts.minAmountOut !== undefined,
      });

      if (quoteOnly) {
        output(
          {
            chain,
            token,
            recipient,
            execution: quote.execution,
            routeSource: quote.routeSource,
            routeDescription: quote.routeDescription,
            tokenIn: amountIn,
            estimatedAmountOut: quote.estimatedAmountOut.toString(),
            minAmountOut: quote.minAmountOut.toString(),
            slippageBps: quote.slippageBps,
            commands: quote.execution === 'liquid-router' ? quote.commands : null,
            inputs: quote.execution === 'liquid-router' ? quote.inputs : null,
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
      if (opts.yes !== true) {
        await confirmQuotedSwapExecution('rare swap sell-token');
      }

      log(`Submitting token sell on ${chain}...`);

      const result = await rare.swap.sellToken({
        token,
        amountIn,
        minAmountOut: quote.minAmountOut,
        recipient,
        deadline: opts.deadline,
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
    }));

  return cmd;
}

function swapBuyRareCommand(): Command {
  const cmd = new Command('buy-rare');
  cmd.description('Buy RARE with ETH using the curated canonical route');

  cmd
    .option('--amount-in <amount>', 'ETH amount to spend')
    .option('--slippage-bps <bps>', 'slippage in basis points (default: 50)')
    .option('--min-amount-out <amount>', 'override minimum RARE out')
    .option('--quote-only', 'show the quote without submitting a transaction')
    .option('--yes', 'submit the quoted swap without an interactive confirmation')
    .option('--recipient <address>', 'recipient address')
    .option('--deadline <seconds>', 'deadline as a unix timestamp in seconds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(withErrorHandling(async (opts: {
      amountIn?: string;
      slippageBps?: string;
      minAmountOut?: string;
      quoteOnly?: boolean;
      yes?: boolean;
      recipient?: string;
      deadline?: string;
      chain?: string;
      chainId?: string;
    }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const quoteOnly = opts.quoteOnly === true;
      const quoteClient = createRareClient({ publicClient });
      const amountIn = opts.amountIn;
      if (amountIn === undefined) throw new Error('swap buy-rare requires --amount-in.');
      const quote = await quoteClient.swap.quoteBuyRare({
        amountIn,
        minAmountOut: opts.minAmountOut,
        slippageBps: opts.slippageBps,
      });
      const wallet = quoteOnly ? undefined : getWalletClient(chain);
      const recipient = opts.recipient ? parseAddress(opts.recipient, 'recipient') : wallet?.account.address;
      const quoteLines = formatBuyRareQuoteLines({
        chain,
        router: quoteClient.contracts.swapRouter,
        eth: amountIn,
        quote,
        recipient,
        usedMinRareOutOverride: opts.minAmountOut !== undefined,
      });

      if (quoteOnly) {
        output(
          {
            chain,
            router: quoteClient.contracts.swapRouter ?? null,
            ethIn: amountIn,
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
      if (opts.yes !== true) {
        await confirmQuotedSwapExecution('rare swap buy-rare');
      }

      if (wallet === undefined) {
        throw new Error('unreachable: swap buy-rare execution requires a wallet.');
      }
      const rare = createRareClient({ publicClient, walletClient: wallet.client });

      log(`Submitting RARE buy on ${chain}...`);

      const result = await rare.swap.buyRare({
        amountIn,
        minAmountOut: quote.minRareOut,
        recipient,
        deadline: opts.deadline,
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
    }));

  return cmd;
}

export function swapCommand(): Command {
  const cmd = new Command('swap');
  cmd.description('Interact with token swap routes');

  cmd.addCommand(swapBuyCommand());
  cmd.addCommand(swapSellCommand());
  cmd.addCommand(swapTokensCommand());
  cmd.addCommand(swapBuyTokenCommand());
  cmd.addCommand(swapSellTokenCommand());
  cmd.addCommand(swapBuyRareCommand());

  return cmd;
}
