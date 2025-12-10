import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Ticket } from "@open-lotto/types";
import { shortenAddress } from "@open-lotto/utils";
import { Card, CardBody } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";

export interface TicketCardProps {
  ticket: Ticket;
  address: PublicKey;
  potAddress: PublicKey;
  isWinner?: boolean;
  canClaim?: boolean;
  onClaim?: () => void;
  onView?: () => void;
  loading?: boolean;
}

export function TicketCard({
  ticket,
  address,
  potAddress,
  isWinner = false,
  canClaim = false,
  onClaim,
  onView,
  loading = false,
}: TicketCardProps) {
  return (
    <Card variant={isWinner ? "elevated" : "outlined"}>
      <CardBody>
        <View style={styles.container}>
          <View style={styles.ticketVisual}>
            <View style={[styles.ticketShape, isWinner && styles.winnerShape]}>
              <Text style={styles.ticketNumber}>#{ticket.index.toString()}</Text>
            </View>
          </View>

          <View style={styles.details}>
            <View style={styles.row}>
              <Text style={styles.label}>Ticket ID</Text>
              <Text style={styles.value}>{shortenAddress(address)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Pot</Text>
              <Text style={styles.value}>{shortenAddress(potAddress)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Owner</Text>
              <Text style={styles.value}>{shortenAddress(ticket.participant)}</Text>
            </View>
          </View>

          <View style={styles.statusSection}>
            {isWinner ? (
              <Badge label="Winner" variant="success" />
            ) : (
              <Badge label="Entered" variant="default" />
            )}
          </View>
        </View>

        {(isWinner && canClaim && onClaim) && (
          <View style={styles.actions}>
            <Button
              title="Claim Prize"
              variant="primary"
              onPress={onClaim}
              loading={loading}
              fullWidth
            />
          </View>
        )}

        {onView && !isWinner && (
          <View style={styles.actions}>
            <Button
              title="View Details"
              variant="outline"
              size="sm"
              onPress={onView}
            />
          </View>
        )}
      </CardBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  ticketVisual: {
    marginRight: 16,
  },
  ticketShape: {
    width: 60,
    height: 80,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  winnerShape: {
    backgroundColor: "#dcfce7",
    borderColor: "#10b981",
    borderStyle: "solid",
  },
  ticketNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  details: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: "#64748b",
  },
  value: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    fontFamily: "monospace",
  },
  statusSection: {
    marginLeft: 12,
  },
  actions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
});
