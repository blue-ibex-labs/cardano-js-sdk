final: prev:
{
  devShell = final.callPackage ./devshell.nix { };

  # need mkYarnPackage to pick up this version
  yarn = prev.yarn.override(_: {
    nodejs = prev.nodejs-14_x;
  });

  cardano-js-sdk = final.callPackage ./generic-cardano-js.nix { };

  # To avoid infinite recursion, we need to pick out the results of the workspace build from `final`
  inherit (final.cardano-js-sdk)
  cardano-sdk-blockfrost
  cardano-sdk-services
  cardano-sdk-services-client
  cardano-sdk-cip2
  cardano-sdk-cip30
  cardano-sdk-core
  cardano-sdk-golden-test-generator
  cardano-sdk-ogmios
  cardano-sdk-util-dev
  cardano-sdk-wallet
  cardano-sdk-web-extension;
}
