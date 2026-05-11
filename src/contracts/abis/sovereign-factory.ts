export const sovereignFactoryAbi = [
  {
    type: 'function',
    name: 'SOVEREIGN_NFT',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ROYALTY_GUARD',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ROYALTY_GUARD_DEADMAN',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createSovereignNFTContract',
    inputs: [
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_symbol', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createSovereignNFTContract',
    inputs: [
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_symbol', type: 'string', internalType: 'string' },
      { name: '_maxTokens', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createSovereignNFTContract',
    inputs: [
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_symbol', type: 'string', internalType: 'string' },
      { name: '_maxTokens', type: 'uint256', internalType: 'uint256' },
      { name: '_contractType', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'SovereignNFTContractCreated',
    inputs: [
      { name: 'contractAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
] as const;
