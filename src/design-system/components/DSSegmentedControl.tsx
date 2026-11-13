import { Pressable, View } from 'react-native';
import { useDSTheme } from '../ThemeContext';
import { DSText } from './DSText';

export interface DSSegmentOption<T extends string> {
  id: T;
  label: string;
}

export interface DSSegmentedControlProps<T extends string> {
  options: readonly DSSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function DSSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: DSSegmentedControlProps<T>) {
  const { theme } = useDSTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.radii.pill,
        padding: theme.spacing.xxs + 1,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.borderSubtle,
      }}
    >
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={({ pressed }) => [
              {
                paddingHorizontal: theme.spacing.md + 2,
                paddingVertical: theme.spacing.xs + 2,
                borderRadius: theme.radii.pill,
                backgroundColor: isActive
                  ? theme.colors.surfaceElevated
                  : 'transparent',
                opacity: pressed ? 0.75 : 1,
                ...(isActive ? theme.shadows.pill : {}),
              },
            ]}
          >
            <DSText
              variant="caption"
              weight={isActive ? 'semibold' : 'medium'}
              tone={isActive ? 'primary' : 'secondary'}
            >
              {opt.label}
            </DSText>
          </Pressable>
        );
      })}
    </View>
  );
}

