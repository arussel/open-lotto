import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Link } from "expo-router";
import { useConnection } from "@/providers/ConnectionProvider";
import { OpenLottoClient, PotWithAddress } from "@open-lotto/sdk";
import { getPotStatus, PotStatus } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";

export default function LotteryScreen() {
  const { connection } = useConnection();
  const [pots, setPots] = useState<PotWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

  const fetchPots = async () => {
    try {
      const client = new OpenLottoClient({ connection, network: "devnet" });
      const allPots = await client.getAllPots();
      setPots(allPots);
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

  const filteredPots = pots.filter((pot) => {
    const status = getPotStatus(pot);
    if (filter === "active") return status === PotStatus.Active;
    if (filter === "ended") return status !== PotStatus.Active;
    return true;
  });

  const statusStyles: Record<PotStatus, { bg: string; text: string }> = {
    [PotStatus.Active]: { bg: "#dcfce7", text: "#166534" },
    [PotStatus.Drawing]: { bg: "#fef3c7", text: "#92400e" },
    [PotStatus.Settled]: { bg: "#dbeafe", text: "#1e40af" },
    [PotStatus.Closed]: { bg: "#f1f5f9", text: "#475569" },
  };

  const renderItem = ({ item: pot }: { item: PotWithAddress }) => {
    const status = getPotStatus(pot);
    const style = statusStyles[status];

    return (
      <Link href={`/lottery/${pot.address.toBase58()}`} asChild>
        <TouchableOpacity style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>#{shortenAddress(pot.address, 6)}</Text>
            <View style={[styles.badge, { backgroundColor: style.bg }]}>
              <Text style={[styles.badgeText, { color: style.text }]}>
                {status}
              </Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Participants</Text>
              <Text style={styles.statValue}>
                {pot.totalParticipants.toString()}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>End Time</Text>
              <Text style={styles.statValue}>
                {new Date(pot.endTimestamp.toNumber() * 1000).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {(["all", "active", "ended"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === f && styles.filterButtonTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredPots}
        renderItem={renderItem}
        keyExtractor={(item) => item.address.toBase58()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading ? "Loading..." : "No lotteries found"}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  filters: {
    flexDirection: "row",
    padding: 16,
    gap: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  filterButtonActive: {
    backgroundColor: "#6366f1",
  },
  filterButtonText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },
  filterButtonTextActive: {
    color: "#ffffff",
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardBody: {
    flexDirection: "row",
    gap: 24,
  },
  stat: {},
  statLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    padding: 24,
  },
});
