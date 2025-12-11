import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import { sha256 } from "js-sha256";
import {
  PROGRAM_ID,
  SEEDS,
  Pot,
  Ticket,
  PotManager,
  DISCRIMINATORS,
  getPotStatus,
  PotStatus,
} from "@open-lotto/types";
import {
  derivePotManagerPDA,
  derivePotPDA,
  deriveTicketPDA,
  deriveTreasuryPDA,
  deriveEscrowPDA,
  deriveWagerEscrowPDA,
} from "@open-lotto/utils";

// Switchboard constants
const SB_ON_DEMAND_DEVNET = new PublicKey(
  "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2"
);
const SB_ON_DEMAND_MAINNET = new PublicKey(
  "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"
);
const SB_QUEUE_DEVNET = new PublicKey(
  "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7"
);
const SB_QUEUE_MAINNET = new PublicKey(
  "A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w"
);
const WRAPPED_SOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export type Network = "mainnet-beta" | "devnet" | "localnet";

export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]>;
}

export interface OpenLottoClientConfig {
  connection: Connection;
  wallet?: WalletAdapter;
  network?: Network;
}

export interface PotWithAddress extends Pot {
  address: PublicKey;
}

export interface TicketWithAddress extends Ticket {
  address: PublicKey;
}

export interface PotManagerWithAddress extends PotManager {
  address: PublicKey;
}

export class OpenLottoClient {
  public readonly connection: Connection;
  public readonly network: Network;
  private wallet?: WalletAdapter;

  constructor(config: OpenLottoClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.network = config.network || "devnet";
  }

  setWallet(wallet: WalletAdapter) {
    this.wallet = wallet;
  }

  get publicKey(): PublicKey | null {
    return this.wallet?.publicKey || null;
  }

  // ============ Admin Instructions ============

  async initPotManager(params: {
    managerName: string;
    tokenMint: PublicKey;
    endTimestamp: BN;
    potDuration: BN;
  }): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const authority = this.wallet.publicKey;

    // Derive PDAs
    const [potManager] = derivePotManagerPDA(authority, params.managerName);
    const [treasuryTokenAccount] = deriveTreasuryPDA();
    const [escrowTokenAccount] = deriveEscrowPDA();
    const [firstPot] = derivePotPDA(potManager, params.endTimestamp);
    const nextEndTs = params.endTimestamp.add(params.potDuration);
    const [nextPot] = derivePotPDA(potManager, nextEndTs);

    // Build instruction
    const discriminator = this.getDiscriminator("init_pot_manager");
    const data = Buffer.concat([
      discriminator,
      params.endTimestamp.toArrayLike(Buffer, "le", 8),
      params.potDuration.toArrayLike(Buffer, "le", 8),
      this.encodeString(params.managerName),
    ]);

    const keys = [
      { pubkey: potManager, isSigner: false, isWritable: true },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: firstPot, isSigner: false, isWritable: true },
      { pubkey: nextPot, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });

    return this.sendTransaction([instruction]);
  }

  async drawLottery(params: {
    pot: PublicKey;
    randomnessAccount: PublicKey;
  }): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const [wagerEscrow] = deriveWagerEscrowPDA();

    const discriminator = this.getDiscriminator("draw_lottery");
    const data = Buffer.concat([
      discriminator,
      params.randomnessAccount.toBuffer(),
    ]);

    const keys = [
      { pubkey: params.pot, isSigner: false, isWritable: true },
      { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: params.randomnessAccount, isSigner: false, isWritable: false },
      { pubkey: wagerEscrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });

    return this.sendTransaction([instruction]);
  }

  async settleLottery(params: {
    pot: PublicKey;
    randomnessAccount: PublicKey;
  }): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const discriminator = this.getDiscriminator("settle_lottery");

    const keys = [
      { pubkey: params.pot, isSigner: false, isWritable: true },
      { pubkey: params.randomnessAccount, isSigner: false, isWritable: false },
      { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data: discriminator,
    });

    return this.sendTransaction([instruction]);
  }

  // ============ User Instructions ============

  async enterTicket(params: {
    pot: PublicKey;
    potTotalParticipants: BN;
    tokenMint: PublicKey;
  }): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const user = this.wallet.publicKey;
    const [ticket] = deriveTicketPDA(params.pot, params.potTotalParticipants);
    const [escrowTokenAccount] = deriveEscrowPDA();
    const [treasuryTokenAccount] = deriveTreasuryPDA();

    // Get user's ATA address
    const userTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      user
    );

    const instructions: TransactionInstruction[] = [];

    // Check if user's ATA exists, if not create it
    const ataInfo = await this.connection.getAccountInfo(userTokenAccount);
    if (!ataInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          user, // payer
          userTokenAccount, // ata
          user, // owner
          params.tokenMint // mint
        )
      );
    }

    const discriminator = this.getDiscriminator("enter_ticket");

    const keys = [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: params.pot, isSigner: false, isWritable: true },
      { pubkey: ticket, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    instructions.push(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: discriminator,
      })
    );

    return this.sendTransaction(instructions);
  }

  async claimPrize(params: {
    ticket: PublicKey;
    winner: PublicKey;
    pot: PublicKey;
    tokenMint: PublicKey;
  }): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const [escrowTokenAccount] = deriveEscrowPDA();
    const winnerTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      params.winner
    );

    const discriminator = this.getDiscriminator("claim_prize");

    const keys = [
      { pubkey: params.ticket, isSigner: false, isWritable: true },
      { pubkey: params.winner, isSigner: false, isWritable: false },
      { pubkey: params.pot, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: winnerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data: discriminator,
    });

    return this.sendTransaction([instruction]);
  }

  // ============ Account Fetchers ============

  async getPot(address: PublicKey): Promise<Pot | null> {
    const accountInfo = await this.connection.getAccountInfo(address);
    if (!accountInfo) return null;
    return this.parsePotAccount(accountInfo.data);
  }

  async getTicket(address: PublicKey): Promise<Ticket | null> {
    const accountInfo = await this.connection.getAccountInfo(address);
    if (!accountInfo) return null;
    return this.parseTicketAccount(accountInfo.data);
  }

  async getAllPots(): Promise<PotWithAddress[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(DISCRIMINATORS.POT)),
          },
        },
      ],
    });

    return accounts
      .map((account) => {
        const pot = this.parsePotAccount(account.account.data);
        if (!pot) return null;
        return { ...pot, address: account.pubkey };
      })
      .filter((p): p is PotWithAddress => p !== null);
  }

  async getActivePots(): Promise<PotWithAddress[]> {
    const allPots = await this.getAllPots();
    return allPots.filter((pot) => getPotStatus(pot) === PotStatus.Active);
  }

  async getUserTickets(user: PublicKey): Promise<TicketWithAddress[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(DISCRIMINATORS.TICKET)),
          },
        },
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: user.toBase58(),
          },
        },
      ],
    });

    return accounts
      .map((account) => {
        const ticket = this.parseTicketAccount(account.account.data);
        if (!ticket) return null;
        return { ...ticket, address: account.pubkey };
      })
      .filter((t): t is TicketWithAddress => t !== null);
  }

  async getWinningTicket(pot: PublicKey): Promise<TicketWithAddress | null> {
    const potData = await this.getPot(pot);
    if (!potData || potData.winningSlot.isZero()) return null;

    const [ticketAddress] = deriveTicketPDA(pot, potData.winningSlot);
    const ticket = await this.getTicket(ticketAddress);
    if (!ticket) return null;

    return { ...ticket, address: ticketAddress };
  }

  async getPotManager(address: PublicKey): Promise<PotManager | null> {
    const accountInfo = await this.connection.getAccountInfo(address);
    if (!accountInfo) return null;
    return this.parsePotManagerAccount(accountInfo.data);
  }

  async getAllPotManagers(): Promise<PotManagerWithAddress[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(DISCRIMINATORS.POT_MANAGER)),
          },
        },
      ],
    });

    return accounts
      .map((account) => {
        const manager = this.parsePotManagerAccount(account.account.data);
        if (!manager) return null;
        return { ...manager, address: account.pubkey };
      })
      .filter((m): m is PotManagerWithAddress => m !== null);
  }

  async getPotsForManager(managerAddress: PublicKey): Promise<PotWithAddress[]> {
    const allPots = await this.getAllPots();
    return allPots.filter((pot) => pot.potManager.equals(managerAddress));
  }

  async getTokenBalance(
    owner: PublicKey,
    mint: PublicKey
  ): Promise<BN> {
    try {
      const ata = await getAssociatedTokenAddress(mint, owner);
      const balance = await this.connection.getTokenAccountBalance(ata);
      return new BN(balance.value.amount);
    } catch {
      return new BN(0);
    }
  }

  async getEscrowBalance(mint: PublicKey): Promise<BN> {
    const [escrow] = deriveEscrowPDA();
    try {
      const balance = await this.connection.getTokenAccountBalance(escrow);
      return new BN(balance.value.amount);
    } catch {
      return new BN(0);
    }
  }

  async getTreasuryBalance(mint: PublicKey): Promise<BN> {
    const [treasury] = deriveTreasuryPDA();
    try {
      const balance = await this.connection.getTokenAccountBalance(treasury);
      return new BN(balance.value.amount);
    } catch {
      return new BN(0);
    }
  }

  // ============ Switchboard Helpers ============

  getSwitchboardProgramId(): PublicKey {
    return this.network === "mainnet-beta"
      ? SB_ON_DEMAND_MAINNET
      : SB_ON_DEMAND_DEVNET;
  }

  getSwitchboardQueue(): PublicKey {
    return this.network === "mainnet-beta"
      ? SB_QUEUE_MAINNET
      : SB_QUEUE_DEVNET;
  }

  async checkRandomnessStatus(
    randomnessAccount: PublicKey
  ): Promise<"not_found" | "initialized" | "committed" | "revealed"> {
    const accountInfo = await this.connection.getAccountInfo(randomnessAccount);
    if (!accountInfo) return "not_found";

    // Check if revealed (reveal_slot > 0)
    // Offset: 8 (disc) + 32 (authority) + 32 (queue) + 32 (seed_slothash) + 8 (seed_slot) + 32 (oracle) = 144
    const revealSlotOffset = 144;
    if (accountInfo.data.length < revealSlotOffset + 8) return "initialized";

    const revealSlot = new BN(
      accountInfo.data.slice(revealSlotOffset, revealSlotOffset + 8),
      "le"
    );

    if (!revealSlot.isZero()) return "revealed";

    // Check if committed (seed_slot > 0)
    const seedSlotOffset = 104;
    const seedSlot = new BN(
      accountInfo.data.slice(seedSlotOffset, seedSlotOffset + 8),
      "le"
    );

    if (!seedSlot.isZero()) return "committed";

    return "initialized";
  }

  // ============ Private Helpers ============

  private async sendTransaction(
    instructions: TransactionInstruction[]
  ): Promise<string> {
    if (!this.wallet?.publicKey) throw new Error("Wallet not connected");

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: this.wallet.publicKey,
    });

    instructions.forEach((ix) => transaction.add(ix));

    const signed = await this.wallet.signTransaction(transaction);
    const signature = await this.connection.sendRawTransaction(
      signed.serialize()
    );

    await this.connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
    });

    return signature;
  }

  private getDiscriminator(name: string): Buffer {
    const hash = sha256.array(`global:${name}`);
    return Buffer.from(hash.slice(0, 8));
  }

  private encodeString(str: string): Buffer {
    const bytes = Buffer.from(str, "utf8");
    const lenBuffer = Buffer.alloc(4);
    lenBuffer.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([lenBuffer, bytes]);
  }

  private parsePotAccount(data: Buffer): Pot | null {
    try {
      // Skip 8-byte discriminator
      let offset = 8;

      const potManager = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const totalParticipants = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const startTimestamp = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const endTimestamp = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const winningSlot = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const randomnessAccount = new PublicKey(data.slice(offset, offset + 32));

      return {
        potManager,
        totalParticipants,
        startTimestamp,
        endTimestamp,
        winningSlot,
        randomnessAccount,
      };
    } catch {
      return null;
    }
  }

  private parseTicketAccount(data: Buffer): Ticket | null {
    try {
      // Skip 8-byte discriminator
      let offset = 8;

      const participant = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const index = new BN(data.slice(offset, offset + 8), "le");

      return { participant, index };
    } catch {
      return null;
    }
  }

  private parsePotManagerAccount(data: Buffer): PotManager | null {
    try {
      // Skip 8-byte discriminator
      let offset = 8;

      const authority = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const treasury = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const tokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const rent = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const lastRandomNumber = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const currentEndTs = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const nextEndTs = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const bump = data[offset];
      offset += 1;

      // Read string: 4 bytes length prefix + content
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLen).toString("utf8");

      return {
        authority,
        treasury,
        tokenMint,
        rent,
        lastRandomNumber,
        timestamps: [currentEndTs, nextEndTs],
        bump,
        name,
      };
    } catch {
      return null;
    }
  }
}

// Re-exports
export * from "@open-lotto/types";
export * from "@open-lotto/utils";
export { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
export { BN } from "bn.js";
