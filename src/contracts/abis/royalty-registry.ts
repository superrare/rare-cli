export const royaltyRegistryAbi = [
  {
    inputs: [{ internalType: 'address', name: 'tokenAddress', type: 'address' }],
    name: 'getRoyaltyLookupAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'tokenAddress', type: 'address' }],
    name: 'overrideAllowed',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
      { internalType: 'address', name: 'royaltyLookupAddress', type: 'address' },
    ],
    name: 'setRoyaltyLookupAddress',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: false, internalType: 'address', name: 'tokenAddress', type: 'address' },
      { indexed: false, internalType: 'address', name: 'royaltyAddress', type: 'address' },
    ],
    name: 'RoyaltyOverride',
    type: 'event',
  },
] as const;
