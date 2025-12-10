import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Open Lotto",
  description: "Decentralized lottery on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="bg-primary-950 text-primary-200 py-8">
              <div className="container mx-auto px-4 text-center">
                <p>Open Lotto - Decentralized Lottery on Solana</p>
                <p className="text-sm mt-2">
                  Powered by Switchboard VRF for verifiable randomness
                </p>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
