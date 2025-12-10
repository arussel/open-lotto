import React from "react";
import { View, Text, ViewStyle, TextStyle } from "react-native";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: "#e2e8f0", text: "#475569" },
  success: { bg: "#dcfce7", text: "#166534" },
  warning: { bg: "#fef3c7", text: "#92400e" },
  danger: { bg: "#fee2e2", text: "#991b1b" },
  info: { bg: "#dbeafe", text: "#1e40af" },
};

export function Badge({ label, variant = "default", size = "md" }: BadgeProps) {
  const colors = BADGE_COLORS[variant];

  const containerStyle: ViewStyle = {
    backgroundColor: colors.bg,
    borderRadius: 9999,
    paddingHorizontal: size === "sm" ? 8 : 12,
    paddingVertical: size === "sm" ? 2 : 4,
    alignSelf: "flex-start",
  };

  const textStyle: TextStyle = {
    color: colors.text,
    fontSize: size === "sm" ? 10 : 12,
    fontWeight: "600",
    textTransform: "uppercase",
  };

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}
