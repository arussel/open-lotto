import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import BN from "bn.js";
import { getPotStatus, PotStatus, Pot } from "@open-lotto/types";
import { formatTokenAmount, shortenAddress } from "@open-lotto/utils";
import { Card, CardHeader, CardBody, CardFooter } from "./Card";
import { Badge, BadgeVariant } from "./Badge";
import { CountdownTimer } from "./CountdownTimer";
import { Button } from "./Button";
import { PublicKey } from "@solana/web3.js";

export interface PotCardProps {
  pot: Pot;
  address: PublicKey;
  prizePool?: BN;
  tokenSymbol?: string;
  tokenDecimals?: number;
  onEnter?: () => void;
  onView?: () => void;
  loading?: boolean;
  userHasTicket?: boolean;
}

const STATUS_BADGE: Record<PotStatus, { label: string; variant: BadgeVariant }> = {
  [PotStatus.Active]: { label: "Active", variant: "success" },
  [PotStatus.Drawing]: { label: "Drawing", variant: "warning" },
  [PotStatus.Settled]: { label: "Settled", variant: "info" },
  [PotStatus.Closed]: { label: "Closed", variant: "default" },
};

export function PotCard({
  pot,
  address,
  prizePool,
  tokenSymbol = "TOKEN",
  tokenDecimals = 9,
  onEnter,
  onView,
  loading = false,
  userHasTicket = false,
}: PotCardProps) {
  const status = getPotStatus(pot);
  const statusBadge = STATUS_BADGE[status];
  const isActive = status === PotStatus.Active;

  return (
    <Card variant="elevated">
      <CardHeader>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Lottery #{address.toBase58().slice(0, 8)}</Text>
            <Text style={styles.subtitle}>{pot.totalParticipants.toString()} participants</Text>
          </View>
          <Badge label={statusBadge.label} variant={statusBadge.variant} />
        </View>
      </CardHeader>

      <CardBody>
        {prizePool && (
          <View style={styles.prizeSection}>
            <Text style={styles.prizeLabel}>Prize Pool</Text>
            <Text style={styles.prizeValue}>
              {formatTokenAmount(prizePool, tokenDecimals)} {tokenSymbol}
            </Text>
          </View>
        )}

        <View style={styles.timerSection}>
          {isActive ? (
            <>
              <Text style={styles.timerLabel}>Ends in</Text>
              <CountdownTimer endTimestamp={pot.endTimestamp} size="sm" />
            </>
          ) : status === PotStatus.Settled ? (
            <View style={styles.winnerSection}>
              <Text style={styles.winnerLabel}>Winner Ticket</Text>
              <Text style={styles.winnerValue}>#{pot.winningSlot.toString()}</Text>
            </View>
          ) : (
            <Text style={styles.statusText}>
              {status === PotStatus.Drawing
                ? "Waiting for randomness..."
                : "Lottery has ended"}
            </Text>
          )}
        </View>

        {userHasTicket && (
          <View style={styles.ticketBadge}>
            <Text style={styles.ticketBadgeText}>You have a ticket</Text>
          </View>
        )}
      </CardBody>

      <CardFooter>
        <View style={styles.actions}>
          {onView && (
            <Button
              title="View"
              variant="outline"
              size="sm"
              onPress={onView}
              style={styles.actionButton}
            />
          )}
          {isActive && onEnter && (
            <Button
              title={userHasTicket ? "Buy Another" : "Enter Now"}
              variant="primary"
              size="sm"
              onPress={onEnter}
              loading={loading}
              style={styles.actionButton}
            />
          )}
        </View>
      </CardFooter>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  prizeSection: {
    marginBottom: 16,
  },
  prizeLabel: {
    fontSize: 12,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  prizeValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6366f1",
  },
  timerSection: {
    alignItems: "center",
    marginVertical: 8,
  },
  timerLabel: {
    fontSize: 12,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  winnerSection: {
    alignItems: "center",
  },
  winnerLabel: {
    fontSize: 12,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  winnerValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#10b981",
  },
  statusText: {
    fontSize: 14,
    color: "#64748b",
    fontStyle: "italic",
  },
  ticketBadge: {
    backgroundColor: "#dbeafe",
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
    alignItems: "center",
  },
  ticketBadgeText: {
    color: "#1e40af",
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    minWidth: 100,
  },
});
