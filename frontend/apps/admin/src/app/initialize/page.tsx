"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { OpenLottoClient } from "@open-lotto/sdk";
import BN from "bn.js";

const MAX_LOTTERY_NAME_BYTES = 32;

export default function InitializePage() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [lotteryName, setLotteryName] = useState("default");
  const [tokenMint, setTokenMint] = useState("");
  const [durationHours, setDurationHours] = useState("24");
  const [endInMinutes, setEndInMinutes] = useState("5");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    txId?: string;
  } | null>(null);

  const lotteryNameBytes = new TextEncoder().encode(lotteryName).length;
  const isNameTooLong = lotteryNameBytes > MAX_LOTTERY_NAME_BYTES;

  const handleInitialize = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      setResult({ success: false, message: "Wallet not connected" });
      return;
    }

    if (!tokenMint) {
      setResult({ success: false, message: "Token mint address is required" });
      return;
    }

    if (isNameTooLong) {
      setResult({ success: false, message: `Lottery name exceeds ${MAX_LOTTERY_NAME_BYTES} bytes` });
      return;
    }

    if (!lotteryName.trim()) {
      setResult({ success: false, message: "Lottery name is required" });
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const tokenMintPubkey = new PublicKey(tokenMint);
      const durationSeconds = parseInt(durationHours) * 60 * 60;
      const endInSeconds = parseInt(endInMinutes) * 60;
      const now = Math.floor(Date.now() / 1000);
      const endTimestamp = now + endInSeconds;

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      const txId = await client.initPotManager({
        managerName: lotteryName,
        tokenMint: tokenMintPubkey,
        endTimestamp: new BN(endTimestamp),
        potDuration: new BN(durationSeconds),
      });

      setResult({
        success: true,
        message: "Pot Manager initialized successfully!",
        txId,
      });
    } catch (error: any) {
      console.error("Error initializing:", error);
      setResult({
        success: false,
        message: error.message || "Failed to initialize",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-700 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-slate-500">
            Please connect an admin wallet to initialize a lottery.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Initialize Lottery</h1>
        <p className="text-slate-500 mt-1">
          Create a new pot manager and initial pot for the lottery.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Lottery Name
            </label>
            <input
              type="text"
              value={lotteryName}
              onChange={(e) => setLotteryName(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                isNameTooLong ? "border-red-500 bg-red-50" : "border-slate-300"
              }`}
              placeholder="default"
            />
            <div className="flex justify-between mt-1">
              <p className="text-sm text-slate-500">
                Unique identifier for this lottery instance
              </p>
              <p className={`text-sm ${isNameTooLong ? "text-red-600 font-medium" : "text-slate-400"}`}>
                {lotteryNameBytes}/{MAX_LOTTERY_NAME_BYTES} bytes
              </p>
            </div>
            {isNameTooLong && (
              <p className="text-sm text-red-600 mt-1">
                Name exceeds maximum length of {MAX_LOTTERY_NAME_BYTES} bytes
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Token Mint Address
            </label>
            <input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              placeholder="Enter SPL token mint address"
            />
            <p className="text-sm text-slate-500 mt-1">
              The SPL token used for lottery tickets and prizes
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Pot Duration (hours)
              </label>
              <input
                type="number"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                First Pot Ends In (minutes)
              </label>
              <input
                type="number"
                value={endInMinutes}
                onChange={(e) => setEndInMinutes(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                min="1"
              />
            </div>
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              <p className="font-medium">{result.message}</p>
              {result.txId && (
                <a
                  href={`https://explorer.solana.com/tx/${result.txId}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline mt-2 block"
                >
                  View Transaction
                </a>
              )}
            </div>
          )}

          <button
            onClick={handleInitialize}
            disabled={loading || isNameTooLong}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Initializing..." : "Initialize Lottery"}
          </button>
        </div>
      </div>
    </div>
  );
}
