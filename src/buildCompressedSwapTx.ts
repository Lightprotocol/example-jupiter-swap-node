import { Connection, TransactionMessage } from '@solana/web3.js';
import { AddressLookupTableAccount } from '@solana/web3.js';
import {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createCloseAccountInstruction,
} from '@solana/spl-token';
import {
    PublicKey,
    TransactionInstruction,
    VersionedTransaction,
} from '@solana/web3.js';
import {
    createJupiterApiClient,
    Instruction,
    QuoteGetRequest,
    QuoteResponse,
    SwapRequest,
} from '@jup-ag/api';
import {
    CompressedTokenProgram,
    CompressSplTokenAccountParams,
    selectMinCompressedTokenAccountsForTransfer,
} from '@lightprotocol/compressed-token';
import {
    bn,
    createRpc,
    defaultTestStateTreeAccounts,
    parseTokenLayoutWithIdl,
    Rpc,
} from '@lightprotocol/stateless.js';
import {
    COMPRESSION_URL,
    LIGHT_LUT,
    RPC_URL,
    SWAP_CONFIG,
    SWAP_REQUEST_CONFIG,
} from './constants.ts';
import { logEnd, logToFile } from './logger.ts';
import { TOKEN_PROGRAM_ID } from './constants.ts';
import {
    createJupiterApiAdapterClient,
    DefaultApiAdapter,
    TokenCompressionMode,
} from '@lightprotocol/jup-api-adapter';

const connection = createRpc(RPC_URL, COMPRESSION_URL, COMPRESSION_URL);
const jupiterApi: DefaultApiAdapter =
    await createJupiterApiAdapterClient(connection);

const deserializeInstruction = (instruction: Instruction) => {
    return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map(key => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, 'base64'),
    });
};

const getAddressLookupTableAccounts = async (
    keys: string[],
    connection: Connection,
): Promise<AddressLookupTableAccount[]> => {
    const addressLookupTableAccountInfos =
        await connection.getMultipleAccountsInfo(
            keys.map(key => new PublicKey(key)),
        );

    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
        const addressLookupTableAddress = keys[index];
        if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
                key: new PublicKey(addressLookupTableAddress),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
        }

        return acc;
    }, new Array<AddressLookupTableAccount>());
};

const getQuote = async (
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    debug: boolean,
) => {
    const quoteGetRequest: QuoteGetRequest = {
        ...SWAP_CONFIG,
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount,
    };
    const quoteResponse: QuoteResponse = await jupiterApi.quoteGetCompressed(
        quoteGetRequest,
        TokenCompressionMode.DecompressInput,
    );
    logToFile(`quoteResponse ${JSON.stringify(quoteResponse, null)}`, debug);
    return quoteResponse;
};

const getSwapInstructions = async (
    swapUserPubkey: PublicKey,
    quoteResponse: QuoteResponse,
) => {
    const instructions = await jupiterApi.swapInstructionsPostCompressed(
        {
            swapRequest: {
                ...SWAP_REQUEST_CONFIG,
                userPublicKey: swapUserPubkey.toBase58(),
                quoteResponse,
            },
        },
        { compressionMode: TokenCompressionMode.DecompressInput },
    );
    return instructions;
};

const getDecompressTokenInstruction = async (
    mint: PublicKey,
    amount: number,
    connection: Rpc,
    owner: PublicKey,
    ata: PublicKey,
) => {
    amount = bn(amount);

    // Get compressed token accounts with custom Token program. Therefore we
    // must parse in the client instead of using
    // getCompressedTokenAccountsByOwner.
    const compressedTokenAccounts = (
        await connection.getCompressedAccountsByOwner(TOKEN_PROGRAM_ID)
    ).items
        .map(acc => ({
            compressedAccount: acc,
            parsed: parseTokenLayoutWithIdl(acc, TOKEN_PROGRAM_ID)!,
        }))
        .filter(acc => acc.parsed.mint.equals(mint));

    const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
        compressedTokenAccounts,
        amount,
    );

    const proof = await connection.getValidityProof(
        inputAccounts.map(account => bn(account.compressedAccount.hash)),
    );

    const ix = await CompressedTokenProgram.decompress({
        payer: owner,
        inputCompressedTokenAccounts: inputAccounts,
        toAddress: ata,
        amount,
        outputStateTree: defaultTestStateTreeAccounts().merkleTree,
        recentInputStateRootIndices: proof.rootIndices,
        recentValidityProof: proof.compressedProof,
    });
    return ix;
};

/// Compresses full tokenOut (determined at runtime) from ata to owner.
const getCompressTokenOutInstruction = async (
    mint: PublicKey,
    owner: PublicKey,
    ata: PublicKey,
) => {
    const param: CompressSplTokenAccountParams = {
        feePayer: owner,
        mint,
        tokenAccount: ata,
        authority: owner,
        outputStateTree: defaultTestStateTreeAccounts().merkleTree,
    };
    return await CompressedTokenProgram.compressSplTokenAccount(param);
};

export async function buildCompressedSwapTx(
    connection: Rpc,
    payerPublicKey: PublicKey,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    debug: boolean,
    compressOutput: boolean = false,
) {
    const instructions = await getSwapInstructions(
        payerPublicKey,
        await getQuote(inputMint, outputMint, amount, debug),
    );

    const {
        computeBudgetInstructions, // The necessary instructions to setup the compute budget.
        setupInstructions,
        swapInstruction, // The actual swap instruction.
        cleanupInstructions,
        addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
    } = instructions;

    const addressLookupTableAccounts: AddressLookupTableAccount[] =
        await getAddressLookupTableAccounts(
            addressLookupTableAddresses,
            connection,
        );

    // TODO: CMP AGAINST
    // `SetupInstructions` equivalent:
    // 1. create tokenInAta. 2. create tokenOutAta. 3. decompress tokenIn.
    // `CleanupInstruction` equivalent:
    // 1. compress tokenOut. 2. close tokenInAta. 3. close tokenOutAta.

    const allInstructions = [
        ...computeBudgetInstructions.map(deserializeInstruction),
        ...setupInstructions.map(deserializeInstruction),
        deserializeInstruction(swapInstruction),
        ...cleanupInstructions.map(deserializeInstruction),
    ].filter(Boolean) as TransactionInstruction[];

    logToFile('Instructions:', debug);
    allInstructions.forEach((ix, i) => {
        logToFile(
            `${i}. ${ix.programId.toString()}: ${ix.data.length} bytes, ${
                ix.keys.length
            } accounts`,
            debug,
        );
        logToFile(
            `Account indices: ${ix.keys.map(k => k.pubkey.toString()).join(', ')}`,
            debug,
        );
    });

    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
        payerKey: payerPublicKey,
        recentBlockhash: blockhash,
        instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);
    const transaction = new VersionedTransaction(messageV0);

    try {
        logToFile(
            `Transaction size (bytes): ${transaction.serialize().length}`,
            debug,
        );
        logToFile(`transaction ${JSON.stringify(transaction, null)}`, debug);
        logEnd(debug);
        return transaction;
    } catch (e) {
        logToFile(`Error compiling transaction: ${e}`, debug);
        throw Error(`Tx too large. Skipping.`);
    }
}
