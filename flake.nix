{
  description = "cardano-js-sdk flake";

  inputs = {
    utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    yarn2nix.url = "github:input-output-hk/yarn2nix";
  };

  outputs = { self, nixpkgs, utils, yarn2nix, ... }:
    let
      localOverlay = import ./nix/overlay.nix;
      overlays = [
        yarn2nix.overlay
        localOverlay
      ];

      pkgsForSystem = system: import nixpkgs {
        overlays = [
          localOverlay
        ];
        inherit system;
      };

    in utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" ] (system: rec {
      legacyPackages = pkgsForSystem system;
      packages = utils.lib.flattenTree {
        inherit (legacyPackages) devShell cardano-js-sdk;
      };
      defaultPackage = packages.devShell;
      apps.cardano-js-sdk = utils.lib.mkApp { drv = packages.cardano-js-sdk; };
      hydraJobs = { inherit (legacyPackages) cardano-js-sdk; };
      checks = { inherit (legacyPackages) cardano-js-sdk; };
  }) // {
    overlays.local = localOverlay;
  };
}
