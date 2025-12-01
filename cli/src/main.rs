use anyhow::{anyhow, Context, Result};
use borsh::{BorshDeserialize, BorshSerialize};
use clap::{Parser, Subcommand};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::{AccountMeta, Instruction},
    message::Message,
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signer},
    system_program,
    sysvar,
    transaction::Transaction,
};
use std::str::FromStr;

mod switchboard;

// Open Lotto Program ID
const OPEN_LOTTO_PID: &str = "GMECsoFXBjDcsA7GuVUq1vFmCM27qJumw4Y1rGsxseui";

/// Open Lotto CLI - Manage lottery and invoke randomness oracle
#[derive(Parser)]
#[command(name = "open-lotto")]
#[command(about = "CLI for Open Lotto lottery program", long_about = None)]
struct Cli {
    /// Solana RPC URL
    #[arg(long, default_value = "https://api.devnet.solana.com")]
    rpc_url: String,

    /// Path to keypair file
    #[arg(long, default_value = "~/.config/solana/id.json")]
    keypair: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new pot manager with pots
    Init {
        /// Manager name (used in PDA derivation)
        #[arg(long, default_value = "default")]
        name: String,

        /// Pot duration in seconds, default 86400 (24 hours)
        #[arg(long, default_value = "86400")]
        duration: u64,

        /// End timestamp for first pot (seconds from now, default 120)
        #[arg(long, default_value = "120")]
        end_in: u64,
    },

    /// Create a new randomness account and commit
    CreateRandomness,

    /// Draw lottery - commits randomness and calls draw_lottery on the program
    Draw {
        /// Pot account public key
        #[arg(long)]
        pot: String,
    },

    /// Reveal randomness and settle lottery
    Settle {
        /// Pot account public key
        #[arg(long)]
        pot: String,
    },

    /// Full draw and settle in one command (waits for reveal)
    DrawAndSettle {
        /// Pot account public key
        #[arg(long)]
        pot: String,
    },

    /// Check the status of a randomness account
    CheckRandomness {
        /// Randomness account public key
        #[arg(long)]
        account: String,
    },
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return path.replacen("~", &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

fn load_keypair(path: &str) -> Result<Keypair> {
    let expanded = expand_tilde(path);
    read_keypair_file(&expanded)
        .map_err(|e| anyhow!("Failed to read keypair from {}: {}", expanded, e))
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    let rpc_client = RpcClient::new_with_commitment(
        cli.rpc_url.clone(),
        CommitmentConfig::confirmed(),
    );

    let payer = load_keypair(&cli.keypair)?;
    println!("Using wallet: {}", payer.pubkey());

    match cli.command {
        Commands::Init { name, duration, end_in } => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs();
            let end_ts = now + end_in;

            let result = init_pot_manager(
                &rpc_client,
                &payer,
                &name,
                end_ts,
                duration,
            )?;

            println!("\n✓ Pot Manager initialized!");
            println!("Manager: {}", result.pot_manager);
            println!("Treasury: {}", result.treasury);
            println!("First Pot: {}", result.first_pot);
            println!("Next Pot: {}", result.next_pot);
            println!("\nFirst pot ends at: {} (in {} seconds)", end_ts, end_in);
            println!("\nTo draw the lottery, run:");
            println!("  open-lotto draw --pot {}", result.first_pot);
        }

        Commands::CreateRandomness => {
            let randomness_keypair = Keypair::new();
            println!("Creating new randomness account: {}", randomness_keypair.pubkey());

            let result = switchboard::create_and_commit_randomness(
                &rpc_client,
                &payer,
                &randomness_keypair,
            ).await?;

            println!("\n✓ Randomness account created and committed!");
            println!("Randomness account: {}", result.randomness_account);
            println!("Commit slot: {}", result.commit_slot);
            println!("\nNext step: Wait a few slots, then reveal and settle");
        }

        Commands::Draw { pot } => {
            let pot_pubkey = Pubkey::from_str(&pot)
                .context("Invalid pot public key")?;

            let randomness_keypair = Keypair::new();
            println!("Creating randomness account: {}", randomness_keypair.pubkey());

            // 1. Create and commit randomness
            let commit_result = switchboard::create_and_commit_randomness(
                &rpc_client,
                &payer,
                &randomness_keypair,
            ).await?;

            println!("Randomness committed at slot: {}", commit_result.commit_slot);

            // 2. Call draw_lottery on our program
            let draw_result = call_draw_lottery(
                &rpc_client,
                &payer,
                &pot_pubkey,
                &randomness_keypair.pubkey(),
            )?;

            println!("\n✓ Draw completed!");
            println!("Randomness account: {}", randomness_keypair.pubkey());
            println!("Transaction: {}", draw_result);
            println!("\nNext step: Wait for randomness reveal (~5-10 seconds), then run settle");
        }

        Commands::Settle { pot } => {
            let pot_pubkey = Pubkey::from_str(&pot)
                .context("Invalid pot public key")?;

            // Read pot account to get randomness account
            let pot_data = rpc_client.get_account_data(&pot_pubkey)?;
            let randomness_account = read_pot_randomness_account(&pot_data)?;

            println!("Using randomness account from pot: {}", randomness_account);

            // Wait for reveal if needed
            println!("Waiting for randomness to be revealed...");
            switchboard::wait_for_reveal(&rpc_client, &randomness_account, 30).await?;

            // Call settle_lottery
            let settle_result = call_settle_lottery(
                &rpc_client,
                &payer,
                &pot_pubkey,
                &randomness_account,
            )?;

            println!("\n✓ Settle completed! Winner has been determined.");
            println!("Transaction: {}", settle_result);
        }

        Commands::DrawAndSettle { pot } => {
            let pot_pubkey = Pubkey::from_str(&pot)
                .context("Invalid pot public key")?;

            let randomness_keypair = Keypair::new();
            println!("Creating randomness account: {}", randomness_keypair.pubkey());

            // 1. Create and commit randomness
            let commit_result = switchboard::create_and_commit_randomness(
                &rpc_client,
                &payer,
                &randomness_keypair,
            ).await?;

            println!("Randomness committed at slot: {}", commit_result.commit_slot);

            // 2. Call draw_lottery
            let draw_result = call_draw_lottery(
                &rpc_client,
                &payer,
                &pot_pubkey,
                &randomness_keypair.pubkey(),
            )?;
            println!("Draw transaction: {}", draw_result);

            // 3. Wait for reveal
            println!("\nWaiting for randomness to be revealed...");
            switchboard::wait_for_reveal(&rpc_client, &randomness_keypair.pubkey(), 30).await?;

            // 4. Settle
            let settle_result = call_settle_lottery(
                &rpc_client,
                &payer,
                &pot_pubkey,
                &randomness_keypair.pubkey(),
            )?;

            println!("\n✓ Draw and settle completed! Winner has been determined.");
            println!("Settle transaction: {}", settle_result);
        }

        Commands::CheckRandomness { account } => {
            let randomness_pubkey = Pubkey::from_str(&account)
                .context("Invalid randomness account public key")?;

            let status = switchboard::check_randomness_status(&rpc_client, &randomness_pubkey)?;
            println!("Randomness account: {}", randomness_pubkey);
            println!("Status: {}", status);
        }
    }

    Ok(())
}

/// Read the randomness_account field from a Pot account's data
fn read_pot_randomness_account(data: &[u8]) -> Result<Pubkey> {
    // Pot layout: discriminator(8) + total_participants(8) + start_ts(8) + end_ts(8) + winning_slot(8) + randomness_account(32)
    if data.len() < 8 + 8 + 8 + 8 + 8 + 32 {
        return Err(anyhow!("Pot account data too short"));
    }
    let offset = 8 + 8 + 8 + 8 + 8; // skip to randomness_account
    let pubkey_bytes: [u8; 32] = data[offset..offset+32].try_into()?;
    Ok(Pubkey::from(pubkey_bytes))
}

/// Call the draw_lottery instruction on the Open Lotto program
fn call_draw_lottery(
    rpc_client: &RpcClient,
    payer: &Keypair,
    pot: &Pubkey,
    randomness_account: &Pubkey,
) -> Result<String> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    // Escrow PDA
    let (escrow_account, _bump) = Pubkey::find_program_address(
        &[b"stateEscrow"],
        &program_id,
    );

    // Build instruction data: discriminator + randomness_account pubkey
    // draw_lottery discriminator: sha256("global:draw_lottery")[..8]
    let discriminator = get_anchor_discriminator("draw_lottery");
    let mut data = discriminator.to_vec();
    data.extend_from_slice(&randomness_account.to_bytes());

    let accounts = vec![
        AccountMeta::new(*pot, false),
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new_readonly(*randomness_account, false),
        AccountMeta::new(escrow_account, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    Ok(signature.to_string())
}

/// Call the settle_lottery instruction on the Open Lotto program
fn call_settle_lottery(
    rpc_client: &RpcClient,
    payer: &Keypair,
    pot: &Pubkey,
    randomness_account: &Pubkey,
) -> Result<String> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    // Escrow PDA
    let (escrow_account, _bump) = Pubkey::find_program_address(
        &[b"stateEscrow"],
        &program_id,
    );

    // Build instruction data
    let discriminator = get_anchor_discriminator("settle_lottery");
    let data = discriminator.to_vec();

    let accounts = vec![
        AccountMeta::new(*pot, false),
        AccountMeta::new_readonly(*randomness_account, false),
        AccountMeta::new(escrow_account, false),
        AccountMeta::new_readonly(payer.pubkey(), true),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    Ok(signature.to_string())
}

pub struct InitResult {
    pub pot_manager: Pubkey,
    pub treasury: Pubkey,
    pub first_pot: Pubkey,
    pub next_pot: Pubkey,
}

/// Initialize a pot manager with two pots
fn init_pot_manager(
    rpc_client: &RpcClient,
    payer: &Keypair,
    manager_name: &str,
    end_ts: u64,
    pot_duration: u64,
) -> Result<InitResult> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    // Derive PDAs
    let (pot_manager, _) = Pubkey::find_program_address(
        &[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()],
        &program_id,
    );

    let (treasury, _) = Pubkey::find_program_address(
        &[b"treasury", payer.pubkey().as_ref()],
        &program_id,
    );

    let (first_pot, _) = Pubkey::find_program_address(
        &[b"pot", pot_manager.as_ref(), &end_ts.to_le_bytes()],
        &program_id,
    );

    let next_end_ts = end_ts + pot_duration;
    let (next_pot, _) = Pubkey::find_program_address(
        &[b"pot", pot_manager.as_ref(), &next_end_ts.to_le_bytes()],
        &program_id,
    );

    // Build instruction data: discriminator + end_ts + pot_duration + manager_name
    let discriminator = get_anchor_discriminator("init_pot_manager");
    let mut data = discriminator.to_vec();
    data.extend_from_slice(&end_ts.to_le_bytes());
    data.extend_from_slice(&pot_duration.to_le_bytes());
    // String is serialized as: length (4 bytes) + bytes
    data.extend_from_slice(&(manager_name.len() as u32).to_le_bytes());
    data.extend_from_slice(manager_name.as_bytes());

    let accounts = vec![
        AccountMeta::new(pot_manager, false),
        AccountMeta::new(treasury, false),
        AccountMeta::new(first_pot, false),
        AccountMeta::new(next_pot, false),
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    println!("Transaction: {}", signature);

    Ok(InitResult {
        pot_manager,
        treasury,
        first_pot,
        next_pot,
    })
}

/// Get Anchor instruction discriminator
fn get_anchor_discriminator(name: &str) -> [u8; 8] {
    use solana_sdk::hash::hash;
    let preimage = format!("global:{}", name);
    let hash_bytes = hash(preimage.as_bytes()).to_bytes();
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&hash_bytes[..8]);
    discriminator
}
