import { useState } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import {
  useDSTheme,
  DSCard,
  DSText,
  DSInput,
  DSButton,
  DSDivider,
} from '@/design-system';
import type { RssSourceConfig } from '@/types/article';

interface SourcesPaneProps {
  sources: RssSourceConfig[];
  userEmail: string;
  onToggleSource: (name: string, userEmail: string) => Promise<void>;
  onAddSource: (name: string, url: string, userEmail: string) => Promise<void>;
  onRemoveSource: (name: string, userEmail: string) => Promise<void>;
  onResetDefaults: (userEmail: string) => Promise<void>;
}

export function SourcesPane({
  sources,
  userEmail,
  onToggleSource,
  onAddSource,
  onRemoveSource,
  onResetDefaults,
}: SourcesPaneProps) {
  const { theme } = useDSTheme();
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const enabledCount = sources.filter((s) => s.enabled).length;

  const handleAdd = async () => {
    setError(null);
    try {
      await onAddSource(newName, newUrl, userEmail);
      setNewName('');
      setNewUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add source');
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{
        padding: theme.spacing.xxl,
        paddingBottom: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          maxWidth: theme.layout.contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: theme.spacing.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View>
            <DSText variant="title3" weight="bold" tone="primary">
              Source Management
            </DSText>
            <DSText
              variant="caption"
              tone="secondary"
              style={{ marginTop: theme.spacing.xxs }}
            >
              {enabledCount} of {sources.length} RSS feeds enabled · Changes apply
              on the next agent run.
            </DSText>
          </View>
          <DSButton
            label="Reset to Defaults"
            variant="secondary"
            size="sm"
            pill
            onPress={() => onResetDefaults(userEmail)}
          />
        </View>

        {/* Add Custom Source */}
        <DSCard headerTitle="Add RSS Feed" padding="lg">
          <View
            style={{ gap: theme.spacing.sm }}
            className="flex-col md:flex-row"
          >
            <DSInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Source name (e.g. PBS NewsHour)"
              compact
              className="md:w-56"
            />
            <DSInput
              value={newUrl}
              onChangeText={setNewUrl}
              placeholder="https://example.com/rss.xml"
              autoCapitalize="none"
              compact
              style={{ flex: 1 }}
            />
            <DSButton
              label="Add Feed"
              variant="primary"
              size="md"
              onPress={handleAdd}
            />
          </View>
          {error ? (
            <DSText
              variant="caption"
              tone="danger"
              weight="medium"
              style={{ marginTop: theme.spacing.sm }}
            >
              {error}
            </DSText>
          ) : null}
        </DSCard>

        {/* Source List */}
        <DSCard
          headerTitle="Configured Feeds"
          headerSubtitle={`${enabledCount} active`}
          padding="xs"
        >
          {sources.map((source, idx) => (
            <View key={source.name}>
              <View
                style={{
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        width: theme.spacing.sm,
                        height: theme.spacing.sm,
                        borderRadius: theme.radii.pill,
                        backgroundColor: source.enabled
                          ? theme.colors.tones.success.dot
                          : theme.colors.tones.neutral.dot,
                      }}
                    />
                    <DSText variant="body" weight="semibold" tone="primary">
                      {source.name}
                    </DSText>
                  </View>
                  <DSText
                    variant="caption"
                    tone="tertiary"
                    numberOfLines={1}
                    style={{
                      marginTop: theme.spacing.xxs,
                      paddingLeft: theme.spacing.lg,
                    }}
                  >
                    {source.url}
                  </DSText>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                  }}
                >
                  <Switch
                    value={source.enabled}
                    onValueChange={() => onToggleSource(source.name, userEmail)}
                    trackColor={{
                      false: theme.colors.borderDefault,
                      true: theme.colors.accent,
                    }}
                  />
                  <DSButton
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    onPress={() => onRemoveSource(source.name, userEmail)}
                  />
                </View>
              </View>
              {idx < sources.length - 1 ? <DSDivider /> : null}
            </View>
          ))}
        </DSCard>
      </View>
    </ScrollView>
  );
}
