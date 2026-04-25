import {
  encodeAbiParameters,
  encodePacked,
  parseAbiParameters,
  type Address,
} from 'viem';
import type { ResolvedRouteStep, ResolvedV4RouteStep, RouteQuote } from './route-types.js';

const ROUTER_COMMANDS = {
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  V4_SWAP: 0x10,
} as const;

const V4_ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
} as const;

const ROUTER_RECIPIENTS = {
  msgSender: '0x0000000000000000000000000000000000000001',
  addressThis: '0x0000000000000000000000000000000000000002',
} as const satisfies Record<string, Address>;

const ROUTER_AMOUNT_CONSTANTS = {
  openDelta: 0n,
  contractBalance:
    0x8000000000000000000000000000000000000000000000000000000000000000n,
} as const;

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

export function encodeRoute(quote: RouteQuote, amountIn: bigint, currencyIn: Address, currencyOut: Address): {
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
} {
  if (quote.steps.length === 0) {
    throw new Error('Missing route steps.');
  }

  const commandBytes: number[] = [];
  const inputs: `0x${string}`[] = [];
  let stepIndex = 0;

  while (stepIndex < quote.steps.length) {
    const step = quote.steps[stepIndex];
    if (!step) {
      throw new Error('Missing route step.');
    }

    if (step.kind === 'wrapEth') {
      commandBytes.push(ROUTER_COMMANDS.WRAP_ETH);
      inputs.push(encodeWrapEth(ROUTER_RECIPIENTS.addressThis, ROUTER_AMOUNT_CONSTANTS.contractBalance));
      stepIndex += 1;
      continue;
    }

    if (step.kind === 'unwrapWeth') {
      const isFinalCommand = stepIndex === quote.steps.length - 1;
      commandBytes.push(ROUTER_COMMANDS.UNWRAP_WETH);
      inputs.push(
        encodeUnwrapWeth(
          isFinalCommand ? ROUTER_RECIPIENTS.msgSender : ROUTER_RECIPIENTS.addressThis,
          isFinalCommand ? quote.minAmountOut : 0n,
        ),
      );
      stepIndex += 1;
      continue;
    }

    const v4BlockStartIndex = stepIndex;
    const v4Steps: ResolvedV4RouteStep[] = [];
    while (stepIndex < quote.steps.length) {
      const currentStep = quote.steps[stepIndex];
      if (!currentStep || currentStep.kind !== 'v4Swap') {
        break;
      }
      v4Steps.push(currentStep);
      stepIndex += 1;
    }

    const firstStep = v4Steps[0];
    const lastStep = v4Steps[v4Steps.length - 1];
    if (!firstStep || !lastStep) {
      throw new Error('Missing V4 route block.');
    }

    const executionMode: V4BlockExecutionMode =
      v4BlockStartIndex === 0
        ? {
            inputSource: 'user',
            outputTarget: stepIndex === quote.steps.length ? 'user' : 'router',
          }
        : {
            inputSource: 'router',
            outputTarget: stepIndex === quote.steps.length ? 'user' : 'router',
          };

    commandBytes.push(ROUTER_COMMANDS.V4_SWAP);
    inputs.push(
      encodeV4ExactIn({
        steps: v4Steps,
        amountIn:
          executionMode.inputSource === 'user'
            ? amountIn
            : ROUTER_AMOUNT_CONSTANTS.openDelta,
        minAmountOut:
          executionMode.outputTarget === 'user' ? quote.minAmountOut : 0n,
        currencyIn:
          executionMode.inputSource === 'user' ? currencyIn : firstStep.tokenIn,
        currencyOut:
          executionMode.outputTarget === 'user'
            ? currencyOut
            : lastStep.tokenOut,
        executionMode,
      }),
    );
  }

  return {
    commands: encodePacked(commandBytes.map(() => 'uint8'), commandBytes),
    inputs,
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
  steps: ResolvedV4RouteStep[];
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
    const [singleStep] = steps;
    if (!singleStep) {
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
