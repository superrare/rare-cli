export const rareBridgeAbi = [
  {
    type: 'function',
    name: 'getFee',
    inputs: [
      {
        name: '_destinationChainSelector',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: '_destinationChainRecipient',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_distributionData',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: '_extraArgs',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: '_payFeesInLink',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [
      {
        name: 'fee',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'send',
    inputs: [
      {
        name: '_destinationChainSelector',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: '_destinationChainRecipient',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_distributionData',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: '_extraArgs',
        type: 'bytes',
        internalType: 'bytes',
      },
      {
        name: '_payFeesInLink',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'MessageSent',
    inputs: [
      {
        name: 'messageId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'destinationChainSelector',
        type: 'uint64',
        indexed: true,
        internalType: 'uint64',
      },
      {
        name: 'destinationChainRecipient',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'fee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'payFeesInLink',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
] as const;
