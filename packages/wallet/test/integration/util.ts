import { SingleAddressWallet } from '../../src';
import { createStubStakePoolSearchProvider } from '@cardano-sdk/util-dev';
import {
  mockAssetProvider,
  mockNetworkInfoProvider,
  mockTxSubmitProvider,
  mockWalletProvider,
  testKeyAgent
} from '../mocks';

export const createWallet = async () => {
  const keyAgent = await testKeyAgent();
  const txSubmitProvider = mockTxSubmitProvider();
  const walletProvider = mockWalletProvider();
  const stakePoolSearchProvider = createStubStakePoolSearchProvider();
  const networkInfoProvider = mockNetworkInfoProvider();
  const assetProvider = mockAssetProvider();
  return new SingleAddressWallet(
    { name: 'Test Wallet' },
    {
      assetProvider,
      keyAgent,
      networkInfoProvider,
      stakePoolSearchProvider,
      txSubmitProvider,
      walletProvider
    }
  );
};
