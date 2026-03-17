#!/bin/bash
# Copy compiled circuit assets to public directories for browser access
# Run from project root: ./scripts/copy-circuits.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source directory (compiled contracts)
MANAGED_DIR="$PROJECT_ROOT/packages/contracts/src/managed"

# Target directories
DEMO_PUBLIC="$PROJECT_ROOT/apps/demo/public/circuits"
EXTENSION_PUBLIC="$PROJECT_ROOT/packages/wallet-extension/public/circuits"

# Contracts to copy
CONTRACTS=("age-verifier" "credential-registry")

echo "Copying circuit assets for browser access..."
echo "Source: $MANAGED_DIR"

# Copy to demo app
if [ -d "$PROJECT_ROOT/apps/demo" ]; then
  echo ""
  echo "Copying to demo app: $DEMO_PUBLIC"
  mkdir -p "$DEMO_PUBLIC"

  for contract in "${CONTRACTS[@]}"; do
    if [ -d "$MANAGED_DIR/$contract" ]; then
      echo "  - $contract"
      mkdir -p "$DEMO_PUBLIC/$contract"

      # Copy keys directory (prover/verifier files)
      if [ -d "$MANAGED_DIR/$contract/keys" ]; then
        cp -r "$MANAGED_DIR/$contract/keys" "$DEMO_PUBLIC/$contract/"
      fi

      # Copy zkir directory (circuit IR files)
      if [ -d "$MANAGED_DIR/$contract/zkir" ]; then
        cp -r "$MANAGED_DIR/$contract/zkir" "$DEMO_PUBLIC/$contract/"
      fi

      # Copy compiler metadata (needed for circuit resolution)
      if [ -d "$MANAGED_DIR/$contract/compiler" ]; then
        cp -r "$MANAGED_DIR/$contract/compiler" "$DEMO_PUBLIC/$contract/"
      fi
    else
      echo "  - $contract (SKIPPED - not compiled)"
    fi
  done
fi

# Copy to wallet extension
if [ -d "$PROJECT_ROOT/packages/wallet-extension" ]; then
  echo ""
  echo "Copying to wallet extension: $EXTENSION_PUBLIC"
  mkdir -p "$EXTENSION_PUBLIC"

  for contract in "${CONTRACTS[@]}"; do
    if [ -d "$MANAGED_DIR/$contract" ]; then
      echo "  - $contract"
      mkdir -p "$EXTENSION_PUBLIC/$contract"

      if [ -d "$MANAGED_DIR/$contract/keys" ]; then
        cp -r "$MANAGED_DIR/$contract/keys" "$EXTENSION_PUBLIC/$contract/"
      fi

      if [ -d "$MANAGED_DIR/$contract/zkir" ]; then
        cp -r "$MANAGED_DIR/$contract/zkir" "$EXTENSION_PUBLIC/$contract/"
      fi

      if [ -d "$MANAGED_DIR/$contract/compiler" ]; then
        cp -r "$MANAGED_DIR/$contract/compiler" "$EXTENSION_PUBLIC/$contract/"
      fi
    fi
  done
fi

echo ""
echo "Circuit copy complete!"

# Show sizes
if [ -d "$DEMO_PUBLIC" ]; then
  echo ""
  echo "Demo app circuit sizes:"
  du -sh "$DEMO_PUBLIC"/* 2>/dev/null || true
fi
