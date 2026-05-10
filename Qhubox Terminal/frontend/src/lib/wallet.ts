// src/lib/wallet.ts
// Real Solana wallet connection — supports Phantom, Solflare, Backpack, Glow

import { Connection, PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL as _LAMPORTS_PER_SOL } from '@solana/web3.js';
export const LAMPORTS_PER_SOL = _LAMPORTS_PER_SOL;

export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

export interface WalletProvider {
  name: string;
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (txs: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  sendTransaction?: (tx: Transaction | VersionedTransaction, connection: Connection) => Promise<string>;
}

export function detectWallet(): { provider: any; name: string } | null {
  if (typeof window === 'undefined') return null;

  const w = window as any;

  if (w.phantom?.solana?.isPhantom) return { provider: w.phantom.solana, name: 'Phantom' };
  if (w.solana?.isPhantom) return { provider: w.solana, name: 'Phantom' };
  if (w.solflare?.isSolflare) return { provider: w.solflare, name: 'Solflare' };
  if (w.backpack?.isBackpack) return { provider: w.backpack, name: 'Backpack' };
  if (w.glow) return { provider: w.glow, name: 'Glow' };
  if (w.coin98?.sol) return { provider: w.coin98.sol, name: 'Coin98' };
  if (w.okxwallet?.solana) return { provider: w.okxwallet.solana, name: 'OKX Wallet' };

  return null;
}

export async function connectWallet(): Promise<{ publicKey: string; name: string; balance: number }> {
  const detected = detectWallet();
  if (!detected) throw new Error('No Solana wallet found. Please install Phantom or Solflare.');

  const { provider, name } = detected;

  let resp: any;
  if (provider.connect) {
    resp = await provider.connect();
  }

  const publicKey: PublicKey = resp?.publicKey || provider.publicKey;
  if (!publicKey) throw new Error('Could not get public key from wallet.');

  const pk = publicKey.toString();

  // Fetch real SOL balance
  let balance = 0;
  try {
    const lamports = await connection.getBalance(new PublicKey(pk));
    balance = lamports / LAMPORTS_PER_SOL;
  } catch (_) {}

  return { publicKey: pk, name, balance };
}

export async function getSOLBalance(publicKey: string): Promise<number> {
  try {
    const lamports = await connection.getBalance(new PublicKey(publicKey));
    return lamports / LAMPORTS_PER_SOL;
  } catch (_) {
    return 0;
  }
}

// Jupiter Aggregator v6 — Real swap quote + transaction
export const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number
): Promise<SwapQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountLamports),
    slippageBps: String(slippageBps),
    onlyDirectRoutes: 'false',
    asLegacyTransaction: 'false',
  });

  const res = await fetch(`${JUPITER_QUOTE_URL}/quote?${params}`);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.statusText}`);
  return res.json();
}

export async function buildSwapTransaction(
  quoteResponse: SwapQuote,
  userPublicKey: string
): Promise<{ swapTransaction: string }> {
  const res = await fetch(`${JUPITER_QUOTE_URL}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.statusText}`);
  return res.json();
}

export async function executeSwap(
  swapTransactionBase64: string,
  walletProvider: any
): Promise<string> {
  const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  const signed = await walletProvider.signTransaction(transaction);
  const rawTx = signed.serialize();

  const txid = await connection.sendRawTransaction(rawTx, {
    skipPreflight: true,
    maxRetries: 3,
  });

  // Confirm
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  return txid;
}
