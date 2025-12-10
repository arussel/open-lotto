import React, { createContext, useContext, useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";

interface WalletContextValue {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const APP_IDENTITY = {
  name: "Open Lotto",
  uri: "https://openlotto.app",
  icon: "favicon.ico",
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      setConnecting(true);

      const result = await transact(async (wallet: Web3MobileWallet) => {
        const authResult = await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });

        return {
          publicKey: authResult.accounts[0].publicKey,
          authToken: authResult.auth_token,
        };
      });

      setPublicKey(new PublicKey(result.publicKey));
      setAuthToken(result.authToken);
    } catch (error) {
      console.error("Failed to connect:", error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setAuthToken(null);
  }, []);

  const signTransaction = useCallback(
    async (tx: Transaction): Promise<Transaction> => {
      if (!publicKey) throw new Error("Wallet not connected");

      const result = await transact(async (wallet: Web3MobileWallet) => {
        // Reauthorize if we have an auth token
        if (authToken) {
          await wallet.reauthorize({
            auth_token: authToken,
            identity: APP_IDENTITY,
          });
        }

        const signedTxs = await wallet.signTransactions({
          transactions: [tx],
        });

        return signedTxs[0];
      });

      return result;
    },
    [publicKey, authToken]
  );

  const signAllTransactions = useCallback(
    async (txs: Transaction[]): Promise<Transaction[]> => {
      if (!publicKey) throw new Error("Wallet not connected");

      const result = await transact(async (wallet: Web3MobileWallet) => {
        if (authToken) {
          await wallet.reauthorize({
            auth_token: authToken,
            identity: APP_IDENTITY,
          });
        }

        return wallet.signTransactions({
          transactions: txs,
        });
      });

      return result;
    },
    [publicKey, authToken]
  );

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected: !!publicKey,
        connecting,
        connect,
        disconnect,
        signTransaction,
        signAllTransactions,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
