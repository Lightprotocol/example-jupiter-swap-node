import { Connection, TransactionMessage } from "@solana/web3.js";
import { AddressLookupTableAccount } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import {
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createJupiterApiClient,
  Instruction,
  QuoteGetRequest,
  QuoteResponse,
  SwapRequest,
} from "@jup-ag/api";
import {
  CompressedTokenProgram,
  selectMinCompressedTokenAccountsForTransfer,
} from "@lightprotocol/compressed-token";
import {
  bn,
  defaultTestStateTreeAccounts,
  Rpc,
} from "@lightprotocol/stateless.js";
import { lightLut, swapConfig } from "./constants.ts";
import { logEnd, logToFile } from "./logger.ts";

const jupiterApi = createJupiterApiClient();

const deserializeInstruction = (instruction: Instruction) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

const getAddressLookupTableAccounts = async (
  keys: string[],
  connection: Connection
): Promise<AddressLookupTableAccount[]> => {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
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
  debug: boolean
) => {
  const quoteGetRequest: QuoteGetRequest = {
    ...swapConfig,
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount,
  };
  const quoteResponse: QuoteResponse = await jupiterApi.quoteGet(
    quoteGetRequest
  );
  logToFile(`quoteResponse ${JSON.stringify(quoteResponse, null)}`, debug);
  return quoteResponse;
};

const getSwapInstructions = async (
  swapUserPubkey: PublicKey,
  quoteResponse: QuoteResponse
) => {
  const swapRequest: SwapRequest = {
    userPublicKey: swapUserPubkey.toBase58(),
    quoteResponse,
    skipUserAccountsRpcCalls: false,
    dynamicComputeUnitLimit: true,
    wrapAndUnwrapSol: true,
    prioritizationFeeLamports: 40_000,
  };

  const instructions = await jupiterApi.swapInstructionsPost({ swapRequest });
  return instructions;
};

const getDecompressInstruction = async (
  mint: PublicKey,
  amount: number,
  connection: Rpc,
  owner: PublicKey,
  ata: PublicKey
) => {
  amount = bn(amount);

  const compressedTokenAccounts =
    await connection.getCompressedTokenAccountsByOwner(owner, {
      mint,
    });

  const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
    compressedTokenAccounts.items,
    amount
  );

  const proof = await connection.getValidityProof(
    inputAccounts.map((account) => bn(account.compressedAccount.hash))
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

export async function buildCompressedSwapTx(
  connection: Rpc,
  payerPublicKey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  debug: boolean
) {
  const instructions = await getSwapInstructions(
    payerPublicKey,
    await getQuote(inputMint, outputMint, amount, debug)
  );

  const {
    tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
    computeBudgetInstructions, // The necessary instructions to setup the compute budget.
    setupInstructions, // Setup missing ATA for the users.
    swapInstruction: swapInstructionPayload, // The actual swap instruction.
    cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
    addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
  } = instructions;

  const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

  // Light LUT
  addressLookupTableAddresses.push(lightLut);
  addressLookupTableAccounts.push(
    ...(await getAddressLookupTableAccounts(
      addressLookupTableAddresses,
      connection
    ))
  );

  const inAta = getAssociatedTokenAddressSync(inputMint, payerPublicKey);
  const decompressIx = await getDecompressInstruction(
    inputMint,
    amount,
    connection,
    payerPublicKey,
    inAta
  );
  const createInAtaIx = createAssociatedTokenAccountInstruction(
    payerPublicKey,
    inAta,
    payerPublicKey,
    inputMint
  );

  const closeInAtaIx = createCloseAccountInstruction(
    inAta,
    payerPublicKey,
    payerPublicKey
  );

  const allInstructions = [
    ...computeBudgetInstructions.map(deserializeInstruction),
    createInAtaIx,
    decompressIx,
    ...setupInstructions.map(deserializeInstruction),
    deserializeInstruction(swapInstructionPayload),
    closeInAtaIx,
    deserializeInstruction(cleanupInstruction!),
  ].filter(Boolean);

  logToFile("Instructions:", debug);
  allInstructions.forEach((ix, i) => {
    logToFile(
      `${i}. ${ix.programId.toString()}: ${ix.data.length} bytes, ${
        ix.keys.length
      } accounts`
    );
    logToFile(
      `Account indices: ${ix.keys.map((k) => k.pubkey.toString()).join(", ")}`
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
    logToFile(`Transaction size (bytes): ${transaction.serialize().length}`);
    logToFile(`transaction ${JSON.stringify(transaction, null)}`, debug);
    logEnd(debug);
    return transaction;
  } catch (e) {
    logToFile(`Error compiling transaction: ${e}`, debug);
    throw Error(`Tx too large. Skipping.`);
  }
}
