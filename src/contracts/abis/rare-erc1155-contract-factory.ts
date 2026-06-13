export const rareErc1155ContractFactoryAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'contractAddress', type: 'address' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
    ],
    name: 'RareERC1155ContractCreated',
    type: 'event',
  },
  {
    inputs: [],
    name: 'rareERC1155',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultMinter',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: '_name', type: 'string' },
      { internalType: 'string', name: '_symbol', type: 'string' },
      { internalType: 'string', name: '_baseURI', type: 'string' },
    ],
    name: 'createRareERC1155Contract',
    outputs: [{ internalType: 'address', name: 'clone', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
