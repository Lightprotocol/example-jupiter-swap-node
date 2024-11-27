/// Adapted from https://github.com/jup-ag/jupiter-quote-api-node/blob/main/example/utils/transactionSender.ts#L20
/// MIT License
/// For purpose of demoing compressed token swaps with the Jupiter API.
/// Added logToFile().
import { Rpc, sleep } from '@lightprotocol/stateless.js';
import {
    BlockhashWithExpiryBlockHeight,
    Connection,
    TransactionExpiredBlockheightExceededError,
    VersionedTransactionResponse,
} from '@solana/web3.js';
import promiseRetry from 'promise-retry';
import { logToFile } from './logger.ts';

type TransactionSenderAndConfirmationWaiterArgs = {
    connection: Connection;
    serializedTransaction: Buffer;
    blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
    debug: boolean;
};

const SEND_OPTIONS = {
    skipPreflight: true,
};

async function transactionSenderAndConfirmationWaiter({
    connection,
    serializedTransaction,
    blockhashWithExpiryBlockHeight,
    debug,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
    logToFile('Sending transaction...', debug);
    const txid = await connection.sendRawTransaction(
        serializedTransaction,
        SEND_OPTIONS,
    );
    logToFile(`Transaction sent with id: ${txid}`, debug);

    const controller = new AbortController();
    const abortSignal = controller.signal;

    const abortableResender = async () => {
        while (true) {
            await sleep(3_500);
            if (abortSignal.aborted) return;
            try {
                logToFile('Resending transaction...', debug);
                await connection.sendRawTransaction(
                    serializedTransaction,
                    SEND_OPTIONS,
                );
            } catch (e) {
                logToFile(`Failed to resend transaction: ${e}`, debug);
            }
        }
    };

    try {
        abortableResender();
        const lastValidBlockHeight =
            blockhashWithExpiryBlockHeight.lastValidBlockHeight - 50;
        logToFile(
            `Waiting for confirmation with lastValidBlockHeight: ${lastValidBlockHeight}`,
            debug,
        );

        // this would throw TransactionExpiredBlockheightExceededError
        await Promise.race([
            connection.confirmTransaction(
                {
                    ...blockhashWithExpiryBlockHeight,
                    lastValidBlockHeight,
                    signature: txid,
                    abortSignal,
                },
                'confirmed',
            ),
            new Promise(async resolve => {
                // in case ws socket died
                while (!abortSignal.aborted) {
                    await sleep(2_000);
                    logToFile('Checking transaction status...', debug);
                    const tx = await connection.getSignatureStatus(txid, {
                        searchTransactionHistory: false,
                    });
                    if (tx?.value?.confirmationStatus === 'confirmed') {
                        logToFile(
                            'Transaction confirmed via status check',
                            debug,
                        );
                        resolve(tx);
                    }
                }
            }),
        ]);
    } catch (e) {
        if (e instanceof TransactionExpiredBlockheightExceededError) {
            logToFile('Transaction expired, returning null', debug);
            // we consume this error and getTransaction would return null
            return null;
        } else {
            // invalid state from web3.js
            logToFile(`Unexpected error: ${e}`, debug);
            throw e;
        }
    } finally {
        logToFile('Aborting transaction monitoring', debug);
        controller.abort();
    }

    // in case rpc is not synced yet, we add some retries
    logToFile('Getting final transaction details with retries...', debug);
    const response = promiseRetry(
        async retry => {
            const response = await connection.getTransaction(txid, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            });
            if (!response) {
                logToFile('Transaction not found, retrying...', debug);
                retry(response);
            }
            return response;
        },
        {
            retries: 4,
            minTimeout: 1e3,
        },
    );

    logToFile('Transaction processing complete', debug);
    return response;
}

export async function handleSend(
    connection: Rpc,
    serializedTransaction: Buffer,
    blockhash: string,
    lastValidBlockHeight: number,
    debug: boolean,
) {
    const transactionResponse = await transactionSenderAndConfirmationWaiter({
        connection,
        serializedTransaction,
        blockhashWithExpiryBlockHeight: {
            blockhash,
            lastValidBlockHeight,
        },
        debug,
    });

    // If we are not getting a response back, the transaction has not confirmed.
    if (!transactionResponse) {
        console.error('Transaction not confirmed');
        return;
    }

    if (transactionResponse.meta?.err) {
        console.error(transactionResponse.meta?.err);
    }

    console.log(
        `https://solscan.io/tx/${transactionResponse.transaction.signatures[0]}`,
    );
}
