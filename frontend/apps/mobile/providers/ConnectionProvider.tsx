import React, { createContext, useContext, useMemo } from "react";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const NETWORK = "devnet";
const RPC_URL = clusterApiUrl(NETWORK);

interface ConnectionContextValue {
  connection: Connection;
  network: typeof NETWORK;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => {
    const connection = new Connection(RPC_URL, "confirmed");
    return { connection, network: NETWORK };
  }, []);

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return context;
}
