import { createRareClient, type RareClient } from '@rareprotocol/rare-cli/client';
import { getContractAddresses, type SupportedChain } from '@rareprotocol/rare-cli/contracts';
import {
  buildUtilsTree,
  type UtilsTreeArtifact,
  type UtilsMerkleProofArtifact,
} from '@rareprotocol/rare-cli/utils';

const supportedChain: SupportedChain = 'sepolia';
const addresses = getContractAddresses(supportedChain);
const tree: UtilsTreeArtifact = buildUtilsTree({
  content: 'contract_address,token_id\n0x1111111111111111111111111111111111111111,1\n',
  format: 'csv',
});
const merkleProof: UtilsMerkleProofArtifact = {
  root: `0x${'00'.repeat(32)}`,
  contract: '0x1111111111111111111111111111111111111111',
  tokenId: '1',
  proof: [],
};
const clientFactory: typeof createRareClient = createRareClient;
declare const maybeClient: RareClient | undefined;

void addresses;
void tree;
void merkleProof;
void clientFactory;
void maybeClient;
