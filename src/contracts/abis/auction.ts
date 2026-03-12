export const auctionAbi = [
  {
    "type": "function",
    "name": "COLDIE_AUCTION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "NO_AUCTION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SCHEDULED_AUCTION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOffer",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_splitAddresses",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approvedTokenRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IApprovedTokenRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionBids",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "bidder",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "marketplaceFee",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionLengthExtension",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bid",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "buy",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "cancelAuction",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelOffer",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "configureAuction",
    "inputs": [
      {
        "name": "_auctionType",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_startingAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_lengthOfAuction",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_startTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_splitAddresses",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "convertOfferToAuction",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_lengthOfAuction",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_splitAddresses",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAuctionDetails",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSalePrice",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_target",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "_marketplaceSettings",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_royaltyRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_royaltyEngine",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_superRareMarketplace",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_superRareAuctionHouse",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_spaceOperatorRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_approvedTokenRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_payments",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_stakingRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_networkBeneficiary",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "marketplaceSettings",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IMarketplaceSettings"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxAuctionLength",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minimumBidIncreasePercentage",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "networkBeneficiary",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "offer",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_convertible",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "offerCancelationDelay",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "payments",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPayments"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "removeSalePrice",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_target",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "royaltyEngine",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IRoyaltyEngineV1"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "royaltyRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IRoyaltyRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setApprovedTokenRegistry",
    "inputs": [
      {
        "name": "_approvedTokenRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAuctionLengthExtension",
    "inputs": [
      {
        "name": "_auctionLengthExtension",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMarketplaceSettings",
    "inputs": [
      {
        "name": "_marketplaceSettings",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMaxAuctionLength",
    "inputs": [
      {
        "name": "_maxAuctionLength",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinimumBidIncreasePercentage",
    "inputs": [
      {
        "name": "_minimumBidIncreasePercentage",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setNetworkBeneficiary",
    "inputs": [
      {
        "name": "_networkBeneficiary",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setOfferCancelationDelay",
    "inputs": [
      {
        "name": "_offerCancelationDelay",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPayments",
    "inputs": [
      {
        "name": "_payments",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRoyaltyEngine",
    "inputs": [
      {
        "name": "_royaltyEngine",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRoyaltyRegistry",
    "inputs": [
      {
        "name": "_royaltyRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSalePrice",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_listPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_splitAddresses",
        "type": "address[]",
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "internalType": "uint8[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSpaceOperatorRegistry",
    "inputs": [
      {
        "name": "_spaceOperatorRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setStakingRegistry",
    "inputs": [
      {
        "name": "_stakingRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSuperRareAuctionHouse",
    "inputs": [
      {
        "name": "_superRareAuctionHouse",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSuperRareMarketplace",
    "inputs": [
      {
        "name": "_superRareMarketplace",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleAuction",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "spaceOperatorRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ISpaceOperatorRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stakingRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "superRareAuctionHouse",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "superRareMarketplace",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenAuctions",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "auctionCreator",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "creationBlock",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "startingTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lengthOfAuction",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minimumBid",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "auctionType",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenCurrentOffers",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "buyer",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "marketplaceFee",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "convertible",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenSalePrices",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "seller",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "currencyAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AcceptOffer",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_bidder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_seller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_splitAddresses",
        "type": "address[]",
        "indexed": false,
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "indexed": false,
        "internalType": "uint8[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionBid",
    "inputs": [
      {
        "name": "_contractAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_bidder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_startedAuction",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "_newAuctionLength",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_previousBidder",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionSettled",
    "inputs": [
      {
        "name": "_contractAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_bidder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_seller",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CancelAuction",
    "inputs": [
      {
        "name": "_contractAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_auctionCreator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CancelOffer",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_bidder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NewAuction",
    "inputs": [
      {
        "name": "_contractAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_auctionCreator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_startingTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_minimumBid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_lengthOfAuction",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferPlaced",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_bidder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_convertible",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SetSalePrice",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_target",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_splitRecipients",
        "type": "address[]",
        "indexed": false,
        "internalType": "address payable[]"
      },
      {
        "name": "_splitRatios",
        "type": "uint8[]",
        "indexed": false,
        "internalType": "uint8[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Sold",
    "inputs": [
      {
        "name": "_originContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_seller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_currencyAddress",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "_amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
