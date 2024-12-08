import { VersionedTransaction } from '@solana/web3.js';
import {
    calculateComputeUnitPrice,
    createRpc,
} from '@lightprotocol/stateless.js';
import {
    createJupiterApiAdapterClient,
    TokenCompressionMode,
} from '@lightprotocol/jup-api-adapter';
import {
    SWAP_USER_KEYPAIR,
    INPUT_MINT,
    OUTPUT_MINT,
    AMOUNT,
    COMPRESSION_URL,
    RPC_URL,
} from './constants.ts';
import { setupTokens } from './setup.ts';

import { handleSend } from './handleSend.ts';

/// Create RPC connection with compression support.
const connection = createRpc(RPC_URL, COMPRESSION_URL, COMPRESSION_URL);

async function main(quote: boolean, debug: boolean) {
    /// Setup for testing only.
    await setupTokens(connection, INPUT_MINT, OUTPUT_MINT, debug);

    /// Init Jupiter API Adapter client.
    const jupiterApi = await createJupiterApiAdapterClient(connection);

    /// Fetch quote.
    const quoteResponse = await jupiterApi.quoteGetCompressed(
        {
            inputMint: INPUT_MINT.toBase58(),
            outputMint: OUTPUT_MINT.toBase58(),
            amount: AMOUNT,
            maxAccounts: 64,
            onlyDirectRoutes: true,
            restrictIntermediateTokens: true,
            slippageBps: 500, // 5%
            computeAutoSlippage: true,
            minimizeSlippage: true,
            preferLiquidDexes: true,
        },
        TokenCompressionMode.DecompressInput,
    );

    /// Fetch Swap tx.
    const swapResponse = await jupiterApi.swapPostCompressed(
        {
            swapRequest: {
                skipUserAccountsRpcCalls: false,
                dynamicComputeUnitLimit: false,
                wrapAndUnwrapSol: true,
                computeUnitPriceMicroLamports: calculateComputeUnitPrice(
                    25_000,
                    1_400_000,
                ),
                userPublicKey: SWAP_USER_KEYPAIR.publicKey.toBase58(),
                quoteResponse,
            },
        },
        { compressionMode: TokenCompressionMode.DecompressInput },
    );

    if (quote) {
        console.log('quote: ', quoteResponse);
        return;
    }

    /// Sign and send.
    const tx = VersionedTransaction.deserialize(
        Buffer.from(swapResponse.swapTransaction, 'base64'),
    );
    tx.sign([SWAP_USER_KEYPAIR]);
    await handleSend(
        jupiterApi.connection,
        tx.serialize(),
        tx.message.recentBlockhash,
        swapResponse.lastValidBlockHeight,
        debug,
    );
}

main(process.argv[2] === 'quote', process.argv[3] === 'true');
