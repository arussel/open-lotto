"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { formatTokenAmount, shortenAddress } from "@open-lotto/utils";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import BN from "bn.js";

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [pots, setPots] = useState<PotWithAddress[]>([]);
  const [escrowBalance, setEscrowBalance] = useState<BN>(new BN(0));
  const [treasuryBalance, setTreasuryBalance] = useState<BN>(new BN(0));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connection) return;

    const fetchData = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const allPots = await client.getAllPots();
        setPots(allPots);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [connection]);

  const activePots = pots.filter((p) => getPotStatus(p) === PotStatus.Active);
  const settledPots = pots.filter((p) => getPotStatus(p) === PotStatus.Settled);
  const totalParticipants = pots.reduce(
    (sum, p) => sum + p.totalParticipants.toNumber(),
    0
  );

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-700 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-slate-500">
            Please connect an admin wallet to access the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Connected: {shortenAddress(publicKey!)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Active Pots"
          value={activePots.length.toString()}
          icon="🎰"
          color="bg-green-500"
        />
        <StatCard
          title="Total Pots"
          value={pots.length.toString()}
          icon="📊"
          color="bg-blue-500"
        />
        <StatCard
          title="Total Participants"
          value={totalParticipants.toString()}
          icon="👥"
          color="bg-purple-500"
        />
        <StatCard
          title="Winners Determined"
          value={settledPots.length.toString()}
          icon="🏆"
          color="bg-yellow-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Recent Pots</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : pots.length === 0 ? (
          <p className="text-slate-500">No pots found. Initialize one to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">
                    Pot Address
                  </th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">
                    Participants
                  </th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">
                    End Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {pots.slice(0, 5).map((pot) => (
                  <tr
                    key={pot.address.toBase58()}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="py-3 px-4 font-mono text-sm">
                      {shortenAddress(pot.address)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={getPotStatus(pot)} />
                    </td>
                    <td className="py-3 px-4">
                      {pot.totalParticipants.toString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {new Date(pot.endTimestamp.toNumber() * 1000).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-4">
        <div className={`${color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl`}>
          {icon}
        </div>
        <div>
          <p className="text-slate-500 text-sm">{title}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PotStatus }) {
  const styles: Record<PotStatus, string> = {
    [PotStatus.Active]: "bg-green-100 text-green-800",
    [PotStatus.Drawing]: "bg-yellow-100 text-yellow-800",
    [PotStatus.Settled]: "bg-blue-100 text-blue-800",
    [PotStatus.Closed]: "bg-slate-100 text-slate-800",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
