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
    defaultTestStateTreeAccounts,
    parseTokenLayoutWithIdl,
    Rpc,
} from '@lightprotocol/stateless.js';
import { LIGHT_LUT, SWAP_CONFIG, SWAP_REQUEST_CONFIG } from './constants.ts';
import { logEnd, logToFile } from './logger.ts';
import { TOKEN_PROGRAM_ID } from './constants.ts';

const jupiterApi = createJupiterApiClient();

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
    const quoteResponse: QuoteResponse =
        await jupiterApi.quoteGet(quoteGetRequest);
    logToFile(`quoteResponse ${JSON.stringify(quoteResponse, null)}`, debug);
    return quoteResponse;
};

const getSwapInstructions = async (
    swapUserPubkey: PublicKey,
    quoteResponse: QuoteResponse,
) => {
    const swapRequest: SwapRequest = {
        ...SWAP_REQUEST_CONFIG,
        userPublicKey: swapUserPubkey.toBase58(),
        quoteResponse,
    };

    const instructions = await jupiterApi.swapInstructionsPost({ swapRequest });
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
) {
    const instructions = await getSwapInstructions(
        payerPublicKey,
        await getQuote(inputMint, outputMint, amount, debug),
    );

    const {
        computeBudgetInstructions, // The necessary instructions to setup the compute budget.
        swapInstruction: swapInstructionPayload, // The actual swap instruction.
        addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
    } = instructions;

    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

    // Light LUT
    addressLookupTableAddresses.push(LIGHT_LUT);
    addressLookupTableAccounts.push(
        ...(await getAddressLookupTableAccounts(
            addressLookupTableAddresses,
            connection,
        )),
    );

    const inAta = getAssociatedTokenAddressSync(inputMint, payerPublicKey);
    const outAta = getAssociatedTokenAddressSync(outputMint, payerPublicKey);

    // `SetupInstructions` equivalent:
    // 1. create tokenInAta. 2. create tokenOutAta. 3. decompress tokenIn.
    const createInAtaIx = createAssociatedTokenAccountInstruction(
        payerPublicKey,
        inAta,
        payerPublicKey,
        inputMint,
    );
    const createOutAtaIx = createAssociatedTokenAccountInstruction(
        payerPublicKey,
        outAta,
        payerPublicKey,
        outputMint,
    );
    const decompressIx = await getDecompressTokenInstruction(
        inputMint,
        amount,
        connection,
        payerPublicKey,
        inAta,
    );

    // `CleanupInstruction` equivalent:
    // 1. compress tokenOut. 2. close tokenInAta. 3. close tokenOutAta.
    const compressOutAtaIx = await getCompressTokenOutInstruction(
        outputMint,
        payerPublicKey,
        outAta,
    );
    const closeInAtaIx = createCloseAccountInstruction(
        inAta,
        payerPublicKey,
        payerPublicKey,
    );
    const closeOutAtaIx = createCloseAccountInstruction(
        outAta,
        payerPublicKey,
        payerPublicKey,
    );

    const allInstructions = [
        ...computeBudgetInstructions.map(deserializeInstruction),
        createInAtaIx,
        createOutAtaIx,
        decompressIx,
        deserializeInstruction(swapInstructionPayload),
        compressOutAtaIx,
        closeInAtaIx,
        closeOutAtaIx,
    ].filter(Boolean);

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
