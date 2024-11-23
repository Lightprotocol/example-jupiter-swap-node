import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import dotenv from "dotenv";
import os from "os";
import { QuoteGetRequest, SwapRequest } from "@jup-ag/api";

dotenv.config();

if (!process.env.INPUT_MINT) throw new Error("INPUT_MINT is not set");
if (!process.env.SWAP_USER_KEYPAIR_PATH)
  throw new Error("SWAP_USER_KEYPAIR_PATH is not set");
if (!process.env.LIGHT_LUT && !process.env.LIGHT_LUT_DEVNET)
  throw new Error("LIGHT_LUT and LIGHT_LUT_DEVNET is not set");

if (!process.env.RPC_URL) throw new Error("RPC_URL is not set");
if (!process.env.COMPRESSION_URL) throw new Error("COMPRESSION_URL is not set");

export const swapUserKeypair = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(
      fs.readFileSync(
        process.env.SWAP_USER_KEYPAIR_PATH!.replace("~", os.homedir()),
        "utf8"
      )
    )
  )
);
export const payerPublicKey = swapUserKeypair.publicKey;
export const inputMint = new PublicKey(process.env.INPUT_MINT!);
export const outputMint = new PublicKey(process.env.OUTPUT_MINT!);
export const compressionUrl = process.env.COMPRESSION_URL!;
export const rpcUrl = process.env.RPC_URL!;
export const lightLut = process.env.LIGHT_LUT!;

console.log("payerPublicKey: ", payerPublicKey.toBase58());
console.log("inputMint: ", inputMint.toBase58());
console.log("outputMint: ", outputMint.toBase58());

export const amount = 1042; // 0.001042 usdc
export const swapConfig: QuoteGetRequest = {
  inputMint: inputMint.toBase58(),
  outputMint: outputMint.toBase58(),
  amount,
  maxAccounts: 64,
  onlyDirectRoutes: true,
  restrictIntermediateTokens: true,
  slippageBps: 500,
  computeAutoSlippage: true,
  minimizeSlippage: true,
  preferLiquidDexes: true,
};

export const swapRequestConfig: SwapRequest = {
  userPublicKey: null!, // set in handleSend
  quoteResponse: null!, // set in handleSend
  skipUserAccountsRpcCalls: false,
  dynamicComputeUnitLimit: true,
  wrapAndUnwrapSol: true,
  prioritizationFeeLamports: 100_000,
};

console.log("swapConfig: ", swapConfig);
