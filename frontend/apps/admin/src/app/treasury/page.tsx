"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { deriveTreasuryPDA, deriveEscrowPDA, formatTokenAmount } from "@open-lotto/utils";
import BN from "bn.js";

export default function TreasuryPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [treasuryBalance, setTreasuryBalance] = useState<string>("0");
  const [escrowBalance, setEscrowBalance] = useState<string>("0");
  const [loading, setLoading] = useState(true);

  const [treasuryAddress] = deriveTreasuryPDA();
  const [escrowAddress] = deriveEscrowPDA();

  useEffect(() => {
    if (!connection) return;

    const fetchBalances = async () => {
      try {
        // Note: In production, you'd need to know the token mint to fetch balances
        // For now, we just show the PDA addresses
        setLoading(false);
      } catch (error) {
        console.error("Error fetching balances:", error);
        setLoading(false);
      }
    };

    fetchBalances();
  }, [connection]);

  if (!publicKey) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-700 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-slate-500">
            Please connect an admin wallet to view treasury.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Treasury</h1>
        <p className="text-slate-500 mt-1">
          View treasury and escrow account information
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-yellow-500 w-12 h-12 rounded-lg flex items-center justify-center text-2xl">
              💰
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Treasury</h2>
              <p className="text-sm text-slate-500">Collected fees</p>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500 mb-1">Address</p>
            <a
              href={`https://explorer.solana.com/address/${treasuryAddress.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-primary-600 hover:underline break-all"
            >
              {treasuryAddress.toBase58()}
            </a>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-500 w-12 h-12 rounded-lg flex items-center justify-center text-2xl">
              🔒
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Escrow</h2>
              <p className="text-sm text-slate-500">Prize pool</p>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500 mb-1">Address</p>
            <a
              href={`https://explorer.solana.com/address/${escrowAddress.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-primary-600 hover:underline break-all"
            >
              {escrowAddress.toBase58()}
            </a>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Account Details</h2>
        <div className="space-y-4">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="font-medium text-slate-700 mb-2">Treasury Token Account</h3>
            <p className="text-sm text-slate-500">
              This PDA holds all collected fees from lottery entries. The fees are 0.01 tokens per ticket.
            </p>
          </div>
          <div className="border-b border-slate-200 pb-4">
            <h3 className="font-medium text-slate-700 mb-2">Escrow Token Account</h3>
            <p className="text-sm text-slate-500">
              This PDA holds the prize pool. When a winner claims their prize,
              tokens are transferred from this account to the winner&apos;s wallet.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate-700 mb-2">Token Configuration</h3>
            <p className="text-sm text-slate-500">
              Each pot manager is bound to a specific SPL token mint.
              To view balances, check the token accounts on Solana Explorer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
