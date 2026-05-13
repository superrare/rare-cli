export const batchOfferAbi = [
  {
    type: 'function',
    name: 'acceptBatchOffer',
    inputs: [
      { name: '_creator', type: 'address', internalType: 'address' },
      { name: '_proof', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: '_rootHash', type: 'bytes32', internalType: 'bytes32' },
      { name: '_contractAddress', type: 'address', internalType: 'address' },
      { name: '_tokenId', type: 'uint256', internalType: 'uint256' },
      { name: '_splitRecipients', type: 'address[]', internalType: 'address payable[]' },
      { name: '_splitRatios', type: 'uint8[]', internalType: 'uint8[]' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'createBatchOffer',
    inputs: [
      { name: '_rootHash', type: 'bytes32', internalType: 'bytes32' },
      { name: '_amount', type: 'uint256', internalType: 'uint256' },
      { name: '_currency', type: 'address', internalType: 'address' },
      { name: '_expiry', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getBatchOffer',
    inputs: [
      { name: 'creator', type: 'address', internalType: 'address' },
      { name: 'rootHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IBatchOffer.BatchOffer',
        components: [
          { name: 'creator', type: 'address', internalType: 'address' },
          { name: 'rootHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'amount', type: 'uint256', internalType: 'uint256' },
          { name: 'currency', type: 'address', internalType: 'address' },
          { name: 'expiry', type: 'uint256', internalType: 'uint256' },
          { name: 'feePercentage', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'revokeBatchOffer',
    inputs: [
      { name: '_rootHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'BatchOfferAccepted',
    inputs: [
      { name: 'seller', type: 'address', indexed: true, internalType: 'address' },
      { name: 'buyer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'contractAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'tokenId', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'rootHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'currency', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BatchOfferCreated',
    inputs: [
      { name: 'creator', type: 'address', indexed: true, internalType: 'address' },
      { name: 'rootHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'currency', type: 'address', indexed: false, internalType: 'address' },
      { name: 'expiry', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BatchOfferRevoked',
    inputs: [
      { name: 'creator', type: 'address', indexed: true, internalType: 'address' },
      { name: 'rootHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'currency', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;
