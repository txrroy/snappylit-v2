import { TextInput, type TextInputProps } from 'react-native';
import { useDSTheme } from '../ThemeContext';

export interface DSInputProps extends TextInputProps {
  compact?: boolean;
}

export function DSInput({ compact = false, style, ...rest }: DSInputProps) {
  const { theme } = useDSTheme();

  return (
    <TextInput
      placeholderTextColor={theme.colors.textTertiary}
      style={[
        theme.typography.body,
        {
          fontFamily: theme.fontFamilies.sans,
          color: theme.colors.textPrimary,
          backgroundColor: theme.colors.surfaceHeader,
          borderWidth: theme.layout.borderWidth,
          borderColor: theme.colors.borderDefault,
          borderRadius: theme.radii.sm,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: compact ? theme.spacing.xs + 3 : theme.spacing.sm + 3,
        },
        style,
      ]}
      {...rest}
    />
  );
}

