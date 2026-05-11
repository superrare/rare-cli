export const rareMinterAbi = [
  {
    inputs: [{ name: '_contractAddress', type: 'address' }],
    name: 'getContractAllowListConfig',
    outputs: [
      {
        components: [
          { name: 'root', type: 'bytes32' },
          { name: 'endTimestamp', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_contractAddress', type: 'address' }],
    name: 'getContractMintLimit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_address', type: 'address' },
    ],
    name: 'getContractMintsPerAddress',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_contractAddress', type: 'address' }],
    name: 'getContractTxLimit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_address', type: 'address' },
    ],
    name: 'getContractTxsPerAddress',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_contractAddress', type: 'address' }],
    name: 'getContractSellerStakingMinimum',
    outputs: [
      {
        components: [
          { name: 'amount', type: 'uint256' },
          { name: 'endTimestamp', type: 'uint256' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_root', type: 'bytes32' },
      { name: '_endTimestamp', type: 'uint256' },
      { name: '_contractAddress', type: 'address' },
    ],
    name: 'setContractAllowListConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_limit', type: 'uint256' },
    ],
    name: 'setContractMintLimit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_limit', type: 'uint256' },
    ],
    name: 'setContractTxLimit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_minimum', type: 'uint256' },
      { name: '_endTimestamp', type: 'uint256' },
    ],
    name: 'setContractSellerStakingMinimum',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
