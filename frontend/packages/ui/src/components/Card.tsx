import React from "react";
import { View, StyleSheet, ViewProps, ViewStyle } from "react-native";

export interface CardProps extends ViewProps {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "elevated" | "outlined";
}

export function Card({
  children,
  padding = "md",
  variant = "default",
  style,
  ...props
}: CardProps) {
  const getPadding = (): number => {
    switch (padding) {
      case "none":
        return 0;
      case "sm":
        return 12;
      case "lg":
        return 24;
      default:
        return 16;
    }
  };

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case "elevated":
        return {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        };
      case "outlined":
        return {
          borderWidth: 1,
          borderColor: "#e2e8f0",
        };
      default:
        return {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
        };
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: getPadding(),
    ...getVariantStyles(),
  };

  return (
    <View style={[cardStyle, style as ViewStyle]} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({
  children,
  style,
  ...props
}: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      style={[{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingBottom: 12 }, style as ViewStyle]}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardBody({
  children,
  style,
  ...props
}: ViewProps & { children: React.ReactNode }) {
  return (
    <View style={[{ flex: 1 }, style as ViewStyle]} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({
  children,
  style,
  ...props
}: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      style={[{ marginTop: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 12 }, style as ViewStyle]}
      {...props}
    >
      {children}
    </View>
  );
}
