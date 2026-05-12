export const batchListingAbi = [
  {
    "type": "function",
    "name": "registerSalePriceMerkleRoot",
    "inputs": [
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_currency", "type": "address", "internalType": "address" },
      { "name": "_amount", "type": "uint256", "internalType": "uint256" },
      { "name": "_splitAddresses", "type": "address[]", "internalType": "address payable[]" },
      { "name": "_splitRatios", "type": "uint8[]", "internalType": "uint8[]" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelSalePriceMerkleRoot",
    "inputs": [
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "buyWithMerkleProof",
    "inputs": [
      { "name": "_originContract", "type": "address", "internalType": "address" },
      { "name": "_tokenId", "type": "uint256", "internalType": "uint256" },
      { "name": "_currency", "type": "address", "internalType": "address" },
      { "name": "_amount", "type": "uint256", "internalType": "uint256" },
      { "name": "_creator", "type": "address", "internalType": "address" },
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_proof", "type": "bytes32[]", "internalType": "bytes32[]" },
      { "name": "_allowListProof", "type": "bytes32[]", "internalType": "bytes32[]" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "setAllowListConfig",
    "inputs": [
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_allowListRoot", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_endTimestamp", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getMerkleSalePriceConfig",
    "inputs": [
      { "name": "_creator", "type": "address", "internalType": "address" },
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IRareBatchListingsMarketplace.SalePriceConfig",
        "components": [
          { "name": "currency", "type": "address", "internalType": "address" },
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "splitRecipients", "type": "address[]", "internalType": "address payable[]" },
          { "name": "splitRatios", "type": "uint8[]", "internalType": "uint8[]" },
          { "name": "nonce", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAllowListConfig",
    "inputs": [
      { "name": "_creator", "type": "address", "internalType": "address" },
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IRareBatchListingsMarketplace.AllowListConfig",
        "components": [
          { "name": "root", "type": "bytes32", "internalType": "bytes32" },
          { "name": "endTimestamp", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCreatorSalePriceMerkleRootNonce",
    "inputs": [
      { "name": "_user", "type": "address", "internalType": "address" },
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTokenSalePriceNonce",
    "inputs": [
      { "name": "_creator", "type": "address", "internalType": "address" },
      { "name": "_merkleRoot", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_tokenContract", "type": "address", "internalType": "address" },
      { "name": "_tokenId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUserSalePriceMerkleRoots",
    "inputs": [
      { "name": "_user", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "", "type": "bytes32[]", "internalType": "bytes32[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isTokenInRoot",
    "inputs": [
      { "name": "_root", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_origin", "type": "address", "internalType": "address" },
      { "name": "_tokenId", "type": "uint256", "internalType": "uint256" },
      { "name": "_proof", "type": "bytes32[]", "internalType": "bytes32[]" }
    ],
    "outputs": [
      { "name": "", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "event",
    "name": "SalePriceMerkleRootRegistered",
    "inputs": [
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "merkleRoot", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "currency", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "nonce", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SalePriceMerkleRootCancelled",
    "inputs": [
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "merkleRoot", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MerkleSalePriceExecuted",
    "inputs": [
      { "name": "contractAddress", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "tokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "seller", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "currency", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "merkleRoot", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
      { "name": "nonce", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AllowListConfigSet",
    "inputs": [
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "merkleRoot", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "allowListRoot", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "endTimestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;
