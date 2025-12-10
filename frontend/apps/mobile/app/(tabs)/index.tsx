import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Link } from "expo-router";
import { useConnection } from "@/providers/ConnectionProvider";
import { useWallet } from "@/providers/WalletProvider";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";

export default function HomeScreen() {
  const { connection } = useConnection();
  const { connected, publicKey, connect, connecting } = useWallet();
  const [activePots, setActivePots] = useState<PotWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPots = async () => {
    try {
      const client = new OpenLottoClient({ connection, network: "devnet" });
      const allPots = await client.getAllPots();
      const active = allPots.filter((p) => getPotStatus(p) === PotStatus.Active);
      setActivePots(active);
    } catch (error) {
      console.error("Error fetching pots:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPots();
  }, [connection]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPots();
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Decentralized Lottery</Text>
        <Text style={styles.heroSubtitle}>
          Fair, transparent, and verifiable on Solana
        </Text>
        {!connected ? (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={connect}
            disabled={connecting}
          >
            <Text style={styles.connectButtonText}>
              {connecting ? "Connecting..." : "Connect Wallet"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.connectedBadge}>
            <Text style={styles.connectedText}>
              Connected: {shortenAddress(publicKey!)}
            </Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activePots.length}</Text>
          <Text style={styles.statLabel}>Active Lotteries</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {activePots.reduce(
              (sum, p) => sum + p.totalParticipants.toNumber(),
              0
            )}
          </Text>
          <Text style={styles.statLabel}>Total Players</Text>
        </View>
      </View>

      {/* Active Lotteries */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Lotteries</Text>
          <Link href="/lottery" asChild>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>View All →</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : activePots.length === 0 ? (
          <Text style={styles.emptyText}>No active lotteries</Text>
        ) : (
          activePots.slice(0, 3).map((pot) => (
            <Link
              key={pot.address.toBase58()}
              href={`/lottery/${pot.address.toBase58()}`}
              asChild
            >
              <TouchableOpacity style={styles.lotteryCard}>
                <View>
                  <Text style={styles.lotteryId}>
                    #{shortenAddress(pot.address, 6)}
                  </Text>
                  <Text style={styles.lotteryParticipants}>
                    {pot.totalParticipants.toString()} participants
                  </Text>
                </View>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </TouchableOpacity>
            </Link>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  hero: {
    backgroundColor: "#1e1b4b",
    padding: 24,
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: "#a5b4fc",
    marginBottom: 24,
    textAlign: "center",
  },
  connectButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  connectButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  connectedBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  connectedText: {
    color: "#a5b4fc",
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 16,
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
  },
  statLabel: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
  },
  viewAllText: {
    color: "#6366f1",
    fontSize: 14,
    fontWeight: "500",
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    padding: 24,
  },
  lotteryCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  lotteryId: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  lotteryParticipants: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  activeBadgeText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
});
