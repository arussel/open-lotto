import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from "react-native";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const COLORS = {
  primary: "#6366f1",
  primaryHover: "#4f46e5",
  secondary: "#64748b",
  danger: "#ef4444",
  white: "#ffffff",
  transparent: "transparent",
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...props
}: ButtonProps) {
  const getBackgroundColor = (): string => {
    if (disabled) return "#9ca3af";
    switch (variant) {
      case "primary":
        return COLORS.primary;
      case "secondary":
        return COLORS.secondary;
      case "danger":
        return COLORS.danger;
      case "outline":
        return COLORS.transparent;
      default:
        return COLORS.primary;
    }
  };

  const getTextColor = (): string => {
    if (variant === "outline") {
      return disabled ? "#9ca3af" : COLORS.primary;
    }
    return COLORS.white;
  };

  const getPadding = (): { paddingVertical: number; paddingHorizontal: number } => {
    switch (size) {
      case "sm":
        return { paddingVertical: 8, paddingHorizontal: 12 };
      case "lg":
        return { paddingVertical: 16, paddingHorizontal: 24 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 16 };
    }
  };

  const getFontSize = (): number => {
    switch (size) {
      case "sm":
        return 14;
      case "lg":
        return 18;
      default:
        return 16;
    }
  };

  const buttonStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderWidth: variant === "outline" ? 2 : 0,
    borderColor: disabled ? "#9ca3af" : COLORS.primary,
    opacity: disabled || loading ? 0.7 : 1,
    ...getPadding(),
    ...(fullWidth ? { width: "100%" } : {}),
  };

  const textStyle: TextStyle = {
    color: getTextColor(),
    fontSize: getFontSize(),
    fontWeight: "600",
  };

  return (
    <TouchableOpacity
      style={[buttonStyle, style as ViewStyle]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading && (
        <ActivityIndicator
          color={getTextColor()}
          size="small"
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={textStyle}>{title}</Text>
    </TouchableOpacity>
  );
}
