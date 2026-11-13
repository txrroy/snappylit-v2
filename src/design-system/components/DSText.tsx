import { Text, type TextProps, type TextStyle } from 'react-native';
import { useDSTheme } from '../ThemeContext';
import type { DSTypographyKey } from '../tokens';

export type DSTextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'inverse'
  | 'ink';

export type DSTextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface DSTextProps extends TextProps {
  variant?: DSTypographyKey;
  tone?: DSTextTone;
  weight?: DSTextWeight;
  serif?: boolean;
  mono?: boolean;
  tabularNums?: boolean;
  uppercase?: boolean;
  center?: boolean;
}

const WEIGHT_MAP: Record<DSTextWeight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export function DSText({
  variant = 'body',
  tone = 'primary',
  weight = 'regular',
  serif = false,
  mono = false,
  tabularNums = false,
  uppercase = false,
  center = false,
  style,
  children,
  ...rest
}: DSTextProps) {
  const { theme } = useDSTheme();

  const colorMap: Record<DSTextTone, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    accent: theme.colors.accentText,
    success: theme.colors.tones.success.text,
    warning: theme.colors.tones.warning.text,
    danger: theme.colors.tones.danger.text,
    inverse: theme.colors.textInverse,
    ink: theme.colors.inkText,
  };

  return (
    <Text
      style={[
        theme.typography[variant],
        {
          color: colorMap[tone],
          fontWeight: WEIGHT_MAP[weight],
          fontFamily: mono
            ? theme.fontFamilies.mono
            : serif
              ? theme.fontFamilies.serif
              : theme.fontFamilies.sans,
          fontVariant: tabularNums ? ['tabular-nums'] : undefined,
          textTransform: uppercase ? 'uppercase' : 'none',
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
