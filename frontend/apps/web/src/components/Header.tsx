"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/lottery", label: "Lotteries" },
  { href: "/tickets", label: "My Tickets" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-primary-950 text-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold">
            Open Lotto
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors ${
                    isActive
                      ? "text-white font-medium"
                      : "text-primary-300 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
