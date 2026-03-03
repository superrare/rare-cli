export const auctionAbi = [
  {
    name: 'configureAuction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'startingPrice', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'currency', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'bid',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'settleAuction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelAuction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'getAuctionDetails',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'startingPrice', type: 'uint256' },
      { name: 'currentBid', type: 'uint256' },
      { name: 'currentBidder', type: 'address' },
      { name: 'endTime', type: 'uint256' },
      { name: 'currency', type: 'address' },
      { name: 'settled', type: 'bool' },
    ],
  },
  {
    name: 'AuctionConfigured',
    type: 'event',
    inputs: [
      { name: 'contractAddress', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'startingPrice', type: 'uint256', indexed: false },
      { name: 'duration', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BidPlaced',
    type: 'event',
    inputs: [
      { name: 'contractAddress', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'bidder', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'AuctionSettled',
    type: 'event',
    inputs: [
      { name: 'contractAddress', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'winner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
