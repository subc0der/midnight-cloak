/**
 * Message types for communication between popup, background, and content scripts
 */

export interface InitVaultMessage {
  type: 'INIT_VAULT';
  password: string;
}

export interface UnlockVaultMessage {
  type: 'UNLOCK_VAULT';
  password: string;
}

export interface LockVaultMessage {
  type: 'LOCK_VAULT';
}

export interface GetCredentialsMessage {
  type: 'GET_CREDENTIALS';
}

export interface GetCredentialMessage {
  type: 'GET_CREDENTIAL';
  id: string;
}

export interface AddCredentialMessage {
  type: 'ADD_CREDENTIAL';
  credential: unknown;
}

export interface DeleteCredentialMessage {
  type: 'DELETE_CREDENTIAL';
  id: string;
}

export interface UpdateAutoLockMessage {
  type: 'UPDATE_AUTO_LOCK';
  minutes: number;
}

export interface VerificationRequestMessage {
  type: 'VERIFICATION_REQUEST';
  policyConfig: {
    type: string;
    minAge?: number;
    [key: string]: unknown;
  };
  origin: string;
}

export type ExtensionMessage =
  | InitVaultMessage
  | UnlockVaultMessage
  | LockVaultMessage
  | GetCredentialsMessage
  | GetCredentialMessage
  | AddCredentialMessage
  | DeleteCredentialMessage
  | UpdateAutoLockMessage
  | VerificationRequestMessage;

export interface SuccessResponse {
  success: true;
  [key: string]: unknown;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ExtensionResponse = SuccessResponse | ErrorResponse;
