import {
  encodeAbiParameters,
  encodePacked,
  getAddress,
  parseAbiParameters,
  type Address,
} from 'viem';
import type { ResolvedV4RouteStep, RouteQuote } from './route-types.js';

const ROUTER_COMMANDS: Record<'WRAP_ETH' | 'UNWRAP_WETH' | 'V4_SWAP', number> = {
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  V4_SWAP: 0x10,
};

const V4_ACTIONS: Record<
  'SWAP_EXACT_IN_SINGLE' | 'SWAP_EXACT_IN' | 'SETTLE' | 'SETTLE_ALL' | 'TAKE' | 'TAKE_ALL',
  number
> = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
};

const ROUTER_RECIPIENTS: Record<'msgSender' | 'addressThis', Address> = {
  msgSender: getAddress('0x0000000000000000000000000000000000000001'),
  addressThis: getAddress('0x0000000000000000000000000000000000000002'),
};

const ROUTER_AMOUNT_CONSTANTS: Record<'openDelta' | 'contractBalance', bigint> = {
  openDelta: 0n,
  contractBalance:
    0x8000000000000000000000000000000000000000000000000000000000000000n,
};

type V4PathKey = readonly [Address, number, number, Address, `0x${string}`];
type V4ExactInSinglePoolKeyTuple = readonly [Address, Address, number, number, Address];
type V4ExactInSingleTuple = readonly [
  V4ExactInSinglePoolKeyTuple,
  boolean,
  bigint,
  bigint,
  `0x${string}`,
];

type V4BlockExecutionMode = {
  inputSource: 'user' | 'router';
  outputTarget: 'user' | 'router';
};

type EncodedRouteParts = {
  commandBytes: readonly number[];
  inputs: readonly `0x${string}`[];
};

type V4RouteBlock = {
  steps: readonly ResolvedV4RouteStep[];
  nextIndex: number;
};

export function encodeRoute(quote: RouteQuote, amountIn: bigint, currencyIn: Address, currencyOut: Address): {
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
} {
  if (quote.steps.length === 0) {
    throw new Error('Missing route steps.');
  }

  const { commandBytes, inputs } = encodeRouteParts(quote, amountIn, currencyIn, currencyOut, 0);

  return {
    commands: encodePacked(commandBytes.map(() => 'uint8'), [...commandBytes]),
    inputs,
  };
}

function encodeRouteParts(
  quote: RouteQuote,
  amountIn: bigint,
  currencyIn: Address,
  currencyOut: Address,
  stepIndex: number,
): EncodedRouteParts {
  const step = quote.steps[stepIndex];
  if (step === undefined) {
    return { commandBytes: [], inputs: [] };
  }

  if (step.kind === 'wrapEth') {
    return prependRoutePart(
      ROUTER_COMMANDS.WRAP_ETH,
      encodeWrapEth(ROUTER_RECIPIENTS.addressThis, ROUTER_AMOUNT_CONSTANTS.contractBalance),
      encodeRouteParts(quote, amountIn, currencyIn, currencyOut, stepIndex + 1),
    );
  }

  if (step.kind === 'unwrapWeth') {
    const isFinalCommand = stepIndex === quote.steps.length - 1;
    return prependRoutePart(
      ROUTER_COMMANDS.UNWRAP_WETH,
      encodeUnwrapWeth(
        isFinalCommand ? ROUTER_RECIPIENTS.msgSender : ROUTER_RECIPIENTS.addressThis,
        isFinalCommand ? quote.minAmountOut : 0n,
      ),
      encodeRouteParts(quote, amountIn, currencyIn, currencyOut, stepIndex + 1),
    );
  }

  const v4Block = collectV4RouteBlock(quote.steps, stepIndex);
  const firstStep = v4Block.steps[0];
  const lastStep = v4Block.steps[v4Block.steps.length - 1];
  if (firstStep === undefined || lastStep === undefined) {
    throw new Error('Missing V4 route block.');
  }

  const executionMode = getV4ExecutionMode(stepIndex, v4Block.nextIndex, quote.steps.length);
  return prependRoutePart(
    ROUTER_COMMANDS.V4_SWAP,
    encodeV4ExactIn({
      steps: v4Block.steps,
      amountIn: shouldUseOriginalAmountInForV4Block(quote.steps, stepIndex, executionMode)
        ? amountIn
        : ROUTER_AMOUNT_CONSTANTS.openDelta,
      minAmountOut: executionMode.outputTarget === 'user' ? quote.minAmountOut : 0n,
      currencyIn: executionMode.inputSource === 'user' ? currencyIn : firstStep.tokenIn,
      currencyOut: executionMode.outputTarget === 'user' ? currencyOut : lastStep.tokenOut,
      executionMode,
    }),
    encodeRouteParts(quote, amountIn, currencyIn, currencyOut, v4Block.nextIndex),
  );
}

function prependRoutePart(
  commandByte: number,
  input: `0x${string}`,
  rest: EncodedRouteParts,
): EncodedRouteParts {
  return {
    commandBytes: [commandByte, ...rest.commandBytes],
    inputs: [input, ...rest.inputs],
  };
}

function collectV4RouteBlock(
  steps: readonly RouteQuote['steps'][number][],
  startIndex: number,
): V4RouteBlock {
  const step = steps[startIndex];
  if (step?.kind !== 'v4Swap') {
    return { steps: [], nextIndex: startIndex };
  }
  const rest = collectV4RouteBlock(steps, startIndex + 1);
  return {
    steps: [step, ...rest.steps],
    nextIndex: rest.nextIndex,
  };
}

function shouldUseOriginalAmountInForV4Block(
  steps: readonly RouteQuote['steps'][number][],
  stepIndex: number,
  executionMode: V4BlockExecutionMode,
): boolean {
  if (executionMode.inputSource === 'user') {
    return true;
  }

  return stepIndex > 0 && steps[stepIndex - 1]?.kind === 'wrapEth';
}

function getV4ExecutionMode(
  v4BlockStartIndex: number,
  nextIndex: number,
  routeLength: number,
): V4BlockExecutionMode {
  return v4BlockStartIndex === 0
    ? {
        inputSource: 'user',
        outputTarget: nextIndex === routeLength ? 'user' : 'router',
      }
    : {
        inputSource: 'router',
        outputTarget: nextIndex === routeLength ? 'user' : 'router',
      };
}

export function encodeBuyRareRoute(quote: RouteQuote, amountIn: bigint, currencyIn: Address, currencyOut: Address): {
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
} {
  return encodeRoute(quote, amountIn, currencyIn, currencyOut);
}

function encodeWrapEth(recipient: Address, amount: bigint): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amount'),
    [recipient, amount],
  );
}

function encodeUnwrapWeth(recipient: Address, amountMinimum: bigint): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountMinimum'),
    [recipient, amountMinimum],
  );
}

function encodeV4ExactIn({
  steps,
  amountIn,
  minAmountOut,
  currencyIn,
  currencyOut,
  executionMode,
}: {
  steps: readonly ResolvedV4RouteStep[];
  amountIn: bigint;
  minAmountOut: bigint;
  currencyIn: Address;
  currencyOut: Address;
  executionMode: V4BlockExecutionMode;
}): `0x${string}` {
  const pathKeysArray: readonly V4PathKey[] = steps.map((step) => [
    step.tokenOut,
    step.poolKey.fee,
    step.poolKey.tickSpacing,
    step.poolKey.hooks,
    '0x',
  ]);

  const swapParams = encodeAbiParameters(
    parseAbiParameters('(address,(address,uint24,int24,address,bytes)[],uint128,uint128)'),
    [[currencyIn, pathKeysArray, amountIn, minAmountOut]],
  );

  const settleAction =
    executionMode.inputSource === 'user'
      ? V4_ACTIONS.SETTLE_ALL
      : V4_ACTIONS.SETTLE;
  const settleParams =
    executionMode.inputSource === 'user'
      ? encodeAbiParameters(
          parseAbiParameters('address currency, uint128 maxAmount'),
          [currencyIn, amountIn],
        )
      : encodeAbiParameters(
          parseAbiParameters('address currency, uint256 amount, bool payerIsUser'),
          [currencyIn, ROUTER_AMOUNT_CONSTANTS.contractBalance, false],
        );

  const takeAction =
    executionMode.outputTarget === 'user'
      ? V4_ACTIONS.TAKE_ALL
      : V4_ACTIONS.TAKE;
  const takeParams =
    executionMode.outputTarget === 'user'
      ? encodeAbiParameters(
          parseAbiParameters('address currency, uint128 minAmount'),
          [currencyOut, minAmountOut],
        )
      : encodeAbiParameters(
          parseAbiParameters('address currency, address recipient, uint256 amount'),
        [currencyOut, ROUTER_RECIPIENTS.addressThis, ROUTER_AMOUNT_CONSTANTS.openDelta],
      );

  if (executionMode.inputSource === 'router' && steps.length === 1) {
    const singleStep = steps[0];
    if (singleStep === undefined) {
      throw new Error('Missing V4 exact input single step.');
    }

    const actions = encodePacked(
      ['uint8', 'uint8', 'uint8'],
      [settleAction, V4_ACTIONS.SWAP_EXACT_IN_SINGLE, takeAction],
    );

    return encodeAbiParameters(
      parseAbiParameters('bytes actions, bytes[] params'),
      [
        actions,
        [
          settleParams,
          encodeV4ExactInSingle(singleStep, ROUTER_AMOUNT_CONSTANTS.openDelta, minAmountOut),
          takeParams,
        ],
      ],
    );
  }

  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [V4_ACTIONS.SWAP_EXACT_IN, settleAction, takeAction],
  );

  return encodeAbiParameters(
    parseAbiParameters('bytes actions, bytes[] params'),
    [actions, [swapParams, settleParams, takeParams]],
  );
}

function encodeV4ExactInSingle(
  step: ResolvedV4RouteStep,
  amountIn: bigint,
  minAmountOut: bigint,
): `0x${string}` {
  const swapExactInSingleTuple: V4ExactInSingleTuple = [
    [
      step.poolKey.currency0,
      step.poolKey.currency1,
      step.poolKey.fee,
      step.poolKey.tickSpacing,
      step.poolKey.hooks,
    ],
    step.zeroForOne,
    amountIn,
    minAmountOut,
    '0x',
  ];

  return encodeAbiParameters(
    parseAbiParameters('((address,address,uint24,int24,address),bool,uint128,uint128,bytes)'),
    [swapExactInSingleTuple],
  );
}
