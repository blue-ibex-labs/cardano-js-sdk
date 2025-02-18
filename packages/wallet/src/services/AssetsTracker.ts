import { Asset, Cardano } from '@cardano-sdk/core';
import { Balance, TransactionalTracker } from './types';
import { RetryBackoffConfig } from 'backoff-rxjs';
import { TrackedAssetProvider } from './ProviderTracker';
import { coldObservableProvider } from './util';
import { distinct, from, map, mergeMap, of, scan, tap } from 'rxjs';

export const createAssetService =
  (assetProvider: TrackedAssetProvider, retryBackoffConfig: RetryBackoffConfig) => (assetId: Cardano.AssetId) =>
    coldObservableProvider(
      () => assetProvider.getAsset(assetId, { history: false, nftMetadata: true, tokenMetadata: true }),
      retryBackoffConfig,
      of(true) // fetch only once
    );
export type AssetService = ReturnType<typeof createAssetService>;

export interface AssetsTrackerProps {
  balanceTracker: TransactionalTracker<Balance>;
  assetProvider: TrackedAssetProvider;
  retryBackoffConfig: RetryBackoffConfig;
}

interface AssetsTrackerInternals {
  assetService?: AssetService;
}

export const createAssetsTracker = (
  { assetProvider, balanceTracker, retryBackoffConfig }: AssetsTrackerProps,
  { assetService = createAssetService(assetProvider, retryBackoffConfig) }: AssetsTrackerInternals = {}
) =>
  balanceTracker.total$.pipe(
    map(({ assets }) => [...(assets?.keys() || [])]),
    tap((assetIds) => assetIds.length === 0 && assetProvider.setStatInitialized(assetProvider.stats.getAsset$)),
    mergeMap((assetIds) => from(assetIds)),
    distinct(),
    mergeMap((assetId) => assetService(assetId)),
    scan((assets, asset) => new Map([...assets, [asset.assetId, asset]]), new Map<Cardano.AssetId, Asset.AssetInfo>())
  );
