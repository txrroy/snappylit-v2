import '../global.css';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const FONT_STYLESHEETS: Array<{ id: string; href: string }> = [
  {
    id: 'dm-sans-font',
    href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&display=swap',
  },
  {
    id: 'work-sans-font',
    href: 'https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,400..700;1,400..700&display=swap',
  },
  {
    id: 'cabinet-grotesk-font',
    href: 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,600,700&display=swap',
  },
];

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    for (const font of FONT_STYLESHEETS) {
      if (!document.getElementById(font.id)) {
        const link = document.createElement('link');
        link.id = font.id;
        link.rel = 'stylesheet';
        link.href = font.href;
        document.head.appendChild(link);
      }
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(consumer)" />
          <Stack.Screen name="(admin)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
