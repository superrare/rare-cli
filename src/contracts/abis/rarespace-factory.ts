export const rareSpaceFactoryAbi = [
  {
    inputs: [
      { internalType: 'string', name: '_name', type: 'string' },
      { internalType: 'string', name: '_symbol', type: 'string' },
    ],
    name: 'createRareSpaceNFTContract',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: '_contractAddress', type: 'address' },
      { indexed: true, internalType: 'address', name: '_operator', type: 'address' },
    ],
    name: 'RareSpaceNFTContractCreated',
    type: 'event',
  },
] as const;
