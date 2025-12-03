use anchor_lang::prelude::*;

#[cfg(test)]
mod test {
    use std::env::join_paths;
    use anchor_lang::prelude::{Account, AccountMeta, Clock, Rent};
    use anchor_lang::InstructionData;
    use litesvm::LiteSVM;
    use open_lotto::instruction::{InitPotManager, EnterTicket, DrawLottery};
    use open_lotto::{ErrorCode, Pot};
    use open_lotto::PotManager;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_program::instruction::{Instruction, InstructionError};
    use solana_account::{Account as SolanaAccount};
    use solana_program::system_program;
    use solana_pubkey::Pubkey;
    use solana_signer::{Signer, SignerError};
    use solana_transaction::Transaction;
    use solana_transaction_error::TransactionError;
    use rand::{thread_rng, Rng};
    use solana_program::sysvar;
    use std::time::{SystemTime, UNIX_EPOCH};
    use litesvm::types::{FailedTransactionMetadata, TransactionResult};

    static PROGRAM_BYTES: &[u8] = include_bytes!("../../../target/deploy/open_lotto.so");

    #[test]
    fn test_fail_if_end_timestamp_passed() {
        // load program
        let mut svm = LiteSVM::new();
        // 1️⃣ Prepare a fake timestamp
        let fake_clock = Clock {
            slot: 1,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: 1_725_000_000, // <-- simulate current time
        };
        svm.set_sysvar(&fake_clock);
        let program_id = open_lotto::ID;
        svm.add_program(program_id, PROGRAM_BYTES);
        let rent = Rent::default().minimum_balance(0);
        // payer
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000_000_000);
        let end_ts: u64 = 5;
        let pot_duration: u64 = 10;
        let manager_name = String::from("daily");

        //create account keys
        let (pot_manager, bump) = Pubkey::find_program_address(&[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()], &program_id);
        let (first_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()], &program_id);
        let (next_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &(end_ts + pot_duration).to_le_bytes()], &program_id);
        let (treasury, _) = Pubkey::find_program_address(&[b"treasury", payer.pubkey().as_ref()], &program_id);
        let accounts = vec![
            AccountMeta::new(pot_manager, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(next_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(system_program::ID, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
        ];

        //create instruction
        let data = InitPotManager {
            end_ts: end_ts,
            pot_duration: pot_duration,
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
    fn test_open_lotto() {
        let init_timestamp = 1_725_000_000;
        // load program
        let mut svm = LiteSVM::new();
        // 1️⃣ Prepare a fake timestamp
        let fake_clock = Clock {
            slot: 1,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: init_timestamp, // <-- simulate current time
        };
        svm.set_sysvar(&fake_clock);
        let program_id = open_lotto::ID;
        svm.add_program(program_id, PROGRAM_BYTES);
        let rent_pot_manager = Rent::default().minimum_balance(PotManager::space());
        let rent_treasury = Rent::default().minimum_balance(0);
        let rent_pot = Rent::default().minimum_balance(Pot::space());
        // payer
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000_000_000);
        let end_ts: u64 = init_timestamp as u64 + 5;
        let pot_duration: u64 = 10;
        let manager_name = String::from("daily");

        //create account keys
        let (pot_manager, bump) = Pubkey::find_program_address(&[b"manager", payer.pubkey().as_ref(), &manager_name.as_bytes()], &program_id);
        let (first_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()], &program_id);
        let (next_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &(end_ts + pot_duration).to_le_bytes()], &program_id);
        let (treasury, _) = Pubkey::find_program_address(&[b"treasury", payer.pubkey().as_ref()], &program_id);
        let accounts = vec![
            AccountMeta::new(pot_manager, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new(first_pot, false),
            AccountMeta::new(next_pot, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(system_program::ID, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
        ];

        //create instruction
        let data = InitPotManager {
            end_ts: end_ts,
            pot_duration: pot_duration,
            manager_name: manager_name.clone()
        }.data();
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);

        // check pot manager
        let created_pot_manager: PotManager = getAccount(&pot_manager, &svm);
        assert_eq!(created_pot_manager.authority, payer.pubkey());
        assert_eq!(created_pot_manager.treasury, treasury);
        assert_eq!(created_pot_manager.rent, rent_pot_manager);
        assert_eq!(created_pot_manager.last_random_number, 0);
        assert_eq!(created_pot_manager.bump, bump);
        assert_eq!(created_pot_manager.timestamps, (end_ts, end_ts + pot_duration));

        // check first pot
        let (first_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &created_pot_manager.timestamps.0.to_le_bytes()], &program_id);
        let created_first_pot: Pot = getAccount(&first_pot, &svm);
        assert_eq!(created_first_pot.total_participants, 0);
        assert_eq!(created_first_pot.start_timestamp, init_timestamp as u64);
        assert_eq!(created_first_pot.end_timestamp, end_ts);

        // check second pot
        let (next_pot, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &created_pot_manager.timestamps.1.to_le_bytes()], &program_id);
        let created_second_pot: Pot = getAccount(&next_pot, &svm);
        assert_eq!(created_second_pot.total_participants, 0);
        assert_eq!(created_second_pot.start_timestamp, end_ts + 1);
        assert_eq!(created_second_pot.end_timestamp, end_ts + pot_duration);

        // enter a ticket
        // payer
        let user = Keypair::new();
        let user_initial_lamport = 1_000_000_000;
        svm.airdrop(&user.pubkey(), 1_000_000_000);
        let current_pot_manager: PotManager = getAccount(&pot_manager, &svm);
        let timestamp = if (init_timestamp as u64) < current_pot_manager.timestamps.0 {
            current_pot_manager.timestamps.0
        } else if  (init_timestamp as u64) < current_pot_manager.timestamps.1 {
            current_pot_manager.timestamps.1
        } else {
            panic!("no valid timestamp");
        };
        let (current_pot_address, _) = Pubkey::find_program_address(&[b"pot", pot_manager.as_ref(), &timestamp.to_le_bytes()], &program_id);
        let current_pot: Pot = getAccount(&current_pot_address, &svm);
        let (current_ticket , _) = Pubkey::find_program_address(&[b"ticket", current_pot_address.as_ref(), &(current_pot.total_participants).to_le_bytes()], &program_id);
        let data = EnterTicket {}.data();
        let accounts = vec![
            AccountMeta::new(user.pubkey(), true),
            AccountMeta::new(current_pot_address, false),
            AccountMeta::new(current_ticket, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new(system_program::ID, false),
        ];
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&user.pubkey()));
        let tx = Transaction::new(&[&user], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        assert!(result.is_ok());

        let treasury_balance = svm.get_balance(&treasury).unwrap();
        assert_eq!(treasury_balance, 1_000_000 + rent_treasury);

        let pot_balance = svm.get_balance(&current_pot_address).unwrap();
        assert_eq!(pot_balance, 9_000_000 + rent_pot);


        // drawing the lottery
        // creating mock Switchboard randomness account
        let mut rng = thread_rng();
        let randomness_pubkey = Pubkey::new_unique();

        // Build a valid RandomnessAccountData structure
        // Discriminator: [10, 66, 229, 135, 220, 239, 217, 114]
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
        // reveal_slot: u64 - needs to match clock.slot for get_value to work
        randomness_data.extend_from_slice(&2u64.to_le_bytes());
        // value: [u8; 32] - the random value
        let random_value: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        randomness_data.extend_from_slice(&random_value);
        // _ebuf2: [u8; 96]
        randomness_data.extend_from_slice(&[0u8; 96]);
        // _ebuf1: [u8; 128]
        randomness_data.extend_from_slice(&[0u8; 128]);

        // Switchboard program ID (devnet)
        let switchboard_pid = Pubkey::try_from("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv").unwrap();
        let randomness_account = SolanaAccount {
            lamports: 1_000_000,
            data: randomness_data,
            owner: switchboard_pid,
            executable: false,
            rent_epoch: 0,
        };
        svm.set_account(randomness_pubkey, randomness_account);

        // Update clock: slot=2 so seed_slot (0) < clock.slot and reveal_slot (2) == clock.slot
        let fake_clock = Clock {
            slot: 2,
            unix_timestamp: fake_clock.unix_timestamp + 10,
            ..fake_clock.clone()
        };
        svm.set_sysvar(&fake_clock);

        let data = DrawLottery{
            randomness_account : randomness_pubkey
        }.data();
        let (escrow_account, _) = Pubkey::find_program_address(&[b"stateEscrow"], &program_id);
        let accounts = vec![
            AccountMeta::new(current_pot_address, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(randomness_pubkey, false),
            AccountMeta::new(escrow_account, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ];
        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let message = Message::new(&[ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        if result.is_err() {
            println!("DrawLottery error: {:?}", result);
        }
        assert!(result.is_ok());

    }

    fn getAccount<A: anchor_lang::AccountDeserialize>(pubkey: &Pubkey, svm: &LiteSVM) -> A {
        let p = svm.get_account(pubkey);
        assert!(p.is_some());
        let d = p.unwrap().data;
        A::try_deserialize(&mut &d[..]).unwrap()
   }
}
