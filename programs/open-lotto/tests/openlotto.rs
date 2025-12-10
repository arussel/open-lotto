use anchor_lang::prelude::*;

#[cfg(test)]
mod test {
    use anchor_lang::prelude::{AccountMeta, Clock, Rent};
    use anchor_lang::InstructionData;
    use litesvm::LiteSVM;
    use open_lotto::instruction::{InitPotManager, EnterTicket, DrawLottery};
    use open_lotto::{ErrorCode, Pot};
    use open_lotto::PotManager;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_program::instruction::{Instruction, InstructionError};
    use solana_account::Account as SolanaAccount;
    use solana_program::system_program;
    use solana_pubkey::Pubkey;
    use solana_signer::Signer;
    use solana_transaction::Transaction;
    use solana_transaction_error::TransactionError;
    use rand::{thread_rng, Rng};
    use spl_token::state::{Mint, Account as TokenAccount};
    use solana_program::program_pack::Pack;

    static PROGRAM_BYTES: &[u8] = include_bytes!("../../../target/deploy/open_lotto.so");

    /// Create a mock SPL token mint account
    fn create_mint_account(mint_authority: &Pubkey) -> SolanaAccount {
        let mut data = vec![0u8; Mint::LEN];
        let mint = Mint {
            mint_authority: solana_program::program_option::COption::Some(*mint_authority),
            supply: 0,
            decimals: 6,
            is_initialized: true,
            freeze_authority: solana_program::program_option::COption::None,
        };
        Mint::pack(mint, &mut data).unwrap();

        SolanaAccount {
            lamports: Rent::default().minimum_balance(Mint::LEN),
            data,
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        }
    }

    /// Create a mock SPL token account
    fn create_token_account(mint: &Pubkey, owner: &Pubkey, amount: u64) -> SolanaAccount {
        let mut data = vec![0u8; TokenAccount::LEN];
        let token_account = TokenAccount {
            mint: *mint,
            owner: *owner,
            amount,
            delegate: solana_program::program_option::COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: solana_program::program_option::COption::None,
            delegated_amount: 0,
            close_authority: solana_program::program_option::COption::None,
        };
        TokenAccount::pack(token_account, &mut data).unwrap();

        SolanaAccount {
            lamports: Rent::default().minimum_balance(TokenAccount::LEN),
            data,
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        }
    }

    #[test]
    fn test_fail_if_end_timestamp_passed() {
        // load program
        let mut svm = LiteSVM::new();
        // Prepare a fake timestamp
        let fake_clock = Clock {
            slot: 1,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: 1_725_000_000,
        };
        svm.set_sysvar(&fake_clock);
        let program_id = open_lotto::ID;
        svm.add_program(program_id, PROGRAM_BYTES);
        svm.add_program(spl_token::id(), include_bytes!("spl_token.so"));

        // payer
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000_000_000);
        let end_ts: u64 = 5; // In the past
        let pot_duration: u64 = 10;
        let manager_name = String::from("daily");

        // Create token mint
        let mint_keypair = Keypair::new();
        let mint_account = create_mint_account(&payer.pubkey());
        svm.set_account(mint_keypair.pubkey(), mint_account);

        // Derive PDAs
        let (pot_manager, _) = Pubkey::find_program_address(
            &[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()],
            &program_id
        );
        let (first_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()],
            &program_id
        );
        let (next_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &(end_ts + pot_duration).to_le_bytes()],
            &program_id
        );
        let (treasury_token_account, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &program_id
        );
        let (escrow_token_account, _) = Pubkey::find_program_address(
            &[b"escrow"],
            &program_id
        );

        let accounts = vec![
            AccountMeta::new(pot_manager, false),
            AccountMeta::new_readonly(mint_keypair.pubkey(), false),
            AccountMeta::new(treasury_token_account, false),
            AccountMeta::new(escrow_token_account, false),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(next_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
        ];

        let data = InitPotManager {
            end_ts,
            pot_duration,
            manager_name: manager_name
        }.data();
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        let r = result.unwrap_err().err;
        assert_eq!(r, TransactionError::InstructionError(0, InstructionError::Custom(ErrorCode::EndTimestampPassed.as_u32())));
    }

    #[test]
    fn test_open_lotto_init() {
        let init_timestamp = 1_725_000_000;
        let mut svm = LiteSVM::new();

        let fake_clock = Clock {
            slot: 1,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: init_timestamp,
        };
        svm.set_sysvar(&fake_clock);
        let program_id = open_lotto::ID;
        svm.add_program(program_id, PROGRAM_BYTES);
        svm.add_program(spl_token::id(), include_bytes!("spl_token.so"));

        // payer
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000_000_000);
        let end_ts: u64 = init_timestamp as u64 + 5;
        let pot_duration: u64 = 10;
        let manager_name = String::from("daily");

        // Create token mint
        let mint_keypair = Keypair::new();
        let mint_account = create_mint_account(&payer.pubkey());
        svm.set_account(mint_keypair.pubkey(), mint_account);

        // Derive PDAs
        let (pot_manager, bump) = Pubkey::find_program_address(
            &[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()],
            &program_id
        );
        let (first_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()],
            &program_id
        );
        let (next_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &(end_ts + pot_duration).to_le_bytes()],
            &program_id
        );
        let (treasury_token_account, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &program_id
        );
        let (escrow_token_account, _) = Pubkey::find_program_address(
            &[b"escrow"],
            &program_id
        );

        let accounts = vec![
            AccountMeta::new(pot_manager, false),
            AccountMeta::new_readonly(mint_keypair.pubkey(), false),
            AccountMeta::new(treasury_token_account, false),
            AccountMeta::new(escrow_token_account, false),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(next_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
        ];

        let data = InitPotManager {
            end_ts,
            pot_duration,
            manager_name: manager_name.clone()
        }.data();
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "InitPotManager failed: {:?}", result);

        // Check pot manager
        let created_pot_manager: PotManager = get_account(&pot_manager, &svm);
        assert_eq!(created_pot_manager.authority, payer.pubkey());
        assert_eq!(created_pot_manager.treasury, treasury_token_account);
        assert_eq!(created_pot_manager.token_mint, mint_keypair.pubkey());
        assert_eq!(created_pot_manager.bump, bump);
        assert_eq!(created_pot_manager.timestamps, (end_ts, end_ts + pot_duration));

        // Check first pot
        let created_first_pot: Pot = get_account(&first_pot, &svm);
        assert_eq!(created_first_pot.total_participants, 0);
        assert_eq!(created_first_pot.start_timestamp, init_timestamp as u64);
        assert_eq!(created_first_pot.end_timestamp, end_ts);

        // Check second pot
        let created_second_pot: Pot = get_account(&next_pot, &svm);
        assert_eq!(created_second_pot.total_participants, 0);
        assert_eq!(created_second_pot.start_timestamp, end_ts + 1);
        assert_eq!(created_second_pot.end_timestamp, end_ts + pot_duration);
    }

    #[test]
    fn test_draw_lottery() {
        let init_timestamp = 1_725_000_000;
        let mut svm = LiteSVM::new();

        let mut fake_clock = Clock {
            slot: 1,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: init_timestamp,
        };
        svm.set_sysvar(&fake_clock);
        let program_id = open_lotto::ID;
        svm.add_program(program_id, PROGRAM_BYTES);
        svm.add_program(spl_token::id(), include_bytes!("spl_token.so"));

        // payer
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000_000_000);
        let end_ts: u64 = init_timestamp as u64 + 100;
        let pot_duration: u64 = 100;
        let manager_name = String::from("daily");

        // Create token mint
        let mint_keypair = Keypair::new();
        let mint_account = create_mint_account(&payer.pubkey());
        svm.set_account(mint_keypair.pubkey(), mint_account);

        // Derive PDAs
        let (pot_manager, _) = Pubkey::find_program_address(
            &[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()],
            &program_id
        );
        let (first_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()],
            &program_id
        );
        let (next_pot, _) = Pubkey::find_program_address(
            &[b"pot", pot_manager.as_ref(), &(end_ts + pot_duration).to_le_bytes()],
            &program_id
        );
        let (treasury_token_account, _) = Pubkey::find_program_address(
            &[b"treasury"],
            &program_id
        );
        let (escrow_token_account, _) = Pubkey::find_program_address(
            &[b"escrow"],
            &program_id
        );

        // Initialize pot manager
        let accounts = vec![
            AccountMeta::new(pot_manager, false),
            AccountMeta::new_readonly(mint_keypair.pubkey(), false),
            AccountMeta::new(treasury_token_account, false),
            AccountMeta::new(escrow_token_account, false),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(next_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
        ];

        let data = InitPotManager {
            end_ts,
            pot_duration,
            manager_name: manager_name.clone()
        }.data();
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "InitPotManager failed: {:?}", result);

        // Create and enter a ticket
        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 1_000_000_000);

        // Create user token account with enough tokens
        let user_token_account_keypair = Keypair::new();
        let user_token_account = create_token_account(
            &mint_keypair.pubkey(),
            &user.pubkey(),
            100_000_000, // 100 tokens
        );
        svm.set_account(user_token_account_keypair.pubkey(), user_token_account);

        let current_pot: Pot = get_account(&first_pot, &svm);
        let (current_ticket, _) = Pubkey::find_program_address(
            &[b"ticket", first_pot.as_ref(), &current_pot.total_participants.to_le_bytes()],
            &program_id
        );

        let enter_data = EnterTicket {}.data();
        let enter_accounts = vec![
            AccountMeta::new(user.pubkey(), true),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(current_ticket, false),
            AccountMeta::new(user_token_account_keypair.pubkey(), false),
            AccountMeta::new(escrow_token_account, false),
            AccountMeta::new(treasury_token_account, false),
            AccountMeta::new_readonly(mint_keypair.pubkey(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::ID, false),
        ];
        let ix = Instruction::new_with_bytes(program_id, &enter_data, enter_accounts);
        let message = Message::new(&[ix], Some(&user.pubkey()));
        let tx = Transaction::new(&[&user], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "EnterTicket failed: {:?}", result);

        // Create mock Switchboard randomness account
        let mut rng = thread_rng();
        let randomness_pubkey = Pubkey::new_unique();

        let mut randomness_data: Vec<u8> = vec![];
        // 8-byte discriminator
        randomness_data.extend_from_slice(&[10, 66, 229, 135, 220, 239, 217, 114]);
        // authority: Pubkey (32 bytes)
        randomness_data.extend_from_slice(&[0u8; 32]);
        // queue: Pubkey (32 bytes)
        randomness_data.extend_from_slice(&[0u8; 32]);
        // seed_slothash: [u8; 32]
        randomness_data.extend_from_slice(&[0u8; 32]);
        // seed_slot: u64 - must be clock.slot - 1 for draw_lottery check
        randomness_data.extend_from_slice(&1u64.to_le_bytes());
        // oracle: Pubkey (32 bytes)
        randomness_data.extend_from_slice(&[0u8; 32]);
        // reveal_slot: u64
        randomness_data.extend_from_slice(&2u64.to_le_bytes());
        // value: [u8; 32]
        let random_value: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        randomness_data.extend_from_slice(&random_value);
        // _ebuf2: [u8; 96]
        randomness_data.extend_from_slice(&[0u8; 96]);
        // _ebuf1: [u8; 128]
        randomness_data.extend_from_slice(&[0u8; 128]);

        let switchboard_pid = Pubkey::try_from("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv").unwrap();
        let randomness_account = SolanaAccount {
            lamports: 1_000_000,
            data: randomness_data,
            owner: switchboard_pid,
            executable: false,
            rent_epoch: 0,
        };
        svm.set_account(randomness_pubkey, randomness_account);

        // Update clock for draw
        fake_clock.slot = 2;
        fake_clock.unix_timestamp += 10;
        svm.set_sysvar(&fake_clock);

        let (wager_escrow, _) = Pubkey::find_program_address(&[b"wagerEscrow"], &program_id);

        let draw_data = DrawLottery {
            randomness_account: randomness_pubkey
        }.data();
        let draw_accounts = vec![
            AccountMeta::new(first_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(randomness_pubkey, false),
            AccountMeta::new(wager_escrow, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ];
        let ix = Instruction::new_with_bytes(program_id, &draw_data, draw_accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "DrawLottery failed: {:?}", result);

        // Verify randomness account is stored in pot
        let updated_pot: Pot = get_account(&first_pot, &svm);
        assert_eq!(updated_pot.randomness_account, randomness_pubkey);
    }

    fn get_account<A: anchor_lang::AccountDeserialize>(pubkey: &Pubkey, svm: &LiteSVM) -> A {
        let p = svm.get_account(pubkey);
        assert!(p.is_some(), "Account {} not found", pubkey);
        let d = p.unwrap().data;
        A::try_deserialize(&mut &d[..]).unwrap()
    }
}
