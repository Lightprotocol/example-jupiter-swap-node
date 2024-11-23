Demo for swapping compressed tokens on Jup.

Creates a single transaction with additional instructions.
Accepts compressed tokens as tokenIn.
Cleans up ATA for tokenIn after swap.
Does not clean up nor compress tokenOut.

1. Create .env from .env.example
2. Requires your FILE_WALLET at SWAP_USER_KEYPAIR_PATH to be funded with some small amount of INPUT_MINT. (default mint: USDC, default amount: 1042)
3. May require large slippage/priority fee lamports to land.

to run:

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

to disable logging:

```
yarn dryrun-skip-logs
```
