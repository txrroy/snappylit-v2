import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useDSTheme } from '../ThemeContext';
import { DSText, type DSTextTone } from './DSText';

export type DSButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'tinted'
  | 'ghost'
  | 'danger'
  | 'success';

export type DSButtonSize = 'sm' | 'md' | 'lg';

export interface DSButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: DSButtonVariant;
  size?: DSButtonSize;
  pill?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function DSButton({
  label,
  variant = 'primary',
  size = 'md',
  pill = false,
  loading = false,
  disabled = false,
  style,
  ...rest
}: DSButtonProps) {
  const { theme } = useDSTheme();
  const isDisabled = disabled || loading;

  const sizeMap: Record<
    DSButtonSize,
    { px: number; py: number; textVariant: 'caption' | 'footnote' | 'body' }
  > = {
    sm: { px: theme.spacing.md, py: theme.spacing.xs + 2, textVariant: 'caption' },
    md: { px: theme.spacing.lg, py: theme.spacing.sm + 2, textVariant: 'footnote' },
    lg: { px: theme.spacing.xl, py: theme.spacing.md, textVariant: 'subhead' as 'body' },
  };

  const variantStyles: Record<
    DSButtonVariant,
    { bg: string; border: string; textTone: DSTextTone; spinnerColor: string }
  > = {
    primary: {
      bg: theme.colors.textPrimary,
      border: theme.colors.textPrimary,
      textTone: 'inverse',
      spinnerColor: theme.colors.textInverse,
    },
    accent: {
      bg: theme.colors.accent,
      border: theme.colors.accent,
      textTone: 'ink',
      spinnerColor: theme.colors.inkText,
    },
    secondary: {
      bg: theme.colors.surface,
      border: theme.colors.borderDefault,
      textTone: 'primary',
      spinnerColor: theme.colors.textPrimary,
    },
    tinted: {
      bg: theme.colors.accentSoft,
      border: theme.colors.accentBorder,
      textTone: 'accent',
      spinnerColor: theme.colors.accent,
    },
    ghost: {
      bg: 'transparent',
      border: 'transparent',
      textTone: 'secondary',
      spinnerColor: theme.colors.textSecondary,
    },
    danger: {
      bg: theme.colors.tones.danger.bg,
      border: theme.colors.tones.danger.border,
      textTone: 'danger',
      spinnerColor: theme.colors.tones.danger.text,
    },
    success: {
      bg: theme.colors.tones.success.dot,
      border: theme.colors.tones.success.dot,
      textTone: 'ink',
      spinnerColor: theme.colors.inkText,
    },
  };

  const v = variantStyles[variant];
  const s = sizeMap[size];

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: s.px,
          paddingVertical: s.py,
          borderRadius: pill ? theme.radii.pill : theme.radii.sm,
          backgroundColor: v.bg,
          borderWidth: theme.layout.borderWidth,
          borderColor: v.border,
          opacity: isDisabled ? 0.42 : pressed ? 0.8 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.spinnerColor} />
      ) : (
        <DSText variant={s.textVariant} weight="semibold" tone={v.textTone}>
          {label}
        </DSText>
      )}
    </Pressable>
  );
}
