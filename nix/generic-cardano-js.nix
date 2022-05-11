{ lib
, callPackage
, bash
, yarn2nix-moretea
}:

yarn2nix-moretea.mkYarnWorkspace rec {
  src = ../.;

  doCheck = true;
  checkPhase = "yarn test --coverage --ci";
  distPhase  = "true";
}
