import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import BN from "bn.js";
import { useCountdown } from "../hooks/useCountdown";

export interface CountdownTimerProps {
  endTimestamp: BN | number;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
  onExpire?: () => void;
}

export function CountdownTimer({
  endTimestamp,
  size = "md",
  showLabels = true,
  onExpire,
}: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(endTimestamp);

  React.useEffect(() => {
    if (isExpired && onExpire) {
      onExpire();
    }
  }, [isExpired, onExpire]);

  const getFontSize = (): number => {
    switch (size) {
      case "sm":
        return 20;
      case "lg":
        return 36;
      default:
        return 28;
    }
  };

  const getLabelSize = (): number => {
    switch (size) {
      case "sm":
        return 10;
      case "lg":
        return 14;
      default:
        return 12;
    }
  };

  const getBoxSize = (): { width: number; height: number } => {
    switch (size) {
      case "sm":
        return { width: 40, height: 50 };
      case "lg":
        return { width: 80, height: 100 };
      default:
        return { width: 60, height: 70 };
    }
  };

  const boxSize = getBoxSize();

  const boxStyle: ViewStyle = {
    backgroundColor: "#1e1b4b",
    borderRadius: 8,
    width: boxSize.width,
    height: boxSize.height,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  };

  const numberStyle: TextStyle = {
    color: "#ffffff",
    fontSize: getFontSize(),
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  };

  const labelStyle: TextStyle = {
    color: "#94a3b8",
    fontSize: getLabelSize(),
    marginTop: 4,
    textTransform: "uppercase",
  };

  const separatorStyle: TextStyle = {
    color: "#6366f1",
    fontSize: getFontSize(),
    fontWeight: "bold",
    marginHorizontal: 2,
  };

  if (isExpired) {
    return (
      <View style={styles.container}>
        <Text style={[numberStyle, { color: "#ef4444" }]}>ENDED</Text>
      </View>
    );
  }

  const pad = (n: number): string => n.toString().padStart(2, "0");

  return (
    <View style={styles.container}>
      {days > 0 && (
        <>
          <View style={styles.unit}>
            <View style={boxStyle}>
              <Text style={numberStyle}>{pad(days)}</Text>
            </View>
            {showLabels && <Text style={labelStyle}>Days</Text>}
          </View>
          <Text style={separatorStyle}>:</Text>
        </>
      )}
      <View style={styles.unit}>
        <View style={boxStyle}>
          <Text style={numberStyle}>{pad(hours)}</Text>
        </View>
        {showLabels && <Text style={labelStyle}>Hrs</Text>}
      </View>
      <Text style={separatorStyle}>:</Text>
      <View style={styles.unit}>
        <View style={boxStyle}>
          <Text style={numberStyle}>{pad(minutes)}</Text>
        </View>
        {showLabels && <Text style={labelStyle}>Min</Text>}
      </View>
      <Text style={separatorStyle}>:</Text>
      <View style={styles.unit}>
        <View style={boxStyle}>
          <Text style={numberStyle}>{pad(seconds)}</Text>
        </View>
        {showLabels && <Text style={labelStyle}>Sec</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  unit: {
    alignItems: "center",
  },
});
