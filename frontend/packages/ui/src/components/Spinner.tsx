import React from "react";
import { View, ActivityIndicator, Text, StyleSheet, ViewStyle } from "react-native";

export interface SpinnerProps {
  size?: "small" | "large";
  color?: string;
  label?: string;
  fullScreen?: boolean;
}

export function Spinner({
  size = "large",
  color = "#6366f1",
  label,
  fullScreen = false,
}: SpinnerProps) {
  const containerStyle: ViewStyle = fullScreen
    ? styles.fullScreen
    : styles.inline;

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color} />
      {label && <Text style={[styles.label, { color }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  fullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  label: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "500",
  },
});
