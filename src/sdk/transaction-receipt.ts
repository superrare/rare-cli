import type { Address, Hash, TransactionReceipt } from 'viem';

type TransactionReceiptClient = {
  waitForTransactionReceipt: (params: { hash: Hash }) => Promise<TransactionReceipt>;
};

export async function waitForSuccessfulTransactionReceipt(
  publicClient: TransactionReceiptClient,
  params: {
    txHash: Hash;
    operation: string;
    marketplace: Address;
    contract?: Address;
    tokenId?: bigint;
  },
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: params.txHash });
  if (receipt.status !== 'success') {
    throw new Error(
      `${params.operation} transaction was confirmed with status "${receipt.status}". ` +
        `Transaction hash: ${params.txHash}. Marketplace: ${params.marketplace}.` +
        `${contextSuffix(params)} Block: ${receipt.blockNumber}.`,
    );
  }

  return receipt;
}

function contextSuffix(params: {
  contract?: Address;
  tokenId?: bigint;
}): string {
  const contract = params.contract === undefined ? '' : ` Contract: ${params.contract}.`;
  const tokenId = params.tokenId === undefined ? '' : ` Token ID: ${params.tokenId.toString()}.`;
  return contract + tokenId;
}
