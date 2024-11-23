import { Rpc } from "@lightprotocol/stateless.js";
import { compress } from "@lightprotocol/compressed-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, closeAccount } from "@solana/spl-token";

export async function compressTokenAndCleanupAtaSetup(
  mint: PublicKey,
  connection: Rpc,
  swapUserKeypair: Keypair
) {
  const payerPublicKey = swapUserKeypair.publicKey;
  const ata = getAssociatedTokenAddressSync(mint, payerPublicKey);
  let cleanupALlAmount;
  try {
    const tokenAccount = await connection.getAccountInfo(ata);
    if (!tokenAccount) return { compressTxId: null, closeTxId: null };

    cleanupALlAmount = await connection.getTokenAccountBalance(ata);
    if (cleanupALlAmount.value.amount !== "0") {
      const compressTxId = await compress(
        connection,
        swapUserKeypair,
        mint,
        cleanupALlAmount.value.amount,
        swapUserKeypair,
        ata,
        payerPublicKey
      );

      console.log("compressTxId", compressTxId, cleanupALlAmount.value.amount);
    }
  } catch (e) {
    console.log(
      "compressTokenAndCleanupAtaSetup: ata not found or compression failed: ",
      e
    );
  }

  // check that balance is 0
  cleanupALlAmount = await connection.getTokenAccountBalance(ata);
  if (cleanupALlAmount.value.amount !== "0")
    throw new Error("balance is not 0");

  const closeTxId = await closeAccount(
    connection,
    swapUserKeypair,
    ata,
    payerPublicKey,
    payerPublicKey
  );
  console.log("closeTxId", closeTxId);
}
