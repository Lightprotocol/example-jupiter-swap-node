import { Keypair, PublicKey } from '@solana/web3.js';
import { QuoteGetRequest, SwapRequest } from '@jup-ag/api';
import fs from 'fs';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

dotenv.config();
export const LOG_FILE = path.join(process.cwd(), 'swap.log');

if (!process.env.INPUT_MINT) throw new Error('INPUT_MINT is not set');
if (!process.env.OUTPUT_MINT) throw new Error('OUTPUT_MINT is not set');
if (!process.env.SWAP_USER_KEYPAIR_PATH)
    throw new Error('SWAP_USER_KEYPAIR_PATH is not set');
if (!process.env.LIGHT_LUT) throw new Error('LIGHT_LUT is not set');
if (!process.env.RPC_URL) throw new Error('RPC_URL is not set');
if (!process.env.COMPRESSION_URL) throw new Error('COMPRESSION_URL is not set');

// custom token program id for purpose of testing the compressOutAta feature
export const TOKEN_PROGRAM_ID = new PublicKey(
    'Dw9m1S3xhNyuBRVuxuyfhdhAz9VP7onbWPbPgbaMicwi',
);
export const INPUT_MINT = new PublicKey(process.env.INPUT_MINT!);
export const OUTPUT_MINT = new PublicKey(process.env.OUTPUT_MINT!);
export const COMPRESSION_URL = process.env.COMPRESSION_URL!;
export const RPC_URL = process.env.RPC_URL!;
export const LIGHT_LUT = process.env.LIGHT_LUT!;

export const SWAP_USER_KEYPAIR = Keypair.fromSecretKey(
    Buffer.from(
        JSON.parse(
            fs.readFileSync(
                process.env.SWAP_USER_KEYPAIR_PATH!.replace('~', os.homedir()),
                'utf8',
            ),
        ),
    ),
);
export const PAYER_PUBLIC_KEY = SWAP_USER_KEYPAIR.publicKey;

export const AMOUNT: number = 1e3; // 0.001 USDC
export const SWAP_CONFIG: QuoteGetRequest = {
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
};

export const SWAP_REQUEST_CONFIG: SwapRequest = {
    userPublicKey: null!, // set in handleSend.ts
    quoteResponse: null!, // set in handleSend.ts
    skipUserAccountsRpcCalls: true,
    dynamicComputeUnitLimit: false,
    wrapAndUnwrapSol: false,
    prioritizationFeeLamports: 200_000,
};

console.log('INPUT_MINT: ', INPUT_MINT.toBase58());
console.log('OUTPUT_MINT: ', OUTPUT_MINT.toBase58());
console.log('PAYER_PUBLIC_KEY: ', PAYER_PUBLIC_KEY.toBase58());
console.log('SWAP_CONFIG: ', SWAP_CONFIG);
