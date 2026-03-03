export const factoryAbi = [
  {
    name: 'createSovereignNFTContract',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
    ],
    outputs: [{ name: 'contractAddress', type: 'address' }],
  },
  {
    name: 'createSovereignNFTContractWithMaxTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'maxTokens', type: 'uint256' },
    ],
    outputs: [{ name: 'contractAddress', type: 'address' }],
  },
  {
    name: 'SovereignNFTContractCreated',
    type: 'event',
    inputs: [
      { name: 'creator', type: 'address', indexed: true },
      { name: 'contractAddress', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
    ],
  },
] as const;
