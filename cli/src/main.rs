use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use solana_cli_config::{Config as SolanaConfig, CONFIG_FILE};
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
const OPEN_LOTTO_PID: &str = "FVzki74o5zsTDK1ShhQ6EyR3m2ft7HRgeSkCiEsE8aDf";

/// Open Lotto CLI - Manage lottery and invoke randomness oracle
#[derive(Parser)]
#[command(name = "open-lotto")]
#[command(about = "CLI for Open Lotto lottery program", long_about = None)]
struct Cli {
    /// Solana RPC URL (defaults to Solana CLI config)
    #[arg(long, short = 'u')]
    rpc_url: Option<String>,

    /// Path to keypair file (defaults to Solana CLI config)
    #[arg(long, short = 'k')]
    keypair: Option<String>,

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

        /// SPL Token mint address for the lottery
        #[arg(long)]
        token_mint: String,
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

    /// Reveal randomness (call Gateway API and submit reveal instruction)
    Reveal {
        /// Randomness account public key
        #[arg(long)]
        randomness: String,

        /// Oracle public key (if known)
        #[arg(long)]
        oracle: Option<String>,
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

    // Load Solana CLI config for defaults
    let config_file = CONFIG_FILE.as_ref()
        .ok_or_else(|| anyhow!("Unable to get Solana config file path"))?;
    let solana_config = SolanaConfig::load(config_file)
        .map_err(|e| anyhow!("Failed to load Solana config: {}", e))?;

    let rpc_url = cli.rpc_url.unwrap_or(solana_config.json_rpc_url);
    let keypair_path = cli.keypair.unwrap_or(solana_config.keypair_path);

    println!("Using RPC: {}", rpc_url);

    let rpc_client = RpcClient::new_with_commitment(
        rpc_url.clone(),
        CommitmentConfig::confirmed(),
    );

    let payer = load_keypair(&keypair_path)?;
    println!("Using wallet: {}", payer.pubkey());

    match cli.command {
        Commands::Init { name, duration, end_in, token_mint } => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs();
            let end_ts = now + end_in;

            let token_mint_pubkey = Pubkey::from_str(&token_mint)
                .context("Invalid token mint public key")?;

            let result = init_pot_manager(
                &rpc_client,
                &payer,
                &name,
                end_ts,
                duration,
                &token_mint_pubkey,
            )?;

            println!("\n✓ Pot Manager initialized!");
            println!("Manager: {}", result.pot_manager);
            println!("Token Mint: {}", token_mint);
            println!("Treasury Token Account: {}", result.treasury_token_account);
            println!("Escrow Token Account: {}", result.escrow_token_account);
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
                &rpc_url,
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
                &rpc_url,
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
                &rpc_url,
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

        Commands::Reveal { randomness, oracle } => {
            let randomness_pubkey = Pubkey::from_str(&randomness)
                .context("Invalid randomness account public key")?;

            // Get oracle from randomness account if not provided
            let oracle_pubkey = if let Some(oracle_str) = oracle {
                Pubkey::from_str(&oracle_str).context("Invalid oracle public key")?
            } else {
                // Read oracle from randomness account
                let randomness_data = rpc_client.get_account_data(&randomness_pubkey)?;
                read_oracle_from_randomness(&randomness_data)?
            };

            let queue = switchboard::get_sb_queue(rpc_url.contains("devnet"))?;

            println!("Revealing randomness...");
            println!("  Randomness: {}", randomness_pubkey);
            println!("  Oracle: {}", oracle_pubkey);
            println!("  Queue: {}", queue);

            let signature = switchboard::reveal_randomness(
                &rpc_client,
                &payer,
                &randomness_pubkey,
                &oracle_pubkey,
                &queue,
                &rpc_url,
            ).await?;

            println!("\n✓ Randomness revealed!");
            println!("Transaction: {}", signature);
        }
    }

    Ok(())
}

/// Read the oracle field from a randomness account's data
fn read_oracle_from_randomness(data: &[u8]) -> Result<Pubkey> {
    // RandomnessAccountData layout:
    // - discriminator: 8 bytes
    // - authority: 32 bytes
    // - queue: 32 bytes
    // - seed_slothash: 32 bytes
    // - seed_slot: 8 bytes
    // - oracle: 32 bytes (offset: 8 + 32 + 32 + 32 + 8 = 112)
    const ORACLE_OFFSET: usize = 112;

    if data.len() < ORACLE_OFFSET + 32 {
        return Err(anyhow!("Randomness account data too short"));
    }

    let pubkey_bytes: [u8; 32] = data[ORACLE_OFFSET..ORACLE_OFFSET + 32].try_into()?;
    Ok(Pubkey::from(pubkey_bytes))
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

    // Wager Escrow PDA (for oracle SOL wager)
    let (wager_escrow, _bump) = Pubkey::find_program_address(
        &[b"wagerEscrow"],
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
        AccountMeta::new(wager_escrow, false),
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

    // Build instruction data
    let discriminator = get_anchor_discriminator("settle_lottery");
    let data = discriminator.to_vec();

    // SettleLottery accounts: pot, randomness_account_data, user (signer)
    let accounts = vec![
        AccountMeta::new(*pot, false),
        AccountMeta::new_readonly(*randomness_account, false),
        AccountMeta::new_readonly(payer.pubkey(), true),
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
    pub treasury_token_account: Pubkey,
    pub escrow_token_account: Pubkey,
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
    token_mint: &Pubkey,
) -> Result<InitResult> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    // Derive PDAs
    let (pot_manager, _) = Pubkey::find_program_address(
        &[b"manager", payer.pubkey().as_ref(), manager_name.as_bytes()],
        &program_id,
    );

    // Treasury token account PDA
    let (treasury_token_account, _) = Pubkey::find_program_address(
        &[b"treasury"],
        &program_id,
    );

    // Escrow token account PDA
    let (escrow_token_account, _) = Pubkey::find_program_address(
        &[b"escrow"],
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

    // Accounts for InitPotManager with SPL token support
    let accounts = vec![
        AccountMeta::new(pot_manager, false),           // pot_manager
        AccountMeta::new_readonly(*token_mint, false),  // token_mint
        AccountMeta::new(treasury_token_account, false), // treasury_token_account
        AccountMeta::new(escrow_token_account, false),  // escrow_token_account
        AccountMeta::new(first_pot, false),             // first_pot
        AccountMeta::new(next_pot, false),              // next_pot
        AccountMeta::new(payer.pubkey(), true),         // authority (signer, payer)
        AccountMeta::new_readonly(system_program::id(), false), // system_program
        AccountMeta::new_readonly(spl_token::id(), false),      // token_program
        AccountMeta::new_readonly(sysvar::rent::id(), false),   // rent
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    println!("Transaction: {}", signature);

    Ok(InitResult {
        pot_manager,
        treasury_token_account,
        escrow_token_account,
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
