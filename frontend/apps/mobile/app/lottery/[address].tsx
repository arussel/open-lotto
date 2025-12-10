import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@/providers/ConnectionProvider";
import { useWallet } from "@/providers/WalletProvider";
import { OpenLottoClient, Pot } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";
import BN from "bn.js";

export default function LotteryDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { connection } = useConnection();
  const { publicKey, connected, connect, signTransaction, signAllTransactions } =
    useWallet();

  const [pot, setPot] = useState<Pot | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);

  const potAddress = new PublicKey(address);

  useEffect(() => {
    const fetchPot = async () => {
      try {
        const client = new OpenLottoClient({ connection, network: "devnet" });
        const potData = await client.getPot(potAddress);
        setPot(potData);
      } catch (error) {
        console.error("Error fetching pot:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPot();
  }, [connection, address]);

  const handleEnter = async () => {
    if (!connected) {
      connect();
      return;
    }

    if (!pot || !publicKey || !signTransaction || !signAllTransactions) return;

    try {
      setEntering(true);

      const client = new OpenLottoClient({
        connection,
        wallet: { publicKey, signTransaction, signAllTransactions },
        network: "devnet",
      });

      // Placeholder token mint - would come from pot manager in production
      const tokenMint = new PublicKey(
        "So11111111111111111111111111111111111111112"
      );

      await client.enterTicket({
        pot: potAddress,
        potTotalParticipants: pot.totalParticipants,
        tokenMint,
      });

      Alert.alert("Success", "You have entered the lottery!");

      // Refresh pot data
      const potData = await client.getPot(potAddress);
      setPot(potData);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to enter lottery");
    } finally {
      setEntering(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!pot) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Lottery not found</Text>
      </View>
    );
  }

  const status = getPotStatus(pot);
  const isActive = status === PotStatus.Active;

  const statusStyles: Record<PotStatus, { bg: string; text: string }> = {
    [PotStatus.Active]: { bg: "#dcfce7", text: "#166534" },
    [PotStatus.Drawing]: { bg: "#fef3c7", text: "#92400e" },
    [PotStatus.Settled]: { bg: "#dbeafe", text: "#1e40af" },
    [PotStatus.Closed]: { bg: "#f1f5f9", text: "#475569" },
  };

  const statusStyle = statusStyles[status];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>#{shortenAddress(potAddress, 8)}</Text>
        <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.badgeText, { color: statusStyle.text }]}>
            {status}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {pot.totalParticipants.toString()}
          </Text>
          <Text style={styles.statLabel}>Participants</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {pot.winningSlot.isZero() ? "?" : `#${pot.winningSlot.toString()}`}
          </Text>
          <Text style={styles.statLabel}>
            {pot.winningSlot.isZero() ? "TBD" : "Winner"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Start Time</Text>
            <Text style={styles.detailValue}>
              {new Date(pot.startTimestamp.toNumber() * 1000).toLocaleString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>End Time</Text>
            <Text style={styles.detailValue}>
              {new Date(pot.endTimestamp.toNumber() * 1000).toLocaleString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={[styles.detailValue, styles.mono]}>
              {shortenAddress(potAddress)}
            </Text>
          </View>
        </View>
      </View>

      {isActive && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.enterButton, entering && styles.enterButtonDisabled]}
            onPress={handleEnter}
            disabled={entering}
          >
            <Text style={styles.enterButtonText}>
              {!connected
                ? "Connect Wallet"
                : entering
                ? "Processing..."
                : "Enter Lottery"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            By entering, you agree to the lottery rules and acknowledge that
            randomness is provided by Switchboard VRF.
          </Text>
        </View>
      )}

      {!isActive && (
        <View style={styles.endedSection}>
          <Text style={styles.endedText}>This lottery has ended</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    color: "#64748b",
    fontSize: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
  },
  header: {
    backgroundColor: "#1e1b4b",
    padding: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    fontFamily: "monospace",
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#64748b",
  },
  section: {
    padding: 16,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  detailsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  detailLabel: {
    fontSize: 14,
    color: "#64748b",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1e293b",
  },
  mono: {
    fontFamily: "monospace",
  },
  actionSection: {
    padding: 16,
  },
  enterButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  enterButtonDisabled: {
    opacity: 0.7,
  },
  enterButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  disclaimer: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 18,
  },
  endedSection: {
    padding: 24,
    alignItems: "center",
  },
  endedText: {
    fontSize: 16,
    color: "#64748b",
  },
});
