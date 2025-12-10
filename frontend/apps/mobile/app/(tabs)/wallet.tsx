import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useWallet } from "@/providers/WalletProvider";
import { shortenAddress } from "@open-lotto/utils";

export default function WalletScreen() {
  const { publicKey, connected, connect, disconnect, connecting } = useWallet();

  const openExplorer = () => {
    if (publicKey) {
      Linking.openURL(
        `https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`
      );
    }
  };

  if (!connected) {
    return (
      <View style={styles.centered}>
        <Text style={styles.icon}>👛</Text>
        <Text style={styles.title}>Connect Wallet</Text>
        <Text style={styles.subtitle}>
          Connect your Solana wallet to manage your lottery tickets
        </Text>
        <TouchableOpacity
          style={styles.connectButton}
          onPress={connect}
          disabled={connecting}
        >
          <Text style={styles.connectButtonText}>
            {connecting ? "Connecting..." : "Connect Wallet"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.supportText}>
          Supports Phantom, Solflare, and other MWA wallets
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <View style={styles.walletIcon}>
            <Text style={styles.walletIconText}>👛</Text>
          </View>
          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Connected Wallet</Text>
            <Text style={styles.walletAddress}>
              {shortenAddress(publicKey!, 8)}
            </Text>
          </View>
        </View>

        <View style={styles.walletActions}>
          <TouchableOpacity style={styles.actionButton} onPress={openExplorer}>
            <Text style={styles.actionButtonText}>View on Explorer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.disconnectButton]}
            onPress={disconnect}
          >
            <Text style={[styles.actionButtonText, styles.disconnectButtonText]}>
              Disconnect
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <View style={styles.networkCard}>
          <View style={styles.networkDot} />
          <Text style={styles.networkText}>Devnet</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutText}>
            Open Lotto is a decentralized lottery on Solana with verifiable
            randomness powered by Switchboard VRF.
          </Text>
          <Text style={styles.aboutVersion}>Version 1.0.0</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  connectButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  connectButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  supportText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  walletCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 24,
  },
  walletHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  walletIcon: {
    width: 48,
    height: 48,
    backgroundColor: "#6366f1",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  walletIconText: {
    fontSize: 24,
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 4,
  },
  walletAddress: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    fontFamily: "monospace",
  },
  walletActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "500",
  },
  disconnectButton: {
    backgroundColor: "#fee2e2",
  },
  disconnectButtonText: {
    color: "#dc2626",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  networkCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 12,
  },
  networkText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1e293b",
  },
  aboutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
  },
  aboutText: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 22,
    marginBottom: 12,
  },
  aboutVersion: {
    fontSize: 12,
    color: "#94a3b8",
  },
});
