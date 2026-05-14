export const royaltyRegistryResolverAbi = [
  {
    inputs: [],
    name: 'royaltyRegistry',
    outputs: [{ internalType: 'contract IRareRoyaltyRegistry', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const royaltyRegistryAbi = [
  {
    inputs: [
      { internalType: 'address', name: '_contractAddress', type: 'address' },
      { internalType: 'uint256', name: '_tokenId', type: 'uint256' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
    ],
    name: 'calculateRoyaltyFee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'contractRoyaltyPercentage',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'contractRoyaltyPercentageSet',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'contractRoyaltyReceiver',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_contractAddress', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'getERC721TokenRoyaltyPercentage',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_contractAddress', type: 'address' }],
    name: 'getPercentageForSetERC721ContractRoyalty',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'iERC721TokenCreator',
    outputs: [{ internalType: 'contract ICreatorRegistry', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'royaltyReceiverOverride',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_contractAddress', type: 'address' },
      { internalType: 'uint8', name: '_percentage', type: 'uint8' },
    ],
    name: 'setPercentageForSetERC721ContractRoyalty',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_receiver', type: 'address' },
      { internalType: 'address', name: '_contractAddress', type: 'address' },
    ],
    name: 'setRoyaltyReceiverForContract',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_receiver', type: 'address' },
      { internalType: 'address', name: '_contractAddress', type: 'address' },
      { internalType: 'uint256', name: '_tokenId', type: 'uint256' },
    ],
    name: 'setRoyaltyReceiverForToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_receiver', type: 'address' }],
    name: 'setRoyaltyReceiverOverride',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_contractAddress', type: 'address' },
      { internalType: 'uint256', name: '_tokenId', type: 'uint256' },
    ],
    name: 'tokenCreator',
    outputs: [{ internalType: 'address payable', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'tokenRoyaltyReceiver',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
