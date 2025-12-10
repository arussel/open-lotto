import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SEEDS, PROGRAM_ID } from "@open-lotto/types";

// Address formatting
export function shortenAddress(address: string | PublicKey, chars = 4): string {
  const addr = typeof address === "string" ? address : address.toBase58();
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

// Token amount formatting
export function formatTokenAmount(
  amount: BN | number | string,
  decimals: number = 9,
  displayDecimals: number = 2
): string {
  const bn = BN.isBN(amount) ? amount : new BN(amount.toString());
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = bn.div(divisor);
  const remainder = bn.mod(divisor);

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const decimalPart = remainderStr.slice(0, displayDecimals);

  if (displayDecimals === 0) {
    return whole.toString();
  }

  return `${whole.toString()}.${decimalPart}`;
}

export function parseTokenAmount(
  amount: string | number,
  decimals: number = 9
): BN {
  const str = amount.toString();
  const [whole, fraction = ""] = str.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return new BN(whole + paddedFraction);
}

// Time formatting
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Ended";

  const days = Math.floor(seconds / (60 * 60 * 24));
  const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const secs = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatTimestamp(timestamp: BN | number): string {
  const ts =
    typeof timestamp === "number" ? timestamp : timestamp.toNumber();
  const date = new Date(ts * 1000);
  return date.toLocaleString();
}

export function formatDate(timestamp: BN | number): string {
  const ts =
    typeof timestamp === "number" ? timestamp : timestamp.toNumber();
  const date = new Date(ts * 1000);
  return date.toLocaleDateString();
}

export function formatTime(timestamp: BN | number): string {
  const ts =
    typeof timestamp === "number" ? timestamp : timestamp.toNumber();
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString();
}

// PDA derivation
export function derivePotManagerPDA(
  authority: PublicKey,
  managerName: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.MANAGER, authority.toBuffer(), Buffer.from(managerName)],
    PROGRAM_ID
  );
}

export function derivePotPDA(
  potManager: PublicKey,
  endTimestamp: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.POT, potManager.toBuffer(), endTimestamp.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function deriveTicketPDA(
  pot: PublicKey,
  index: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.TICKET, pot.toBuffer(), index.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function deriveTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.TREASURY], PROGRAM_ID);
}

export function deriveEscrowPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.ESCROW], PROGRAM_ID);
}

export function deriveWagerEscrowPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.WAGER_ESCROW], PROGRAM_ID);
}

// Validation
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidAmount(amount: string): boolean {
  if (!amount || amount.trim() === "") return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

// Explorer URLs
export type Network = "mainnet-beta" | "devnet" | "testnet" | "localnet";

export function getExplorerUrl(
  type: "tx" | "address" | "token",
  value: string,
  network: Network = "devnet"
): string {
  const base = "https://explorer.solana.com";
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;

  switch (type) {
    case "tx":
      return `${base}/tx/${value}${cluster}`;
    case "address":
      return `${base}/address/${value}${cluster}`;
    case "token":
      return `${base}/address/${value}${cluster}`;
  }
}

export function getSolscanUrl(
  type: "tx" | "account" | "token",
  value: string,
  network: Network = "devnet"
): string {
  const subdomain = network === "mainnet-beta" ? "" : `${network}.`;
  const base = `https://${subdomain}solscan.io`;

  switch (type) {
    case "tx":
      return `${base}/tx/${value}`;
    case "account":
      return `${base}/account/${value}`;
    case "token":
      return `${base}/token/${value}`;
  }
}

// Number formatting
export function formatNumber(num: number | BN, locale = "en-US"): string {
  const n = BN.isBN(num) ? num.toNumber() : num;
  return n.toLocaleString(locale);
}

export function formatPercentage(
  value: number,
  decimals: number = 2
): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Re-exports
export { BN } from "bn.js";
export { PublicKey } from "@solana/web3.js";
