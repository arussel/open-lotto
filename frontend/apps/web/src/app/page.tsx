"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import Link from "next/link";
import { LotteryCard } from "@/components/LotteryCard";

export default function HomePage() {
  const { connection } = useConnection();
  const [activePots, setActivePots] = useState<PotWithAddress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connection) return;

    const fetchPots = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const allPots = await client.getAllPots();
        const active = allPots.filter((p) => getPotStatus(p) === PotStatus.Active);
        setActivePots(active);
      } catch (error) {
        console.error("Error fetching pots:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPots();
  }, [connection]);

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">
            Decentralized Lottery on Solana
          </h1>
          <p className="text-xl text-primary-200 mb-8 max-w-2xl mx-auto">
            Fair, transparent, and verifiable. Enter for a chance to win with
            provably random selection powered by Switchboard VRF.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/lottery"
              className="bg-white text-primary-900 font-bold py-3 px-8 rounded-lg hover:bg-primary-100 transition-colors"
            >
              View Lotteries
            </Link>
            <Link
              href="/tickets"
              className="bg-primary-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-primary-700 transition-colors border border-primary-500"
            >
              My Tickets
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">
            Why Open Lotto?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🎲"
              title="Provably Fair"
              description="Randomness is generated using Switchboard VRF, ensuring every draw is verifiable and tamper-proof."
            />
            <FeatureCard
              icon="⚡"
              title="Instant Payouts"
              description="Winners can claim their prizes immediately. No waiting, no middlemen."
            />
            <FeatureCard
              icon="🔒"
              title="Non-Custodial"
              description="Your funds stay in your wallet until you buy a ticket. Smart contracts handle everything."
            />
          </div>
        </div>
      </section>

      {/* Active Lotteries Section */}
      <section className="py-16 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-slate-800">
              Active Lotteries
            </h2>
            <Link
              href="/lottery"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : activePots.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No active lotteries at the moment. Check back soon!
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activePots.slice(0, 3).map((pot) => (
                <LotteryCard key={pot.address.toBase58()} pot={pot} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <StepCard
              step={1}
              title="Connect Wallet"
              description="Connect your Solana wallet (Phantom, Solflare, etc.)"
            />
            <StepCard
              step={2}
              title="Buy Ticket"
              description="Choose a lottery and purchase your ticket with tokens"
            />
            <StepCard
              step={3}
              title="Wait for Draw"
              description="When the lottery ends, randomness is generated"
            />
            <StepCard
              step={4}
              title="Claim Prize"
              description="If you win, claim your prize instantly!"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center p-6">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-slate-600">{description}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
        {step}
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
  );
}
