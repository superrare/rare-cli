export function withLiveWriteConsent(args: string[]): string[] {
  if (!acceptsLiveWriteConsent(args) || args.includes('--yes')) {
    return args;
  }
  return [...args, '--yes'];
}

function acceptsLiveWriteConsent(args: string[]): boolean {
  const [command, subcommand] = args;
  if (args.includes('--quote-only')) return false;
  if (command === 'deploy') return true;
  if (command === 'liquid-edition') return subcommand === 'deploy' || subcommand === 'set-render-contract';
  if (command === 'listing') {
    if (subcommand === 'create') return true;
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
  if (command === 'batch') {
    if (subcommand === 'offer') {
      const offerSubcommand = args[2];
      return offerSubcommand === 'create' || offerSubcommand === 'revoke' || offerSubcommand === 'accept';
    }
    if (subcommand === 'auction') {
      const auctionSubcommand = args[2];
      return auctionSubcommand === 'create' ||
        auctionSubcommand === 'cancel' ||
        auctionSubcommand === 'bid' ||
        auctionSubcommand === 'settle';
    }
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
    if (subcommand === 'create') return args[2] === 'sovereign' || args[2] === 'lazy-sovereign' || args[2] === 'lazy-batch-mint';
    if (subcommand === 'mint-batch' || subcommand === 'prepare-lazy-mint') return true;
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
  return false;
}

export function isLiveWriteCommand(args: string[]): boolean {
  const [command, subcommand] = args;
  if (args.includes('--quote-only')) return false;
  if (command === 'deploy') return true;
  if (command === 'liquid-edition' && subcommand === 'deploy') return true;
  if (command === 'listing') {
    if (subcommand === 'create' || subcommand === 'cancel' || subcommand === 'buy') return true;
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
  if (command === 'batch') {
    if (subcommand === 'offer') {
      const offerSubcommand = args[2];
      return offerSubcommand === 'create' || offerSubcommand === 'revoke' || offerSubcommand === 'accept';
    }
    if (subcommand === 'auction') {
      const auctionSubcommand = args[2];
      return auctionSubcommand === 'create' ||
        auctionSubcommand === 'cancel' ||
        auctionSubcommand === 'bid' ||
        auctionSubcommand === 'settle';
    }
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
      if (royaltySubcommand === 'set-default-receiver' || royaltySubcommand === 'set-token-receiver') return true;
      if (royaltySubcommand === 'registry') return args[3]?.startsWith('set-') === true;
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
  return false;
}
