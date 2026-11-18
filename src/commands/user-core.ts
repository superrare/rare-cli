import type { UserSelector } from '@rareprotocol/rare-sdk';

export type UserOptions = { address?: string; username?: string; userId?: string };
export function selectUser(address: string | undefined, options: UserOptions): UserSelector {
  if ([address, options.address, options.username, options.userId].filter(value => value !== undefined).length !== 1) {
    throw new Error('Supply exactly one address, --address, --username or --user-id.');
  }
  if (options.userId !== undefined) return { userId: Number(options.userId) };
  if (options.username !== undefined) return { username: options.username };
  return { address: address ?? options.address ?? '' };
}
