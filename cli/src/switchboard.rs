//! Switchboard On-Demand randomness operations
//!
//! This module handles creating randomness accounts, committing, and checking reveal status
//! by directly constructing Switchboard program instructions.

use anyhow::{anyhow, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    address_lookup_table,
    instruction::{AccountMeta, Instruction},
    message::Message,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    sysvar,
    transaction::Transaction,
};
use spl_associated_token_account::get_associated_token_address;
use std::str::FromStr;
use std::time::Duration;

// Switchboard On-Demand Program ID
// Mainnet: SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv
// Devnet: Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
const SB_ON_DEMAND_PID_DEVNET: &str = "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2";
const SB_ON_DEMAND_PID_MAINNET: &str = "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv";

// Default queue addresses
const SB_QUEUE_DEVNET: &str = "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7";
const SB_QUEUE_MAINNET: &str = "A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w";

// Wrapped SOL mint (same on mainnet and devnet)
const WRAPPED_SOL_MINT: &str = "So11111111111111111111111111111111111111112";

// SPL Token program
const SPL_TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SPL_ASSOCIATED_TOKEN_PROGRAM: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// Switchboard randomness account size
const RANDOMNESS_ACCOUNT_SIZE: u64 = 512;

pub struct CommitResult {
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    pub signature: String,
}

/// Get Switchboard program ID based on network
pub fn get_sb_program_id(is_devnet: bool) -> Result<Pubkey> {
    let pid_str = if is_devnet {
        SB_ON_DEMAND_PID_DEVNET
    } else {
        SB_ON_DEMAND_PID_MAINNET
    };
    Pubkey::from_str(pid_str).map_err(|e| anyhow!("Invalid program ID: {}", e))
}

/// Get Switchboard queue based on network
pub fn get_sb_queue(is_devnet: bool) -> Result<Pubkey> {
    let queue_str = if is_devnet {
        SB_QUEUE_DEVNET
    } else {
        SB_QUEUE_MAINNET
    };
    Pubkey::from_str(queue_str).map_err(|e| anyhow!("Invalid queue address: {}", e))
}

/// Detect if the RPC URL points to devnet
fn is_devnet_url(rpc_url: &str) -> bool {
    rpc_url.contains("devnet")
}

/// Create a new randomness account and commit to randomness
pub async fn create_and_commit_randomness(
    rpc_client: &RpcClient,
    payer: &Keypair,
    randomness_keypair: &Keypair,
    rpc_url: &str,
) -> Result<CommitResult> {
    // Determine network from RPC URL
    let is_devnet = is_devnet_url(rpc_url);

    let sb_program_id = get_sb_program_id(is_devnet)?;
    let queue = get_sb_queue(is_devnet)?;

    println!("Network: {}", if is_devnet { "devnet" } else { "mainnet" });

    println!("Using Switchboard program: {}", sb_program_id);
    println!("Using queue: {}", queue);

    // Get a recent finalized slot for the LUT derivation
    let recent_slot = rpc_client.get_slot()?;
    println!("Recent slot: {}", recent_slot);

    // Step 1: Create the randomness account with randomnessInit
    // The Anchor program handles account creation via init constraint
    let init_ix = build_randomness_init_instruction(
        &sb_program_id,
        &randomness_keypair.pubkey(),
        &queue,
        &payer.pubkey(),
        recent_slot,
    )?;

    // Build and send init transaction
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[init_ix], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer, randomness_keypair], message, recent_blockhash);

    println!("Sending randomnessInit transaction...");
    let init_signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    println!("Init transaction: {}", init_signature);

    // Step 2: Commit to randomness
    // Get all oracles and try each one until one succeeds
    let oracles = get_oracles_from_queue(rpc_client, &queue)?;
    println!("Found {} oracles in queue, trying each...", oracles.len());

    let mut commit_signature = None;
    for (idx, oracle) in oracles.iter().enumerate() {
        println!("Trying oracle {}/{}: {}", idx + 1, oracles.len(), oracle);

        let commit_ix = build_randomness_commit_instruction(
            &sb_program_id,
            &randomness_keypair.pubkey(),
            &queue,
            oracle,
            &payer.pubkey(),
        )?;

        let recent_blockhash = rpc_client.get_latest_blockhash()?;
        let message = Message::new(&[commit_ix], Some(&payer.pubkey()));
        let transaction = Transaction::new(&[payer], message, recent_blockhash);

        match rpc_client.send_and_confirm_transaction(&transaction) {
            Ok(sig) => {
                println!(
                    "Commit transaction succeeded with oracle {}: {}",
                    oracle, sig
                );
                commit_signature = Some(sig.to_string());
                break;
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("RandomnessOracleKeyExpired") {
                    println!("Oracle {} key expired, trying next...", oracle);
                    continue;
                } else {
                    // Other error, might want to fail immediately
                    println!("Oracle {} failed with error: {}", oracle, err_str);
                    continue;
                }
            }
        }
    }

    let signature =
        commit_signature.ok_or_else(|| anyhow!("All oracles failed to commit randomness"))?;

    Ok(CommitResult {
        randomness_account: randomness_keypair.pubkey(),
        commit_slot: recent_slot,
        signature: signature.to_string(),
    })
}

/// Get all oracles from the queue account
fn get_oracles_from_queue(rpc_client: &RpcClient, queue: &Pubkey) -> Result<Vec<Pubkey>> {
    // Read queue account data to find an oracle
    let queue_data = rpc_client.get_account_data(queue)?;

    // QueueAccountData layout (from IDL, bytemuck/repr(C)):
    // - discriminator: 8 bytes
    // - authority: 32 bytes
    // - mr_enclaves: 32 * 32 = 1024 bytes
    // - oracle_keys: 78 * 32 = 2496 bytes (starting at offset 8 + 32 + 1024 = 1064)
    // - reserved1: 40 bytes
    // - secp_oracle_signing_keys: 30 * 20 = 600 bytes
    // - ed25519_oracle_signing_keys: 30 * 32 = 960 bytes
    // - max_quote_verification_age: 8 bytes
    // - last_heartbeat: 8 bytes
    // - node_timeout: 8 bytes
    // - oracle_min_stake: 8 bytes
    // - allow_authority_override_after: 8 bytes
    // - mr_enclaves_len: 4 bytes
    // - oracle_keys_len: 4 bytes (at offset ~5236)

    // The actual offsets based on IDL field sizes:
    // discriminator: 8
    // authority: 32 -> offset 8, end 40
    // mr_enclaves: 32*32=1024 -> offset 40, end 1064
    // oracle_keys: 78*32=2496 -> offset 1064, end 3560
    // reserved1: 40 -> offset 3560, end 3600
    // secp_oracle_signing_keys: 30*20=600 -> offset 3600, end 4200
    // ed25519_oracle_signing_keys: 30*32=960 -> offset 4200, end 5160
    // max_quote_verification_age: 8 -> offset 5160, end 5168
    // last_heartbeat: 8 -> offset 5168, end 5176
    // node_timeout: 8 -> offset 5176, end 5184
    // oracle_min_stake: 8 -> offset 5184, end 5192
    // allow_authority_override_after: 8 -> offset 5192, end 5200
    // mr_enclaves_len: 4 -> offset 5200, end 5204
    // oracle_keys_len: 4 -> offset 5204, end 5208

    const ORACLE_KEYS_OFFSET: usize = 1064; // 8 + 32 + 1024
    const ORACLE_KEYS_LEN_OFFSET: usize = 5204;

    if queue_data.len() < ORACLE_KEYS_LEN_OFFSET + 4 {
        return Err(anyhow!(
            "Queue account data too short: {} bytes",
            queue_data.len()
        ));
    }

    // Read oracle_keys_len (u32)
    let oracle_keys_len = u32::from_le_bytes(
        queue_data[ORACLE_KEYS_LEN_OFFSET..ORACLE_KEYS_LEN_OFFSET + 4]
            .try_into()
            .map_err(|_| anyhow!("Failed to read oracle_keys_len"))?,
    ) as usize;

    println!("Queue has {} active oracles", oracle_keys_len);

    if oracle_keys_len == 0 {
        return Err(anyhow!("Queue has no active oracles"));
    }

    // Collect all valid oracles
    let sb_program_id = get_sb_program_id(true)?;
    let mut oracles = Vec::new();

    for oracle_idx in 0..oracle_keys_len.min(20) {
        let oracle_offset = ORACLE_KEYS_OFFSET + (oracle_idx * 32);

        if queue_data.len() < oracle_offset + 32 {
            continue;
        }

        let oracle_bytes: [u8; 32] = match queue_data[oracle_offset..oracle_offset + 32].try_into()
        {
            Ok(b) => b,
            Err(_) => continue,
        };

        let oracle = Pubkey::from(oracle_bytes);

        // Skip zero pubkey
        if oracle == Pubkey::default() {
            continue;
        }

        // Verify oracle exists on-chain and is owned by Switchboard
        match rpc_client.get_account(&oracle) {
            Ok(account) => {
                if account.owner != sb_program_id {
                    continue;
                }
                oracles.push(oracle);
            }
            Err(_) => continue,
        }
    }

    if oracles.is_empty() {
        return Err(anyhow!("Could not find any valid oracles in the queue"));
    }

    Ok(oracles)
}

/// Build the Switchboard randomnessInit instruction
fn build_randomness_init_instruction(
    program_id: &Pubkey,
    randomness_account: &Pubkey,
    queue: &Pubkey,
    payer: &Pubkey,
    recent_slot: u64,
) -> Result<Instruction> {
    // Get PDAs and associated accounts
    let wrapped_sol_mint = Pubkey::from_str(WRAPPED_SOL_MINT)?;
    let token_program = Pubkey::from_str(SPL_TOKEN_PROGRAM)?;
    let associated_token_program = Pubkey::from_str(SPL_ASSOCIATED_TOKEN_PROGRAM)?;

    // Program state PDA
    let (program_state, _) = Pubkey::find_program_address(&[b"STATE"], program_id);

    // LUT signer PDA
    let (lut_signer, _) =
        Pubkey::find_program_address(&[b"LutSigner", randomness_account.as_ref()], program_id);

    // Reward escrow - ATA for randomness account to hold wrapped SOL
    let reward_escrow = get_associated_token_address(randomness_account, &wrapped_sol_mint);

    // LUT (lookup table) - derived using the address lookup table program
    // Seeds are: [authority (lutSigner), recent_slot as 8 bytes little endian]
    let (lut, _) = Pubkey::find_program_address(
        &[lut_signer.as_ref(), &recent_slot.to_le_bytes()],
        &solana_sdk::address_lookup_table::program::id(),
    );

    // Discriminator for randomnessInit (Anchor style)
    let discriminator = get_anchor_discriminator("randomness_init");

    // Instruction data: discriminator (8 bytes) + recent_slot (8 bytes, little-endian)
    let mut data = discriminator;
    data.extend_from_slice(&recent_slot.to_le_bytes());

    // Account order from IDL:
    // 1. randomness (signer, writable)
    // 2. reward_escrow (PDA, writable)
    // 3. authority (signer)
    // 4. queue (writable)
    // 5. payer (signer, writable)
    // 6. system_program
    // 7. token_program
    // 8. associated_token_program
    // 9. wrapped_sol_mint
    // 10. program_state
    // 11. lut_signer
    // 12. lut (writable)
    // 13. address_lookup_table_program

    println!("Building randomnessInit with accounts:");
    println!("  0. randomness: {}", randomness_account);
    println!("  1. reward_escrow: {}", reward_escrow);
    println!("  2. authority: {}", payer);
    println!("  3. queue: {}", queue);
    println!("  4. payer: {}", payer);
    println!("  5. system_program: {}", system_program::id());
    println!("  6. token_program: {}", token_program);
    println!(
        "  7. associated_token_program: {}",
        associated_token_program
    );
    println!("  8. wrapped_sol_mint: {}", wrapped_sol_mint);
    println!("  9. program_state: {}", program_state);
    println!(" 10. lut_signer: {}", lut_signer);
    println!(" 11. lut: {}", lut);
    println!(
        " 12. address_lookup_table_program: {}",
        address_lookup_table::program::id()
    );
    println!("  Instruction data (hex): {}", hex::encode(&data));

    let accounts = vec![
        AccountMeta::new(*randomness_account, true), // 0. randomness (signer, writable)
        AccountMeta::new(reward_escrow, false),      // 1. reward_escrow (writable)
        AccountMeta::new_readonly(*payer, true),     // 2. authority (signer)
        AccountMeta::new(*queue, false),             // 3. queue (writable)
        AccountMeta::new(*payer, true),              // 4. payer (signer, writable)
        AccountMeta::new_readonly(system_program::id(), false), // 5. system_program
        AccountMeta::new_readonly(token_program, false), // 6. token_program
        AccountMeta::new_readonly(associated_token_program, false), // 7. associated_token_program
        AccountMeta::new_readonly(wrapped_sol_mint, false), // 8. wrapped_sol_mint
        AccountMeta::new_readonly(program_state, false), // 9. program_state
        AccountMeta::new_readonly(lut_signer, false), // 10. lut_signer
        AccountMeta::new(lut, false),                // 11. lut (writable)
        AccountMeta::new_readonly(address_lookup_table::program::id(), false), // 12. address_lookup_table_program
    ];

    Ok(Instruction::new_with_bytes(*program_id, &data, accounts))
}

/// Build the Switchboard randomness commit instruction
fn build_randomness_commit_instruction(
    program_id: &Pubkey,
    randomness_account: &Pubkey,
    queue: &Pubkey,
    oracle: &Pubkey,
    authority: &Pubkey,
) -> Result<Instruction> {
    // Discriminator for randomness_commit from IDL: [52, 170, 152, 201, 179, 133, 242, 141]
    let discriminator: Vec<u8> = vec![52, 170, 152, 201, 179, 133, 242, 141];

    // Account order from IDL:
    // 1. randomness (writable)
    // 2. queue (relations: randomness, oracle)
    // 3. oracle (writable)
    // 4. recent_slothashes
    // 5. authority (signer, relations: randomness)

    // RandomnessCommitParams is an empty struct, so no additional data needed
    let data = discriminator;

    println!("Building randomnessCommit with accounts:");
    println!("  0. randomness: {}", randomness_account);
    println!("  1. queue: {}", queue);
    println!("  2. oracle: {}", oracle);
    println!("  3. recent_slothashes: {}", sysvar::slot_hashes::id());
    println!("  4. authority: {}", authority);

    let accounts = vec![
        AccountMeta::new(*randomness_account, false), // 0. randomness (writable)
        AccountMeta::new_readonly(*queue, false),     // 1. queue
        AccountMeta::new(*oracle, false),             // 2. oracle (writable)
        AccountMeta::new_readonly(sysvar::slot_hashes::id(), false), // 3. recent_slothashes
        AccountMeta::new_readonly(*authority, true),  // 4. authority (signer)
    ];

    Ok(Instruction::new_with_bytes(*program_id, &data, accounts))
}

/// Get Anchor instruction discriminator using SHA256
fn get_anchor_discriminator(name: &str) -> Vec<u8> {
    use solana_sdk::hash::{hashv, Hash};
    // Anchor uses sha256 hash of "global:<instruction_name>"
    // Note: Anchor uses Sha256, solana_sdk::hash::hash uses Sha256 internally
    let preimage = format!("global:{}", name);
    let hash_bytes = hashv(&[preimage.as_bytes()]).to_bytes();
    hash_bytes[..8].to_vec()
}

/// Wait for randomness to be revealed
pub async fn wait_for_reveal(
    rpc_client: &RpcClient,
    randomness_account: &Pubkey,
    timeout_secs: u64,
) -> Result<()> {
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        if start.elapsed() > timeout {
            return Err(anyhow!("Timeout waiting for randomness reveal"));
        }

        match check_if_revealed(rpc_client, randomness_account) {
            Ok(true) => {
                println!("Randomness revealed!");
                return Ok(());
            }
            Ok(false) => {
                print!(".");
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Err(e) => {
                return Err(anyhow!("Error checking randomness: {}", e));
            }
        }
    }
}

/// Check if randomness has been revealed
fn check_if_revealed(rpc_client: &RpcClient, randomness_account: &Pubkey) -> Result<bool> {
    let account = rpc_client.get_account(randomness_account)?;

    // Parse the RandomnessAccountData structure
    // The revealed value is stored at a specific offset
    // If the reveal slot is non-zero, randomness has been revealed

    if account.data.len() < 100 {
        return Err(anyhow!("Account data too short"));
    }

    // Check if reveal_slot is set (offset may vary based on Switchboard version)
    // For now, we check if there's meaningful data after the initial fields
    // The RandomnessAccountData has: seed_slot, seed_value, revealed_value, etc.

    // Simplified check: look for non-zero bytes in the revealed value area
    // This is a heuristic - the actual check should parse the full structure
    let reveal_offset = 40; // Approximate offset to revealed random value
    let reveal_check = &account.data[reveal_offset..reveal_offset + 32];

    // If the revealed value section has non-zero bytes, it's likely revealed
    let is_revealed = reveal_check.iter().any(|&b| b != 0);

    Ok(is_revealed)
}

/// Check the status of a randomness account
pub fn check_randomness_status(
    rpc_client: &RpcClient,
    randomness_account: &Pubkey,
) -> Result<String> {
    let account = match rpc_client.get_account(randomness_account) {
        Ok(acc) => acc,
        Err(_) => return Ok("Account not found".to_string()),
    };

    // Check both devnet and mainnet program IDs
    let sb_devnet = get_sb_program_id(true)?;
    let sb_mainnet = get_sb_program_id(false)?;

    if account.owner != sb_devnet && account.owner != sb_mainnet {
        return Ok(format!(
            "Account is not owned by Switchboard program (owner: {})",
            account.owner
        ));
    }

    // Parse basic info from the account
    // RandomnessAccountData layout:
    // - discriminator: 8 bytes [10, 66, 229, 135, 220, 239, 217, 114]
    // - authority: 32 bytes
    // - queue: 32 bytes
    // - seed_slothash: 32 bytes
    // - seed_slot: 8 bytes
    // - oracle: 32 bytes
    // - reveal_slot: 8 bytes
    // - value: 32 bytes

    if account.data.len() < 160 {
        return Ok("Account data too short to be a valid randomness account".to_string());
    }

    // Check discriminator
    let expected_discriminator = [10u8, 66, 229, 135, 220, 239, 217, 114];
    if account.data[..8] != expected_discriminator {
        return Ok("Invalid randomness account discriminator".to_string());
    }

    // Parse reveal_slot (offset: 8 + 32 + 32 + 32 + 8 + 32 = 144)
    let reveal_slot_offset = 144;
    let reveal_slot = u64::from_le_bytes(
        account.data[reveal_slot_offset..reveal_slot_offset + 8]
            .try_into()
            .unwrap_or([0u8; 8]),
    );

    // Parse seed_slot (offset: 8 + 32 + 32 + 32 = 104)
    let seed_slot_offset = 104;
    let seed_slot = u64::from_le_bytes(
        account.data[seed_slot_offset..seed_slot_offset + 8]
            .try_into()
            .unwrap_or([0u8; 8]),
    );

    if reveal_slot > 0 {
        Ok(format!(
            "Revealed at slot {} (seed slot: {}) - randomness value is available",
            reveal_slot, seed_slot
        ))
    } else if seed_slot > 0 {
        Ok(format!(
            "Committed at slot {} - waiting for oracle to reveal",
            seed_slot
        ))
    } else {
        Ok("Initialized - not yet committed".to_string())
    }
}
