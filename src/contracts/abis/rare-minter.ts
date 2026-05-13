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
    name: 'getDirectSaleConfig',
    outputs: [
      {
        components: [
          { name: 'seller', type: 'address' },
          { name: 'currencyAddress', type: 'address' },
          { name: 'price', type: 'uint256' },
          { name: 'startTime', type: 'uint256' },
          { name: 'maxMints', type: 'uint256' },
          { name: 'splitRecipients', type: 'address[]' },
          { name: 'splitRatios', type: 'uint8[]' },
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
      { name: '_contractAddress', type: 'address' },
      { name: '_currencyAddress', type: 'address' },
      { name: '_price', type: 'uint256' },
      { name: '_startTime', type: 'uint256' },
      { name: '_maxMints', type: 'uint256' },
      { name: '_splitRecipients', type: 'address[]' },
      { name: '_splitRatios', type: 'uint8[]' },
    ],
    name: 'prepareMintDirectSale',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
