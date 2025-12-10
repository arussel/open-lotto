use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("FVzki74o5zsTDK1ShhQ6EyR3m2ft7HRgeSkCiEsE8aDf");

#[program]
pub mod open_lotto {
    use super::*;
    use anchor_lang::solana_program::program::set_return_data;
    use switchboard_on_demand::RandomnessAccountData;

    // Token amounts (using smallest token unit, e.g., 6 decimals = 1 token = 1_000_000)
    const POT_AMOUNT: u64 = 9_000_000; // 9 tokens to prize pool
    const FEE: u64 = 1_000_000;        // 1 token to treasury
    const WAGER: u64 = 100;            // Oracle wager

    pub fn init_pot_manager(
        ctx: Context<InitPotManager>,
        end_ts: u64,
        pot_duration: u64,
        manager_name: String,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp as u64;
        if end_ts < now {
            return Err(ErrorCode::EndTimestampPassed.into());
        }

        let next_timestamp = end_ts + pot_duration;
        let pot_manager = &mut ctx.accounts.pot_manager;
        let pot_manager_key = pot_manager.key();

        pot_manager.timestamps = (end_ts, next_timestamp);

        // store bump
        pot_manager.bump = ctx.bumps.pot_manager;

        // initialize state
        pot_manager.treasury = ctx.accounts.treasury_token_account.key();
        pot_manager.token_mint = ctx.accounts.token_mint.key();
        pot_manager.last_random_number = 0;
        pot_manager.rent = ctx.accounts.rent.minimum_balance(PotManager::space());
        pot_manager.name = manager_name;

        // initialize pots with reference to pot manager
        ctx.accounts.first_pot.pot_manager = pot_manager_key;
        ctx.accounts.first_pot.start_timestamp = now;
        ctx.accounts.first_pot.end_timestamp = end_ts;
        ctx.accounts.first_pot.total_participants = 0;
        ctx.accounts.next_pot.pot_manager = pot_manager_key;
        ctx.accounts.next_pot.start_timestamp = end_ts + 1;
        ctx.accounts.next_pot.end_timestamp = end_ts + pot_duration;
        ctx.accounts.next_pot.total_participants = 0;

        // store authority
        pot_manager.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn enter_ticket(ctx: Context<EnterLottery>) -> Result<()> {
        if ctx.accounts.pot.end_timestamp < Clock::get()?.unix_timestamp as u64 {
            return Err(ErrorCode::PotClosed.into());
        }
        ctx.accounts.ticket.index = ctx.accounts.pot.total_participants;
        ctx.accounts.ticket.participant = ctx.accounts.user.key();
        ctx.accounts.pot.total_participants += 1;

        // Transfer tokens to escrow (prize pool)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            POT_AMOUNT,
        )?;

        // Transfer fee tokens to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            FEE,
        )?;

        Ok(())
    }

    pub fn draw_lottery(ctx: Context<DrawLottery>, randomness_account: Pubkey) -> Result<()> {
        let clock = Clock::get()?;
        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .map_err(|_| ErrorCode::RandomnessNotResolved)?;
        if randomness_data.seed_slot != clock.slot - 1 {
            msg!("seed_slot: {}", randomness_data.seed_slot);
            msg!("slot: {}", clock.slot);
            return Err(ErrorCode::RandomnessAlreadyRevealed.into());
        }

        // Transfer SOL wager for oracle (this stays as SOL)
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.wager_escrow.to_account_info(),
                },
            ),
            WAGER,
        )?;

        ctx.accounts.pot.randomness_account = randomness_account;

        Ok(())
    }

    pub fn settle_lottery(ctx: Context<SettleLottery>) -> Result<()> {
        let clock = Clock::get()?;
        let pot = &mut ctx.accounts.pot;

        if ctx.accounts.randomness_account_data.key() != pot.randomness_account {
            return Err(ErrorCode::InvalidRandomnessAccount.into());
        }

        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .map_err(|_| ErrorCode::RandomnessNotResolved)?;
        let revealed_random_value = randomness_data
            .get_value(clock.slot)
            .map_err(|_| ErrorCode::RandomnessNotResolved)?;
        let number = u64::from_le_bytes(
            revealed_random_value[0..8]
                .try_into()
                .map_err(|_| ErrorCode::RandomnessNotResolved)?,
        );
        let winner = number % pot.total_participants;
        pot.winning_slot = winner;
        set_return_data(&winner.to_le_bytes());
        Ok(())
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        if ctx.accounts.ticket.index != ctx.accounts.pot.winning_slot {
            return Err(ErrorCode::TicketAccountNotWinning.into());
        }
        if ctx.accounts.ticket.participant != ctx.accounts.winner.key() {
            return Err(ErrorCode::TicketAccountNotWinning.into());
        }

        let prize_amount = ctx.accounts.pot.total_participants * POT_AMOUNT;

        // Transfer tokens from escrow to winner using PDA signer
        let escrow_seeds = &[b"escrow".as_ref(), &[ctx.bumps.escrow_token_account]];
        let signer_seeds = &[&escrow_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_token_account.to_account_info(),
                },
                signer_seeds,
            ),
            prize_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub ticket: Account<'info, Ticket>,

    /// CHECK: Winner's wallet - validated via ticket.participant
    pub winner: AccountInfo<'info>,

    #[account(mut)]
    pub pot: Account<'info, Pot>,

    /// Escrow token account holding prize pool
    #[account(
        mut,
        seeds = [b"escrow"],
        bump,
        token::mint = token_mint,
        token::authority = escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Winner's token account to receive prize
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = winner,
    )]
    pub winner_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleLottery<'info> {
    #[account(mut)]
    pub pot: Account<'info, Pot>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness_account_data: AccountInfo<'info>,
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct DrawLottery<'info> {
    #[account(mut)]
    pub pot: Account<'info, Pot>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness_account_data: AccountInfo<'info>,
    /// CHECK: This is a PDA escrow account holding SOL for oracle wagers.
    #[account(mut, seeds = [b"wagerEscrow".as_ref()], bump)]
    pub wager_escrow: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EnterLottery<'info> {
    /// The user entering the lottery (payer)
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub pot: Account<'info, Pot>,

    #[account(
        init,
        payer = user,
        space = Ticket::space(),
        seeds = [b"ticket", pot.key().as_ref(), &pot.total_participants.to_le_bytes()],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    /// User's token account to pay from
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Escrow token account for prize pool
    #[account(
        mut,
        seeds = [b"escrow"],
        bump,
        token::mint = token_mint,
        token::authority = escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Treasury token account for fees
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
        token::mint = token_mint,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(end_ts: u64, pot_duration: u64, manager_name: String)]
pub struct InitPotManager<'info> {
    #[account(
        init,
        payer = authority,
        space = PotManager::space(),
        seeds = [b"manager", authority.key().as_ref(), manager_name.as_bytes()],
        bump
    )]
    pub pot_manager: Account<'info, PotManager>,

    /// The SPL token mint for the lottery
    pub token_mint: Account<'info, Mint>,

    /// Treasury token account to collect fees
    #[account(
        init,
        payer = authority,
        seeds = [b"treasury"],
        bump,
        token::mint = token_mint,
        token::authority = authority,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    /// Escrow token account to hold prize pool
    #[account(
        init,
        payer = authority,
        seeds = [b"escrow"],
        bump,
        token::mint = token_mint,
        token::authority = escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        space = Pot::space(),
        seeds = [
            b"pot",
            pot_manager.key().as_ref(),
            &end_ts.to_le_bytes(),
        ],
        bump
    )]
    pub first_pot: Account<'info, Pot>,

    #[account(
        init,
        payer = authority,
        space = Pot::space(),
        seeds = [
            b"pot",
            pot_manager.key().as_ref(),
            &(end_ts + pot_duration).to_le_bytes(),
        ],
        bump
    )]
    pub next_pot: Account<'info, Pot>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// address: program-id + "potmanager"
#[account]
pub struct PotManager {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub token_mint: Pubkey,
    pub rent: u64,
    pub last_random_number: u64,
    pub timestamps: (u64, u64),
    pub bump: u8,
    pub name: String, // Max 32 bytes (PDA seed limit)
}

impl PotManager {
    pub const MAX_NAME_LEN: usize = 32;

    pub fn space() -> usize {
        8 +  // discriminator
        32 + // authority
        32 + // treasury
        32 + // token_mint
        8 +  // rent
        8 +  // last_random_number
        16 + // timestamps (u64, u64)
        1 +  // bump
        4 + Self::MAX_NAME_LEN // name (4 bytes for string length prefix + max content)
    }
}

// address: program-id + "pot" + pot end timestamp`
#[account]
pub struct Pot {
    pub pot_manager: Pubkey, // Reference to parent PotManager
    pub total_participants: u64,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    pub winning_slot: u64,
    pub randomness_account: Pubkey,
}

impl Pot {
    pub fn space() -> usize {
        8 +  // discriminator
        32 + // pot_manager
        8 +  // total_participants
        8 +  // start_ts
        8 +  // end_ts
        8 +  // winning_slot
        32   // randomness_account
    }
}

// address: program-id + "ticket" + pot end timestamp + participant index
#[account]
pub struct Ticket {
    pub participant: Pubkey,
    pub index: u64,
}

impl Ticket {
    pub fn space() -> usize {
        8 + 8 + 32
    }
}

use strum::IntoEnumIterator;
use strum_macros::EnumIter;
#[error_code]
#[derive(EnumIter)]
pub enum ErrorCode {
    #[msg("End timestamp has passed")]
    EndTimestampPassed,
    #[msg("The pot is already closed")]
    PotClosed,
    #[msg("The randomness has already been revealed")]
    RandomnessAlreadyRevealed,
    #[msg("Not enough funds to play")]
    NotEnoughFundsToPlay,
    #[msg("Invalid randomness account")]
    InvalidRandomnessAccount,
    #[msg("Randomness not resolved")]
    RandomnessNotResolved,
    #[msg("Ticket account is not winning")]
    TicketAccountNotWinning,
}

impl ErrorCode {
    pub fn try_from_32(code: u32) -> Option<Self> {
        use anchor_lang::error::ERROR_CODE_OFFSET;
        ErrorCode::iter().nth(code.checked_sub(ERROR_CODE_OFFSET)? as usize)
    }

    pub fn as_u32(&self) -> u32 {
        use anchor_lang::error::ERROR_CODE_OFFSET;
        ERROR_CODE_OFFSET + *self as u32
    }
}
