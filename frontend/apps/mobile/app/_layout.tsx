import { Slot, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionProvider } from "@/providers/ConnectionProvider";
import { WalletProvider } from "@/providers/WalletProvider";

// Polyfills for Solana
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <WalletProvider>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: "#1e1b4b",
              },
              headerTintColor: "#fff",
              headerTitleStyle: {
                fontWeight: "bold",
              },
            }}
          >
            <Stack.Screen
              name="(tabs)"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="lottery/[address]"
              options={{
                title: "Lottery Details",
                presentation: "card",
              }}
            />
          </Stack>
          <StatusBar style="light" />
        </WalletProvider>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
