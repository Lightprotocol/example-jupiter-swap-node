import {
    VersionedTransaction,
    TransactionMessage,
    AddressLookupTableAccount,
    PublicKey,
} from '@solana/web3.js';
import {
    calculateComputeUnitPrice,
    createRpc,
    Rpc,
} from '@lightprotocol/stateless.js';
import {
    createJupiterApiAdapterClient,
    deserializeInstruction,
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

const connection = createRpc(RPC_URL, COMPRESSION_URL, COMPRESSION_URL);

async function main(quote: boolean, debug: boolean) {
    await setupTokens(connection, INPUT_MINT, OUTPUT_MINT, debug);

    const jupiterApi = await createJupiterApiAdapterClient(connection);

    // Fetch quote
    const quoteResponse = await jupiterApi.quoteGetCompressed(
        {
            inputMint: INPUT_MINT.toBase58(),
            outputMint: OUTPUT_MINT.toBase58(),
            amount: AMOUNT,
            maxAccounts: 64,
            onlyDirectRoutes: true,
            restrictIntermediateTokens: true,
            slippageBps: 500,
            computeAutoSlippage: true,
            minimizeSlippage: true,
            preferLiquidDexes: true,
        },
        TokenCompressionMode.DecompressInput,
    );

    // Get swap instructions
    const instructions = await jupiterApi.swapInstructionsPostCompressed(
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

    // Get lookup tables
    const lookupTables = await getLookupTables(
        connection,
        instructions.addressLookupTableAddresses,
    );

    const allInstructions = [
        ...instructions.computeBudgetInstructions, // has higher cu budget for ctokens
        ...instructions.setupInstructions, // has all necessary ixs for ctokens
        instructions.swapInstruction,
        ...instructions.cleanupInstructions, // has all necessary ixs for ctokens
    ].map(ix => deserializeInstruction(ix));

    // Create, sign, and send transaction
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
        payerKey: SWAP_USER_KEYPAIR.publicKey,
        recentBlockhash: blockhash,
        instructions: allInstructions,
    }).compileToV0Message(lookupTables);

    const tx = new VersionedTransaction(messageV0);
    tx.sign([SWAP_USER_KEYPAIR]);

    await handleSend(
        jupiterApi.connection,
        tx.serialize(),
        blockhash,
        (await connection.getLatestBlockhash()).lastValidBlockHeight,
        debug,
    );
}

/// Helper
async function getLookupTables(
    connection: Rpc,
    addressLookupTableAddresses: string[],
) {
    const accountInfos = await connection.getMultipleAccountsInfo(
        addressLookupTableAddresses.map(address => new PublicKey(address)),
    );
    const lookupTables = accountInfos.map((accountInfo, i) => ({
        key: new PublicKey(addressLookupTableAddresses[i]),
        state: AddressLookupTableAccount.deserialize(accountInfo!.data),
        isActive: () => true,
    }));
    return lookupTables;
}

main(process.argv[2] === 'quote', process.argv[3] === 'true' || false);
