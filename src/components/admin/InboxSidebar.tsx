import { View, Pressable, ScrollView } from 'react-native';
import { useDSTheme, DSText } from '@/design-system';

export type InboxFolder =
  | { type: 'all-pending' }
  | { type: 'all-published' }
  | { type: 'today-published' }
  | { type: 'today-pending' }
  | { type: 'older-date'; date: string };

export interface OlderDateEntry {
  date: string;
  count: number;
}

interface InboxSidebarProps {
  allPendingCount: number;
  allPublishedCount: number;
  todayPublishedCount: number;
  todayPendingCount: number;
  olderDates: OlderDateEntry[];
  selectedFolder: InboxFolder;
  onSelectFolder: (folder: InboxFolder) => void;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatEditionDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const month = MONTH_NAMES[monthIdx];
  if (!month || Number.isNaN(day)) return dateStr;
  return `${month} ${day}, ${year}`;
}

function isSameFolder(a: InboxFolder, b: InboxFolder): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'older-date' && b.type === 'older-date') {
    return a.date === b.date;
  }
  return true;
}

interface SidebarItemProps {
  label: string;
  count: number;
  active: boolean;
  dotColor?: string;
  onPress: () => void;
}

function SidebarItem({
  label,
  count,
  active,
  dotColor,
  onPress,
}: SidebarItemProps) {
  const { theme } = useDSTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          marginHorizontal: theme.spacing.sm,
          marginBottom: theme.spacing.xxs,
          borderRadius: theme.radii.sm,
          backgroundColor: active
            ? theme.colors.textPrimary
            : pressed
              ? theme.colors.surfaceHover
              : 'transparent',
        },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flex: 1,
          minWidth: 0,
        }}
      >
        {dotColor ? (
          <View
            style={{
              width: theme.spacing.sm,
              height: theme.spacing.sm,
              borderRadius: theme.radii.pill,
              backgroundColor: active ? theme.colors.textInverse : dotColor,
            }}
          />
        ) : null}
        <DSText
          variant="footnote"
          weight={active ? 'semibold' : 'medium'}
          tone={active ? 'inverse' : 'primary'}
          numberOfLines={1}
        >
          {label}
        </DSText>
      </View>

      <DSText
        variant="caption"
        weight={active ? 'bold' : 'medium'}
        tone={active ? 'inverse' : 'tertiary'}
        tabularNums
        style={{ marginLeft: theme.spacing.sm }}
      >
        {count}
      </DSText>
    </Pressable>
  );
}

export function InboxSidebar({
  allPendingCount,
  allPublishedCount,
  todayPublishedCount,
  todayPendingCount,
  olderDates,
  selectedFolder,
  onSelectFolder,
}: InboxSidebarProps) {
  const { theme } = useDSTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceHeader,
        borderColor: theme.colors.borderSubtle,
      }}
      className="w-full md:w-[220px] md:shrink-0 border-b md:border-b-0 md:border-r"
    >
      <ScrollView
        style={{ paddingVertical: theme.spacing.md }}
        className="max-h-56 md:max-h-none md:flex-1"
      >
        {/* Heading 0: All Editions */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <DSText
            variant="micro"
            weight="bold"
            tone="tertiary"
            uppercase
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.xs,
            }}
          >
            All Editions
          </DSText>
          <SidebarItem
            label="All Pending"
            count={allPendingCount}
            dotColor={theme.colors.tones.warning.dot}
            active={isSameFolder(selectedFolder, { type: 'all-pending' })}
            onPress={() => onSelectFolder({ type: 'all-pending' })}
          />
          <SidebarItem
            label="All Published"
            count={allPublishedCount}
            dotColor={theme.colors.tones.success.dot}
            active={isSameFolder(selectedFolder, { type: 'all-published' })}
            onPress={() => onSelectFolder({ type: 'all-published' })}
          />
        </View>

        {/* Heading 1: Today */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <DSText
            variant="micro"
            weight="bold"
            tone="tertiary"
            uppercase
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.xs,
            }}
          >
            Today
          </DSText>
          <SidebarItem
            label="Published"
            count={todayPublishedCount}
            dotColor={theme.colors.tones.success.dot}
            active={isSameFolder(selectedFolder, { type: 'today-published' })}
            onPress={() => onSelectFolder({ type: 'today-published' })}
          />
          <SidebarItem
            label="Pending"
            count={todayPendingCount}
            dotColor={theme.colors.tones.warning.dot}
            active={isSameFolder(selectedFolder, { type: 'today-pending' })}
            onPress={() => onSelectFolder({ type: 'today-pending' })}
          />
        </View>

        {/* Heading 2: Older */}
        <View>
          <DSText
            variant="micro"
            weight="bold"
            tone="tertiary"
            uppercase
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.xs,
            }}
          >
            Older
          </DSText>
          {olderDates.length === 0 ? (
            <DSText
              variant="caption"
              tone="tertiary"
              style={{
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.xs,
              }}
            >
              No older dates
            </DSText>
          ) : (
            olderDates.map((entry) => (
              <SidebarItem
                key={entry.date}
                label={formatEditionDate(entry.date)}
                count={entry.count}
                active={isSameFolder(selectedFolder, {
                  type: 'older-date',
                  date: entry.date,
                })}
                onPress={() =>
                  onSelectFolder({ type: 'older-date', date: entry.date })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
