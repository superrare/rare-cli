export const collectionMintAbi = [
  {
    inputs: [
      { internalType: 'string', name: '_baseURI', type: 'string' },
      { internalType: 'uint256', name: '_numberOfTokens', type: 'uint256' },
    ],
    name: 'batchMint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: '_baseURI', type: 'string' },
      { internalType: 'uint256', name: '_numberOfTokens', type: 'uint256' },
    ],
    name: 'prepareMint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: '_baseURI', type: 'string' },
      { internalType: 'uint256', name: '_numberOfTokens', type: 'uint256' },
      { internalType: 'address', name: '_minter', type: 'address' },
    ],
    name: 'prepareMintWithMinter',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'fromTokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'toTokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'fromAddress', type: 'address' },
      { indexed: true, internalType: 'address', name: 'toAddress', type: 'address' },
    ],
    name: 'ConsecutiveTransfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'numberOfTokens', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'baseURI', type: 'string' },
    ],
    name: 'PrepareMint',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'startTokenId', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'endTokenId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'baseURI', type: 'string' },
    ],
    name: 'PrepareMint',
    type: 'event',
  },
] as const;
