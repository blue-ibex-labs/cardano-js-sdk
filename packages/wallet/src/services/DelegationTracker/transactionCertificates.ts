import { Cardano, createTxInspector, signedCertificatesInspector, util } from '@cardano-sdk/core';
import { Observable, combineLatest, distinctUntilChanged, map } from 'rxjs';
import { last } from 'lodash-es';
import { transactionsEquals } from '../util/equals';

export const RegAndDeregCertificateTypes = [
  Cardano.CertificateType.StakeKeyRegistration,
  Cardano.CertificateType.StakeKeyDeregistration
];

export const stakeKeyCertficates = (certificates?: Cardano.Certificate[]) =>
  certificates?.filter((certificate): certificate is Cardano.StakeAddressCertificate =>
    RegAndDeregCertificateTypes.includes(certificate.__typename)
  ) || [];

export const includesAnyCertificate = (haystack: Cardano.Certificate[], needle: Cardano.CertificateType[]) =>
  haystack.some(({ __typename }) => needle.includes(__typename)) || false;

export const isLastStakeKeyCertOfType = (
  transactionsCertificates: Cardano.Certificate[][],
  certType: Cardano.CertificateType.StakeKeyRegistration | Cardano.CertificateType.StakeKeyDeregistration,
  rewardAccount?: Cardano.RewardAccount
) => {
  const stakeKeyHash = rewardAccount ? Cardano.Ed25519KeyHash.fromRewardAccount(rewardAccount) : null;
  const lastRegOrDereg = last(
    transactionsCertificates
      .map((certificates) => {
        const allStakeKeyCertificates = stakeKeyCertficates(certificates);
        const addressStakeKeyCertificates = stakeKeyHash
          ? allStakeKeyCertificates.filter(({ stakeKeyHash: certStakeKeyHash }) => stakeKeyHash === certStakeKeyHash)
          : allStakeKeyCertificates;
        return last(addressStakeKeyCertificates);
      })
      .filter(util.isNotNil)
  );
  return lastRegOrDereg?.__typename === certType;
};

export const transactionsWithCertificates = (
  transactions$: Observable<Cardano.TxAlonzo[]>,
  rewardAccounts$: Observable<Cardano.RewardAccount[]>,
  certificateTypes: Cardano.CertificateType[]
) =>
  combineLatest([transactions$, rewardAccounts$]).pipe(
    map(([transactions, rewardAccounts]) =>
      transactions.filter((tx) => {
        const inspectTx = createTxInspector({
          signedCertificates: signedCertificatesInspector(rewardAccounts, certificateTypes)
        });
        return inspectTx(tx).signedCertificates.length > 0;
      })
    ),
    distinctUntilChanged(transactionsEquals)
  );
