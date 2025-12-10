import React from "react";
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ViewStyle,
} from "react-native";

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  size = "md",
  closeOnBackdrop = true,
}: ModalProps) {
  const getWidth = (): ViewStyle["width"] => {
    switch (size) {
      case "sm":
        return 300;
      case "lg":
        return 600;
      default:
        return 450;
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback
        onPress={closeOnBackdrop ? onClose : undefined}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.content, { width: getWidth(), maxWidth: "90%" }]}>
              {title && (
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.body}>{children}</View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 24,
    color: "#64748b",
    lineHeight: 24,
  },
  body: {
    padding: 20,
  },
});
