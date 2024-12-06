import { buildCompressedSwapTx } from './buildCompressedSwapTx.ts';
import { Rpc, sleep } from '@lightprotocol/stateless.js';
import {
    PAYER_PUBLIC_KEY,
    SWAP_USER_KEYPAIR,
    INPUT_MINT,
    OUTPUT_MINT,
    AMOUNT,
    COMPRESSION_URL,
    RPC_URL,
    TOKEN_PROGRAM_ID,
    LOG_FILE,
} from './constants.ts';
import { compressTokenAndCleanupAtaSetup, registerMint } from './setup.ts';
import { logToFile } from './logger.ts';
import { handleSend } from './handleSend.ts';
import { CompressedTokenProgram } from '@lightprotocol/compressed-token';

type Flow = 'quote' | 'swap';
let ROUNDS = parseInt(process.env.ROUNDS || '1');
const COMPRESS_TOKEN_OUT = process.env.COMPRESS_TOKEN_OUT === 'true' || false;

async function main(flow: Flow = 'quote', debug: boolean = true) {
    logToFile(
        `flow=${flow}, debug=${debug}, rounds=${ROUNDS}, compressTokenOut=${COMPRESS_TOKEN_OUT}`,
        debug,
    );
    console.log('Storing debug logs in:', LOG_FILE);

    const connection = new Rpc(RPC_URL, COMPRESSION_URL, COMPRESSION_URL);

    // CompressedTokenProgram.setProgramId(TOKEN_PROGRAM_ID);
    const totalRounds = ROUNDS;
    while (ROUNDS > 0) {
        console.log(`Running round ${totalRounds - ROUNDS + 1}/${totalRounds}`);
        ROUNDS--;
        const compressedTokenAccounts =
            await connection.getCompressedTokenAccountsByOwner(
                PAYER_PUBLIC_KEY,
            );
        console.log(
            'Compressed token accounts:',
            compressedTokenAccounts.items.map(item => JSON.stringify(item)),
        );
        try {
            console.log('Resetting...'); // need to reset each round if compressTokenOutIx=false
            await registerMint(connection, INPUT_MINT, debug);
            await registerMint(connection, OUTPUT_MINT, debug);
            await compressTokenAndCleanupAtaSetup(
                INPUT_MINT,
                connection,
                SWAP_USER_KEYPAIR,
                debug,
            );
            await compressTokenAndCleanupAtaSetup(
                OUTPUT_MINT,
                connection,
                SWAP_USER_KEYPAIR,
                debug,
            );

            const transaction = await buildCompressedSwapTx(
                connection,
                PAYER_PUBLIC_KEY,
                INPUT_MINT,
                OUTPUT_MINT,
                AMOUNT,
                debug,
                COMPRESS_TOKEN_OUT,
            );

            transaction.sign([SWAP_USER_KEYPAIR]);

            const txLength = transaction.serialize().length;
            console.log(`Transaction size: ${txLength} bytes`);

            if (txLength > 1232) {
                console.log(
                    'Transaction size exceeded 1232 bytes by ',
                    txLength - 1232,
                    'bytes, skipping',
                );
                continue;
            }

            if (flow === 'quote') {
                console.log('quote received');
                continue;
            }

            const result = await handleSend(
                connection,
                Buffer.from(transaction.serialize()),
                transaction.message.recentBlockhash,
                (await connection.getLatestBlockhash()).lastValidBlockHeight,
                debug,
            );
            logToFile(
                `Transaction result: ${JSON.stringify(result, null)}`,
                debug,
            );
            sleep(1000);
        } catch (error) {
            console.error('Error:', error);
        }
    }
}
const args = process.argv.slice(2);
const flow = (args[0] as Flow) || 'quote';
const debug = args[1] === 'true' || false;

main(flow, debug);
