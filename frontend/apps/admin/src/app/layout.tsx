import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Open Lotto Admin",
  description: "Admin dashboard for Open Lotto on Solana",
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
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
