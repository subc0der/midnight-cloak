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

export interface GetAllPendingRequestsMessage {
  type: 'GET_ALL_PENDING_REQUESTS';
}

export interface ApproveVerificationMessage {
  type: 'APPROVE_VERIFICATION';
  requestId?: string;
}

export interface DenyVerificationMessage {
  type: 'DENY_VERIFICATION';
  requestId?: string;
}

export interface PollResponseMessage {
  type: 'POLL_RESPONSE';
  requestId: string;
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

export interface GetAllPendingOffersMessage {
  type: 'GET_ALL_PENDING_OFFERS';
}

export interface AcceptCredentialMessage {
  type: 'ACCEPT_CREDENTIAL';
  offerId?: string;
}

export interface RejectCredentialMessage {
  type: 'REJECT_CREDENTIAL';
  offerId?: string;
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
  | GetAllPendingRequestsMessage
  | ApproveVerificationMessage
  | DenyVerificationMessage
  | PollResponseMessage
  | CredentialOfferMessage
  | GetPendingOfferMessage
  | GetAllPendingOffersMessage
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
