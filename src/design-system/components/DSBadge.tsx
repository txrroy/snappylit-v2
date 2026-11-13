import { Pressable, View, type ViewStyle } from 'react-native';
import { useDSTheme } from '../ThemeContext';
import type { DSColors } from '../themes';
import { DSText } from './DSText';

export type DSTone = keyof DSColors['tones'];

export interface DSBadgeProps {
  label: string;
  tone?: DSTone;
  dot?: boolean;
  bordered?: boolean;
  style?: ViewStyle;
}

export function DSBadge({
  label,
  tone = 'neutral',
  dot = false,
  bordered = false,
  style,
}: DSBadgeProps) {
  const { theme } = useDSTheme();
  const t = theme.colors.tones[tone];

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs + 1,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xxs + 1,
          borderRadius: theme.radii.xs,
          backgroundColor: t.bg,
          borderWidth: bordered ? theme.layout.borderWidth : 0,
          borderColor: bordered ? t.border : 'transparent',
        },
        style,
      ]}
    >
      {dot ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: theme.radii.pill,
            backgroundColor: t.dot,
          }}
        />
      ) : null}
      <DSText
        variant="micro"
        weight="semibold"
        tabularNums
        style={{ color: t.text, letterSpacing: 0.2 }}
      >
        {label}
      </DSText>
    </View>
  );
}

export interface DSChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

export function DSChip({ label, active = false, onPress }: DSChipProps) {
  const { theme } = useDSTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs + 2,
          borderRadius: theme.radii.pill,
          backgroundColor: active
            ? theme.colors.textPrimary
            : theme.colors.surfaceMuted,
          borderWidth: theme.layout.borderWidth,
          borderColor: active
            ? theme.colors.textPrimary
            : theme.colors.borderSubtle,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <DSText
        variant="caption"
        weight="semibold"
        tone={active ? 'inverse' : 'secondary'}
      >
        {label}
      </DSText>
    </Pressable>
  );
}
