{ lib
, mkShell
, yarn
, nodejs-14_x
}:

mkShell {
  name = "cardano-js-shell";

  nativeBuildInputs = [
    nodejs-14_x
    yarn
  ];
}
