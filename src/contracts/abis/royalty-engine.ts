export const royaltyEngineAbi = [
  {
    inputs: [],
    name: 'royaltyRegistry',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'getRoyaltyView',
    outputs: [
      { internalType: 'address payable[]', name: 'recipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'getRoyalty',
    outputs: [
      { internalType: 'address payable[]', name: 'recipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'tokenAddress', type: 'address' }],
    name: 'getCachedRoyaltySpec',
    outputs: [{ internalType: 'int16', name: '', type: 'int16' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'tokenAddress', type: 'address' }],
    name: 'invalidateCachedRoyaltySpec',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
