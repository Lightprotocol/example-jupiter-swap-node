## Jup Swap with Compressed Tokens - Demo

- Creates a single transaction with additional instructions.
- Accepts compressed tokens as tokenIn.
- Cleans up ATA for tokenIn after swap.
- Does not clean up nor compress tokenOut.

### Setup

1. Create .env from .env.example
2. Requires your FILE_WALLET at SWAP_USER_KEYPAIR_PATH to be funded with some small amount of INPUT_MINT. (default mint: USDC, default amount: 1042)
3. May require large slippage/priority fee lamports to land. you can change configs in src/constants.ts.

### Run

```
yarn
```

```
# get quotes, see tx size
ROUNDS=5 yarn dryrun    # runs 5 rounds
yarn dryrun            # runs 1 round (default)
```

```
# also send and confirm
ROUNDS=5 yarn send      # runs 5 rounds
yarn send              # runs 1 round (default)
```

### Example tx signatures:

- https://solscan.io/tx/4QiVMPKYQxZTQZagT6LDaooaUecSzFNTWkHM3UsQ7om2WvzqLWip3GQ5Gj8a4pYBuLD124RVnP2QKvp6EPRBidTK
- https://solscan.io/tx/5JPv1k9HRqdzie8DcpYFFbwcLmdxYFu9rLpyrFFYii4AE6XPfrk59tgpRasZfykvLn6QgLhzBCKxFvBaNWTYRp4K
- https://solscan.io/tx/3KVwEPz1XFxNifz7hptqQWSeM3vgxBDCj2v1SwLMjgRS9iKLi8mEoHzyuvcsAzMjPwLp9c3mizUy5hKYSKXELwuV
