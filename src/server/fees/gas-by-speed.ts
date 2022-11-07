//
// *********************************************
// *********************************************
// *********************************************
// *********************************************
//
//     DANGER  DANGER  DANGER  DANGER  DANGER
//
//
//     DO NOT MODIFY THE LOGIC IN THIS FILE.
//
//     DO NOT MODIFY THE LOGIC IN THIS FILE.
//
//     DO NOT MODIFY THE LOGIC IN THIS FILE.
//
//     DO NOT MODIFY THE LOGIC IN THIS FILE.
//
//
//   This logic comes from private RAILGUN contributor
//   frontend repos, where the logic is managed.
//
//
// *********************************************
// *********************************************
// *********************************************
//

import { BigNumber } from '@ethersproject/bignumber';
import { ChainType } from '@railgun-community/engine';
import Web3, { Eth, FeeHistoryResult } from 'web3-eth';
import { RelayerChain } from '../../models/chain-models';
import { EVMGasType } from '../../models/network-models';
import { maxBigNumber } from '../../util/utils';
import { NetworkChainID } from '../config/config-chains';
import configNetworks from '../config/config-networks';
import { getProviderForNetwork } from '../providers/active-network-providers';
import { web3ProviderFromChainID } from '../providers/web3-providers';

// Hack to get the types to apply correctly.
const Web3Eth = Web3 as unknown as typeof Web3.Eth;

//
// THIS CODE WAS MODIFIED FROM METAMASK (MAY 10 2022):
//
// const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const;
// const PRIORITY_LEVEL_PERCENTILES = [10, 20, 30] as const;
// const SETTINGS_BY_PRIORITY_LEVEL = {
//   low: {
//     percentile: 10 as Percentile,
//     baseFeePercentageMultiplier: new BN(110),
//     priorityFeePercentageMultiplier: new BN(94),
//     minSuggestedMaxPriorityFeePerGas: new BN(1_000_000_000),
//     estimatedWaitTimes: {
//       minWaitTimeEstimate: 15_000,
//       maxWaitTimeEstimate: 30_000,
//     },
//   },
//   medium: {
//     percentile: 20 as Percentile,
//     baseFeePercentageMultiplier: new BN(120),
//     priorityFeePercentageMultiplier: new BN(97),
//     minSuggestedMaxPriorityFeePerGas: new BN(1_500_000_000),
//     estimatedWaitTimes: {
//       minWaitTimeEstimate: 15_000,
//       maxWaitTimeEstimate: 45_000,
//     },
//   },
//   high: {
//     percentile: 30 as Percentile,
//     baseFeePercentageMultiplier: new BN(125),
//     priorityFeePercentageMultiplier: new BN(98),
//     minSuggestedMaxPriorityFeePerGas: new BN(2_000_000_000),
//     estimatedWaitTimes: {
//       minWaitTimeEstimate: 15_000,
//       maxWaitTimeEstimate: 60_000,
//     },
//   },
// };
//

export type GasDetails =
  | {
      evmGasType: EVMGasType.Type0;
      gasPrice: BigNumber;
    }
  | {
      evmGasType: EVMGasType.Type2;
      maxFeePerGas: BigNumber;
      maxPriorityFeePerGas: BigNumber;
    };

export type GasDetailsBySpeed = NumMapType<GasDetails>;

enum GasHistoryPercentile {
  Low = 10,
  Medium = 20,
  High = 30,
}

type SuggestedGasDetails = {
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
};

const HISTORICAL_BLOCK_COUNT = 5;
const REWARD_PERCENTILES: number[] = [
  GasHistoryPercentile.Low,
  GasHistoryPercentile.Medium,
  GasHistoryPercentile.High,
];

// WARNING: TRANSACTIONS RISK BEING REVERTED IF YOU MODIFY THIS.
const SETTINGS_BY_PRIORITY_LEVEL = {
  [GasHistoryPercentile.Low]: {
    baseFeePercentageMultiplier: BigNumber.from(125),
    priorityFeePercentageMultiplier: BigNumber.from(100),
    minSuggestedMaxPriorityFeePerGas: BigNumber.from(1_500_000_000),
  },
  [GasHistoryPercentile.Medium]: {
    baseFeePercentageMultiplier: BigNumber.from(180),
    priorityFeePercentageMultiplier: BigNumber.from(110),
    minSuggestedMaxPriorityFeePerGas: BigNumber.from(2_500_000_000),
  },
  [GasHistoryPercentile.High]: {
    baseFeePercentageMultiplier: BigNumber.from(250),
    priorityFeePercentageMultiplier: BigNumber.from(125),
    minSuggestedMaxPriorityFeePerGas: BigNumber.from(3_000_000_000),
  },
};

const getMedianBigNumber = (feeHistoryOutputs: BigNumber[]): BigNumber => {
  const { length } = feeHistoryOutputs;
  if (length === 0) {
    throw new Error('No fee history outputs');
  }
  const sorted = feeHistoryOutputs.sort((a, b) => {
    return a.sub(b).isNegative() ? -1 : 1;
  });
  // Middle index, rounded down.
  // eg. Should return 2nd item out of 4, 3/5, 3/6 and 4/7, converted to 0-indexed indeces.
  const middleIndex = Math.ceil(length / 2 - 1);
  return sorted[middleIndex];
};

// WARNING: TRANSACTIONS RISK BEING REVERTED IF YOU MODIFY THIS.
const gasHistoryPercentileForChain = (
  chain: RelayerChain,
): GasHistoryPercentile => {
  switch (chain.type) {
    case ChainType.EVM: {
      switch (chain.id) {
        case NetworkChainID.Ethereum:
          return GasHistoryPercentile.Low;
        case NetworkChainID.Hardhat:
          return GasHistoryPercentile.Medium;
        case NetworkChainID.EthereumGoerli:
        case NetworkChainID.BNBChain:
        case NetworkChainID.PolygonPOS:
        case NetworkChainID.PolygonMumbai:
          return GasHistoryPercentile.High;
      }
    }
  }
  throw new Error(`Chain ${chain.type}:${chain.id} unhandled for gas speeds.`);
};

export const getStandardGasDetails = async (chain: RelayerChain) => {
  const { evmGasType } = configNetworks[chain.type][chain.id];

  let gasDetailsBySpeed: GasDetailsBySpeed;
  switch (evmGasType) {
    case EVMGasType.Type0:
      gasDetailsBySpeed = await getGasPricesBySpeed(evmGasType, chain);
      break;
    case EVMGasType.Type2:
      gasDetailsBySpeed = await getHistoricalGasDetailsBySpeed(
        evmGasType,
        chain,
      );
      break;
  }

  if (!gasDetailsBySpeed) {
    throw new Error('Unhandled gas type.');
  }

  const percentile = gasHistoryPercentileForChain(chain);
  return gasDetailsBySpeed[percentile];
};

const gasPriceForPercentile = (
  gasPrice: BigNumber,
  percentile: GasHistoryPercentile,
) => {
  const settings = SETTINGS_BY_PRIORITY_LEVEL[percentile];
  return gasPrice.mul(settings.baseFeePercentageMultiplier).div(100);
};

const getGasPricesBySpeed = async (
  evmGasType: EVMGasType.Type0,
  chain: RelayerChain,
): Promise<GasDetailsBySpeed> => {
  const provider = getProviderForNetwork(chain);
  const gasPrice = await provider.getGasPrice();

  const gasPricesBySpeed: GasDetailsBySpeed = {
    [GasHistoryPercentile.Low]: {
      evmGasType,
      gasPrice: gasPriceForPercentile(gasPrice, GasHistoryPercentile.Low),
    },
    [GasHistoryPercentile.Medium]: {
      evmGasType,
      gasPrice: gasPriceForPercentile(gasPrice, GasHistoryPercentile.Medium),
    },
    [GasHistoryPercentile.High]: {
      evmGasType,
      gasPrice: gasPriceForPercentile(gasPrice, GasHistoryPercentile.High),
    },
  };

  return gasPricesBySpeed;
};

const findHeadBlockInMessage = (message: string): Optional<number> => {
  try {
    const headBlockInMessageSplit = message.split(', head ');
    if (headBlockInMessageSplit.length === 2) {
      const headBlock = parseInt(headBlockInMessageSplit[1], 10);
      if (!Number.isNaN(headBlock)) {
        return headBlock;
      }
    }
    return undefined;
  } catch (err) {
    return undefined;
  }
};

const getFeeHistory = (
  web3Eth: Eth,
  recentBlock?: number,
  retryCount = 0,
): Promise<FeeHistoryResult> => {
  return web3Eth
    .getFeeHistory(
      HISTORICAL_BLOCK_COUNT,
      recentBlock ?? 'latest',
      REWARD_PERCENTILES,
    )
    .catch(async (err) => {
      if (err.message && err.message.includes('request beyond head block')) {
        if (retryCount > 5) {
          throw new Error(
            'Recent on-chain fee history not available. Please refresh and try again.',
          );
        }
        const headBlock = findHeadBlockInMessage(err.message);
        if (headBlock) {
          return getFeeHistory(web3Eth, headBlock, retryCount + 1);
        }

        // eslint-disable-next-line no-param-reassign
        recentBlock = recentBlock ?? (await web3Eth.getBlockNumber()) - 1;
        return getFeeHistory(web3Eth, recentBlock - 1, retryCount + 1);
      }
      throw err;
    });
};

const getHistoricalGasDetailsBySpeed = async (
  evmGasType: EVMGasType.Type2,
  chain: RelayerChain,
): Promise<GasDetailsBySpeed> => {
  const web3Eth = new Web3Eth();
  const provider = web3ProviderFromChainID(chain);
  web3Eth.setProvider(provider);

  const recentBlock = (await web3Eth.getBlockNumber()) - 1;
  const feeHistory = await getFeeHistory(web3Eth, recentBlock);

  const baseFees: BigNumber[] = feeHistory.baseFeePerGas.map((feeHex) =>
    BigNumber.from(feeHex),
  );
  const priorityFeePercentile: NumMapType<BigNumber[]> = {
    [GasHistoryPercentile.Low]: feeHistory.reward.map((feePriorityGroup) =>
      BigNumber.from(feePriorityGroup[0]),
    ),
    [GasHistoryPercentile.Medium]: feeHistory.reward.map((feePriorityGroup) =>
      BigNumber.from(feePriorityGroup[1]),
    ),
    [GasHistoryPercentile.High]: feeHistory.reward.map((feePriorityGroup) =>
      BigNumber.from(feePriorityGroup[2]),
    ),
  };

  const baseFeesMedian: BigNumber = getMedianBigNumber(baseFees);
  const priorityFeePercentileMedians: NumMapType<BigNumber> = {
    [GasHistoryPercentile.Low]: getMedianBigNumber(
      priorityFeePercentile[GasHistoryPercentile.Low],
    ),
    [GasHistoryPercentile.Medium]: getMedianBigNumber(
      priorityFeePercentile[GasHistoryPercentile.Medium],
    ),
    [GasHistoryPercentile.High]: getMedianBigNumber(
      priorityFeePercentile[GasHistoryPercentile.High],
    ),
  };

  const suggestedGasDetails: NumMapType<SuggestedGasDetails> = {
    [GasHistoryPercentile.Low]: getSuggestedGasDetails(
      baseFeesMedian,
      priorityFeePercentileMedians,
      GasHistoryPercentile.Low,
    ),
    [GasHistoryPercentile.Medium]: getSuggestedGasDetails(
      baseFeesMedian,
      priorityFeePercentileMedians,
      GasHistoryPercentile.Medium,
    ),
    [GasHistoryPercentile.High]: getSuggestedGasDetails(
      baseFeesMedian,
      priorityFeePercentileMedians,
      GasHistoryPercentile.High,
    ),
  };

  switch (evmGasType) {
    case EVMGasType.Type2: {
      return {
        [GasHistoryPercentile.Low]: {
          evmGasType,
          ...suggestedGasDetails[GasHistoryPercentile.Low],
        },
        [GasHistoryPercentile.Medium]: {
          evmGasType,
          ...suggestedGasDetails[GasHistoryPercentile.Medium],
        },
        [GasHistoryPercentile.High]: {
          evmGasType,
          ...suggestedGasDetails[GasHistoryPercentile.High],
        },
      };
    }
  }

  throw new Error('Unknown gas type for historical gas estimates');
};

const getSuggestedGasDetails = (
  baseFeesMedian: BigNumber,
  priorityFeePercentileMedians: NumMapType<BigNumber>,
  percentile: GasHistoryPercentile,
): SuggestedGasDetails => {
  const settings = SETTINGS_BY_PRIORITY_LEVEL[percentile];
  const baseFeePerGas = baseFeesMedian
    .mul(settings.baseFeePercentageMultiplier)
    .div(100);
  const maxPriorityFee = priorityFeePercentileMedians[percentile]
    .mul(settings.priorityFeePercentageMultiplier)
    .div(100);
  return {
    maxPriorityFeePerGas: maxBigNumber(
      maxPriorityFee,
      settings.minSuggestedMaxPriorityFeePerGas,
    ),
    maxFeePerGas: baseFeePerGas.add(maxPriorityFee),
  };
};
