import { Tabs } from 'expo-router';
import { TouchableOpacity, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Calendar, Clock, History, User, CalendarOff } from 'lucide-react-native';

const TAB_COLOR = '#0066FF';
const INACTIVE = '#9ca3af';

function TabBarIcon({ icon: Icon, focused }: { icon: any; focused: boolean }) {
  return <Icon size={22} color={focused ? TAB_COLOR : INACTIVE} strokeWidth={focused ? 2.5 : 1.8} />;
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  const tabs = [
    { name: 'home', label: 'Home', Icon: Home },
    { name: 'calendar', label: 'Calendar', Icon: Calendar },
    { name: 'timeinout', label: '', Icon: Clock },
    { name: 'leave', label: 'Leave', Icon: CalendarOff },
    { name: 'profile', label: 'Profile', Icon: User },
  ];

  return (
    <View
      style={{ paddingBottom: insets.bottom }}
      className="bg-white border-t border-gray-100 flex-row items-center"
    >
      {tabs.map((tab, index) => {
        const route = state.routes.find((r: any) => r.name === tab.name);
        const focused = state.index === state.routes.indexOf(route);

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route?.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(tab.name);
          }
        };

        // Center time in/out button
        if (tab.name === 'timeinout') {
          return (
            <TouchableOpacity key={tab.name} onPress={onPress} className="flex-1 items-center -mt-5">
              <View className="w-14 h-14 rounded-full bg-[#0066FF] items-center justify-center shadow-lg"
                style={{ elevation: 6, shadowColor: '#28a0f7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6 }}>
                <Clock size={26} color="white" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={tab.name} onPress={onPress} className="flex-1 items-center py-3 gap-1">
            <TabBarIcon icon={tab.Icon} focused={focused} />
            <Text style={{ color: focused ? TAB_COLOR : INACTIVE }} className="text-xs">
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="timeinout" />
      <Tabs.Screen name="leave" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
