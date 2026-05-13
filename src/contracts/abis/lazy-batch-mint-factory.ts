export const lazyBatchMintFactoryAbi = [
  {
    type: 'function',
    name: 'createLazySovereignBatchMint',
    inputs: [
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_symbol', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createLazySovereignBatchMint',
    inputs: [
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_symbol', type: 'string', internalType: 'string' },
      { name: '_maxTokens', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'LazySovereignBatchMintCreated',
    inputs: [
      { name: 'contractAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
] as const;
