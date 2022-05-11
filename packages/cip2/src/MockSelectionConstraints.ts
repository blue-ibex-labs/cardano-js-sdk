import { Cardano } from '@cardano-sdk/core';
import { SelectionConstraints } from './types';

export interface MockSelectionConstraints {
  minimumCoinQuantity: bigint;
  minimumCostCoefficient: bigint;
  maxTokenBundleSize: number;
  selectionLimit: number;
}

export const MOCK_NO_CONSTRAINTS: MockSelectionConstraints = {
  maxTokenBundleSize: Number.POSITIVE_INFINITY,
  minimumCoinQuantity: 0n,
  minimumCostCoefficient: 0n,
  selectionLimit: Number.POSITIVE_INFINITY
};

export const mockConstraintsToConstraints = (constraints: MockSelectionConstraints): SelectionConstraints => ({
  computeMinimumCoinQuantity: () => constraints.minimumCoinQuantity,
  computeMinimumCost: async ({ inputs }) => constraints.minimumCostCoefficient * BigInt(inputs.size),
  computeSelectionLimit: async () => constraints.selectionLimit,
  tokenBundleSizeExceedsLimit: (assets?: Cardano.TokenMap) => (assets?.size || 0) > constraints.maxTokenBundleSize
});

export const NO_CONSTRAINTS: SelectionConstraints = {
  computeMinimumCoinQuantity: () => MOCK_NO_CONSTRAINTS.minimumCoinQuantity,
  computeMinimumCost: async ({ inputs }) => MOCK_NO_CONSTRAINTS.minimumCostCoefficient * BigInt(inputs.size),
  computeSelectionLimit: async () => MOCK_NO_CONSTRAINTS.selectionLimit,
  tokenBundleSizeExceedsLimit: (assets?: Cardano.TokenMap) =>
    (assets?.size || 0) > MOCK_NO_CONSTRAINTS.maxTokenBundleSize
};

export default NO_CONSTRAINTS;
