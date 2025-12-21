/**
 * CredentialManager - Manage user credentials
 */

import type { Credential, CredentialType } from '@maskid/core';

export interface CredentialManagerConfig {
  storage?: 'local' | 'session';
  encryptionKey?: string;
}

export class CredentialManager {
  private credentials: Map<string, Credential> = new Map();
  private storageKey = 'maskid:credentials';
  private storage: Storage;

  constructor(config: CredentialManagerConfig = {}) {
    this.storage =
      config.storage === 'session'
        ? globalThis.sessionStorage
        : globalThis.localStorage;

    this.loadFromStorage();
  }

  async store(credential: Credential): Promise<void> {
    this.credentials.set(credential.id, credential);
    this.saveToStorage();
  }

  async get(id: string): Promise<Credential | undefined> {
    return this.credentials.get(id);
  }

  async getAll(): Promise<Credential[]> {
    return Array.from(this.credentials.values());
  }

  async getByType(type: CredentialType): Promise<Credential[]> {
    return Array.from(this.credentials.values()).filter((c) => c.type === type);
  }

  async delete(id: string): Promise<void> {
    this.credentials.delete(id);
    this.saveToStorage();
  }

  async clear(): Promise<void> {
    this.credentials.clear();
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = this.storage?.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Credential[];
        for (const cred of parsed) {
          this.credentials.set(cred.id, cred);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage(): void {
    try {
      const toStore = Array.from(this.credentials.values());
      this.storage?.setItem(this.storageKey, JSON.stringify(toStore));
    } catch {
      // Ignore storage errors
    }
  }
}
