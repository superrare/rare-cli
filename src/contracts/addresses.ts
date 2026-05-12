import { getAddress, isAddress, zeroAddress, type Address, type Chain } from 'viem';
import { sepolia, mainnet, base, baseSepolia } from 'viem/chains';

export const supportedChains = [
  'mainnet',
  'sepolia',
  'base',
  'base-sepolia',
] as const;

export type SupportedChain = (typeof supportedChains)[number];

export const viemChains: Record<SupportedChain, Chain> = {
  mainnet,
  sepolia,
  base,
  'base-sepolia': baseSepolia,
};

export const chainIds: Record<SupportedChain, number> = {
  mainnet: 1,
  sepolia: 11155111,
  base: 8453,
  'base-sepolia': 84532,
};

export const defaultRpcUrls: Partial<Record<SupportedChain, string>> = {
  mainnet: 'https://eth.llamarpc.com',
  sepolia: 'https://rpc.sepolia.org',
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
};

export type CanonicalV4Pool = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  poolId?: `0x${string}`;
}

export type ContractAddresses = {
  factory: Address;
  auction: Address;
  batchListing?: Address;
  erc721ApprovalManager?: Address;
  liquidFactory?: Address;
  swapRouter?: Address;
  v4Quoter?: Address;
};

export type CanonicalV4Pools = {
  rareEthPool?: CanonicalV4Pool;
  usdcEthPool?: CanonicalV4Pool;
};

export const contractAddresses: Partial<Record<SupportedChain, ContractAddresses>> = {
  sepolia: {
    factory: getAddress('0x3c7526a0975156299ceef369b8ff3c01cc670523'),
    auction: getAddress('0xC8Edc7049b233641ad3723D6C60019D1c8771612'),
    batchListing: getAddress('0xF2bE72d4343beD375Cb6d0E799a3c003163860e0'),
    erc721ApprovalManager: getAddress('0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E'),
    liquidFactory: getAddress('0xfD18C0D99e5b6F89F3538806241C2C0d6FD728Ac'),
    swapRouter: getAddress('0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305'),
    v4Quoter: getAddress('0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227'),
  },
  mainnet: {
    factory: getAddress('0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1'),
    auction: getAddress('0x6D7c44773C52D396F43c2D511B81aa168E9a7a42'),
    batchListing: getAddress('0x6a190885A806D39A0A8C348bfA1ac762D72E608d'),
    erc721ApprovalManager: getAddress('0x4bb0Deea6d1A30C601338aAB776d394C2AE5c0F8'),
    liquidFactory: getAddress('0xd3D8Ca76E8c5547694106378B6e471B4AC8EFC63'),
    swapRouter: getAddress('0xEBd58EdA8408d9EA409f2c2bE8898BD9738f3583'),
    v4Quoter: getAddress('0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203'),
  },
  base: {
    factory: getAddress('0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd'),
    auction: getAddress('0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2'),
  },
  'base-sepolia': {
    factory: getAddress('0x2b181ae0f1aea6fed75591b04991b1a3f9868d51'),
    auction: getAddress('0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2'),
  },
};

export const canonicalV4Pools: Partial<Record<SupportedChain, CanonicalV4Pools>> = {
  sepolia: {
    rareEthPool: {
      currency0: zeroAddress,
      currency1: getAddress('0x197FaeF3f59eC80113e773Bb6206a17d183F97CB'),
      fee: 3000,
      tickSpacing: 60,
      hooks: zeroAddress,
      poolId: '0x781d2707a6eb9cd3bdbea356a0ba90f9c5ef274927f5e72b0060bba5abd94f03',
    },
    usdcEthPool: {
      currency0: zeroAddress,
      currency1: getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
      fee: 3000,
      tickSpacing: 60,
      hooks: zeroAddress,
      poolId: '0x3390c733d8252e864d4ce769398dd3fb8680d1f626719e8d7736d062665f0987',
    },
  },
  mainnet: {
    rareEthPool: {
      currency0: zeroAddress,
      currency1: getAddress('0xba5BDe662c17e2aDFF1075610382B9B691296350'),
      fee: 3000,
      tickSpacing: 60,
      hooks: zeroAddress,
      poolId: '0xc5e82ff54924a7232a3e91ca252d505f4e4417afa2b6a8507dfb691182cd0b16',
    },
    usdcEthPool: {
      currency0: zeroAddress,
      currency1: getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
      fee: 3000,
      tickSpacing: 60,
      hooks: zeroAddress,
      poolId: '0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d',
    },
  },
};

export const currencyNames = ['eth', 'rare', 'usdc'] as const;

export type CurrencyName = (typeof currencyNames)[number];

export const ETH_ADDRESS: Address = zeroAddress;
export const PUBLIC_LISTING_TARGET: Address = zeroAddress;

const currencyAddresses: Record<CurrencyName, Partial<Record<SupportedChain, Address>>> = {
  eth: {
    mainnet: ETH_ADDRESS,
    sepolia: ETH_ADDRESS,
    base: ETH_ADDRESS,
    'base-sepolia': ETH_ADDRESS,
  },
  rare: {
    mainnet: getAddress('0xba5BDe662c17e2aDFF1075610382B9B691296350'),
    sepolia: getAddress('0x197FaeF3f59eC80113e773Bb6206a17d183F97CB'),
    base: getAddress('0x691077c8e8de54ea84efd454630439f99bd8c92f'),
    'base-sepolia': getAddress('0x8b21bC8571d11F7AdB705ad8F6f6BD1deb79cE01'),
  },
  usdc: {
    mainnet: getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    sepolia: getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    base: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    'base-sepolia': getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  },
};

function isCurrencyName(value: string): value is CurrencyName {
  return currencyNames.some((currencyName) => currencyName === value);
}

export function resolveCurrency(input: string, chain: SupportedChain): Address {
  const lower = input.toLowerCase();
  if (isCurrencyName(lower)) {
    const addr = currencyAddresses[lower][chain];
    if (!addr) {
      throw new Error(`Currency "${lower}" is not available on "${chain}".`);
    }
    return addr;
  }
  if (isAddress(input)) {
    return getAddress(input);
  }
  throw new Error(`Unknown currency "${input}". Supported: ${currencyNames.join(', ')} or a 0x address.`);
}

export function getContractAddresses(chain: SupportedChain): ContractAddresses {
  const addresses = contractAddresses[chain];
  if (!addresses) {
    throw new Error(
      `RARE Protocol contracts are not deployed on "${chain}". Supported chains: ${Object.keys(contractAddresses).join(', ')}`
    );
  }
  return addresses;
}

export function getBatchListingAddress(chain: SupportedChain): Address {
  const addresses = getContractAddresses(chain);
  if (!addresses.batchListing) {
    const deployed = Object.entries(contractAddresses)
      .filter(([, set]) => set.batchListing !== undefined)
      .map(([name]) => name);
    throw new Error(
      `Batch listing marketplace is not deployed on "${chain}". Available on: ${deployed.join(', ')}`
    );
  }
  return addresses.batchListing;
}

export function getErc721ApprovalManagerAddress(chain: SupportedChain): Address {
  const addresses = getContractAddresses(chain);
  if (!addresses.erc721ApprovalManager) {
    const deployed = Object.entries(contractAddresses)
      .filter(([, set]) => set.erc721ApprovalManager !== undefined)
      .map(([name]) => name);
    throw new Error(
      `ERC721 approval manager is not deployed on "${chain}". Available on: ${deployed.join(', ')}`
    );
  }
  return addresses.erc721ApprovalManager;
}

export function getCanonicalV4Pools(chain: SupportedChain): CanonicalV4Pools {
  const pools = canonicalV4Pools[chain];
  if (!pools) {
    throw new Error(
      `Canonical V4 pools are not configured for "${chain}". Supported chains: ${Object.keys(canonicalV4Pools).join(', ')}`
    );
  }
  return pools;
}

export function isSupportedChain(value: string): value is SupportedChain {
  return supportedChains.some((chain) => chain === value);
}

export function getLiquidFactoryAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).liquidFactory;
  if (!address) {
    throw new Error(`Liquid Editions factory is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getSwapRouterAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).swapRouter;
  if (!address) {
    throw new Error(`Liquid router is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getV4QuoterAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).v4Quoter;
  if (!address) {
    throw new Error(`Uniswap V4 quoter is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getCanonicalRareEthPool(chain: SupportedChain): CanonicalV4Pool {
  const pool = getCanonicalV4Pools(chain).rareEthPool;
  if (!pool) {
    throw new Error(`Canonical RARE/ETH pool is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return pool;
}

export function getCanonicalUsdcEthPool(chain: SupportedChain): CanonicalV4Pool {
  const pool = getCanonicalV4Pools(chain).usdcEthPool;
  if (!pool) {
    throw new Error(`Canonical USDC/ETH pool is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return pool;
}
