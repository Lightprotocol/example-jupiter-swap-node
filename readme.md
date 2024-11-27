## Jup Swap with Compressed Tokens - Demo

-   Creates a single swap transaction with [additional instructions](https://github.com/Lightprotocol/example-jupiter-swap-node/blob/main/src/buildCompressedSwapTx.ts#L192-L200): `createInAtaIx`, `decompressIx`, `closeInAtaIx`
-   Accepts compressed tokens as tokenIn.
-   Cleans up ATA for tokenIn after swap.
-   Clean up ATA for tokenOut via `compressOutAtaIx` support is in progress.

### Notes
-   This e2e integration does not require on-chain changes to the Jup program.
-   Demo requires `directSwapsOnly=true` to avoid occasional tx size overruns (+ ~300 bytes overhead). This can be fixed by integrating natively in Jup's API for `setupInstructions` and `cleanupInstructions`.

### Setup

1. Create .env from .env.example
2. Fund `FILE_WALLET` at `SWAP_USER_KEYPAIR_PATH` with small amount of `INPUT_MINT`.
3. May require large slippage/priority fee to land. you can change configs in src/constants.ts.

### Run

```
yarn
```

```
# get quotes, see tx size
ROUNDS=5 yarn quote    # runs 5 rounds
yarn quote            # runs 1 round (default)
```

```
# also send and confirm
ROUNDS=5 yarn swap      # runs 5 rounds
yarn swap              # runs 1 round (default)
```

### Example tx sigs:

-   https://solscan.io/tx/4QiVMPKYQxZTQZagT6LDaooaUecSzFNTWkHM3UsQ7om2WvzqLWip3GQ5Gj8a4pYBuLD124RVnP2QKvp6EPRBidTK
-   https://solscan.io/tx/5JPv1k9HRqdzie8DcpYFFbwcLmdxYFu9rLpyrFFYii4AE6XPfrk59tgpRasZfykvLn6QgLhzBCKxFvBaNWTYRp4K
-   https://solscan.io/tx/3KVwEPz1XFxNifz7hptqQWSeM3vgxBDCj2v1SwLMjgRS9iKLi8mEoHzyuvcsAzMjPwLp9c3mizUy5hKYSKXELwuV

No safeguards. Use at your own risk. Set small amounts. ensure your INPUT_MINT tokenBalances are small.
