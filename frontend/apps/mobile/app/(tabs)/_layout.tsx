import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
        },
        headerStyle: {
          backgroundColor: "#1e1b4b",
        },
        headerTintColor: "#fff",
        headerTitleStyle: {
          fontWeight: "bold",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} />,
          headerTitle: "Open Lotto",
        }}
      />
      <Tabs.Screen
        name="lottery"
        options={{
          title: "Lotteries",
          tabBarIcon: ({ color }) => <TabIcon icon="🎰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "My Tickets",
          tabBarIcon: ({ color }) => <TabIcon icon="🎫" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color }) => <TabIcon icon="👛" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20 }}>{icon}</Text>;
}
