import { Cardano } from '../../..';

type FilterCondition = 'and' | 'or';

export interface MultipleChoiceSearchFilter<T> {
  /**
   * Defaults to 'or'
   */
  _condition?: FilterCondition;
  values: T[];
}

export interface StakePoolQueryOptions {
  /**
   * Will fetch all stake pools if not specified
   */
  filters?: {
    /**
     * Defaults to 'and'
     */
    _condition?: FilterCondition;
    /**
     * Will return results for partial matches
     */
    identifier?: MultipleChoiceSearchFilter<
      Partial<Pick<Cardano.PoolParameters, 'id'> & Pick<Cardano.StakePoolMetadata, 'name' | 'ticker'>>
    >;
    pledgeMet?: boolean;
    status?: Cardano.StakePoolStatus[];
  };
  /**
   * Will fetch all stake pool reward history if not specified
   */
  rewardsHistoryLimit?: number;
  /**
   * Will return all stake pools matching the query if not specified
   */
  pagination?: {
    startAt: number;
    limit: number;
  };
}

export interface StakePoolSearchResults {
  pageResults: Cardano.StakePool[];
  totalResultCount: number;
}

export interface StakePoolSearchProvider {
  /**
   * @param {StakePoolQueryOptions} options query options
   * @returns Stake pools
   * @throws ProviderError
   */
  queryStakePools: (options?: StakePoolQueryOptions) => Promise<StakePoolSearchResults>;
}
