import { EVMGasType } from '@railgun-community/shared-models';

export type FeeHistoryResult = {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  oldestBlock: number;
  reward: string[][];
};

export enum GasHistoryPercentile {
  Low = 10,
  Medium = 20,
  High = 30,
  VeryHigh = 40,
}

export type GasDetails =
  | {
      evmGasType: EVMGasType.Type0 | EVMGasType.Type1;
      gasPrice: bigint;
    }
  | {
      evmGasType: EVMGasType.Type2;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

export type GasDetailsBySpeed = {
  [percentile in GasHistoryPercentile]: GasDetails;
};
