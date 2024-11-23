import { buildCompressedSwapTx } from "./buildCompressedSwapTx.ts";
import { Rpc, sleep } from "@lightprotocol/stateless.js";
import {
  payerPublicKey,
  swapUserKeypair,
  inputMint,
  outputMint,
  amount,
  compressionUrl,
  rpcUrl,
} from "./constants.ts";
import { compressTokenAndCleanupAtaSetup } from "./setup.ts";
import { logToFile } from "./logger.ts";
import { handleSend } from "./handleSend.ts";
type Flow = "dryrun" | "send";
let ROUNDS = 5;

async function main(flow: Flow = "dryrun", debug: boolean = true) {
  console.log("Compressed Jupiter swap started");
  console.log(`Flow: ${flow}, Debug: ${debug}, Total rounds: ${ROUNDS}`);

  if (debug) console.log("Storing debug info in swap.log");
  while (ROUNDS > 0) {
    ROUNDS--;
    try {
      const connection = new Rpc(rpcUrl, compressionUrl, compressionUrl);

      // reset the setup
      await compressTokenAndCleanupAtaSetup(
        inputMint,
        connection,
        swapUserKeypair // also payer
      );

      const transaction = await buildCompressedSwapTx(
        connection,
        payerPublicKey,
        inputMint,
        outputMint,
        amount,
        debug
      );

      transaction.sign([swapUserKeypair]);

      const txLength = transaction.serialize().length;
      console.log(`Transaction size: ${txLength} bytes`);

      if (txLength > 1232) {
        console.log(
          "Transaction size exceeded 1232 bytes by ",
          txLength - 1232,
          "bytes, skipping"
        );
        continue;
      }

      if (flow === "dryrun") {
        console.log("dryrun completed");
        continue;
      }

      const result = await handleSend(
        connection,
        Buffer.from(transaction.serialize()),
        transaction.message.recentBlockhash,
        (
          await connection.getLatestBlockhash()
        ).lastValidBlockHeight,
        debug
      );
      logToFile(`Transaction result: ${JSON.stringify(result, null)}`, debug);
      sleep(1000);
    } catch (error) {
      console.error("Error:", error);
    }
  }
}
const args = process.argv.slice(2);
const flow = (args[0] as Flow) || "dryrun";
const debug = args[1] === "true" || false;

main(flow, debug);
