import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import { chainIds } from '@rareprotocol/rare-sdk/contracts/addresses';
import { accountClient, accountCommand, continueDeviceLogin, openVerificationUrl, preflightStorage, printAuthorized, printDeviceRequest, safeSession, storageOptions, withCancellation, type AccountCommandOptions } from '../auth-cli.js';
import { createAuthStore } from '../auth-storage.js';
import { getConfiguredWalletAccount } from '../client.js';
import { getActiveChain } from '../config.js';
import { isJsonMode, output } from '../output.js';
import { planLogin, type LoginOptions } from './auth-core.js';

export function authCommand(): Command {
  const auth = new Command('auth').description('Log in for account/profile access; transaction wallets remain independent');
  auth.addCommand(accountCommand('login')
    .description('Sign in using device approval or an existing configured wallet')
    .option('--wallet', 'sign a login message with the configured wallet (no transaction)')
    .option('--device', 'start browser-approved device login')
    .option('--no-wait', 'save pending request and return approval instructions')
    .option('--no-browser', 'do not launch a browser')
    .option('--poll <request-id>', 'perform one permitted poll of a saved request')
    .option('--resume <request-id>', 'wait for a saved device request')
    .option('--chain <chain>', 'configured wallet chain')
    .option('--chain-id <id>', 'configured wallet chain ID')
    .action(async (opts: AccountCommandOptions & LoginOptions & { wait?: boolean }): Promise<void> => {
      const plan = planLogin({ ...opts, noWait: opts.wait === false }, isJsonMode(), Boolean(process.stdin.isTTY));
      if (!plan.ok) throw new Error(plan.message);
      const config = storageOptions(opts);
      const client = accountClient(config);
      await withCancellation(async signal => {
        if (plan.value.mode === 'wallet') {
          const chain = getActiveChain(opts.chain, opts.chainId);
          const account = getConfiguredWalletAccount(chain);
          await preflightStorage(config);
          const session = await client.auth.loginWithWallet({ address: account.address, chainId: chainIds[chain], signMessage: async message => account.signMessage({ message }), signal });
          printAuthorized(session);
        } else if (plan.value.mode === 'continue') {
          await continueDeviceLogin(client, config, plan.value.requestId, plan.value.wait, signal);
        } else {
          await preflightStorage(config);
          const requestId = randomUUID();
          const pending = createAuthStore({ ...config, pendingRequestId: requestId });
          const authorization = await client.auth.startDeviceAuthorization({ signal });
          await pending.withLock(async () => { await pending.set(authorization); });
          printDeviceRequest(requestId, authorization);
          if (plan.value.openBrowser) await openVerificationUrl(authorization.verificationUri);
          if (plan.value.wait) await continueDeviceLogin(client, config, requestId, true, signal);
        }
      });
    }));
  auth.addCommand(accountCommand('status').description('Show local session metadata; --verify reads the authenticated profile')
    .option('--verify', 'verify remotely, refreshing if needed')
    .action(async (opts: AccountCommandOptions & { verify?: boolean }): Promise<void> => {
      const client = accountClient(storageOptions(opts));
      const session = await client.auth.getSession();
      if (session === null) {
        output({ status: 'signed_out', verified: false }, () => { console.log('Signed out.'); });
        return;
      }
      const profile = opts.verify === true ? await client.profile.get() : undefined;
      const current = opts.verify === true ? await client.auth.getSession() : session;
      output({ status: profile !== undefined ? 'authenticated' : session.refreshBlocked === true ? 'reauthentication_required' : session.expiresAt <= Date.now() ? 'expired' : 'present', verified: profile !== undefined,
        ...(current === null ? {} : safeSession(current)), ...(profile === undefined ? {} : { accountId: profile.accountId, address: profile.address, username: profile.username }) }, () => {
        console.log(profile === undefined ? 'Stored session (not remotely verified).' : `Authenticated as ${profile.username}.`);
      });
    }));
  auth.addCommand(accountCommand('logout').description('Revoke current session and clear credentials; wallet config is preserved')
    .option('--local-only', 'remove local credentials without server revocation')
    .action(async (opts: AccountCommandOptions & { localOnly?: boolean }): Promise<void> => {
      const client = accountClient(storageOptions(opts));
      if (opts.localOnly === true) await client.auth.clearSession();
      else await client.auth.logout();
      output({ status: 'signed_out', revocationRequested: opts.localOnly !== true }, () => { console.log(opts.localOnly === true ? 'Local credentials cleared. Server session was not revoked.' : 'Session revoked and local credentials cleared.'); });
    }));
  return auth;
}
