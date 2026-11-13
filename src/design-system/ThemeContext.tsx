import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { THEMES, type DSTheme, type ThemeId } from './themes';

interface DSThemeContextValue {
  theme: DSTheme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  toggleTheme: () => void;
}

const DSThemeContext = createContext<DSThemeContextValue>({
  theme: THEMES['apple-hig'],
  themeId: 'apple-hig',
  setThemeId: () => {},
  toggleTheme: () => {},
});

export function DSThemeProvider({
  initialTheme = 'apple-hig',
  children,
}: {
  initialTheme?: ThemeId;
  children: ReactNode;
}) {
  const [themeId, setThemeId] = useState<ThemeId>(initialTheme);

  const value = useMemo<DSThemeContextValue>(
    () => ({
      theme: THEMES[themeId],
      themeId,
      setThemeId,
      toggleTheme: () =>
        setThemeId((prev) => (prev === 'apple-hig' ? 'dark' : 'apple-hig')),
    }),
    [themeId]
  );

  return (
    <DSThemeContext.Provider value={value}>{children}</DSThemeContext.Provider>
  );
}

export function useDSTheme(): DSThemeContextValue {
  return useContext(DSThemeContext);
}

export function ThemeToggleButton() {
  const { theme, themeId, toggleTheme } = useDSTheme();
  const isDark = themeId === 'dark';

  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityLabel={`Switch to ${isDark ? 'Editorial' : 'Charcoal'} theme`}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs + 2,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radii.pill,
          backgroundColor: 'transparent',
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: theme.radii.pill,
          backgroundColor: isDark ? theme.colors.accent : theme.colors.textPrimary,
        }}
      />
      <Text
        style={{
          ...theme.typography.caption,
          fontFamily: theme.fontFamilies.sans,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        }}
      >
        {isDark ? 'Charcoal' : 'Daylight'}
      </Text>
    </Pressable>
  );
}
