import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useConnection } from "@/providers/ConnectionProvider";
import { useWallet } from "@/providers/WalletProvider";
import { OpenLottoClient, TicketWithAddress } from "@open-lotto/sdk";
import { shortenAddress } from "@open-lotto/utils";

export default function TicketsScreen() {
  const { connection } = useConnection();
  const { publicKey, connected, connect, connecting } = useWallet();
  const [tickets, setTickets] = useState<TicketWithAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickets = async () => {
    if (!publicKey) return;

    try {
      const client = new OpenLottoClient({ connection, network: "devnet" });
      const userTickets = await client.getUserTickets(publicKey);
      setTickets(userTickets);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchTickets();
    } else {
      setLoading(false);
    }
  }, [connection, publicKey, connected]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  if (!connected) {
    return (
      <View style={styles.centered}>
        <Text style={styles.icon}>🎫</Text>
        <Text style={styles.title}>My Tickets</Text>
        <Text style={styles.subtitle}>
          Connect your wallet to view your tickets
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
      </View>
    );
  }

  const renderItem = ({ item: ticket }: { item: TicketWithAddress }) => (
    <View style={styles.ticketCard}>
      <View style={styles.ticketVisual}>
        <Text style={styles.ticketNumber}>#{ticket.index.toString()}</Text>
      </View>
      <View style={styles.ticketDetails}>
        <Text style={styles.ticketId}>{shortenAddress(ticket.address)}</Text>
        <Text style={styles.ticketOwner}>
          Owner: {shortenAddress(ticket.participant)}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tickets}
        renderItem={renderItem}
        keyExtractor={(item) => item.address.toBase58()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyTitle}>No Tickets Yet</Text>
            <Text style={styles.emptyText}>
              Enter a lottery to get your first ticket!
            </Text>
          </View>
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
  list: {
    padding: 16,
  },
  ticketCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ticketVisual: {
    width: 60,
    height: 80,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  ticketNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e293b",
  },
  ticketDetails: {
    flex: 1,
  },
  ticketId: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
  },
  ticketOwner: {
    fontSize: 14,
    color: "#64748b",
  },
  emptyState: {
    alignItems: "center",
    padding: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
});
