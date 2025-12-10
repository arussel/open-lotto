"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { OpenLottoClient, Pot, TicketWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";
import BN from "bn.js";
import { CountdownDisplay } from "@/components/CountdownDisplay";

export default function LotteryDetailPage() {
  const params = useParams();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [pot, setPot] = useState<Pot | null>(null);
  const [userTickets, setUserTickets] = useState<TicketWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const potAddress = new PublicKey(params.address as string);

  useEffect(() => {
    if (!connection) return;

    const fetchData = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const potData = await client.getPot(potAddress);
        setPot(potData);

        if (publicKey) {
          const tickets = await client.getUserTickets(publicKey);
          // Filter tickets for this pot - you'd need to track this differently
          // For now, show all user tickets
          setUserTickets(tickets);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [connection, publicKey, params.address]);

  const handleEnter = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions || !pot) return;

    try {
      setEntering(true);
      setResult(null);

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      // You'd need to pass the correct token mint - for now using a placeholder
      // In production, this would come from the pot manager
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");

      const txId = await client.enterTicket({
        pot: potAddress,
        potTotalParticipants: pot.totalParticipants,
        tokenMint,
      });

      setResult({ success: true, message: `Ticket purchased! TX: ${shortenAddress(txId)}` });

      // Refresh pot data
      const potData = await client.getPot(potAddress);
      setPot(potData);
    } catch (error: any) {
      setResult({ success: false, message: error.message || "Failed to enter" });
    } finally {
      setEntering(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-slate-500">
        Loading...
      </div>
    );
  }

  if (!pot) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-slate-500">
        Lottery not found
      </div>
    );
  }

  const status = getPotStatus(pot);
  const isActive = status === PotStatus.Active;
  const isSettled = status === PotStatus.Settled;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
            <p className="text-primary-200 text-sm">Lottery</p>
            <p className="font-mono text-2xl font-bold mb-4">
              {shortenAddress(potAddress, 8)}
            </p>
            <div className="flex items-center gap-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isActive
                    ? "bg-green-500 text-white"
                    : isSettled
                    ? "bg-blue-500 text-white"
                    : "bg-slate-500 text-white"
                }`}
              >
                {status}
              </span>
              {isActive && (
                <span className="text-primary-200">
                  Ends in <CountdownDisplay endTimestamp={pot.endTimestamp} />
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-slate-500 text-sm">Total Participants</p>
                <p className="text-3xl font-bold text-slate-800">
                  {pot.totalParticipants.toString()}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-slate-500 text-sm">
                  {isSettled ? "Winning Ticket" : "Prize Pool"}
                </p>
                <p className="text-3xl font-bold text-slate-800">
                  {isSettled ? `#${pot.winningSlot.toString()}` : "?"}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6 mb-6">
              <h3 className="font-medium text-slate-800 mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Start Time</span>
                  <span className="font-medium">
                    {new Date(pot.startTimestamp.toNumber() * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">End Time</span>
                  <span className="font-medium">
                    {new Date(pot.endTimestamp.toNumber() * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Address</span>
                  <a
                    href={`https://explorer.solana.com/address/${potAddress.toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline font-mono"
                  >
                    {shortenAddress(potAddress)}
                  </a>
                </div>
              </div>
            </div>

            {result && (
              <div
                className={`p-4 rounded-lg mb-6 ${
                  result.success
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {result.message}
              </div>
            )}

            {isActive && publicKey && (
              <button
                onClick={handleEnter}
                disabled={entering}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {entering ? "Purchasing..." : "Buy Ticket"}
              </button>
            )}

            {isActive && !publicKey && (
              <p className="text-center text-slate-500">
                Connect your wallet to enter this lottery
              </p>
            )}

            {!isActive && (
              <p className="text-center text-slate-500">
                This lottery has ended
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
