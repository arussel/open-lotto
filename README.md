# Open Lotto

A decentralized lottery program on Solana with verifiable randomness.

## Overview

- Participants can buy multiple tickets
- Each ticket has a unique number
- At the end of the lottery, a winning ticket is drawn using Switchboard VRF
- The owner of the winning ticket receives the prize pool

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│   Users     │     │     Solana      │     │     Keeper      │     │  Switchboard Oracle │
│             │     │                 │     │   (CLI/Bot)     │     │       (TEE)         │
└──────┬──────┘     └────────┬────────┘     └────────┬────────┘     └──────────┬──────────┘
       │                     │                       │                         │
       │ enter_ticket        │                       │                         │
       ├────────────────────>│ (Open Lotto)          │                         │
       │                     │                       │                         │
       │                     │ (when pot ends)       │                         │
       │                     │                       │                         │
       │                     │   randomnessInit      │                         │
       │                     │<──────────────────────┤                         │
       │                     │ (Switchboard program) │                         │
       │                     │                       │                         │
       │                     │   randomnessCommit    │                         │
       │                     │<──────────────────────┤                         │
       │                     │ (Switchboard program) │                         │
       │                     │                       │                         │
       │                     │   draw_lottery        │                         │
       │                     │<──────────────────────┤                         │
       │                     │ (Open Lotto)          │                         │
       │                     │                       │                         │
       │                     │   randomnessReveal    │  (watches chain,        │
       │                     │<────────────────────────────────────────────────┤
       │                     │ (Switchboard program) │   reveals when ready)   │
       │                     │                       │                         │
       │                     │   settle_lottery      │                         │
       │                     │<──────────────────────┤                         │
       │                     │ (Open Lotto)          │                         │
       │                     │                       │                         │
       │ claim_prize         │                       │                         │
       ├────────────────────>│ (Open Lotto)          │                         │
       │                     │                       │                         │
```

## Components

### On-Chain Program (Anchor)

Located in `programs/open-lotto/`. Handles:

- **Pot Manager**: Controls lottery configuration and rolling pots
- **Pots**: Time-bounded lottery rounds with ticket sales
- **Tickets**: Individual entries linked to participants
- **Treasury**: Collects fees (10% of ticket price)

### CLI / Keeper

Located in `cli/`. A Rust CLI that can act as a keeper bot:

- `init` - Initialize pot manager with rolling pots
- `draw` - Request randomness and call draw_lottery
- `settle` - Wait for reveal and settle the winner
- `draw-and-settle` - Full cycle in one command

### Switchboard Integration

Uses Switchboard On-Demand for verifiable randomness:

1. **randomnessInit** - Create randomness account with LUT
2. **randomnessCommit** - Lock in slot, oracle signs commitment
3. **Oracle reveals** - TEE computes and writes random value
4. **Program reads** - settle_lottery picks winner from revealed value

## Accounts

```
PotManager (PDA: ["manager", authority, name])
├── authority: Pubkey
├── treasury: Pubkey
├── timestamps: (current_pot_end, next_pot_end)
└── pot_duration: u64

Pot (PDA: ["pot", pot_manager, end_timestamp])
├── total_participants: u64
├── start_timestamp: u64
├── end_timestamp: u64
├── winning_slot: u64
└── randomness_account: Pubkey

Ticket (PDA: ["ticket", pot, index])
├── participant: Pubkey
└── index: u64

Treasury (PDA: ["treasury", authority])
└── (holds 10% fees)

Escrow (PDA: ["stateEscrow"])
└── (holds 90% prize pool)
```

## Flow

1. **Setup**: Keeper calls `init` to create pot manager + first two pots
2. **Ticket Sales**: Users call `enter_ticket` during pot's time window
3. **Draw**: When pot ends, keeper calls `draw` (creates randomness, commits)
4. **Reveal**: Switchboard oracle reveals random value (~5-10 seconds)
5. **Settle**: Keeper calls `settle` to determine winner
6. **Claim**: Winner calls `claim_prize` to collect the pot

## Development

```bash
# Build program
anchor build

# Run tests (uses LiteSVM with mocked randomness)
cargo test

# Build CLI
cd cli && cargo build

# Run CLI (uses Solana CLI config)
./target/debug/open-lotto init --name daily --duration 86400
```

## Status

- Program: Deployed to devnet at `GMECsoFXBjDcsA7GuVUq1vFmCM27qJumw4Y1rGsxseui`
- CLI: Complete
- Switchboard: Blocked on devnet (oracle keys expired)

## Costs (Mainnet Estimate)

| Operation | Cost |
|-----------|------|
| Deploy program | ~2 SOL |
| Init pot manager | ~0.02 SOL |
| Buy ticket | 0.01 SOL + rent |
| Draw + Settle | ~0.01 SOL |
