## Jup Swap with Compressed Tokens - Demo

This is an example using `@lightprotocol/jup-api-adapter` - a thin wrapper for the Jupiter API with compressed token support.

For details, see [jup-api-adapter](https://github.com/Lightprotocol/jup-api-adapter).

### Notes

-   This e2e integration does not require on-chain changes to the Jup program.
-   Demo requires `directSwapsOnly=true` to avoid occasional tx size overruns (+ ~300 bytes overhead). This can be fixed by integrating natively in Jup's API for `setupInstructions` and `cleanupInstructions`.
-   Future/Optional: `useSharedAccounts` could remove the need for intermediate ATA setup and cleanup.


### Setup

1. Create .env from .env.example
2. Fund `FILE_WALLET` at `SWAP_USER_KEYPAIR_PATH` with small amount of `INPUT_MINT`.
3. May require large slippage/priority fee to land. you can change configs in src/constants.ts.


### Usage

```
yarn # install deps
```

```
yarn quote          # get quote
yarn swap           # quote + send tx
```

- `src/swap-with-transaction.ts` requests the tx from the Jup API via `swapPostCompressed`.
- `src/swap-with-instructions.ts` requests the ixs via `swapInstructionsPostCompressed` and builds the tx manually.

```
yarn quote-ixs      # get quote
yarn swap-ixs       # quote + send tx
```


### Notes

-   This e2e integration does not require on-chain changes to the Jup program.
-   Demo requires `directSwapsOnly=true` to avoid occasional tx size overruns (+ ~300 bytes overhead). This can be fixed by integrating natively in Jup's API for `setupInstructions` and `cleanupInstructions`.
-   Future/Optional: `useSharedAccounts` could remove the need for intermediate ATA setup and cleanup.

### Example tx sigs:

with compressTokenOutIx:

-   https://solscan.io/tx/47duf8bTsK7Fi6dQgeHbD3GwPXC1GFiiBnLEq1i6jSRtKcwc2by7Rxbx7dxkKeA6EyVuJf1b5BhL6EKgsSAzFKXG
-   https://solscan.io/tx/2qdBGCKhGnhSQKfoyiY3eHoChuHkQ7QtZpCR9m2CWTvLxwivxcRTNpUqtQkxPrWHd2ibh5QWwjsTjGnq7VsmAwzd

without compressTokenOutIx:

-   https://solscan.io/tx/4QiVMPKYQxZTQZagT6LDaooaUecSzFNTWkHM3UsQ7om2WvzqLWip3GQ5Gj8a4pYBuLD124RVnP2QKvp6EPRBidTK
-   https://solscan.io/tx/5JPv1k9HRqdzie8DcpYFFbwcLmdxYFu9rLpyrFFYii4AE6XPfrk59tgpRasZfykvLn6QgLhzBCKxFvBaNWTYRp4K
-   https://solscan.io/tx/3KVwEPz1XFxNifz7hptqQWSeM3vgxBDCj2v1SwLMjgRS9iKLi8mEoHzyuvcsAzMjPwLp9c3mizUy5hKYSKXELwuV

To use the `compressTokenOutIx` feature, checkout [this branch](https://github.com/Lightprotocol/example-jupiter-swap-node/tree/use-compress-out-ata).

No safeguards. Use at your own risk. Set small amounts. ensure your INPUT_MINT tokenBalances are small. `compressTokenOutIx` instruction interface is not audited.
