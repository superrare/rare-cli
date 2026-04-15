import { formatEther } from 'viem';
import type { Nft, Collection, NftEvent, Pagination } from './sdk/api.js';

let _jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  _jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return _jsonMode;
}

/**
 * Print data as JSON (if --json) or use the pretty-printer callback.
 * In JSON mode, status/progress messages are suppressed — only the final
 * output() call matters.
 */
export function output(data: unknown, prettyPrint: () => void): void {
  if (_jsonMode) {
    const serialized = JSON.stringify(data, bigintReplacer, 2);
    console.log(serialized);
  } else {
    prettyPrint();
  }
}

/**
 * Print a status/progress message (suppressed in JSON mode).
 */
export function log(message: string): void {
  if (!_jsonMode) {
    console.log(message);
  }
}

// --- Serialization helpers ---

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

// --- NFT pretty-printing ---

export function printNft(nft: Nft): void {
  const name = nft.metadata.name ?? 'Untitled';
  console.log(`\n${name}`);
  console.log(`  ID:       ${nft.universalTokenId}`);
  console.log(`  Contract: ${nft.contractAddress}`);
  console.log(`  Chain:    ${nft.chainId}`);
  console.log(`  Token ID: ${nft.tokenId}`);
  console.log(`  Type:     ${nft.type}`);

  if (nft.creator) {
    console.log(`  Creator:  ${nft.creator.username ?? nft.creator.address}`);
  }
  if (nft.owner) {
    console.log(`  Owner:    ${nft.owner.username ?? nft.owner.address}`);
  }

  if (nft.metadata.description) {
    const desc = nft.metadata.description.length > 120
      ? nft.metadata.description.slice(0, 117) + '...'
      : nft.metadata.description;
    console.log(`  Desc:     ${desc}`);
  }

  if (nft.metadata.tags.length > 0) {
    console.log(`  Tags:     ${nft.metadata.tags.join(', ')}`);
  }

  if (nft.metadata.imageUri) {
    console.log(`  Image:    ${nft.metadata.imageUri}`);
  }

  // Market summary
  if (nft.market.auctions.length > 0) {
    const auction = nft.market.auctions[0];
    const bid = auction.currentBid ? formatCryptoValue(auction.currentBid) : null;
    const reserve = auction.reservePrice ? formatCryptoValue(auction.reservePrice) : null;
    console.log(`  Auction:  ${auction.state}${bid ? ` | bid: ${bid}` : ''}${reserve ? ` | reserve: ${reserve}` : ''}`);
  }
  if (nft.market.listings.length > 0) {
    const listing = nft.market.listings[0];
    console.log(`  Listed:   ${formatCryptoValue(listing.price)}`);
  }
  if (nft.market.offers.length > 0) {
    const offer = nft.market.offers[0];
    console.log(`  Offer:    ${formatCryptoValue(offer.price)} from ${offer.buyer?.username ?? offer.buyerAddress}`);
  }

  if (nft.lastSale) {
    console.log(`  Last sale: ${formatCryptoValue(nft.lastSale.price)}`);
  }
}

export function printNftRow(nft: Nft): void {
  const name = nft.metadata.name ?? 'Untitled';
  const owner = nft.owner?.username ?? nft.owner?.address?.slice(0, 10) ?? '';
  const market = nftMarketSummary(nft);
  console.log(`  ${nft.universalTokenId}  ${name}${owner ? `  (${owner})` : ''}${market ? `  ${market}` : ''}`);
}

function nftMarketSummary(nft: Nft): string {
  const parts: string[] = [];
  if (nft.market.auctions.length > 0) {
    const a = nft.market.auctions[0];
    parts.push(`auction:${a.state}`);
  }
  if (nft.market.listings.length > 0) {
    parts.push(`listed:${formatCryptoValue(nft.market.listings[0].price)}`);
  }
  if (nft.market.offers.length > 0) {
    parts.push(`offer:${formatCryptoValue(nft.market.offers[0].price)}`);
  }
  return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
}

// --- Collection pretty-printing ---

export function printCollection(col: Collection): void {
  const name = col.name ?? 'Unnamed';
  console.log(`\n${name}`);
  console.log(`  ID:         ${col.collectionId}`);
  if (col.symbol) console.log(`  Symbol:     ${col.symbol}`);
  if (col.description) {
    const desc = col.description.length > 120
      ? col.description.slice(0, 117) + '...'
      : col.description;
    console.log(`  Desc:       ${desc}`);
  }
  if (col.owner) {
    console.log(`  Owner:      ${col.owner.username ?? col.owner.address}`);
  }
  console.log(`  Tokens:     ${col.stats.tokenCount}`);
  console.log(`  Collectors: ${col.stats.collectorCount}`);
  if (col.stats.floorPriceUsd != null) {
    console.log(`  Floor:      $${col.stats.floorPriceUsd.toLocaleString()}`);
  }
  if (col.stats.saleVolumeUsd != null) {
    console.log(`  Volume:     $${col.stats.saleVolumeUsd.toLocaleString()}`);
  }
  console.log(`  Chains:     ${col.chainIds.join(', ')}`);
}

export function printCollectionRow(col: Collection): void {
  const name = col.name ?? 'Unnamed';
  const tokens = `${col.stats.tokenCount} tokens`;
  const floor = col.stats.floorPriceUsd != null ? `floor: $${col.stats.floorPriceUsd}` : '';
  console.log(`  ${col.collectionId}  ${name}  ${tokens}${floor ? `  ${floor}` : ''}`);
}

// --- Pagination ---

export function printPagination(pagination: Pagination): void {
  console.log(`\n  Page ${pagination.page}/${pagination.totalPages} (${pagination.totalCount} total)`);
  if (pagination.page < pagination.totalPages) {
    console.log(`  Use --page ${pagination.page + 1} to see next page.`);
  }
}

// --- CryptoValue formatting ---

function formatCryptoValue(cv: { cryptoAmount: string; currency: { symbol: string; decimals: number }; usdAmount: number | null }): string {
  const amount = formatUnits(cv.cryptoAmount, cv.currency.decimals);
  const usd = cv.usdAmount != null ? ` ($${cv.usdAmount.toLocaleString()})` : '';
  return `${amount} ${cv.currency.symbol}${usd}`;
}

function formatUnits(raw: string, decimals: number): string {
  if (decimals === 18) {
    return formatEther(BigInt(raw));
  }
  const n = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

// --- Transaction result ---

export function printTxResult(result: { txHash: string; receipt: { blockNumber: bigint } }, label: string): void {
  console.log(`Transaction sent: ${result.txHash}`);
  console.log(`${label} Block: ${result.receipt.blockNumber}`);
}
