import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

import '../global.css';
import { SplashOverlay } from '@/components/splash-overlay';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300 });

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

function RootNavigator() {
  const { session, loading } = useSession();
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    if (loading) {
      return;
    }

    SplashScreen.hide();

    const timer = setTimeout(() => {
      setOverlayVisible(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleOverlayHidden = useCallback(() => {
    setOverlayMounted(false);
  }, []);

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>

      {overlayMounted && (
        <SplashOverlay
          visible={overlayVisible}
          onHidden={handleOverlayHidden}
        />
      )}
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
