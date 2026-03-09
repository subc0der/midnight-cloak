/**
 * Chrome storage adapter for @midnight-cloak/wallet CredentialManager
 *
 * This adapter wraps EncryptedStorage to provide credential storage
 * for the Chrome extension.
 */

import type { Credential } from '@midnight-cloak/core';
import { EncryptedStorage, VaultData } from './encrypted-storage';

export interface StorageAdapter {
  load(): Promise<Credential[]>;
  save(credentials: Credential[]): Promise<void>;
  clear(): Promise<void>;
}

export class ChromeStorageAdapter implements StorageAdapter {
  private storage: EncryptedStorage;

  constructor(storage: EncryptedStorage) {
    this.storage = storage;
  }

  async load(): Promise<Credential[]> {
    const data = await this.storage.load();
    return (data?.credentials as Credential[]) || [];
  }

  async save(credentials: Credential[]): Promise<void> {
    const currentData = (await this.storage.load()) || { credentials: [] };
    await this.storage.save({
      ...currentData,
      credentials,
    } as VaultData);
  }

  async clear(): Promise<void> {
    await this.storage.save({ credentials: [] });
  }
}
