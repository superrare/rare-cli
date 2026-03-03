export type SupportedChain = 'sepolia' | 'mainnet';

export const contractAddresses: Record<
  SupportedChain,
  { factory: `0x${string}`; auction: `0x${string}` }
> = {
  sepolia: {
    factory: '0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992',
    auction: '0xC8Edc7049b233641ad3723D6C60019D1c8771612',
  },
  mainnet: {
    factory: '0x8B0a05d8FCEA149dC2d215342b233962dcc63483',
    auction: '0x6D7c44773C52D396F43c2D511B81aa168E9a7a42',
  },
};
