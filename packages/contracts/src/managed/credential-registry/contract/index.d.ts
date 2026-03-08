import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyOwnership(context: __compactRuntime.CircuitContext<PS>,
                  expectedPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  checkCommitment(context: __compactRuntime.CircuitContext<PS>,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  derivePublicKey(sk_0: Uint8Array): Uint8Array;
  generateCommitment(data_0: Uint8Array, blinder_0: Uint8Array): Uint8Array;
  generateCredentialId(issuer_0: Uint8Array,
                       subject_0: Uint8Array,
                       nonce_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  derivePublicKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyOwnership(context: __compactRuntime.CircuitContext<PS>,
                  expectedPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  checkCommitment(context: __compactRuntime.CircuitContext<PS>,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  generateCommitment(context: __compactRuntime.CircuitContext<PS>,
                     data_0: Uint8Array,
                     blinder_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  generateCredentialId(context: __compactRuntime.CircuitContext<PS>,
                       issuer_0: Uint8Array,
                       subject_0: Uint8Array,
                       nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  registeredCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  readonly totalCredentials: bigint;
  readonly round: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
