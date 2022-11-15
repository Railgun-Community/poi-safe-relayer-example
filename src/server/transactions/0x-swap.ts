import { TransactionResponse } from '@ethersproject/providers';
import { BigNumber, PopulatedTransaction } from 'ethers';
import { TokenAmount } from '../../models/token-models';
import {
  zeroXExchangeProxyContractAddress,
  ZeroXFormattedQuoteData,
  zeroXGetSwapQuote,
} from '../api/0x/0x-quote';
import { getEstimateGasDetailsPublic } from '../fees/gas-estimate';
import { executeTransaction } from './execute-transaction';
import { ActiveWallet } from '../../models/wallet-models';
import configNetworks from '../config/config-networks';
import debug from 'debug';
import { removeUndefineds } from '../../util/utils';
import { RelayerChain } from '../../models/chain-models';
import configDefaults from '../config/config-defaults';
import {
  getEVMGasTypeForTransaction,
  networkForChain,
} from '@railgun-community/shared-models';

const dbg = debug('relayer:swaps');

export const generateSwapTransactions = async (
  tokenAmounts: TokenAmount[],
  chain: RelayerChain,
): Promise<PopulatedTransaction[]> => {
  const populatedTransactions: Optional<PopulatedTransaction>[] =
    await Promise.all(
      tokenAmounts.map(async (tokenAmount) => {
        try {
          const swapQuote = await zeroXGetSwapQuote(
            chain,
            tokenAmount,
            configNetworks[chain.type][chain.id].gasToken.symbol,
            configDefaults.topUps.toleratedSlippage,
          );
          if (swapQuote.error) {
            throw new Error(swapQuote.error);
          }
          if (!swapQuote.quote) {
            dbg(
              `Failed to get zeroX Swap Quote for ${tokenAmount.tokenAddress}`,
            );
            return undefined;
          }
          const populatedSwap = quoteToPopulatedTransaction(
            chain,
            swapQuote.quote,
          );
          return populatedSwap;
        } catch (err: any) {
          dbg(
            `Could not populate transaction for token ${tokenAmount.tokenAddress} being swapped for top up: ${err.message}`,
          );
          return undefined;
        }
      }),
    );

  return removeUndefineds(populatedTransactions);
};

const quoteToPopulatedTransaction = (
  chain: RelayerChain,
  quote: ZeroXFormattedQuoteData,
): PopulatedTransaction => {
  const populatedTransaction: PopulatedTransaction = {
    to: zeroXExchangeProxyContractAddress(chain),
    data: quote.data,
    value: BigNumber.from(quote.value),
  };
  return populatedTransaction;
};

export const swapZeroX = async (
  activeWallet: ActiveWallet,
  tokenAmounts: TokenAmount[],
  chain: RelayerChain,
): Promise<TransactionResponse[]> => {
  const populatedSwapTXs = await generateSwapTransactions(tokenAmounts, chain);
  const TransactionResponses: TransactionResponse[] = await Promise.all(
    populatedSwapTXs.map(async (populatedSwap) => {
      const network = networkForChain(chain);
      if (!network) {
        throw new Error(
          `Unsupported network for chain ${chain.type}:${chain.id}`,
        );
      }
      const sendWithPublicWallet = true;
      const evmGasType = getEVMGasTypeForTransaction(
        network.name,
        sendWithPublicWallet,
      );
      const gasDetails = await getEstimateGasDetailsPublic(
        chain,
        evmGasType,
        populatedSwap,
      );
      const txResponse = await executeTransaction(
        chain,
        populatedSwap,
        gasDetails,
        activeWallet,
      );
      return txResponse;
    }),
  );

  return TransactionResponses;
};
