"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { LotteryCard } from "@/components/LotteryCard";

export default function LotteryListPage() {
  const { connection } = useConnection();
  const [pots, setPots] = useState<PotWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

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

  const filteredPots = pots.filter((pot) => {
    const status = getPotStatus(pot);
    if (filter === "active") return status === PotStatus.Active;
    if (filter === "ended") return status !== PotStatus.Active;
    return true;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Lotteries</h1>
        <p className="text-slate-500">
          Browse active and past lotteries. Enter for a chance to win!
        </p>
      </div>

      <div className="mb-6">
        <div className="flex gap-2">
          {(["all", "active", "ended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : filteredPots.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No lotteries found. Check back later!
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPots.map((pot) => (
            <LotteryCard key={pot.address.toBase58()} pot={pot} />
          ))}
        </div>
      )}
    </div>
  );
}
