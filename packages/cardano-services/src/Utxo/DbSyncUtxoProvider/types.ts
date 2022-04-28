export interface UtxoModel {
  address: string;
  value: string;
  index: number;
  tx_id: string;
  asset_quantity?: string;
  asset_name?: string;
  asset_policy?: string;
  data_hash?: string;
}
