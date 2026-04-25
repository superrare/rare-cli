import { type Address, type Hash } from 'viem';
import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import { liquidRouterAbi } from '../contracts/abis/liquid-router.js';
import { getKnownCanonicalEthPoolKey, getRareAddress } from '../swap/known-pools.js';
import { getLiquidTokenPoolKey } from '../swap/liquid-token.js';
import { quoteRoute } from '../swap/quoter.js';
import { encodeRoute } from '../swap/route-encoding.js';
import {
  requestUniswapApproval,
  requestUniswapQuote,
  requestUniswapSwap,
  type UniswapQuotePayload,
} from '../swap/uniswap-api.js';
import type { ResolvedRoute } from '../swap/route-types.js';
import {
  ensureTokenAllowance,
  getConfiguredAccountAddress,
  getTokenDecimals,
  requireConfiguredAddress,
  requireWallet,
  resolveDeadline,
  sendPreparedTransaction,
  toInteger,
  toTokenAmount,
  toWei,
  validateRouterPayload,
  type RareClientConfig,
} from './internal.js';
import {
  assertRecipientSupportedForUniswapFallback,
  assertRequotedMinAmountOut,
  assertRequestedMinAmountOut,
  assertSupportedUniswapRouting,
  buildBuyRareQuoteFromTokenQuote,
  buildCanonicalEthTradeRoute,
  buildLiquidRouterTradeQuote,
  buildUniswapTradeQuote,
  computeMinAmountOut,
  computeSlippageBpsFromAmounts,
  getQuotedRecipientAmount,
  resolveSlippageBps,
} from '../swap/trade-core.js';
import type {
  BuyRareParams,
  BuyRareQuote,
  BuyTokenParams,
  RareClient,
  SellTokenParams,
  TokenTradeQuote,
} from './client.js';

type TokenTradeDirection = 'buy' | 'sell';

type LocalTokenTradeQuoteDetails = {
  kind: 'local';
  quote: TokenTradeQuote;
};

type UniswapTokenTradeQuoteDetails = {
  kind: 'uniswap';
  quote: TokenTradeQuote;
  rawQuote: UniswapQuotePayload;
  tokenIn: Address;
  tokenOut: Address;
};

type TokenTradeQuoteDetails = LocalTokenTradeQuoteDetails | UniswapTokenTradeQuoteDetails;

async function resolveCanonicalEthTradeRoute(
  publicClient: RareClientConfig['publicClient'],
  chain: SupportedChain,
  token: Address,
  direction: TokenTradeDirection,
): Promise<ResolvedRoute | null> {
  const knownPoolKey = getKnownCanonicalEthPoolKey(chain, token);
  if (knownPoolKey) {
    return buildCanonicalEthTradeRoute({
      chain,
      token,
      direction,
      poolKey: knownPoolKey,
      routeSource: 'known-pool',
    });
  }

  const liquidPoolKey = await getLiquidTokenPoolKey(publicClient, token);
  if (!liquidPoolKey) {
    return null;
  }

  return buildCanonicalEthTradeRoute({
    chain,
    token,
    direction,
    poolKey: liquidPoolKey,
    routeSource: 'liquid-edition',
  });
}

async function buildLocalTokenTradeQuote(
  publicClient: RareClientConfig['publicClient'],
  chain: SupportedChain,
  addresses: { v4Quoter?: Address },
  params:
    | ({ direction: 'buy' } & Pick<BuyTokenParams, 'token' | 'ethAmount' | 'minTokensOut' | 'slippageBps'>)
    | ({ direction: 'sell' } & Pick<SellTokenParams, 'token' | 'tokenAmount' | 'minEthOut' | 'slippageBps'>),
): Promise<LocalTokenTradeQuoteDetails | null> {
  try {
    const route = await resolveCanonicalEthTradeRoute(publicClient, chain, params.token, params.direction);
    if (!route) {
      return null;
    }

    const quoterAddress = requireConfiguredAddress(addresses.v4Quoter, 'Uniswap V4 quoter', chain);
    const amountIn =
      params.direction === 'buy'
        ? toWei(params.ethAmount)
        : await toTokenAmount(publicClient, params.token, params.tokenAmount, 'tokenAmount');
    const defaultSlippageBps = resolveSlippageBps(params.slippageBps);
    const estimatedQuote = await quoteRoute(publicClient, quoterAddress, route, amountIn, 0n);
    const minAmountOut =
      params.direction === 'buy'
        ? params.minTokensOut
          ? await toTokenAmount(publicClient, params.token, params.minTokensOut, 'minTokensOut')
          : computeMinAmountOut(estimatedQuote.amountOut, defaultSlippageBps)
        : params.minEthOut
          ? toWei(params.minEthOut)
          : computeMinAmountOut(estimatedQuote.amountOut, defaultSlippageBps);
    const routeQuote = await quoteRoute(publicClient, quoterAddress, route, amountIn, minAmountOut);
    const { commands, inputs } = encodeRoute(routeQuote, amountIn, route.tokenIn, route.tokenOut);

    return {
      kind: 'local',
      quote: buildLiquidRouterTradeQuote({
        amountIn,
        route,
        routeQuote,
        minAmountOut,
        inputDecimals: await getTokenDecimals(publicClient, route.tokenIn),
        outputDecimals: await getTokenDecimals(publicClient, route.tokenOut),
        defaultSlippageBps,
        usedMinAmountOutOverride:
          (params.direction === 'buy' && params.minTokensOut !== undefined) ||
          (params.direction === 'sell' && params.minEthOut !== undefined),
        commands,
        inputs,
      }),
    };
  } catch {
    return null;
  }
}

async function buildUniswapFallbackTradeQuote(
  publicClient: RareClientConfig['publicClient'],
  chainId: number,
  token: Address,
  accountAddress: Address,
  params:
    | ({ direction: 'buy' } & Pick<BuyTokenParams, 'ethAmount' | 'minTokensOut' | 'slippageBps' | 'recipient'>)
    | ({ direction: 'sell' } & Pick<SellTokenParams, 'tokenAmount' | 'minEthOut' | 'slippageBps' | 'recipient'>),
): Promise<UniswapTokenTradeQuoteDetails> {
  assertRecipientSupportedForUniswapFallback(params.recipient, accountAddress);

  const tokenIn = params.direction === 'buy' ? ETH_ADDRESS : token;
  const tokenOut = params.direction === 'buy' ? token : ETH_ADDRESS;
  const amountIn =
    params.direction === 'buy'
      ? toWei(params.ethAmount)
      : await toTokenAmount(publicClient, token, params.tokenAmount, 'tokenAmount');
  const requestedMinAmountOut =
    params.direction === 'buy'
      ? params.minTokensOut
        ? await toTokenAmount(publicClient, token, params.minTokensOut, 'minTokensOut')
        : undefined
      : params.minEthOut
        ? toWei(params.minEthOut)
        : undefined;
  const defaultSlippageBps = resolveSlippageBps(params.slippageBps);

  let quoteResponse = await requestUniswapQuote({
    chainId,
    tokenIn,
    tokenOut,
    amount: amountIn,
    swapper: accountAddress,
    slippageBps: defaultSlippageBps,
  });

  assertSupportedUniswapRouting(quoteResponse.routing);

  if (requestedMinAmountOut !== undefined) {
    const quotedAmounts = getQuotedRecipientAmount(quoteResponse.quote, accountAddress);
    assertRequestedMinAmountOut(quotedAmounts.estimatedAmountOut, requestedMinAmountOut);

    const derivedSlippageBps = computeSlippageBpsFromAmounts(quotedAmounts.estimatedAmountOut, requestedMinAmountOut);
    quoteResponse = await requestUniswapQuote({
      chainId,
      tokenIn,
      tokenOut,
      amount: amountIn,
      swapper: accountAddress,
      slippageBps: derivedSlippageBps,
    });

    const requotedAmounts = getQuotedRecipientAmount(quoteResponse.quote, accountAddress);
    assertRequotedMinAmountOut(requotedAmounts.minAmountOut, requestedMinAmountOut);
  }

  return {
    kind: 'uniswap',
    rawQuote: quoteResponse.quote,
    tokenIn,
    tokenOut,
    quote: buildUniswapTradeQuote({
      amountIn,
      quote: quoteResponse.quote,
      recipient: accountAddress,
      tokenIn,
      tokenOut,
      inputDecimals: await getTokenDecimals(publicClient, tokenIn),
      outputDecimals: await getTokenDecimals(publicClient, tokenOut),
      routing: quoteResponse.routing,
    }),
  };
}

async function buildTokenTradeQuote(
  publicClient: RareClientConfig['publicClient'],
  chain: SupportedChain,
  chainId: number,
  addresses: { v4Quoter?: Address },
  accountAddress: Address | undefined,
  params:
    | ({ direction: 'buy' } & Pick<BuyTokenParams, 'token' | 'ethAmount' | 'minTokensOut' | 'slippageBps' | 'recipient'>)
    | ({ direction: 'sell' } & Pick<SellTokenParams, 'token' | 'tokenAmount' | 'minEthOut' | 'slippageBps' | 'recipient'>),
): Promise<TokenTradeQuoteDetails> {
  const localQuote = await buildLocalTokenTradeQuote(publicClient, chain, addresses, params);
  if (localQuote) {
    return localQuote;
  }

  if (!accountAddress) {
    throw new Error('An account is required to quote non-canonical token routes via the Uniswap fallback.');
  }

  return buildUniswapFallbackTradeQuote(publicClient, chainId, params.token, accountAddress, params);
}

async function buildBuyRareQuote(
  publicClient: RareClientConfig['publicClient'],
  chain: SupportedChain,
  addresses: { v4Quoter?: Address },
  params: Pick<BuyRareParams, 'ethAmount' | 'minRareOut' | 'slippageBps'>,
): Promise<BuyRareQuote> {
  const rareAddress = getRareAddress(chain);
  const tokenQuote = await buildLocalTokenTradeQuote(publicClient, chain, addresses, {
    direction: 'buy',
    token: rareAddress,
    ethAmount: params.ethAmount,
    minTokensOut: params.minRareOut,
    slippageBps: params.slippageBps,
  });

  if (!tokenQuote) {
    throw new Error('Failed to build the canonical RARE route.');
  }

  return buildBuyRareQuoteFromTokenQuote(rareAddress, tokenQuote.quote);
}

export function createSwapNamespace(
  config: RareClientConfig,
  chain: SupportedChain,
  chainId: number,
  addresses: { swapRouter?: Address; v4Quoter?: Address },
): RareClient['swap'] {
  const { publicClient } = config;

  return {
    async buy(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
      validateRouterPayload(params.commands, params.inputs);

      const recipient = params.recipient ?? accountAddress;
      const ethAmount = toWei(params.ethAmount);
      const minTokensOut = await toTokenAmount(publicClient, params.token, params.minTokensOut, 'minTokensOut');
      const txHash = await walletClient.writeContract({
        address: router,
        abi: liquidRouterAbi,
        functionName: 'buy',
        args: [params.token, recipient, minTokensOut, params.commands, [...params.inputs], resolveDeadline(params.deadline)],
        account,
        chain: undefined,
        value: ethAmount,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async sell(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
      validateRouterPayload(params.commands, params.inputs);

      const tokenAmount = await toTokenAmount(publicClient, params.token, params.tokenAmount, 'tokenAmount');
      const minEthOut = toWei(params.minEthOut);

      await ensureTokenAllowance(publicClient, walletClient, account, accountAddress, params.token, router, tokenAmount);

      const txHash = await walletClient.writeContract({
        address: router,
        abi: liquidRouterAbi,
        functionName: 'sell',
        args: [
          params.token,
          tokenAmount,
          params.recipient ?? accountAddress,
          minEthOut,
          params.commands,
          [...params.inputs],
          resolveDeadline(params.deadline),
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async swap(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
      validateRouterPayload(params.commands, params.inputs);

      const amountIn = await toTokenAmount(publicClient, params.tokenIn, params.amountIn, 'amountIn');
      const minAmountOut = await toTokenAmount(publicClient, params.tokenOut, params.minAmountOut, 'minAmountOut');

      if (params.tokenIn !== ETH_ADDRESS) {
        await ensureTokenAllowance(publicClient, walletClient, account, accountAddress, params.tokenIn, router, amountIn);
      }

      const txHash = await walletClient.writeContract({
        address: router,
        abi: liquidRouterAbi,
        functionName: 'swap',
        args: [
          params.tokenIn,
          amountIn,
          params.tokenOut,
          params.recipient ?? accountAddress,
          minAmountOut,
          params.commands,
          [...params.inputs],
          resolveDeadline(params.deadline),
        ],
        account,
        chain: undefined,
        value: params.tokenIn === ETH_ADDRESS ? amountIn : undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async quoteBuyToken(params) {
      const quote = await buildTokenTradeQuote(
        publicClient,
        chain,
        chainId,
        addresses,
        getConfiguredAccountAddress(config),
        {
          direction: 'buy',
          token: params.token,
          ethAmount: params.ethAmount,
          minTokensOut: params.minTokensOut,
          slippageBps: params.slippageBps,
          recipient: params.recipient,
        },
      );
      return quote.quote;
    },

    async buyToken(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const quoteDetails = await buildTokenTradeQuote(publicClient, chain, chainId, addresses, accountAddress, {
        direction: 'buy',
        token: params.token,
        ethAmount: params.ethAmount,
        minTokensOut: params.minTokensOut,
        slippageBps: params.slippageBps,
        recipient: params.recipient,
      });

      if (quoteDetails.kind === 'local') {
        const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
        if (!quoteDetails.quote.commands || !quoteDetails.quote.inputs) {
          throw new Error('Missing encoded route for liquid-router execution.');
        }

        const txHash = await walletClient.writeContract({
          address: router,
          abi: liquidRouterAbi,
          functionName: 'buy',
          args: [
            params.token,
            params.recipient ?? accountAddress,
            quoteDetails.quote.minAmountOut,
            quoteDetails.quote.commands,
            [...quoteDetails.quote.inputs],
            resolveDeadline(params.deadline),
          ],
          account,
          chain: undefined,
          value: quoteDetails.quote.amountIn,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return {
          txHash,
          receipt,
          estimatedAmountOut: quoteDetails.quote.estimatedAmountOut,
          minAmountOut: quoteDetails.quote.minAmountOut,
          routeSource: quoteDetails.quote.routeSource,
          execution: quoteDetails.quote.execution,
          commands: quoteDetails.quote.commands,
          inputs: quoteDetails.quote.inputs,
        };
      }

      const swapResponse = await requestUniswapSwap({
        quote: quoteDetails.rawQuote,
        deadline: params.deadline === undefined ? undefined : Number(toInteger(params.deadline, 'deadline')),
      });
      const sent = await sendPreparedTransaction(publicClient, walletClient, account, swapResponse.swap);
      return {
        ...sent,
        estimatedAmountOut: quoteDetails.quote.estimatedAmountOut,
        minAmountOut: quoteDetails.quote.minAmountOut,
        routeSource: quoteDetails.quote.routeSource,
        execution: quoteDetails.quote.execution,
      };
    },

    async quoteSellToken(params) {
      const quote = await buildTokenTradeQuote(
        publicClient,
        chain,
        chainId,
        addresses,
        getConfiguredAccountAddress(config),
        {
          direction: 'sell',
          token: params.token,
          tokenAmount: params.tokenAmount,
          minEthOut: params.minEthOut,
          slippageBps: params.slippageBps,
          recipient: params.recipient,
        },
      );
      return quote.quote;
    },

    async sellToken(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const quoteDetails = await buildTokenTradeQuote(publicClient, chain, chainId, addresses, accountAddress, {
        direction: 'sell',
        token: params.token,
        tokenAmount: params.tokenAmount,
        minEthOut: params.minEthOut,
        slippageBps: params.slippageBps,
        recipient: params.recipient,
      });

      if (quoteDetails.kind === 'local') {
        const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
        if (!quoteDetails.quote.commands || !quoteDetails.quote.inputs) {
          throw new Error('Missing encoded route for liquid-router execution.');
        }

        const tokenAmount = await toTokenAmount(publicClient, params.token, params.tokenAmount, 'tokenAmount');
        await ensureTokenAllowance(publicClient, walletClient, account, accountAddress, params.token, router, tokenAmount);

        const txHash = await walletClient.writeContract({
          address: router,
          abi: liquidRouterAbi,
          functionName: 'sell',
          args: [
            params.token,
            tokenAmount,
            params.recipient ?? accountAddress,
            quoteDetails.quote.minAmountOut,
            quoteDetails.quote.commands,
            [...quoteDetails.quote.inputs],
            resolveDeadline(params.deadline),
          ],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return {
          txHash,
          receipt,
          estimatedAmountOut: quoteDetails.quote.estimatedAmountOut,
          minAmountOut: quoteDetails.quote.minAmountOut,
          routeSource: quoteDetails.quote.routeSource,
          execution: quoteDetails.quote.execution,
          commands: quoteDetails.quote.commands,
          inputs: quoteDetails.quote.inputs,
        };
      }

      const approval = await requestUniswapApproval({
        chainId,
        walletAddress: accountAddress,
        token: params.token,
        amount: quoteDetails.quote.amountIn,
        tokenOut: ETH_ADDRESS,
      });
      let approvalResetTxHash: Hash | undefined;
      if (approval.cancel) {
        const resetTx = await sendPreparedTransaction(publicClient, walletClient, account, approval.cancel);
        approvalResetTxHash = resetTx.txHash;
      }

      let approvalTxHash: Hash | undefined;
      if (approval.approval) {
        const approvalTx = await sendPreparedTransaction(publicClient, walletClient, account, approval.approval);
        approvalTxHash = approvalTx.txHash;
      }

      const swapResponse = await requestUniswapSwap({
        quote: quoteDetails.rawQuote,
        deadline: params.deadline === undefined ? undefined : Number(toInteger(params.deadline, 'deadline')),
      });
      const sent = await sendPreparedTransaction(publicClient, walletClient, account, swapResponse.swap);
      return {
        ...sent,
        estimatedAmountOut: quoteDetails.quote.estimatedAmountOut,
        minAmountOut: quoteDetails.quote.minAmountOut,
        routeSource: quoteDetails.quote.routeSource,
        execution: quoteDetails.quote.execution,
        approvalTxHash,
        approvalResetTxHash,
      };
    },

    async quoteBuyRare(params) {
      return buildBuyRareQuote(publicClient, chain, addresses, params);
    },

    async buyRare(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const router = requireConfiguredAddress(addresses.swapRouter, 'Liquid router', chain);
      const quote = await buildBuyRareQuote(publicClient, chain, addresses, params);

      const txHash = await walletClient.writeContract({
        address: router,
        abi: liquidRouterAbi,
        functionName: 'buy',
        args: [quote.rareAddress, params.recipient ?? accountAddress, quote.minRareOut, quote.commands, [...quote.inputs], resolveDeadline(params.deadline)],
        account,
        chain: undefined,
        value: quote.ethAmount,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return {
        txHash,
        receipt,
        estimatedRareOut: quote.estimatedRareOut,
        minRareOut: quote.minRareOut,
        commands: quote.commands,
        inputs: quote.inputs,
      };
    },
  };
}
