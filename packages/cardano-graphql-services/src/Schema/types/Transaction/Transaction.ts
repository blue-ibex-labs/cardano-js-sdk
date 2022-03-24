/* eslint-disable no-use-before-define */
/* eslint-disable sonarjs/no-duplicate-string */
import { AuxiliaryData } from './AuxiliaryData';
import { Block } from '../Block';
import { Cardano } from '@cardano-sdk/core';
import { Certificate } from './CertificateUnion';
import { Directive, Field, Int, ObjectType } from 'type-graphql';
import { Int64 } from '../util';
import { PublicKey } from '../PublicKey';
import { Slot } from '../Slot';
import { Token } from './Token';
import { TransactionInput } from './TransactionInput';
import { TransactionOutput } from './TransactionOutput';
import { Withdrawal } from './Withdrawal';
import { Witness } from './Witness';

@ObjectType()
export class Transaction {
  @Directive('@id')
  @Field(() => String)
  hash: Cardano.TransactionId;
  @Field(() => Block)
  block: Block;
  @Directive('@search')
  @Field(() => Int)
  blockHeight: Cardano.BlockNo;
  @Field(() => Int)
  index: number;
  @Field(() => [TransactionInput], { nullable: true })
  collateral?: TransactionInput[];
  // TODO: nullable has to be reverted once this information can be obtained
  @Field(() => Int64, { nullable: true })
  deposit: Cardano.Lovelace;
  // TODO: nullable has to be reverted once this information can be obtained
  @Field(() => Int64, { nullable: true })
  fee: Cardano.Lovelace;
  @Directive('@hasInverse(field: transaction)')
  @Field(() => [TransactionInput])
  inputs: TransactionInput[];
  @Directive('@hasInverse(field: transaction)')
  @Field(() => [TransactionOutput])
  outputs: TransactionOutput[];
  @Field(() => Slot, { nullable: true })
  invalidBefore?: Slot;
  @Field(() => Slot, { nullable: true })
  invalidHereafter?: Slot;
  @Directive('@hasInverse(field: transaction)')
  @Field(() => AuxiliaryData, { nullable: true })
  auxiliaryData?: AuxiliaryData;
  @Field(() => [Token], { nullable: true })
  mint?: Token[];
  // TODO: nullable has to be reverted once this information can be obtained
  @Field(() => Int64, { nullable: true })
  size: number;
  @Field(() => Int64)
  totalOutputCoin: Cardano.Lovelace;
  @Field()
  validContract: boolean;
  @Directive('@hasInverse(field: transaction)')
  @Field(() => [Withdrawal], { nullable: true })
  withdrawals?: Withdrawal[];
  @Directive('@hasInverse(field: transaction)')
  @Field(() => Witness)
  witness: Witness;
  @Field(() => [Certificate], { nullable: true })
  certificates?: typeof Certificate[];
  @Field(() => String, { nullable: true })
  scriptIntegrityHash?: Cardano.Hash28ByteBase16;
  @Directive('@hasInverse(field: requiredExtraSignatureInTransactions)')
  @Field(() => [PublicKey], { nullable: true })
  requiredExtraSignatures?: PublicKey[];
}
