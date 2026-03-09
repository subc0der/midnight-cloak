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

export interface GetPendingRequestMessage {
  type: 'GET_PENDING_REQUEST';
}

export interface ApproveVerificationMessage {
  type: 'APPROVE_VERIFICATION';
}

export interface DenyVerificationMessage {
  type: 'DENY_VERIFICATION';
}

export interface CredentialOfferMessage {
  type: 'CREDENTIAL_OFFER';
  credential: {
    type: string;
    claims: Record<string, unknown>;
    issuer: string;
    expiresAt: number | null;
  };
  origin: string;
}

export interface GetPendingOfferMessage {
  type: 'GET_PENDING_OFFER';
}

export interface AcceptCredentialMessage {
  type: 'ACCEPT_CREDENTIAL';
}

export interface RejectCredentialMessage {
  type: 'REJECT_CREDENTIAL';
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
  | VerificationRequestMessage
  | GetPendingRequestMessage
  | ApproveVerificationMessage
  | DenyVerificationMessage
  | CredentialOfferMessage
  | GetPendingOfferMessage
  | AcceptCredentialMessage
  | RejectCredentialMessage;

export interface SuccessResponse {
  success: true;
  [key: string]: unknown;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ExtensionResponse = SuccessResponse | ErrorResponse;

// Pending request/offer types for popup
export interface PendingVerificationRequest {
  id: string;
  origin: string;
  policyConfig: {
    type: string;
    minAge?: number;
    [key: string]: unknown;
  };
  timestamp: number;
}

export interface PendingCredentialOffer {
  id: string;
  origin: string;
  credential: {
    type: string;
    claims: Record<string, unknown>;
    issuer: string;
    expiresAt: number | null;
  };
  timestamp: number;
}
