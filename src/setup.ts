import {
    bn,
    buildAndSignTx,
    Rpc,
    sendAndConfirmTx,
} from '@lightprotocol/stateless.js';
import {
    compress,
    CompressedTokenProgram,
} from '@lightprotocol/compressed-token';
import { SWAP_USER_KEYPAIR } from './constants.ts';
import { ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, closeAccount } from '@solana/spl-token';
import { logToFile } from './logger.ts';

export async function registerMint(
    connection: Rpc,
    mint: PublicKey,
    debug: boolean,
) {
    const account = CompressedTokenProgram.deriveTokenPoolPda(mint);

    const exists = await connection.getAccountInfo(account);
    logToFile(`Input mint already registered: ${exists ? 'yes' : 'no'}`, debug);
    if (exists) return;

    const balance = await connection.getBalance(SWAP_USER_KEYPAIR.publicKey);
    logToFile(`payer balance: ${balance}`, debug);

    try {
        const ix = await CompressedTokenProgram.createTokenPool({
            feePayer: SWAP_USER_KEYPAIR.publicKey,
            mint: mint,
        });

        const { blockhash } = await connection.getLatestBlockhash();

        const tx = buildAndSignTx(
            [
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 100_000,
                }),
                ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: 90000,
                }),
                ix,
            ],
            SWAP_USER_KEYPAIR,
            blockhash,
        );

        const txId = await sendAndConfirmTx(connection, tx);

        logToFile(`new mint registered: ${txId}`, debug);
    } catch (e) {
        logToFile(`error registering mint: ${e}`, debug);
        throw e;
    }
}

export async function compressTokenAndCleanupAtaSetup(
    mint: PublicKey,
    connection: Rpc,
    swapUserKeypair: Keypair,
    debug: boolean,
) {
    const payerPublicKey = swapUserKeypair.publicKey;
    const ata = getAssociatedTokenAddressSync(mint, payerPublicKey);
    let cleanupALlAmount;

    try {
        const tokenAccount = await connection.getAccountInfo(ata);

        if (!tokenAccount) return { compressTxId: null, closeTxId: null };

        cleanupALlAmount = await connection.getTokenAccountBalance(ata);
        if (cleanupALlAmount.value.amount !== '0') {
            logToFile(
                `Found ATA, compressing: ${cleanupALlAmount.value.amount}`,
                debug,
            );
            const compressTxId = await compress(
                connection,
                swapUserKeypair,
                mint,
                bn(cleanupALlAmount.value.amount),
                swapUserKeypair,
                ata,
                payerPublicKey,
            );

            logToFile(`compressTxId: ${compressTxId}`, debug);
        }
    } catch (e) {
        logToFile(
            `compressTokenAndCleanupAtaSetup: ATA not found or Compression failed: ${e}`,
            debug,
        );
    }
    cleanupALlAmount = await connection.getTokenAccountBalance(ata);
    if (cleanupALlAmount.value.amount !== '0')
        throw new Error('balance is not 0');

    const closeTxId = await closeAccount(
        connection,
        swapUserKeypair,
        ata,
        payerPublicKey,
        payerPublicKey,
    );
    logToFile(`closeTxId: ${closeTxId}`, debug);
}
