export const rareSpaceAbi = [
  {
    inputs: [
      { internalType: 'string', name: '_uri', type: 'string' },
      { internalType: 'address', name: '_receiver', type: 'address' },
      { internalType: 'address', name: '_royaltyReceiver', type: 'address' },
    ],
    name: 'mintTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
] as const;
