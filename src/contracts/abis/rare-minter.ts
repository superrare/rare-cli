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
  {
    inputs: [
      { name: '_contractAddress', type: 'address' },
      { name: '_currencyAddress', type: 'address' },
      { name: '_price', type: 'uint256' },
      { name: '_numMints', type: 'uint8' },
      { name: '_proof', type: 'bytes32[]' },
    ],
    name: 'mintDirectSale',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: '_contractAddress', type: 'address' },
      { indexed: true, name: '_seller', type: 'address' },
      { indexed: true, name: '_buyer', type: 'address' },
      { indexed: false, name: '_tokenIdStart', type: 'uint256' },
      { indexed: false, name: '_tokenIdEnd', type: 'uint256' },
      { indexed: false, name: '_currency', type: 'address' },
      { indexed: false, name: '_price', type: 'uint256' },
    ],
    name: 'MintDirectSale',
    type: 'event',
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
      { name: '_minimum', type: 'uint256' },
      { name: '_endTimestamp', type: 'uint256' },
    ],
    name: 'setContractSellerStakingMinimum',
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
] as const;
