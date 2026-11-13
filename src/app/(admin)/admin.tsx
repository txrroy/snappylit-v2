import { AdminLoginScreen } from '@/components/admin/AdminLoginScreen';
import { AnalyticsPane } from '@/components/admin/AnalyticsPane';
import {
  ArticleInboxList,
  INITIAL_FILTERS,
  applyArticleFilters,
  type ArticleFilterState,
} from '@/components/admin/ArticleInboxList';
import { ArticleReaderDrawer } from '@/components/admin/ArticleReaderDrawer';
import { EditorOverviewPane } from '@/components/admin/EditorOverviewPane';
import {
  InboxSidebar,
  formatEditionDate,
  type InboxFolder,
  type OlderDateEntry,
} from '@/components/admin/InboxSidebar';
import { LivePipelineDrawer } from '@/components/admin/LivePipelineDrawer';
import { PolicyGovernancePane } from '@/components/admin/PolicyGovernancePane';
import { SourcesPane } from '@/components/admin/SourcesPane';
import {
  DSButton,
  DSSegmentedControl,
  DSText,
  DSThemeProvider,
  useDSTheme,
} from '@/design-system';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminArticles } from '@/hooks/useArticles';
import { useAgentPolicy, useSourcesConfig } from '@/hooks/useGovernance';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DashboardView = 'overview' | 'inbox' | 'settings';
type SettingsSubTab = 'policy' | 'sources' | 'analytics';

const MAIN_TABS: readonly { id: DashboardView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'inbox', label: 'Approval Inbox' },
];

const SETTINGS_TABS: readonly { id: SettingsSubTab; label: string }[] = [
  { id: 'policy', label: 'Rules & Policies' },
  { id: 'sources', label: 'RSS Sources' },
  { id: 'analytics', label: 'Version Analytics' },
];

function AdminDashboardContent() {
  const { theme } = useDSTheme();
  const {
    user,
    loading: authLoading,
    isAuthorized,
    isAdmin,
    authError,
    signIn,
    signUp,
    logOut,
    getIdToken,
  } = useAdminAuth();

  const {
    articles,
    loading: articlesLoading,
    error: articlesError,
    saveChanges,
    approveArticle,
    batchApproveArticles,
    rejectArticle,
    revertToDraft,
    confirmKidsTopic,
  } = useAdminArticles(isAuthorized);

  const {
    activePolicy,
    versions,
    savePolicyVersion,
    rollbackToVersion,
    testPolicy,
  } = useAgentPolicy(isAuthorized);

  const {
    sources,
    toggleSource,
    addSource,
    removeSource,
    resetDefaults,
  } = useSourcesConfig(isAuthorized);

  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>('policy');
  const [livePipelineOpen, setLivePipelineOpen] = useState(false);

  const [selectedFolder, setSelectedFolder] = useState<InboxFolder>({
    type: 'today-pending',
  });
  const [filters, setFilters] = useState<ArticleFilterState>(INITIAL_FILTERS);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null
  );

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const { todayPublished, todayPending, olderDates } = useMemo(() => {
    const pub = [];
    const pend = [];
    const olderMap = new Map<string, number>();

    for (const article of articles) {
      if (article.date === today) {
        if (article.status === 'published') pub.push(article);
        else if (article.status === 'draft') pend.push(article);
      } else {
        olderMap.set(article.date, (olderMap.get(article.date) ?? 0) + 1);
      }
    }

    const dates: OlderDateEntry[] = Array.from(olderMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, count]) => ({ date, count }));

    return {
      todayPublished: pub,
      todayPending: pend,
      olderDates: dates,
    };
  }, [articles, today]);

  const folderArticles = useMemo(() => {
    if (selectedFolder.type === 'today-published') return todayPublished;
    if (selectedFolder.type === 'today-pending') return todayPending;
    return articles.filter((a) => a.date === selectedFolder.date);
  }, [articles, selectedFolder, todayPublished, todayPending]);

  const filteredArticles = useMemo(
    () => applyArticleFilters(folderArticles, filters),
    [folderArticles, filters]
  );

  const folderTitle = useMemo(() => {
    if (selectedFolder.type === 'today-published') return 'Today · Published';
    if (selectedFolder.type === 'today-pending') return 'Today · Pending';
    return formatEditionDate(selectedFolder.date);
  }, [selectedFolder]);

  const handleSelectFolder = useCallback((folder: InboxFolder) => {
    setSelectedFolder(folder);
    setFilters(INITIAL_FILTERS);
    setSelectedArticleId(null);
  }, []);

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) ?? null,
    [articles, selectedArticleId]
  );

  const selectedIndex = useMemo(
    () => filteredArticles.findIndex((a) => a.id === selectedArticleId),
    [filteredArticles, selectedArticleId]
  );

  const hasPrev = selectedIndex > 0;
  const hasNext =
    selectedIndex >= 0 && selectedIndex < filteredArticles.length - 1;

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedArticleId(filteredArticles[selectedIndex - 1].id);
    }
  }, [filteredArticles, selectedIndex]);

  const handleNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filteredArticles.length - 1) {
      setSelectedArticleId(filteredArticles[selectedIndex + 1].id);
    }
  }, [filteredArticles, selectedIndex]);

  if (authLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <AdminLoginScreen
          authError={authError}
          unauthorizedEmail={
            user && !isAuthorized ? user.email ?? 'Unknown user' : null
          }
          onSignIn={signIn}
          onSignUp={signUp}
          onSignOut={logOut}
        />
      </SafeAreaView>
    );
  }

  const userEmail = user.email ?? 'editor';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* Minimalistic Editorial Top Bar */}
      <View
        style={{
          backgroundColor: theme.colors.canvas,
          borderBottomWidth: theme.layout.borderWidth,
          borderBottomColor: theme.colors.borderSubtle,
          paddingHorizontal: theme.spacing.xxl,
          paddingVertical: theme.spacing.md,
        }}
      >
        <View
          style={{
            maxWidth: theme.layout.contentMaxWidth + 280,
            width: '100%',
            alignSelf: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          {/* Left: Brand + Quiet Text Navigation */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Pressable
              onPress={() => {
                setActiveView('overview');
                setSelectedArticleId(null);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.textPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <DSText variant="micro" weight="bold" tone="inverse">
                  SL
                </DSText>
              </View>
              <DSText variant="footnote" weight="bold" tone="primary">
                SnappyLit Studio
              </DSText>
            </Pressable>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.lg,
              }}
            >
              {(
                [
                  ...MAIN_TABS,
                  { id: 'settings' as const, label: 'Settings' },
                ] as const
              ).map((tab) => {
                const isActive = activeView === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      setActiveView(tab.id);
                      if (tab.id !== 'inbox') setSelectedArticleId(null);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: theme.spacing.xs,
                      borderBottomWidth: 2,
                      borderBottomColor: isActive
                        ? theme.colors.accent
                        : 'transparent',
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <DSText
                      variant="footnote"
                      weight={isActive ? 'semibold' : 'medium'}
                      tone={isActive ? 'primary' : 'tertiary'}
                    >
                      {tab.label}
                    </DSText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Right: Quiet Contextual Utilities */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: theme.spacing.md,
            }}
          >
            <Pressable
              onPress={() => setLivePipelineOpen(true)}
              style={({ pressed }) => ({
                paddingVertical: theme.spacing.xs,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <DSText variant="caption" weight="semibold" tone="primary">
                Run pipeline
              </DSText>
            </Pressable>

            <DSText variant="caption" tone="tertiary">
              {userEmail.split('@')[0]}
            </DSText>

            <Pressable
              onPress={logOut}
              style={({ pressed }) => ({
                paddingVertical: theme.spacing.xs,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <DSText variant="caption" weight="medium" tone="secondary">
                Sign out
              </DSText>
            </Pressable>
          </View>
        </View>
      </View>

      {articlesError ? (
        <View
          style={{
            backgroundColor: theme.colors.tones.danger.bg,
            borderBottomWidth: theme.layout.borderWidth,
            borderBottomColor: theme.colors.tones.danger.border,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <DSText variant="footnote" tone="danger">
            {articlesError}
          </DSText>
        </View>
      ) : null}

      {articlesLoading ? (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.canvas,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <DSText
            variant="footnote"
            tone="secondary"
            style={{ marginTop: theme.spacing.md }}
          >
            Loading dashboard...
          </DSText>
        </View>
      ) : activeView === 'overview' ? (
        <EditorOverviewPane
          articles={articles}
          today={today}
          adminUid={user.uid}
          drawerOpen={Boolean(selectedArticleId) || livePipelineOpen}
          selectedArticleId={selectedArticleId}
          onSelectArticle={setSelectedArticleId}
          onApproveArticle={approveArticle}
          onRejectArticle={rejectArticle}
          onRevertToDraft={revertToDraft}
          onOpenInbox={(folder, articleId) => {
            setSelectedFolder(folder);
            setFilters(INITIAL_FILTERS);
            setSelectedArticleId(articleId ?? null);
            setActiveView('inbox');
          }}
          onOpenLivePipeline={() => setLivePipelineOpen(true)}
        />
      ) : activeView === 'inbox' ? (
        <View
          style={{
            position: 'relative',
            flex: 1,
            overflow: 'hidden',
          }}
          className="flex-col md:flex-row"
        >
          <InboxSidebar
            todayPublishedCount={todayPublished.length}
            todayPendingCount={todayPending.length}
            olderDates={olderDates}
            selectedFolder={selectedFolder}
            onSelectFolder={handleSelectFolder}
          />

          <ArticleInboxList
            folderTitle={folderTitle}
            articles={folderArticles}
            filteredArticles={filteredArticles}
            filters={filters}
            showStatusFilter={selectedFolder.type === 'older-date'}
            selectedArticleId={selectedArticleId}
            onChangeFilters={setFilters}
            onSelectArticle={setSelectedArticleId}
            onBatchApprove={(ids) => batchApproveArticles(ids, user.uid)}
          />

          <ArticleReaderDrawer
            article={selectedArticle}
            adminUid={user.uid}
            hasPrev={hasPrev}
            hasNext={hasNext}
            getIdToken={getIdToken}
            onPrev={handlePrev}
            onNext={handleNext}
            onClose={() => setSelectedArticleId(null)}
            onSaveChanges={saveChanges}
            onApprove={approveArticle}
            onReject={rejectArticle}
            onConfirmKidsTopic={confirmKidsTopic}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* System Settings Sub-Bar */}
          <View
            style={{
              backgroundColor: theme.colors.surfaceHeader,
              borderBottomWidth: theme.layout.borderWidth,
              borderBottomColor: theme.colors.borderSubtle,
              paddingHorizontal: theme.spacing.xl,
              paddingVertical: theme.spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
              }}
            >
              <DSButton
                label="← Overview"
                variant="ghost"
                size="sm"
                onPress={() => setActiveView('overview')}
              />
              <DSText variant="subhead" weight="bold" tone="primary">
                System Settings
              </DSText>
            </View>
            <DSSegmentedControl
              options={SETTINGS_TABS}
              value={settingsTab}
              onChange={setSettingsTab}
            />
          </View>

          {settingsTab === 'policy' ? (
            <PolicyGovernancePane
              activePolicy={activePolicy}
              versions={versions}
              isAdmin={isAdmin}
              userEmail={userEmail}
              getIdToken={getIdToken}
              onSaveVersion={savePolicyVersion}
              onRollback={rollbackToVersion}
              onTestPolicy={testPolicy}
            />
          ) : settingsTab === 'sources' ? (
            <SourcesPane
              sources={sources}
              userEmail={userEmail}
              onToggleSource={toggleSource}
              onAddSource={addSource}
              onRemoveSource={removeSource}
              onResetDefaults={resetDefaults}
            />
          ) : (
            <AnalyticsPane articles={articles} />
          )}
        </View>
      )}

      {/* Live Multi-Agent Pipeline Visualizer Drawer */}
      <LivePipelineDrawer
        visible={livePipelineOpen}
        getIdToken={getIdToken}
        onClose={() => setLivePipelineOpen(false)}
        onOpenArticle={(id) => {
          setSelectedFolder({ type: 'today-pending' });
          setActiveView('inbox');
          setSelectedArticleId(id);
        }}
      />
    </SafeAreaView>
  );
}

export default function AdminDashboardScreen() {
  return (
    <DSThemeProvider initialTheme="apple-hig">
      <AdminDashboardContent />
    </DSThemeProvider>
  );
}
