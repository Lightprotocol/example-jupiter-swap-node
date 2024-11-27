## Jup Swap with Compressed Tokens - Demo

-   Creates a single swap transaction with [additional instructions](https://github.com/Lightprotocol/example-jupiter-swap-node/blob/main/src/buildCompressedSwapTx.ts#L192-L200): `createTokenInAtaIx`, `createTokenOutAtaIx`, `decompressTokenInIx`, `compressTokenOutIx`, `closeTokenInAtaIx`, `closeTokenOutAtaIx`
-   Accepts compressed tokens as tokenIn
-   Returns compressed tokens as tokenOut (set `COMPRESS_TOKEN_OUT=true` to enable)
-   Cleans up intermediate ATAs for tokenIn and tokenOut after the swap.

### Notes

-   This e2e integration does not require on-chain changes to the Jup program.
-   Demo requires `directSwapsOnly=true` to avoid occasional tx size overruns (+ ~300 bytes overhead). This can be fixed by integrating natively in Jup's API for `setupInstructions` and `cleanupInstructions`.
-   Future/Optional: `useSharedAccounts` could remove the need for intermediate ATA setup and cleanup.

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
yarn quote                          # runs 1 round (default)
ROUNDS=5 yarn quote                 # runs 5 rounds
COMPRESS_TOKEN_OUT=true yarn quote  # uses compressTokenOutIx feature (default: false)
```

```
# also send and confirm
yarn swap                           # runs 1 round (default)
ROUNDS=5 yarn swap                  # runs 5 rounds
COMPRESS_TOKEN_OUT=true yarn swap   # uses compressTokenOutIx feature (default: false)
```

### Example tx sigs:

with compressTokenOutIx:

-   https://solscan.io/tx/47duf8bTsK7Fi6dQgeHbD3GwPXC1GFiiBnLEq1i6jSRtKcwc2by7Rxbx7dxkKeA6EyVuJf1b5BhL6EKgsSAzFKXG

without compressTokenOutIx:

-   https://solscan.io/tx/4QiVMPKYQxZTQZagT6LDaooaUecSzFNTWkHM3UsQ7om2WvzqLWip3GQ5Gj8a4pYBuLD124RVnP2QKvp6EPRBidTK
-   https://solscan.io/tx/5JPv1k9HRqdzie8DcpYFFbwcLmdxYFu9rLpyrFFYii4AE6XPfrk59tgpRasZfykvLn6QgLhzBCKxFvBaNWTYRp4K
-   https://solscan.io/tx/3KVwEPz1XFxNifz7hptqQWSeM3vgxBDCj2v1SwLMjgRS9iKLi8mEoHzyuvcsAzMjPwLp9c3mizUy5hKYSKXELwuV

No safeguards. Use at your own risk. Set small amounts. ensure your INPUT_MINT tokenBalances are small. `compressTokenOutIx` instruction interface is not audited.
