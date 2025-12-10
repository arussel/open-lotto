"use client";

import Link from "next/link";
import { PotWithAddress, getPotStatus, PotStatus } from "@open-lotto/sdk";
import { shortenAddress } from "@open-lotto/utils";
import { CountdownDisplay } from "./CountdownDisplay";

export function LotteryCard({ pot }: { pot: PotWithAddress }) {
  const status = getPotStatus(pot);

  const statusStyles: Record<PotStatus, string> = {
    [PotStatus.Active]: "bg-green-100 text-green-800",
    [PotStatus.Drawing]: "bg-yellow-100 text-yellow-800",
    [PotStatus.Settled]: "bg-blue-100 text-blue-800",
    [PotStatus.Closed]: "bg-slate-100 text-slate-800",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-primary-200 text-sm">Lottery</p>
            <p className="text-white font-mono font-bold">
              #{shortenAddress(pot.address, 6)}
            </p>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyles[status]}`}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-slate-500 text-sm">Participants</p>
            <p className="text-2xl font-bold text-slate-800">
              {pot.totalParticipants.toString()}
            </p>
          </div>
          {status === PotStatus.Active && (
            <div className="text-right">
              <p className="text-slate-500 text-sm">Ends in</p>
              <CountdownDisplay endTimestamp={pot.endTimestamp} />
            </div>
          )}
          {status === PotStatus.Settled && (
            <div className="text-right">
              <p className="text-slate-500 text-sm">Winner</p>
              <p className="text-xl font-bold text-green-600">
                #{pot.winningSlot.toString()}
              </p>
            </div>
          )}
        </div>

        <Link
          href={`/lottery/${pot.address.toBase58()}`}
          className="block w-full bg-primary-600 hover:bg-primary-700 text-white text-center font-medium py-2 rounded-lg transition-colors"
        >
          {status === PotStatus.Active ? "Enter Now" : "View Details"}
        </Link>
      </div>
    </div>
  );
}
