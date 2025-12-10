"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/initialize", label: "Initialize", icon: "🚀" },
  { href: "/pots", label: "All Pots", icon: "🎰" },
  { href: "/draw", label: "Draw & Settle", icon: "🎲" },
  { href: "/treasury", label: "Treasury", icon: "💰" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-primary-950 text-white min-h-screen flex flex-col">
      <div className="p-6 border-b border-primary-800">
        <h1 className="text-xl font-bold">Open Lotto</h1>
        <p className="text-primary-300 text-sm">Admin Dashboard</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary-600 text-white"
                      : "text-primary-200 hover:bg-primary-800 hover:text-white"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-primary-800">
        <WalletMultiButton className="w-full" />
      </div>
    </aside>
  );
}
