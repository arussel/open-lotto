import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Program ID
export const PROGRAM_ID = new PublicKey(
  "FVzki74o5zsTDK1ShhQ6EyR3m2ft7HRgeSkCiEsE8aDf"
);

// Constants
export const POT_AMOUNT = new BN(100_000_000); // 0.1 tokens (assuming 9 decimals)
export const FEE_AMOUNT = new BN(10_000_000); // 0.01 tokens (assuming 9 decimals)

// PDA Seeds
export const SEEDS = {
  MANAGER: Buffer.from("manager"),
  POT: Buffer.from("pot"),
  TICKET: Buffer.from("ticket"),
  TREASURY: Buffer.from("treasury"),
  ESCROW: Buffer.from("escrow"),
  WAGER_ESCROW: Buffer.from("wagerEscrow"),
} as const;

// Account Types
export interface Pot {
  totalParticipants: BN;
  startTimestamp: BN;
  endTimestamp: BN;
  winningSlot: BN;
  randomnessAccount: PublicKey;
}

export interface Ticket {
  participant: PublicKey;
  index: BN;
}

export interface PotManager {
  authority: PublicKey;
  tokenMint: PublicKey;
  potDuration: BN;
  currentPot: PublicKey;
  nextPot: PublicKey;
}

// Instruction Args
export interface InitPotManagerArgs {
  endTs: BN;
  potDuration: BN;
  managerName: string;
}

export interface DrawLotteryArgs {
  randomnessAccount: PublicKey;
}

// Error Codes
export enum OpenLottoError {
  EndTimestampPassed = 6000,
  PotClosed = 6001,
  RandomnessAlreadyRevealed = 6002,
  NotEnoughFundsToPlay = 6003,
  InvalidRandomnessAccount = 6004,
  RandomnessNotResolved = 6005,
  TicketAccountNotWinning = 6006,
}

export const ERROR_MESSAGES: Record<OpenLottoError, string> = {
  [OpenLottoError.EndTimestampPassed]: "End timestamp has passed",
  [OpenLottoError.PotClosed]: "The pot is already closed",
  [OpenLottoError.RandomnessAlreadyRevealed]:
    "The randomness has already been revealed",
  [OpenLottoError.NotEnoughFundsToPlay]: "Not enough funds to play",
  [OpenLottoError.InvalidRandomnessAccount]: "Invalid randomness account",
  [OpenLottoError.RandomnessNotResolved]: "Randomness not resolved",
  [OpenLottoError.TicketAccountNotWinning]: "Ticket account is not winning",
};

// Pot Status Helper
export enum PotStatus {
  Active = "active",
  Drawing = "drawing",
  Settled = "settled",
  Closed = "closed",
}

export function getPotStatus(pot: Pot): PotStatus {
  const now = Math.floor(Date.now() / 1000);
  const endTime = pot.endTimestamp.toNumber();
  const hasRandomness = !pot.randomnessAccount.equals(PublicKey.default);
  const hasWinner = pot.winningSlot.toNumber() > 0;

  if (now < endTime) {
    return PotStatus.Active;
  }
  if (hasWinner) {
    return PotStatus.Settled;
  }
  if (hasRandomness) {
    return PotStatus.Drawing;
  }
  return PotStatus.Closed;
}

// Time helpers
export function getTimeRemaining(endTimestamp: BN): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const end = endTimestamp.toNumber();
  const total = Math.max(0, end - now);

  return {
    days: Math.floor(total / (60 * 60 * 24)),
    hours: Math.floor((total % (60 * 60 * 24)) / (60 * 60)),
    minutes: Math.floor((total % (60 * 60)) / 60),
    seconds: total % 60,
    total,
  };
}

// Account discriminators (for filtering)
export const DISCRIMINATORS = {
  POT: Buffer.from([238, 118, 60, 175, 178, 191, 59, 58]),
  TICKET: Buffer.from([41, 228, 24, 165, 78, 90, 235, 200]),
} as const;

// Re-export common types
export type { PublicKey } from "@solana/web3.js";
export { BN } from "bn.js";
