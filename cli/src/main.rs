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

    /// Close a pot account and recover rent
    ClosePot {
        /// Pot account public key
        #[arg(long)]
        pot: String,
    },

    /// List all program accounts (pots, pot managers, tickets)
    ListAccounts,

    /// Force close a program-owned account (for cleaning up legacy accounts)
    ForceClose {
        /// Account public key to close
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

        Commands::ClosePot { pot } => {
            let pot_pubkey = Pubkey::from_str(&pot)
                .context("Invalid pot public key")?;

            let signature = call_close_pot(&rpc_client, &payer, &pot_pubkey)?;
            println!("\n✓ Pot account closed!");
            println!("Transaction: {}", signature);
            println!("Rent recovered to: {}", payer.pubkey());
        }

        Commands::ListAccounts => {
            let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

            println!("Fetching all program accounts...\n");

            let accounts = rpc_client.get_program_accounts(&program_id)?;

            if accounts.is_empty() {
                println!("No accounts found for program {}", program_id);
            } else {
                // Categorize accounts by discriminator
                let mut pots = Vec::new();
                let mut pot_managers = Vec::new();
                let mut tickets = Vec::new();
                let mut unknown = Vec::new();

                for (pubkey, account) in &accounts {
                    if account.data.len() >= 8 {
                        let disc = &account.data[0..8];
                        match disc {
                            // Pot discriminator
                            [238, 118, 60, 175, 178, 191, 59, 58] => pots.push((pubkey, account)),
                            // PotManager discriminator
                            [184, 109, 148, 80, 4, 87, 136, 85] => pot_managers.push((pubkey, account)),
                            // Ticket discriminator
                            [41, 228, 24, 165, 78, 90, 235, 200] => tickets.push((pubkey, account)),
                            _ => unknown.push((pubkey, account)),
                        }
                    } else {
                        unknown.push((pubkey, account));
                    }
                }

                println!("=== Pot Managers ({}) ===", pot_managers.len());
                for (pubkey, account) in &pot_managers {
                    let lamports = account.lamports;
                    let name = parse_pot_manager_name(&account.data).unwrap_or_else(|_| "unknown".to_string());
                    println!("  {} (name: {}, {} lamports)", pubkey, name, lamports);
                }

                println!("\n=== Pots ({}) ===", pots.len());
                for (pubkey, account) in &pots {
                    let lamports = account.lamports;
                    let (participants, end_ts) = parse_pot_info(&account.data).unwrap_or((0, 0));
                    println!("  {} (participants: {}, end_ts: {}, {} lamports)", pubkey, participants, end_ts, lamports);
                }

                println!("\n=== Tickets ({}) ===", tickets.len());
                for (pubkey, account) in &tickets {
                    let lamports = account.lamports;
                    println!("  {} ({} lamports)", pubkey, lamports);
                }

                if !unknown.is_empty() {
                    println!("\n=== Unknown ({}) ===", unknown.len());
                    for (pubkey, account) in &unknown {
                        println!("  {} ({} lamports, {} bytes)", pubkey, account.lamports, account.data.len());
                    }
                }

                println!("\n=== Summary ===");
                let total_lamports: u64 = accounts.iter().map(|(_, a)| a.lamports).sum();
                println!("Total accounts: {}", accounts.len());
                println!("Total lamports: {} ({:.4} SOL)", total_lamports, total_lamports as f64 / 1_000_000_000.0);
            }
        }

        Commands::ForceClose { account } => {
            let account_pubkey = Pubkey::from_str(&account)
                .context("Invalid account public key")?;

            let signature = call_force_close_account(&rpc_client, &payer, &account_pubkey)?;
            println!("\n✓ Account force closed!");
            println!("Transaction: {}", signature);
            println!("Rent recovered to: {}", payer.pubkey());
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
    // Pot layout (new):
    // - discriminator: 8 bytes
    // - pot_manager: 32 bytes
    // - total_participants: 8 bytes
    // - start_ts: 8 bytes
    // - end_ts: 8 bytes
    // - winning_slot: 8 bytes
    // - randomness_account: 32 bytes
    const RANDOMNESS_OFFSET: usize = 8 + 32 + 8 + 8 + 8 + 8;
    if data.len() < RANDOMNESS_OFFSET + 32 {
        return Err(anyhow!("Pot account data too short"));
    }
    let pubkey_bytes: [u8; 32] = data[RANDOMNESS_OFFSET..RANDOMNESS_OFFSET + 32].try_into()?;
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

/// Call the close_pot instruction on the Open Lotto program
fn call_close_pot(
    rpc_client: &RpcClient,
    payer: &Keypair,
    pot: &Pubkey,
) -> Result<String> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    let discriminator = get_anchor_discriminator("close_pot");
    let data = discriminator.to_vec();

    // ClosePot accounts: pot, authority (signer)
    let accounts = vec![
        AccountMeta::new(*pot, false),
        AccountMeta::new(payer.pubkey(), true),
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    Ok(signature.to_string())
}

/// Parse pot manager name from account data
fn parse_pot_manager_name(data: &[u8]) -> Result<String> {
    // PotManager layout:
    // - discriminator: 8 bytes
    // - authority: 32 bytes
    // - treasury: 32 bytes
    // - token_mint: 32 bytes
    // - rent: 8 bytes
    // - last_random_number: 8 bytes
    // - timestamps: 16 bytes (two u64s)
    // - bump: 1 byte
    // - name: 4 bytes length + string
    const NAME_OFFSET: usize = 8 + 32 + 32 + 32 + 8 + 8 + 16 + 1;

    if data.len() < NAME_OFFSET + 4 {
        return Err(anyhow!("PotManager data too short"));
    }

    let name_len = u32::from_le_bytes(data[NAME_OFFSET..NAME_OFFSET + 4].try_into()?) as usize;
    if data.len() < NAME_OFFSET + 4 + name_len {
        return Err(anyhow!("PotManager name data incomplete"));
    }

    let name_bytes = &data[NAME_OFFSET + 4..NAME_OFFSET + 4 + name_len];
    String::from_utf8(name_bytes.to_vec()).map_err(|e| anyhow!("Invalid name UTF-8: {}", e))
}

/// Parse pot info (participants, end_ts) from account data
fn parse_pot_info(data: &[u8]) -> Result<(u64, u64)> {
    // Pot layout (new):
    // - discriminator: 8 bytes
    // - pot_manager: 32 bytes
    // - total_participants: 8 bytes
    // - start_timestamp: 8 bytes
    // - end_timestamp: 8 bytes
    // - winning_slot: 8 bytes
    // - randomness_account: 32 bytes
    const PARTICIPANTS_OFFSET: usize = 8 + 32;
    const END_TS_OFFSET: usize = 8 + 32 + 8 + 8;

    if data.len() < END_TS_OFFSET + 8 {
        return Err(anyhow!("Pot data too short"));
    }

    let participants = u64::from_le_bytes(data[PARTICIPANTS_OFFSET..PARTICIPANTS_OFFSET + 8].try_into()?);
    let end_ts = u64::from_le_bytes(data[END_TS_OFFSET..END_TS_OFFSET + 8].try_into()?);

    Ok((participants, end_ts))
}

/// Call the force_close_account instruction on the Open Lotto program
fn call_force_close_account(
    rpc_client: &RpcClient,
    payer: &Keypair,
    account: &Pubkey,
) -> Result<String> {
    let program_id = Pubkey::from_str(OPEN_LOTTO_PID)?;

    let discriminator = get_anchor_discriminator("force_close_account");
    let data = discriminator.to_vec();

    // ForceCloseAccount accounts: account, authority (signer)
    let accounts = vec![
        AccountMeta::new(*account, false),
        AccountMeta::new(payer.pubkey(), true),
    ];

    let instruction = Instruction::new_with_bytes(program_id, &data, accounts);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let message = Message::new(&[instruction], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[payer], message, recent_blockhash);

    let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
    Ok(signature.to_string())
}
