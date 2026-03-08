import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getBirthYear(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  getCurrentYear(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  verifyAge(context: __compactRuntime.CircuitContext<PS>, minAge_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  computeAge(birthYear_0: bigint, currentYear_0: bigint): bigint;
  meetsAgeThreshold(birthYear_0: bigint, currentYear_0: bigint, minAge_0: bigint): boolean;
}

export type Circuits<PS> = {
  verifyAge(context: __compactRuntime.CircuitContext<PS>, minAge_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  computeAge(context: __compactRuntime.CircuitContext<PS>,
             birthYear_0: bigint,
             currentYear_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  meetsAgeThreshold(context: __compactRuntime.CircuitContext<PS>,
                    birthYear_0: bigint,
                    currentYear_0: bigint,
                    minAge_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  readonly round: bigint;
  readonly verificationCount: bigint;
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
