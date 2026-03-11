{
  description = "Figure Graph - Ballroom dance syllabus visualization";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js
            nodejs_22
            nodePackages.npm

            # Python (for data pipeline)
            (python3.withPackages (ps: with ps; [
              pyyaml
              anthropic
            ]))

            # PDF processing
            poppler-utils
          ];

          shellHook = ''
            echo "figure-graph dev environment loaded"
          '';
        };
      });
}
