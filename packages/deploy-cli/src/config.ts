// Configuration for Midnight Cloak deployment CLI
// Based on example-counter patterns

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const currentDir = __dirname;

// Contract configuration - paths to compiled Compact artifacts
export const contractConfig = {
  privateStateStoreName: 'midnight-cloak-private-state',
  ageVerifierZkPath: path.resolve(__dirname, '..', '..', 'contracts', 'src', 'managed', 'age-verifier'),
  credentialRegistryZkPath: path.resolve(__dirname, '..', '..', 'contracts', 'src', 'managed', 'credential-registry'),
};

export interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export class PreprodConfig implements Config {
  logDir = path.resolve(__dirname, '..', 'logs', 'preprod', `${new Date().toISOString()}.log`);
  indexer = 'https://indexer.preprod.midnight.network/api/v3/graphql';
  indexerWS = 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws';
  node = 'https://rpc.preprod.midnight.network';
  proofServer = 'http://127.0.0.1:6300';

  constructor() {
    setNetworkId('preprod');
  }
}

export class PreviewConfig implements Config {
  logDir = path.resolve(__dirname, '..', 'logs', 'preview', `${new Date().toISOString()}.log`);
  indexer = 'https://indexer.preview.midnight.network/api/v3/graphql';
  indexerWS = 'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
  node = 'https://rpc.preview.midnight.network';
  proofServer = 'http://127.0.0.1:6300';

  constructor() {
    setNetworkId('preview');
  }
}

export class StandaloneConfig implements Config {
  logDir = path.resolve(__dirname, '..', 'logs', 'standalone', `${new Date().toISOString()}.log`);
  indexer = 'http://127.0.0.1:8088/api/v3/graphql';
  indexerWS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
  node = 'http://127.0.0.1:9944';
  proofServer = 'http://127.0.0.1:6300';

  constructor() {
    setNetworkId('undeployed');
  }
}
