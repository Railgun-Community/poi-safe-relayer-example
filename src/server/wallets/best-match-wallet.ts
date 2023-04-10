import { BigNumber } from 'ethers';
import { getActiveWalletGasTokenBalanceMapForChain } from '../balances/balance-cache';
import { getActiveWalletsForChain } from './active-wallets';
import {
  getAvailableWallets,
  getLastUsedWalletForChain,
} from './available-wallets';
import { ActiveWallet } from '../../models/wallet-models';
import { logger } from '../../util/logger';
import { RelayerChain } from '../../models/chain-models';
import configDefaults from '../config/config-defaults';

export const getBestMatchWalletForNetwork = async (
  chain: RelayerChain,
  minimumGasNeeded: BigNumber,
): Promise<ActiveWallet> => {
  const activeWallets = getActiveWalletsForChain(chain);
  const gasTokenBalanceMap = await getActiveWalletGasTokenBalanceMapForChain(
    chain,
    activeWallets,
  );

  const availableWallets = await getAvailableWallets(activeWallets, chain);

  // Simple filters:
  // - Availability.
  // - Amount of (gas token) available.
  // Simple sort:
  // - Priority.
  const randomizeSelection = configDefaults.wallet.randomizeWalletSelection;
  const lastUsedWallet = getLastUsedWalletForChain(chain);
  const sortedAvailableWallets = availableWallets
    .filter((wallet) => {
      const balanceMet =
        gasTokenBalanceMap[wallet.address].gte(minimumGasNeeded);
      if (!randomizeSelection) {
        return balanceMet;
      }
      if (balanceMet && availableWallets.length > 1) {
        // Filter out last used wallet.
        return wallet.address !== lastUsedWallet;
      }

      return true;
    })
    .sort((a, b) => {
      if (!randomizeSelection) {
        return a.priority - b.priority;
      }
      if (gasTokenBalanceMap[a.address].lt(gasTokenBalanceMap[b.address])) {
        return 1;
      }
      if (gasTokenBalanceMap[a.address].gt(gasTokenBalanceMap[b.address])) {
        return -1;
      }
      return 0;
    });

  if (sortedAvailableWallets.length < 1) {
    const outofFundsWallets = activeWallets.filter((wallet) =>
      gasTokenBalanceMap[wallet.address].lt(minimumGasNeeded),
    );
    logger.warn(
      `${availableWallets.length} wallets available. ${
        outofFundsWallets.length
      } wallets are out of gas funds. (Need gas: ${minimumGasNeeded.toHexString()})`,
    );
    throw new Error(`All wallets busy or out of funds.`);
  }
  const walletIndex = randomizeSelection
    ? Math.floor(Math.random() * sortedAvailableWallets.length)
    : 0;

  const bestWallet = sortedAvailableWallets[walletIndex];
  return bestWallet;
};
