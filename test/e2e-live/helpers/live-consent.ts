export function withLiveWriteConsent(args: string[]): string[] {
  if (!acceptsLiveWriteConsent(args) || args.includes('--yes')) {
    return args;
  }
  return [...args, '--yes'];
}

function acceptsLiveWriteConsent(args: string[]): boolean {
  const [command, subcommand] = args;
  if (args.includes('--quote-only')) return false;
  if (command === 'liquid-edition') return subcommand === 'deploy';
  if (command === 'listing') {
    if (subcommand === 'create' || subcommand === 'buy') return true;
    if (subcommand === 'erc1155') {
      const erc1155Subcommand = args[2];
      if (erc1155Subcommand === 'create' || erc1155Subcommand === 'buy') return true;
      if (erc1155Subcommand !== 'release') return false;
      const releaseSubcommand = args[3];
      return releaseSubcommand === 'configure' || releaseSubcommand === 'mint';
    }
    if (subcommand === 'batch') {
      const batchListingSubcommand = args[2];
      return batchListingSubcommand === 'create' ||
        batchListingSubcommand === 'buy';
    }
    if (subcommand !== 'release') return false;
    const releaseSubcommand = args[2];
    return releaseSubcommand === 'mint';
  }
  if (command === 'auction') {
    if (subcommand === 'batch') {
      const batchAuctionSubcommand = args[2];
      return batchAuctionSubcommand === 'create' ||
        batchAuctionSubcommand === 'bid';
    }
    return subcommand === 'create' || subcommand === 'bid';
  }
  if (command === 'offer') {
    if (subcommand === 'erc1155') {
      const erc1155Subcommand = args[2];
      return erc1155Subcommand === 'create' || erc1155Subcommand === 'accept';
    }
    if (subcommand === 'batch') {
      const batchOfferSubcommand = args[2];
      return batchOfferSubcommand === 'create' ||
        batchOfferSubcommand === 'accept';
    }
    return subcommand === 'create' || subcommand === 'accept';
  }
  if (command === 'swap') {
    return subcommand === 'buy' ||
      subcommand === 'sell' ||
      subcommand === 'swap' ||
      subcommand === 'buy-token' ||
      subcommand === 'sell-token' ||
      subcommand === 'buy-rare';
  }
  if (command === 'bridge') {
    return subcommand === 'send';
  }
  return false;
}

export function isLiveWriteCommand(args: string[]): boolean {
  const [command, subcommand] = args;
  if (args.includes('--quote-only')) return false;
  if (command === 'liquid-edition') {
    return subcommand === 'deploy' || subcommand === 'set-render-contract';
  }
  if (command === 'listing') {
    if (subcommand === 'create' || subcommand === 'cancel' || subcommand === 'buy') return true;
    if (subcommand === 'erc1155') {
      const erc1155Subcommand = args[2];
      if (erc1155Subcommand === 'create' || erc1155Subcommand === 'cancel' || erc1155Subcommand === 'buy') return true;
      if (erc1155Subcommand !== 'release') return false;
      const releaseSubcommand = args[3];
      if (releaseSubcommand === 'configure' || releaseSubcommand === 'mint') return true;
      if (releaseSubcommand === 'allowlist') return args[4] === 'set' || args[4] === 'clear';
      if (releaseSubcommand === 'limits') return args[4]?.startsWith('set-') === true;
      return false;
    }
    if (subcommand === 'batch') {
      const batchListingSubcommand = args[2];
      return batchListingSubcommand === 'create' ||
        batchListingSubcommand === 'cancel' ||
        batchListingSubcommand === 'buy' ||
        batchListingSubcommand === 'set-allowlist';
    }
    if (subcommand !== 'release') return false;
    const releaseSubcommand = args[2];
    if (releaseSubcommand === 'configure' || releaseSubcommand === 'mint') return true;
    if (releaseSubcommand === 'allowlist') return args[3] === 'set' || args[3] === 'clear';
    if (releaseSubcommand === 'limits') return args[3]?.startsWith('set-') === true;
    return false;
  }
  if (command === 'auction') {
    if (subcommand === 'batch') {
      const batchAuctionSubcommand = args[2];
      return batchAuctionSubcommand === 'create' ||
        batchAuctionSubcommand === 'cancel' ||
        batchAuctionSubcommand === 'bid' ||
        batchAuctionSubcommand === 'settle';
    }
    return subcommand === 'create' || subcommand === 'cancel' || subcommand === 'bid' || subcommand === 'settle';
  }
  if (command === 'offer') {
    if (subcommand === 'erc1155') {
      const erc1155Subcommand = args[2];
      return erc1155Subcommand === 'create' || erc1155Subcommand === 'cancel' || erc1155Subcommand === 'accept';
    }
    if (subcommand === 'batch') {
      const batchOfferSubcommand = args[2];
      return batchOfferSubcommand === 'create' ||
        batchOfferSubcommand === 'revoke' ||
        batchOfferSubcommand === 'accept';
    }
    return subcommand === 'create' || subcommand === 'cancel' || subcommand === 'accept';
  }
  if (command === 'collection') {
    if (subcommand === 'deploy') return true;
    if (subcommand === 'erc1155') {
      const erc1155Subcommand = args[2];
      if (erc1155Subcommand === 'create-token' || erc1155Subcommand === 'mint' || erc1155Subcommand === 'mint-batch') {
        return true;
      }
      if (erc1155Subcommand === 'minter') return args[3] === 'set';
    }
    if (subcommand === 'create' || subcommand === 'mint' || subcommand === 'mint-batch' || subcommand === 'prepare-lazy-mint') {
      return true;
    }
    if (subcommand === 'metadata') {
      const metadataSubcommand = args[2];
      return metadataSubcommand === 'update-base-uri' ||
        metadataSubcommand === 'update-token-uri' ||
        metadataSubcommand === 'lock-base-uri';
    }
    if (subcommand === 'royalty') {
      const royaltySubcommand = args[2];
      if (
        royaltySubcommand === 'set-default-receiver' ||
        royaltySubcommand === 'set-default-percentage' ||
        royaltySubcommand === 'set-token-receiver'
      ) return true;
    }
    return false;
  }
  if (command === 'swap') {
    return subcommand === 'buy' ||
      subcommand === 'sell' ||
      subcommand === 'swap' ||
      subcommand === 'buy-token' ||
      subcommand === 'sell-token' ||
      subcommand === 'buy-rare';
  }
  if (command === 'bridge') {
    return subcommand === 'send';
  }
  return false;
}
