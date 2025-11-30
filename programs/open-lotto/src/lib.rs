use anchor_lang::prelude::*;

declare_id!("GMECsoFXBjDcsA7GuVUq1vFmCM27qJumw4Y1rGsxseui");

pub fn transfer<'a>(
    system_program: AccountInfo<'a>,
    from: AccountInfo<'a>,
    to: AccountInfo<'a>,
    amount: u64,
    seeds: Option<&[&[&[u8]]]>, // Use Option to explicitly handle the presence or absence of seeds
) -> Result<()> {
    let amount_needed = amount;
    if amount_needed > from.lamports() {
        msg!(
            "Need {} lamports, but only have {}",
            amount_needed,
            from.lamports()
        );
        return Err(ErrorCode::NotEnoughFundsToPlay.into());
    }

    let transfer_accounts = anchor_lang::system_program::Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
    };

    let transfer_ctx = match seeds {
        Some(seeds) => CpiContext::new_with_signer(system_program, transfer_accounts, seeds),
        None => CpiContext::new(system_program, transfer_accounts),
    };

    anchor_lang::system_program::transfer(transfer_ctx, amount)
}

#[program]
pub mod open_lotto {
    use super::*;
    use anchor_lang::solana_program::program::set_return_data;
    use anchor_lang::system_program;
    use switchboard_on_demand::RandomnessAccountData;

    const POT_AMOUNT: u64 = 9_500_000;
    const FEE: u64 = 500_000;
    const WAGER: u64 = 100;

    pub fn init_pot_manager(
        ctx: Context<InitPotManager>,
        end_ts: u64,
        pot_duration: u64,
        manager_name: String,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp as u64;
        if (end_ts < now) {
            return Err(ErrorCode::EndTimestampPassed.into());
        }

        let next_timestamp = end_ts + pot_duration;
        let pot_manager = &mut ctx.accounts.pot_manager;

        pot_manager.timestamps = (end_ts, next_timestamp);

        // store bump
        pot_manager.bump = ctx.bumps.pot_manager;

        // initialize state
        pot_manager.treasury = ctx.accounts.treasury.key();
        pot_manager.last_random_number = 0;
        pot_manager.rent = ctx.accounts.rent.minimum_balance(PotManager::space());

        // initialize pots
        ctx.accounts.first_pot.start_timestamp = now;
        ctx.accounts.first_pot.end_timestamp = end_ts;
        ctx.accounts.first_pot.total_participants = 0;
        ctx.accounts.next_pot.start_timestamp = end_ts + 1;
        ctx.accounts.next_pot.end_timestamp = end_ts + pot_duration;
        ctx.accounts.next_pot.total_participants = 0;

        //store authority
        pot_manager.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn enter_ticket(ctx: Context<EnterLottery>) -> Result<()> {
        if (ctx.accounts.pot.end_timestamp < Clock::get()?.unix_timestamp as u64) {
            return Err(ErrorCode::PotClosed.into());
        }
        ctx.accounts.ticket.index = ctx.accounts.pot.total_participants;
        ctx.accounts.ticket.participant = ctx.accounts.user.key();
        ctx.accounts.pot.total_participants += 1;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.pot.to_account_info(),
                },
            ),
            POT_AMOUNT,
        )?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
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
                .unwrap();
        if randomness_data.seed_slot != clock.slot - 1 {
            msg!("seed_slot: {}", randomness_data.seed_slot);
            msg!("slot: {}", clock.slot);
            return Err(ErrorCode::RandomnessAlreadyRevealed.into());
        }

        transfer(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.escrow_account.to_account_info(),
            WAGER,
            None,
        )?;

        ctx.accounts.pot.randomness_account = randomness_account;

        Ok(())
    }

    pub fn settle_lottery(ctx: Context<SettleLottery>) -> Result<()> {
        let clock = Clock::get()?;
        let pot = &mut ctx.accounts.pot;

        if (ctx.accounts.randomness_account_data.key() != pot.randomness_account) {
            return Err(ErrorCode::InvalidRandomnessAccount.into());
        }

        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .unwrap();
        let revealed_random_value = randomness_data
            .get_value(clock.slot)
            .map_err(|_| ErrorCode::RandomnessNotResolved)?;
        let number = u64::from_le_bytes(revealed_random_value[0..8].try_into().unwrap());
        let winner = number % pot.total_participants;
        pot.winning_slot = winner;
        set_return_data(&winner.to_le_bytes());
        Ok(())
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        if (ctx.accounts.ticket.index != ctx.accounts.pot.winning_slot) {
            return Err(ErrorCode::TicketAccountNotWinning.into());
        }
        if(ctx.accounts.ticket.participant != ctx.accounts.winner.key()){
            return Err(ErrorCode::TicketAccountNotWinning.into());
        }
        transfer(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.pot.to_account_info(),
            ctx.accounts.winner.to_account_info(),
            ctx.accounts.pot.total_participants * POT_AMOUNT,
            None,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub ticket: Account<'info, Ticket>,
    #[account(mut)]
    pub winner: Account<'info, Ticket>,
    #[account(mut)]
    pub pot: Account<'info, Pot>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleLottery<'info> {
    #[account(mut)]
    pub pot: Account<'info, Pot>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness_account_data: AccountInfo<'info>,
    /// CHECK: This is a simple Solana account holding SOL.
    #[account(mut, seeds = [b"stateEscrow".as_ref()], bump )]
    pub escrow_account: AccountInfo<'info>,
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DrawLottery<'info> {
    #[account(mut)]
    pub pot: Account<'info, Pot>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness_account_data: AccountInfo<'info>,
    /// CHECK: This is a PDA escrow account holding SOL for wagers.
    #[account(mut, seeds = [b"stateEscrow".as_ref()], bump)]
    pub escrow_account: AccountInfo<'info>,
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

    /// CHECK: This account is a lamports-only pot created by the program.
    /// No data or ownership checks are needed.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

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

    /// CHECK: This account is a lamports-only pot created by the program.
    /// No data or ownership checks are needed.
    #[account(
      init,
      payer = authority,
      space = 0,
      seeds = [b"treasury", authority.key().as_ref()],
      bump
    )]
    pub treasury: UncheckedAccount<'info>,

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

    pub rent: Sysvar<'info, Rent>,
}

// address: program-id + "potmanager"
#[account]
pub struct PotManager {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub rent: u64,
    pub last_random_number: u64,
    pub timestamps: (u64, u64),
    pub bump: u8,
}

impl PotManager {
    pub fn space() -> usize {
        8 + //discriminator
        32 +// authority
        32 +// pot
        32 +// treasury
        8 + //rent
        8 + // last_random_numbers
        8 + // pot end timestamp
        1 // bump
    }
}

// address: program-id + "pot" + pot end timestamp`
#[account]
pub struct Pot {
    pub total_participants: u64,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    pub winning_slot: u64,
    pub randomness_account: Pubkey,
}

impl Pot {
    pub fn space() -> usize {
        8 + // discriminator
        8 + // total_participants
        8 + // start_ts
        8 + // end_ts
        8 + // winning_slot
        32 //randomness_account
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
