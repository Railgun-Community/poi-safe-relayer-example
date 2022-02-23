import { BigNumber } from 'ethers';
import { NetworkChainID } from '../config/config-chain-ids';
import configDefaults from '../config/config-defaults';
import configNetworks from '../config/config-networks';
import { NetworkFeeSettings } from '../../models/network-models';
import { GasTokenConfig, Token } from '../../models/token-models';
import {
  allTokenAddressesForNetwork,
  getTransactionTokens,
} from '../tokens/network-tokens';
import {
  getTransactionTokenPrices,
  TokenPrice,
} from '../tokens/token-price-cache';
import { cacheUnitFeesForTokens } from './transaction-fee-cache';

export const getAllUnitTokenFeesForChain = (
  chainID: NetworkChainID,
): { fees: MapType<BigNumber>; feeCacheID: string } => {
  const tokenAddresses = allTokenAddressesForNetwork(chainID);
  const tokenFeesForChain: MapType<BigNumber> = {};
  tokenAddresses.forEach((tokenAddress) => {
    try {
      tokenFeesForChain[tokenAddress] = calculateTokenFeePerUnitGasToken(
        chainID,
        tokenAddress,
      );
    } catch (err: any) {
      // No op.
    }
  });
  const feeCacheID = cacheUnitFeesForTokens(chainID, tokenFeesForChain);
  return { fees: tokenFeesForChain, feeCacheID };
};

export const calculateTokenFeePerUnitGasToken = (
  chainID: NetworkChainID,
  tokenAddress: string,
) => {
  const networkConfig = configNetworks[chainID];
  const { gasToken } = networkConfig;
  const oneUnitGas = BigNumber.from(10).pow(BigNumber.from(gasToken.decimals));

  return getTokenFee(chainID, oneUnitGas, tokenAddress);
};

export const getTokenFee = (
  chainID: NetworkChainID,
  maximumGas: BigNumber,
  tokenAddress: string,
) => {
  const { precision } = configDefaults.transactionFees;
  const { roundedPriceRatio, decimalRatio } = getTokenRatiosFromCachedPrices(
    chainID,
    tokenAddress,
    precision,
  );
  return maximumGas
    .mul(roundedPriceRatio)
    .div(decimalRatio)
    .div(BigNumber.from(precision));
};

const getTokenRatiosFromCachedPrices = (
  chainID: NetworkChainID,
  tokenAddress: string,
  precision: number,
) => {
  const networkConfig = configNetworks[chainID];
  const { token, gasToken } = getTransactionTokens(chainID, tokenAddress);
  const { tokenPrice, gasTokenPrice } = getTransactionTokenPrices(
    chainID,
    token,
    gasToken,
  );

  const roundedPriceRatio = getRoundedTokenToGasPriceRatio(
    tokenPrice,
    gasTokenPrice,
    networkConfig.fees,
    precision,
  );
  const decimalRatio = getTransactionTokenToGasDecimalRatio(token, gasToken);

  return { roundedPriceRatio, decimalRatio };
};

export const getRoundedTokenToGasPriceRatio = (
  tokenPrice: TokenPrice,
  gasTokenPrice: TokenPrice,
  fees: NetworkFeeSettings,
  precision: number,
): BigNumber => {
  const priceRatio = gasTokenPrice.price / tokenPrice.price;
  const slippage = priceRatio * fees.slippageBuffer;
  const profit = priceRatio * fees.slippageBuffer;
  const totalFeeRatio = priceRatio + slippage + profit;
  const ratioMinimum = configDefaults.transactionFees.priceRatioMinimum;

  const ratio = totalFeeRatio * precision;
  if (ratio < ratioMinimum) {
    throw new Error(
      `Price ratio between token (${tokenPrice.price}) and gas token (${gasTokenPrice.price})
      is not precise enough to provide an accurate fee.`,
    );
  }

  const roundedPriceRatio = BigNumber.from(Math.round(ratio));
  return roundedPriceRatio;
};

export const getTransactionTokenToGasDecimalRatio = (
  token: Token,
  gasToken: GasTokenConfig,
): BigNumber => {
  const decimalDifference = gasToken.decimals - token.decimals;
  return BigNumber.from(10).pow(BigNumber.from(decimalDifference));
};
