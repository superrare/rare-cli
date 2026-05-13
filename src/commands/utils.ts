import { Command } from 'commander';
import { createUtilsMerkleCommand, createUtilsTreeCommand } from './batch.js';

export function utilsCommand(): Command {
  const cmd = new Command('utils');
  cmd.description('Offline Merkle tree and proof utilities');
  cmd.addCommand(createUtilsTreeCommand());
  cmd.addCommand(createUtilsMerkleCommand());
  return cmd;
}
