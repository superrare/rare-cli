import { createRareClient, type BridgeNamespace, type RareClient } from '@rareprotocol/rare-cli/client';
import { getContractAddresses, getRareBridgeAddress, getCcipChainSelector, type SupportedChain } from '@rareprotocol/rare-cli/contracts';
import {
  buildUtilsTree,
  type UtilsTreeArtifact,
  type UtilsMerkleProofArtifact,
} from '@rareprotocol/rare-cli/utils';

const supportedChain: SupportedChain = 'sepolia';
const addresses = getContractAddresses(supportedChain);
const rareBridgeAddress = getRareBridgeAddress(supportedChain);
const ccipChainSelector = getCcipChainSelector(supportedChain);
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
declare const maybeBridge: BridgeNamespace | undefined;

void addresses;
void rareBridgeAddress;
void ccipChainSelector;
void tree;
void merkleProof;
void clientFactory;
void maybeClient;
void maybeBridge;
