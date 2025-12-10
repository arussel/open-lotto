"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { OpenLottoClient, TicketWithAddress, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";
import Link from "next/link";

export default function TicketsPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [tickets, setTickets] = useState<TicketWithAddress[]>([]);
  const [pots, setPots] = useState<Map<string, PotWithAddress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!connection || !publicKey) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const userTickets = await client.getUserTickets(publicKey);
        setTickets(userTickets);

        // Fetch all pots to check for winners
        const allPots = await client.getAllPots();
        const potMap = new Map<string, PotWithAddress>();
        allPots.forEach((pot) => {
          potMap.set(pot.address.toBase58(), pot);
        });
        setPots(potMap);
      } catch (error) {
        console.error("Error fetching tickets:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [connection, publicKey]);

  const handleClaim = async (ticket: TicketWithAddress, pot: PotWithAddress) => {
    if (!publicKey || !signTransaction || !signAllTransactions) return;

    try {
      setClaiming(ticket.address.toBase58());

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      // Placeholder token mint - in production, get from pot manager
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");

      await client.claimPrize({
        ticket: ticket.address,
        winner: ticket.participant,
        pot: pot.address,
        tokenMint,
      });

      // Refresh tickets
      const userTickets = await client.getUserTickets(publicKey);
      setTickets(userTickets);
    } catch (error) {
      console.error("Error claiming:", error);
    } finally {
      setClaiming(null);
    }
  };

  if (!publicKey) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-4">My Tickets</h1>
        <p className="text-slate-500 mb-8">
          Connect your wallet to view your lottery tickets
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">My Tickets</h1>
        <p className="text-slate-500">
          View your lottery tickets and claim any prizes
        </p>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">You don&apos;t have any tickets yet</p>
          <Link
            href="/lottery"
            className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Browse Lotteries
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => {
            // Find the pot for this ticket (simplified - you'd need proper tracking)
            const potEntry = Array.from(pots.entries()).find(([_, pot]) =>
              pot.winningSlot.eq(ticket.index) ||
              pot.totalParticipants.gt(ticket.index)
            );
            const pot = potEntry?.[1];
            const isWinner = pot && pot.winningSlot.eq(ticket.index);
            const canClaim =
              isWinner && getPotStatus(pot) === PotStatus.Settled;

            return (
              <div
                key={ticket.address.toBase58()}
                className={`bg-white rounded-xl shadow-sm p-6 ${
                  isWinner ? "ring-2 ring-green-500" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-16 h-20 rounded-lg flex items-center justify-center text-2xl font-bold ${
                        isWinner
                          ? "bg-green-100 text-green-800 border-2 border-green-500"
                          : "bg-slate-100 text-slate-600 border-2 border-dashed border-slate-300"
                      }`}
                    >
                      #{ticket.index.toString()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        Ticket #{ticket.index.toString()}
                      </p>
                      <p className="text-sm text-slate-500 font-mono">
                        {shortenAddress(ticket.address)}
                      </p>
                      {isWinner && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                          Winner!
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {canClaim && pot && (
                      <button
                        onClick={() => handleClaim(ticket, pot)}
                        disabled={claiming === ticket.address.toBase58()}
                        className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {claiming === ticket.address.toBase58()
                          ? "Claiming..."
                          : "Claim Prize"}
                      </button>
                    )}
                    <a
                      href={`https://explorer.solana.com/address/${ticket.address.toBase58()}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                      View →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { PublicKey } from "@solana/web3.js";
