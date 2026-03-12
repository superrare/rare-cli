export type SupportedChain = 'sepolia' | 'mainnet';

export const contractAddresses: Record<
  SupportedChain,
  { factory: `0x${string}`; auction: `0x${string}` }
> = {
  sepolia: {
    factory: '0x3c7526a0975156299ceef369b8ff3c01cc670523',
    auction: '0xC8Edc7049b233641ad3723D6C60019D1c8771612',
  },
  mainnet: {
    factory: '0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1',
    auction: '0x6D7c44773C52D396F43c2D511B81aa168E9a7a42',
  },
};
