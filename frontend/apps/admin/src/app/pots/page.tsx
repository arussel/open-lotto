"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";
import Link from "next/link";

export default function PotsPage() {
  const { connection } = useConnection();
  const [pots, setPots] = useState<PotWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PotStatus | "all">("all");

  useEffect(() => {
    if (!connection) return;

    const fetchPots = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const allPots = await client.getAllPots();
        setPots(allPots);
      } catch (error) {
        console.error("Error fetching pots:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPots();
  }, [connection]);

  const filteredPots =
    filter === "all" ? pots : pots.filter((p) => getPotStatus(p) === filter);

  const statusColors: Record<PotStatus, string> = {
    [PotStatus.Active]: "bg-green-100 text-green-800",
    [PotStatus.Drawing]: "bg-yellow-100 text-yellow-800",
    [PotStatus.Settled]: "bg-blue-100 text-blue-800",
    [PotStatus.Closed]: "bg-slate-100 text-slate-800",
  };

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">All Pots</h1>
          <p className="text-slate-500 mt-1">View and manage all lottery pots</p>
        </div>
        <Link
          href="/initialize"
          className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          New Pot
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <div className="flex gap-2">
            {["all", ...Object.values(PotStatus)].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status as PotStatus | "all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? "bg-primary-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : filteredPots.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No pots found. Create one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Address
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Participants
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Start Time
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    End Time
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Winner
                  </th>
                  <th className="text-left py-4 px-6 text-slate-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPots.map((pot) => {
                  const status = getPotStatus(pot);
                  return (
                    <tr
                      key={pot.address.toBase58()}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-4 px-6 font-mono text-sm">
                        <a
                          href={`https://explorer.solana.com/address/${pot.address.toBase58()}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          {shortenAddress(pot.address)}
                        </a>
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {pot.totalParticipants.toString()}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {new Date(
                          pot.startTimestamp.toNumber() * 1000
                        ).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {new Date(
                          pot.endTimestamp.toNumber() * 1000
                        ).toLocaleString()}
                      </td>
                      <td className="py-4 px-6">
                        {pot.winningSlot.isZero() ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className="font-medium text-green-600">
                            #{pot.winningSlot.toString()}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        {(status === PotStatus.Closed ||
                          status === PotStatus.Drawing) && (
                          <Link
                            href={`/draw?pot=${pot.address.toBase58()}`}
                            className="text-primary-600 hover:underline text-sm"
                          >
                            {status === PotStatus.Closed ? "Draw" : "Settle"}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
