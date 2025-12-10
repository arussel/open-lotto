"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";

export default function DrawPage() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [pots, setPots] = useState<PotWithAddress[]>([]);
  const [selectedPot, setSelectedPot] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"draw" | "settle" | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    txId?: string;
  } | null>(null);

  useEffect(() => {
    if (!connection) return;

    const fetchPots = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const allPots = await client.getAllPots();
        setPots(allPots);
      } catch (error) {
        console.error("Error fetching pots:", error);
      }
    };

    fetchPots();
  }, [connection]);

  const selectedPotData = pots.find(
    (p) => p.address.toBase58() === selectedPot
  );
  const potStatus = selectedPotData ? getPotStatus(selectedPotData) : null;

  const handleDraw = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions || !selectedPot) {
      return;
    }

    try {
      setLoading(true);
      setAction("draw");
      setResult(null);

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      // Generate a new randomness account keypair
      // Note: In production, you'd integrate with Switchboard SDK properly
      const randomnessKeypair = Keypair.generate();

      const txId = await client.drawLottery({
        pot: new PublicKey(selectedPot),
        randomnessAccount: randomnessKeypair.publicKey,
      });

      setResult({
        success: true,
        message: `Draw initiated! Randomness account: ${shortenAddress(randomnessKeypair.publicKey)}`,
        txId,
      });
    } catch (error: any) {
      console.error("Error drawing:", error);
      setResult({
        success: false,
        message: error.message || "Failed to draw lottery",
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleSettle = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions || !selectedPotData) {
      return;
    }

    try {
      setLoading(true);
      setAction("settle");
      setResult(null);

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      const txId = await client.settleLottery({
        pot: new PublicKey(selectedPot),
        randomnessAccount: selectedPotData.randomnessAccount,
      });

      setResult({
        success: true,
        message: "Lottery settled! Winner has been determined.",
        txId,
      });

      // Refresh pots
      const allPots = await client.getAllPots();
      setPots(allPots);
    } catch (error: any) {
      console.error("Error settling:", error);
      setResult({
        success: false,
        message: error.message || "Failed to settle lottery",
      });
    } finally {
      setLoading(false);
      setAction(null);
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
            Please connect an admin wallet to manage drawings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Draw & Settle</h1>
        <p className="text-slate-500 mt-1">
          Trigger randomness and settle lottery winners.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Pot
            </label>
            <select
              value={selectedPot}
              onChange={(e) => {
                setSelectedPot(e.target.value);
                setResult(null);
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select a pot...</option>
              {pots.map((pot) => (
                <option key={pot.address.toBase58()} value={pot.address.toBase58()}>
                  {shortenAddress(pot.address)} - {getPotStatus(pot)} (
                  {pot.totalParticipants.toString()} participants)
                </option>
              ))}
            </select>
          </div>

          {selectedPotData && (
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-medium text-slate-800 mb-3">Pot Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Status:</span>
                  <span className="ml-2 font-medium">{potStatus}</span>
                </div>
                <div>
                  <span className="text-slate-500">Participants:</span>
                  <span className="ml-2 font-medium">
                    {selectedPotData.totalParticipants.toString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">End Time:</span>
                  <span className="ml-2 font-medium">
                    {new Date(
                      selectedPotData.endTimestamp.toNumber() * 1000
                    ).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Winning Slot:</span>
                  <span className="ml-2 font-medium">
                    {selectedPotData.winningSlot.isZero()
                      ? "Not determined"
                      : selectedPotData.winningSlot.toString()}
                  </span>
                </div>
              </div>
            </div>
          )}

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

          <div className="flex gap-4">
            <button
              onClick={handleDraw}
              disabled={
                loading ||
                !selectedPot ||
                potStatus !== PotStatus.Closed
              }
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && action === "draw" ? "Drawing..." : "Draw Lottery"}
            </button>

            <button
              onClick={handleSettle}
              disabled={
                loading ||
                !selectedPot ||
                potStatus !== PotStatus.Drawing
              }
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && action === "settle" ? "Settling..." : "Settle Lottery"}
            </button>
          </div>

          <div className="text-sm text-slate-500">
            <p className="font-medium mb-2">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Wait for the pot to end (status: Closed)</li>
              <li>Click "Draw Lottery" to initiate randomness</li>
              <li>Wait a few seconds for randomness to be revealed</li>
              <li>Click "Settle Lottery" to determine the winner</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
