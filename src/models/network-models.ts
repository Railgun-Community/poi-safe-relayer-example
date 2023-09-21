import {
  RailgunProxyContract,
  RelayAdaptContract,
  RailgunProxyDeploymentBlock,
  FallbackProviderJsonConfig,
} from '@railgun-community/shared-models';
import { CoingeckoNetworkID } from './api-constants';
import { GasTokenConfig } from './token-models';
import { FeeConfig } from './fee-config';

export type Network = {
  name: string;
  proxyContract: RailgunProxyContract;
  relayAdaptContract: RelayAdaptContract;
  deploymentBlock?: RailgunProxyDeploymentBlock;
  fallbackProviderConfig: FallbackProviderJsonConfig;
  gasToken: GasTokenConfig;
  coingeckoNetworkId?: CoingeckoNetworkID;
  priceTTLInMS: number;
  fees: FeeConfig;
  isTestNetwork?: boolean;
  skipQuickScan?: boolean;
  topUp: TopUpConfig;
};

type TopUpConfig = {
  allowMultiTokenTopUp: boolean;
  accumulateNativeToken: boolean;
  shouldNotSwap: string[];
  toleratedSlippage: number;
  maxSpendPercentage: number;
  swapThresholdIntoGasToken: bigint;
  minimumGasBalanceForTopup: bigint;
};