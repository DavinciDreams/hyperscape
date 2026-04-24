export {
  PluginCatalog,
  PluginCatalogError,
  PluginDependencyCycleError,
  UnknownPluginError,
} from "./PluginCatalog.js";

export { type Disposer, PluginContextScope } from "./PluginContextScope.js";

export {
  type PluginContextBase,
  type PluginContextBuilder,
  PluginHost,
} from "./PluginHost.js";

export {
  type HyperforgePlugin,
  type LifecyclePhase,
  type PluginContextProvider,
  type PluginFactory,
  type PluginLifecycleState,
  type PluginRecord,
  MissingHardDependencyError,
  MissingPluginFactoryError,
  PluginLifecycleError,
  PluginLoader,
} from "./PluginLoader.js";

export {
  buildPluginCatalogFromRegistry,
  listPluginsEnabledByDefault,
  resolvePluginEnabledByDefault,
} from "./PluginRegistryBridge.js";

export {
  type CreatePluginHostOptions,
  UnregisteredPluginError,
  createPluginHostFromRegistry,
} from "./PluginRegistryBootstrap.js";

export {
  type PluginBrowserRow,
  buildPluginBrowserSnapshot,
} from "./PluginBrowserSnapshot.js";

export {
  type PluginBrowserSearchFilters,
  type ScoredPluginBrowserRow,
  searchPluginBrowser,
} from "./PluginBrowserSearch.js";

export {
  type PluginBrowserGroup,
  groupByAuthor,
  groupByState,
  groupByTag,
} from "./PluginBrowserGroupings.js";

export {
  type PluginBrowserSortColumn,
  type PluginBrowserSortDirection,
  type PluginBrowserSortOrder,
  buildPluginBrowserComparator,
  sortPluginBrowserRows,
} from "./PluginBrowserSortOrder.js";

export {
  type PluginBrowserGroupMode,
  type PluginBrowserView,
  type PluginBrowserViewOptions,
  buildPluginBrowserView,
} from "./PluginBrowserView.js";

export {
  type PluginBrowserViewState,
  DEFAULT_VIEW_STATE,
  parsePluginBrowserViewState,
  serializePluginBrowserViewState,
  viewStateToOptions,
} from "./PluginBrowserViewState.js";

export {
  type EnabledByDefaultChange,
  type PluginMetadataChange,
  type PluginRegistryDiff,
  type PluginVersionChange,
  diffPluginRegistries,
  isPluginRegistryDiffEmpty,
} from "./PluginManifestDiff.js";

export {
  type PluginRegistryDiffSelection,
  applyPluginRegistryDiff,
} from "./PluginRegistryDiffApply.js";

export {
  type PluginRegistryDiffCounts,
  type PluginRegistryDiffRow,
  type PluginRegistryDiffRowKind,
  type PluginRegistryDiffSeverity,
  countPluginRegistryDiffRows,
  summarizePluginRegistryDiff,
} from "./PluginRegistryDiffSummary.js";

export {
  type PluginRegistryDiffIssue,
  type PluginRegistryDiffIssueKind,
  type PluginRegistryDiffIssueSeverity,
  type PluginRegistryDiffValidationReport,
  validatePluginRegistryDiff,
} from "./PluginRegistryDiffValidator.js";

export {
  type PluginRegistryTransitionPlan,
  type PluginTransitionRestart,
  type PluginTransitionStart,
  type PluginTransitionStop,
  computePluginRegistryTransitionPlan,
  isPluginRegistryTransitionPlanEmpty,
} from "./PluginRegistryTransitionPlan.js";

export {
  type PluginRegistryTransitionOrderOptions,
  type TransitionStep,
  type TransitionStepKind,
  type TransitionStepRestart,
  type TransitionStepStart,
  type TransitionStepStop,
  orderPluginRegistryTransition,
} from "./PluginRegistryTransitionOrder.js";

export {
  type ExecuteTransitionOptions,
  type TransitionAdapter,
  type TransitionExecutionReport,
  type TransitionStepResult,
  type TransitionStepStatus,
  executePluginRegistryTransition,
  formatTransitionExecutionReport,
  manifestForStep,
} from "./PluginRegistryTransitionExecutor.js";

export { journalTransitionExecutionReport } from "./PluginRegistryTransitionJournal.js";

export {
  type DryRunRecordedCall,
  type DryRunTransitionAdapterOptions,
  DryRunTransitionAdapter,
  failedPluginIds,
  summarizeDryRunCalls,
} from "./PluginRegistryDryRunAdapter.js";

export {
  type TransitionReportRow,
  type TransitionReportRowBadge,
  type TransitionReportView,
  type TransitionReportViewSummary,
  buildTransitionReportView,
} from "./PluginRegistryTransitionReportView.js";

export {
  type RollbackPlan,
  type RollbackPlanSkip,
  type RollbackPlanSkipReason,
  computePluginRegistryRollbackPlan,
  isRollbackPlanEmpty,
  rollbackStepCount,
} from "./PluginRegistryRollbackPlan.js";

export {
  type PluginRegistryApplyPreview,
  type PreviewPluginRegistryApplyOptions,
  isPreviewApplySafe,
  previewPluginRegistryApply,
} from "./PluginRegistryApplyPreview.js";

export {
  type PluginDetailsSnapshot,
  type PluginDetailsSnapshotInput,
  buildPluginDetailsSnapshot,
} from "./PluginDetailsSnapshot.js";

export {
  type PluginCommand,
  type PluginCommandParseErrorCode,
  PluginCommandParseError,
  parsePluginCommand,
} from "./PluginCommandParser.js";

export {
  type InfoOutcome,
  type ListOutcome,
  type PendingDisableOutcome,
  type PendingEnableOutcome,
  type PendingReloadOutcome,
  type PluginCommandOutcome,
  type ResolveContext,
  type UnknownPluginIdOutcome,
  resolvePluginCommand,
} from "./PluginCommandResolver.js";

export {
  type ExecutionResult,
  type MutationKind,
  type ReadOutcomeKind,
  executePluginCommand,
} from "./PluginCommandExecutor.js";

export {
  type RunnerResult,
  type RunPluginCommandLineOptions,
  journalPluginExecutionResult,
  runPluginCommandLine,
} from "./PluginCommandRunner.js";

export {
  type ActivitySummary,
  buildActivityFeedByPlugin,
  buildRecentActivityFeed,
  summarizeActivity,
} from "./PluginActivityFeed.js";

export {
  type BulkItemResult,
  type BulkMutation,
  type BulkOperationResult,
  type BulkOptions,
  disablePluginSubset,
  enablePluginSubset,
  reloadPluginSubset,
} from "./PluginBulkOperations.js";

export {
  type ContributionIdentifier,
  type ContributionRecord,
  DuplicateContributionIdError,
  PluginContributionRegistry,
  UnknownContributionIdError,
} from "./PluginContributionRegistry.js";

export {
  type LivePluginContributionCounts,
  countLiveContributionsForPlugin,
  countLiveContributionsForPlugins,
} from "./PluginContributionCounts.js";

export {
  type AdvertisedPluginContributionCounts,
  type PluginContributionDivergence,
  diffContributionCounts,
  hasContributionDivergence,
} from "./PluginContributionDivergence.js";

export {
  type PluginLifecycleEvent,
  type PluginLifecycleOutcome,
  PluginLifecycleJournal,
} from "./PluginLifecycleJournal.js";

export {
  type PluginHealthIssue,
  type PluginHealthIssueKind,
  type PluginHostHealthReport,
  checkPluginHostHealth,
} from "./PluginHostHealthCheck.js";

export {
  InvalidPluginVersionError,
  InvalidPluginVersionRangeError,
  satisfiesPluginVersionRange,
} from "./PluginVersionRange.js";

export {
  type DisableImpactEntry,
  computeDisableImpact,
  directDependentsOf,
  transitiveDependenciesOf,
  transitiveDependentsOf,
} from "./PluginDependencyGraph.js";

export {
  type ChainEnableItemResult,
  type ChainEnableResult,
  type EnableImpactEntry,
  computeEnableImpact,
  enablePluginChain,
} from "./PluginChainEnable.js";

export {
  DuplicatePluginIdError,
  UnknownPluginIdError,
  addPluginToRegistry,
  clearPluginEnabledOverride,
  removePluginFromRegistry,
  replacePluginInRegistry,
  setPluginEnabledOverride,
} from "./PluginRegistryMutations.js";

export {
  type BuildHealthDigestInput,
  type PluginRegistryHealthCounts,
  type PluginRegistryHealthDigest,
  type PluginRegistryHealthSeverity,
  buildPluginRegistryHealthDigest,
} from "./PluginRegistryHealthDigest.js";

export {
  type PluginRowHealthBadge,
  type PluginRowHealthSeverity,
  buildPluginBrowserHealthBadges,
} from "./PluginBrowserHealthBadges.js";

export {
  type FormatPluginRegistryHealthDigestOptions,
  formatPluginRegistryHealthDigest,
} from "./PluginRegistryHealthDigestFormat.js";

export {
  type PluginRegistryApplyOutcome,
  type PluginRegistryApplyOutcomeKind,
  classifyPluginRegistryApplyOutcome,
} from "./PluginRegistryApplyOutcome.js";

export {
  type PluginLifecyclePhaseCounts,
  type PluginLifecycleStats,
  buildPluginLifecycleStats,
  buildPluginLifecycleStatsByPlugin,
} from "./PluginLifecycleStats.js";

export {
  type ClassifyPluginStabilityOptions,
  type PluginStabilityBadge,
  type PluginStabilityRating,
  classifyPluginStability,
} from "./PluginStabilityClassifier.js";

export {
  type PluginBrowserRowSummary,
  type PluginRowSummarySeverity,
  type SummarizePluginBrowserRowsInput,
  summarizePluginBrowserRows,
} from "./PluginBrowserRowSummary.js";

export {
  type PluginBrowserHeaderCounts,
  type PluginBrowserHeaderSummary,
  summarizePluginBrowserHeader,
} from "./PluginBrowserHeaderSummary.js";

export {
  type BuildPluginLifecycleTimelineOptions,
  type PluginLifecycleTimeline,
  type PluginLifecycleTimelineEntry,
  buildPluginLifecycleTimeline,
} from "./PluginLifecycleTimeline.js";

export {
  type BuildPluginFailureWindowOptions,
  type PluginFailureWindow,
  type PluginFailureWindowEntry,
  buildPluginFailureWindow,
} from "./PluginFailureWindow.js";

export {
  type BuildPluginDetailsLifecycleViewOptions,
  type PluginDetailsLifecycleView,
  buildPluginDetailsLifecycleView,
} from "./PluginDetailsLifecycleView.js";

export {
  type PluginBrowserSeverityFilter,
  filterBrokenRows,
  filterNeedsAttentionRows,
  filterPluginBrowserRowsBySeverity,
} from "./PluginBrowserSeverityFilter.js";

export {
  type PluginBrowserRowSortDirection,
  type PluginBrowserRowSortKey,
  type PluginBrowserRowSortOrder,
  sortPluginBrowserRowSummaries,
  sortPluginBrowserRowSummariesByWorstFirst,
} from "./PluginBrowserRowSort.js";

export {
  type ComposePluginBrowserSnapshotInput,
  type ComposePluginBrowserSnapshotOptions,
  type PluginBrowserSnapshotComposed,
  composePluginBrowserSnapshot,
} from "./PluginBrowserSnapshotComposer.js";

export {
  type PluginBrowserRowChange,
  type PluginBrowserRowChangeKind,
  type PluginBrowserSnapshotDiff,
  diffPluginBrowserSnapshots,
  isPluginBrowserSnapshotDiffEmpty,
  severityRegressions,
} from "./PluginBrowserSnapshotDiff.js";

export {
  type PluginBrowserToastIntent,
  type PluginBrowserToastKind,
  buildPluginBrowserToastIntents,
} from "./PluginBrowserToastRouter.js";

export {
  type FilterToastIntentsOptions,
  type FilterToastIntentsResult,
  type ToastSuppressionState,
  emptyToastSuppressionState,
  filterPluginBrowserToastIntents,
  pruneToastSuppressionState,
} from "./PluginBrowserToastSuppression.js";

export {
  type PluginBrowserNotificationPipelineInput,
  type PluginBrowserNotificationPipelineResult,
  runPluginBrowserNotificationPipeline,
} from "./PluginBrowserNotificationPipeline.js";

export {
  type PluginBrowserToastOverflowSummary,
  type RateLimitToastIntentsOptions,
  type RateLimitToastIntentsResult,
  rateLimitPluginBrowserToastIntents,
} from "./PluginBrowserToastRateLimit.js";

export {
  type PluginBrowserToastGroup,
  groupPluginBrowserToastIntents,
} from "./PluginBrowserToastGrouping.js";

export {
  type PluginBrowserToastDisplay,
  type PluginBrowserToastLocalizationKeys,
  formatPluginBrowserToastGroup,
} from "./PluginBrowserToastDisplay.js";

export {
  type PluginBrowserToastOverflowDisplay,
  type RenderPluginBrowserToastsInput,
  type RenderPluginBrowserToastsResult,
  renderPluginBrowserToastDisplays,
} from "./PluginBrowserToastRender.js";

export {
  type PluginBrowserToastPipelineInput,
  type PluginBrowserToastPipelineResult,
  runPluginBrowserToastPipeline,
} from "./PluginBrowserToastPipeline.js";

export {
  type PluginBrowserChangelogEntry,
  type PluginBrowserChangelogState,
  type PluginBrowserChangelogFilter,
  type AppendPluginBrowserChangelogOptions,
  DEFAULT_MAX_CHANGELOG_ENTRIES,
  emptyPluginBrowserChangelog,
  appendPluginBrowserChangelog,
  filterPluginBrowserChangelog,
  prunePluginBrowserChangelog,
} from "./PluginBrowserChangelog.js";

export {
  type PluginBrowserChangelogSummary,
  type SummarizePluginBrowserChangelogOptions,
  emptyPluginBrowserChangelogSummary,
  summarizePluginBrowserChangelog,
  topPluginsByChangelogActivity,
} from "./PluginBrowserChangelogSummary.js";

export {
  type PluginBrowserChangelogView,
  type PluginBrowserChangelogViewGroup,
  type PluginBrowserChangelogViewRow,
  type RenderPluginBrowserChangelogViewOptions,
  renderPluginBrowserChangelogView,
} from "./PluginBrowserChangelogView.js";

export {
  type PluginBrowserChangelogCursorState,
  type PluginBrowserChangelogUnreadReport,
  emptyPluginBrowserChangelogCursor,
  unreadPluginBrowserChangelog,
  markPluginBrowserChangelogSeen,
  setPluginBrowserChangelogCursor,
} from "./PluginBrowserChangelogCursor.js";

export {
  type ExportPluginBrowserChangelogOptions,
  type PluginBrowserChangelogExportMetadata,
  NDJSON_EXPORT_METADATA,
  CSV_EXPORT_METADATA,
  exportPluginBrowserChangelogAsNdjson,
  exportPluginBrowserChangelogAsCsv,
} from "./PluginBrowserChangelogExport.js";

export {
  type PluginBrowserEditorState,
  type SerializedPluginBrowserEditorState,
  type PluginBrowserEditorStateEnvelope,
  type PluginBrowserEditorStateLoadIssue,
  type PluginBrowserEditorStateLoadResult,
  PLUGIN_BROWSER_EDITOR_STATE_VERSION,
  emptyPluginBrowserEditorState,
  savePluginBrowserEditorState,
  loadPluginBrowserEditorState,
} from "./PluginBrowserEditorState.js";

export {
  type PluginBrowserSnapshot,
  type PluginBrowserState,
  type PluginBrowserAction,
  initialPluginBrowserState,
  pluginBrowserReducer,
} from "./PluginBrowserReducer.js";

export {
  type PluginBrowserSeverityCounts,
  type SelectVisibleRowsOptions,
  selectRowArray,
  selectRowById,
  selectSelectedRow,
  selectHasStaleSelection,
  selectSeverityCounts,
  selectVisibleRows,
  selectUnreadChangelog,
  selectHasUnreadChangelog,
  selectUnreadWorstSeverity,
  selectChangelogSummary,
  selectChangelogView,
  selectToastSurfaceCount,
} from "./PluginBrowserSelectors.js";

export {
  type PluginBrowserKeyboardEvent,
  type PluginBrowserKeyboardBindingsContext,
  pluginBrowserActionForKey,
} from "./PluginBrowserKeyboardBindings.js";

export {
  type PluginBrowserCommandCategory,
  type PluginBrowserCommandEntry,
  type BuildPluginBrowserCommandMenuOptions,
  buildPluginBrowserCommandMenu,
  filterPluginBrowserCommandMenu,
} from "./PluginBrowserCommandMenu.js";

export {
  type PluginBrowserStoreListener,
  type CreatePluginBrowserStoreOptions,
  type PluginBrowserStore,
  createPluginBrowserStore,
} from "./PluginBrowserStore.js";

export {
  type PluginBrowserSelector,
  type PluginBrowserEqualityFn,
  type SubscribePluginBrowserStoreSliceOptions,
  subscribePluginBrowserStoreSlice,
  referenceEquals,
  shallowEquals,
} from "./PluginBrowserStoreSelector.js";

export {
  type PluginBrowserStateDiffEvent,
  diffPluginBrowserState,
} from "./PluginBrowserStateDiff.js";

export {
  type PluginBrowserActionRecord,
  type PluginBrowserActionRecorder,
  type CreatePluginBrowserActionRecorderOptions,
  DEFAULT_MAX_ACTION_RECORDS,
  createPluginBrowserActionRecorder,
  replayPluginBrowserActions,
  pluginBrowserActionsFromRecords,
} from "./PluginBrowserActionRecorder.js";

export {
  type PluginBrowserPersistedState,
  PERSISTENCE_SCHEMA_VERSION,
  serializePluginBrowserState,
  rehydratePluginBrowserState,
  parsePluginBrowserPersistedState,
  parsePluginBrowserPersistedStateJson,
  stringifyPluginBrowserPersistedState,
  bootPluginBrowserStateFromJson,
} from "./PluginBrowserPersistence.js";

export {
  type PluginBrowserDeepLinkState,
  encodePluginBrowserDeepLink,
  decodePluginBrowserDeepLink,
  isEmptyPluginBrowserDeepLink,
} from "./PluginBrowserDeepLink.js";

export {
  type PluginBrowserDetailsViewModel,
  type BuildPluginBrowserDetailsViewModelOptions,
  DEFAULT_DETAILS_CHANGELOG_LIMIT,
  buildPluginBrowserDetailsViewModel,
} from "./PluginBrowserDetailsViewModel.js";

export {
  type PluginBrowserFocusCommand,
  type PluginBrowserFocusNavigatorOptions,
  nextFocusedPluginId,
} from "./PluginBrowserFocusNavigator.js";

export {
  type PluginBrowserHistoryTracker,
  type PluginBrowserHistoryTrackerOptions,
  createPluginBrowserHistoryTracker,
} from "./PluginBrowserHistoryTracker.js";

export {
  type PluginBrowserBulkSelection,
  createPluginBrowserBulkSelection,
} from "./PluginBrowserBulkSelection.js";

export {
  type PluginBrowserClipboardFormat,
  formatPluginBrowserRow,
  formatPluginBrowserRows,
  formatPluginBrowserPluginIds,
} from "./PluginBrowserClipboard.js";

export {
  type PluginBrowserListEntry,
  type PluginBrowserListViewModel,
  type BuildPluginBrowserListViewModelOptions,
  buildPluginBrowserListViewModel,
} from "./PluginBrowserListViewModel.js";

export {
  type PluginBrowserEmptyState,
  type PluginBrowserEmptyStateKind,
  computePluginBrowserEmptyState,
} from "./PluginBrowserEmptyState.js";

export {
  type PluginBrowserPageWindow,
  type ComputePluginBrowserPageWindowInput,
  DEFAULT_PLUGIN_BROWSER_PAGE_SIZE,
  computePluginBrowserPageWindow,
  slicePluginBrowserPage,
} from "./PluginBrowserPagination.js";

export {
  type PluginBrowserColumnDefinition,
  type PluginBrowserColumnSnapshot,
  type PluginBrowserColumnVisibility,
  createPluginBrowserColumnVisibility,
} from "./PluginBrowserColumnVisibility.js";

export {
  type PluginBrowserRowDensityMode,
  type PluginBrowserRowDensityMetrics,
  type PluginBrowserRowDensity,
  type CreatePluginBrowserRowDensityOptions,
  DEFAULT_PLUGIN_BROWSER_DENSITY,
  PLUGIN_BROWSER_DENSITY_METRICS,
  createPluginBrowserRowDensity,
} from "./PluginBrowserRowDensity.js";

export {
  type PluginBrowserColumnWidthDefinition,
  type PluginBrowserColumnWidthSnapshot,
  type PluginBrowserColumnWidths,
  createPluginBrowserColumnWidths,
} from "./PluginBrowserColumnWidths.js";

export {
  type PluginBrowserColumnPinDefinition,
  type PluginBrowserColumnPinSide,
  type PluginBrowserColumnPinSnapshot,
  type PluginBrowserColumnPinning,
  createPluginBrowserColumnPinning,
} from "./PluginBrowserColumnPinning.js";

export {
  type PluginBrowserColumnSearch,
  type PluginBrowserColumnSearchDefinition,
  type PluginBrowserColumnSearchSnapshot,
  createPluginBrowserColumnSearch,
} from "./PluginBrowserColumnSearch.js";

export {
  type PluginBrowserScrollEntry,
  type PluginBrowserScrollMemory,
  type PluginBrowserScrollMemoryOptions,
  createPluginBrowserScrollMemory,
} from "./PluginBrowserScrollMemory.js";

export {
  type PluginBrowserRowExpansion,
  type PluginBrowserRowExpansionOptions,
  createPluginBrowserRowExpansion,
} from "./PluginBrowserRowExpansion.js";

export {
  type PluginBrowserSearchHistory,
  type PluginBrowserSearchHistoryOptions,
  createPluginBrowserSearchHistory,
} from "./PluginBrowserSearchHistory.js";

export {
  type PluginBrowserPinnedRows,
  type PluginBrowserPinnedRowsOptions,
  createPluginBrowserPinnedRows,
} from "./PluginBrowserPinnedRows.js";

export {
  type PluginBrowserSavedFilter,
  type PluginBrowserSavedFilters,
  type PluginBrowserSavedFiltersOptions,
  createPluginBrowserSavedFilters,
} from "./PluginBrowserSavedFilters.js";

export {
  type PluginBrowserViewMode,
  type PluginBrowserViewModeId,
  type PluginBrowserViewModeMetrics,
  type PluginBrowserViewModeOptions,
  createPluginBrowserViewMode,
  DEFAULT_PLUGIN_BROWSER_VIEW_MODE,
  PLUGIN_BROWSER_VIEW_MODE_METRICS,
} from "./PluginBrowserViewMode.js";

export {
  type PluginBrowserFavorites,
  type PluginBrowserFavoritesOptions,
  createPluginBrowserFavorites,
} from "./PluginBrowserFavorites.js";

export {
  type PluginBrowserColumnOrder,
  type PluginBrowserColumnOrderDefinition,
  type PluginBrowserColumnOrderOptions,
  createPluginBrowserColumnOrder,
} from "./PluginBrowserColumnOrder.js";

export {
  type PluginBrowserRecentlyViewed,
  type PluginBrowserRecentlyViewedEntry,
  type PluginBrowserRecentlyViewedOptions,
  createPluginBrowserRecentlyViewed,
} from "./PluginBrowserRecentlyViewed.js";

export {
  type PluginBrowserTagFilter,
  type PluginBrowserTagFilterOptions,
  type PluginBrowserTagFilterSnapshot,
  createPluginBrowserTagFilter,
} from "./PluginBrowserTagFilter.js";

export {
  type PluginBrowserDetailsTab,
  type PluginBrowserDetailsTabDefinition,
  type PluginBrowserDetailsTabOptions,
  NoPluginBrowserDetailsTabsError,
  createPluginBrowserDetailsTab,
} from "./PluginBrowserDetailsTab.js";

export {
  type PluginBrowserSidebarSectionDefinition,
  type PluginBrowserSidebarSections,
  type PluginBrowserSidebarSectionsOptions,
  type PluginBrowserSidebarSectionsSnapshot,
  createPluginBrowserSidebarSections,
} from "./PluginBrowserSidebarSections.js";

export {
  type PluginBrowserContextMenu,
  type PluginBrowserContextMenuPosition,
  type PluginBrowserContextMenuSnapshot,
  type PluginBrowserContextMenuTarget,
  createPluginBrowserContextMenu,
} from "./PluginBrowserContextMenuTarget.js";

export {
  type PluginBrowserLoadingTracker,
  type PluginBrowserLoadingTrackerEntry,
  createPluginBrowserLoadingTracker,
} from "./PluginBrowserLoadingTracker.js";

export {
  type PluginBrowserHoverState,
  type PluginBrowserHoverTarget,
  createPluginBrowserHoverState,
} from "./PluginBrowserHoverState.js";

export {
  type PluginBrowserOperationResults,
  type PluginBrowserOperationOutcome,
  type PluginBrowserOperationResultEntry,
  createPluginBrowserOperationResults,
} from "./PluginBrowserOperationResults.js";

export {
  type PluginBrowserDragReorderState,
  type PluginBrowserDragReorderSnapshot,
  type PluginBrowserDragReorderCommit,
  createPluginBrowserDragReorderState,
} from "./PluginBrowserDragReorderState.js";

export {
  type PluginBrowserMutedPlugins,
  type PluginBrowserMutedPluginEntry,
  createPluginBrowserMutedPlugins,
} from "./PluginBrowserMutedPlugins.js";

export {
  type PluginBrowserRetryQueue,
  type PluginBrowserRetryEntry,
  createPluginBrowserRetryQueue,
} from "./PluginBrowserRetryQueue.js";

export {
  type PluginBrowserBadgeCounts,
  type PluginBrowserBadgeEntry,
  createPluginBrowserBadgeCounts,
} from "./PluginBrowserBadgeCounts.js";

export {
  type PluginBrowserUndoStack,
  type PluginBrowserUndoCommand,
  createPluginBrowserUndoStack,
} from "./PluginBrowserUndoStack.js";

export {
  type PluginBrowserDirtyState,
  type PluginBrowserDirtyEntry,
  createPluginBrowserDirtyState,
} from "./PluginBrowserDirtyState.js";

export {
  type PluginBrowserFieldValidation,
  type PluginBrowserFieldErrorEntry,
  createPluginBrowserFieldValidation,
} from "./PluginBrowserFieldValidation.js";

export {
  type PluginBrowserActionConfirmation,
  type PluginBrowserConfirmRequest,
  type PluginBrowserConfirmResolution,
  type PluginBrowserConfirmOutcome,
  createPluginBrowserActionConfirmation,
} from "./PluginBrowserActionConfirmation.js";

export {
  type PluginBrowserInstallQueue,
  type PluginBrowserInstallEntry,
  type PluginBrowserInstallStatus,
  createPluginBrowserInstallQueue,
} from "./PluginBrowserInstallQueue.js";

export {
  type PluginBrowserInlineEditor,
  type PluginBrowserInlineEditorSession,
  createPluginBrowserInlineEditor,
} from "./PluginBrowserInlineEditor.js";

export {
  type PluginBrowserUpdateNotifier,
  type PluginBrowserUpdateAdvertisement,
  createPluginBrowserUpdateNotifier,
} from "./PluginBrowserUpdateNotifier.js";

export {
  type PluginBrowserReleaseChannel,
  type PluginBrowserReleaseChannelEntry,
  createPluginBrowserReleaseChannel,
} from "./PluginBrowserReleaseChannel.js";

export {
  type PluginBrowserPermissionGrants,
  type PluginBrowserPermissionGrantEntry,
  type PluginBrowserPermissionGrantState,
  createPluginBrowserPermissionGrants,
} from "./PluginBrowserPermissionGrants.js";

export {
  type PluginBrowserAutoUpdatePolicy,
  type PluginBrowserAutoUpdatePolicyEntry,
  type PluginBrowserAutoUpdatePolicyLedger,
  createPluginBrowserAutoUpdatePolicyLedger,
} from "./PluginBrowserAutoUpdatePolicy.js";

export {
  type PluginBrowserDownloadStatus,
  type PluginBrowserDownloadEntry,
  type PluginBrowserDownloadProgress,
  createPluginBrowserDownloadProgress,
} from "./PluginBrowserDownloadProgress.js";

export {
  type PluginBrowserNoteEntry,
  type PluginBrowserNotes,
  createPluginBrowserNotes,
} from "./PluginBrowserNotes.js";

export {
  type PluginBrowserTrashEntry,
  type PluginBrowserTrashBin,
  createPluginBrowserTrashBin,
} from "./PluginBrowserTrashBin.js";

export {
  type PluginBrowserSaveOnExitRequestResult,
  type PluginBrowserSaveOnExitBlocker,
  type PluginBrowserSaveOnExit,
  createPluginBrowserSaveOnExit,
} from "./PluginBrowserSaveOnExit.js";

export {
  type PluginBrowserConflictKind,
  type PluginBrowserConflict,
  type PluginBrowserConflictSession,
  type PluginBrowserConflictClosed,
  type PluginBrowserConflictResolver,
  createPluginBrowserConflictResolver,
} from "./PluginBrowserConflictResolver.js";

export {
  type PluginBrowserBulkItemStatus,
  type PluginBrowserBulkItem,
  type PluginBrowserBulkBatch,
  type PluginBrowserBulkCompletion,
  type PluginBrowserBulkProgress,
  createPluginBrowserBulkProgress,
} from "./PluginBrowserBulkProgress.js";

export {
  type PluginBrowserUpdateEntry,
  type PluginBrowserUpdateAvailability,
  createPluginBrowserUpdateAvailability,
} from "./PluginBrowserUpdateAvailability.js";

export {
  type PluginBrowserCooldownEntry,
  type PluginBrowserOperationCooldown,
  createPluginBrowserOperationCooldown,
} from "./PluginBrowserOperationCooldown.js";

export {
  type PluginBrowserRestartEntry,
  type PluginBrowserRestartRequired,
  createPluginBrowserRestartRequired,
} from "./PluginBrowserRestartRequired.js";

export {
  type PluginBrowserSnoozeEntry,
  type PluginBrowserSnoozeTimer,
  createPluginBrowserSnoozeTimer,
} from "./PluginBrowserSnoozeTimer.js";

export {
  type PluginBrowserSourceTrustLevel,
  type PluginBrowserSourceTrustEntry,
  type PluginBrowserSourceTrust,
  createPluginBrowserSourceTrust,
} from "./PluginBrowserSourceTrust.js";

export {
  type PluginBrowserDiagnosticSeverity,
  type PluginBrowserDiagnosticEntry,
  type PluginBrowserDiagnostics,
  createPluginBrowserDiagnostics,
} from "./PluginBrowserDiagnostics.js";

export {
  type PluginBrowserReviewOutcome,
  type PluginBrowserOpenReview,
  type PluginBrowserClosedReview,
  type PluginBrowserReviewDraft,
  createPluginBrowserReviewDraft,
} from "./PluginBrowserReviewDraft.js";

export {
  type PluginBrowserStagedStatus,
  type PluginBrowserStagedFile,
  type PluginBrowserDragDropStaging,
  createPluginBrowserDragDropStaging,
} from "./PluginBrowserDragDropStaging.js";

export {
  type PluginBrowserTelemetryDecision,
  type PluginBrowserTelemetryEntry,
  type PluginBrowserTelemetryOptIn,
  createPluginBrowserTelemetryOptIn,
} from "./PluginBrowserTelemetryOptIn.js";

export {
  type PluginBrowserCrumb,
  type PluginBrowserBreadcrumb,
  createPluginBrowserBreadcrumb,
} from "./PluginBrowserBreadcrumb.js";

export {
  type PluginBrowserReleaseNotesViewerState,
  type PluginBrowserReleaseNotesViewer,
  createPluginBrowserReleaseNotesViewer,
} from "./PluginBrowserReleaseNotesViewer.js";

export {
  type PluginBrowserRatingBuckets,
  type PluginBrowserRatingDistributionEntry,
  type PluginBrowserRatingDistribution,
  createPluginBrowserRatingDistribution,
} from "./PluginBrowserRatingDistribution.js";

export {
  type PluginBrowserCategoryMatchMode,
  type PluginBrowserCategoryFilter,
  createPluginBrowserCategoryFilter,
} from "./PluginBrowserCategoryFilter.js";

export {
  type PluginBrowserLicenseEntry,
  type PluginBrowserLicenseGroup,
  type PluginBrowserLicenseIndex,
  createPluginBrowserLicenseIndex,
} from "./PluginBrowserLicenseIndex.js";

export {
  type PluginBrowserSearchMatch,
  SEARCH_SCORE_ID_EXACT,
  SEARCH_SCORE_ID_PREFIX,
  SEARCH_SCORE_ID_SUBSTRING,
  SEARCH_SCORE_LABEL_EXACT,
  SEARCH_SCORE_LABEL_PREFIX,
  SEARCH_SCORE_LABEL_SUBSTRING,
  SEARCH_SCORE_REASON_SUBSTRING,
  SEARCH_SCORE_NO_MATCH,
  scorePluginBrowserRow,
  searchPluginBrowserRows,
} from "./PluginBrowserSearchIndex.js";

export {
  type HelloContext,
  type HelloService,
  buildHelloContextProvider,
  createHelloService,
  helloReferencePlugin,
  withScopeDispose,
} from "./examples/HelloReferencePlugin.js";

export {
  type GreetingReport,
  type GreetingReportSink,
  createGreetingReportSink,
  greetingReporterPlugin,
} from "./examples/GreetingReporterPlugin.js";

export {
  type PaletteCategory,
  type PaletteContributionContext,
  paletteContributionPlugin,
} from "./examples/PaletteContributionPlugin.js";

export {
  type ToolbarTool,
  type ToolbarToolContributionContext,
  toolbarToolContributionPlugin,
} from "./examples/ToolbarToolContributionPlugin.js";

export {
  type CommandContributionContext,
  type EditorCommand,
  InvalidCommandIdError,
  InvalidKeybindingError,
  commandContributionPlugin,
} from "./examples/CommandContributionPlugin.js";

export {
  type HudAnchor,
  type HudWidget,
  type WidgetContributionContext,
  InvalidWidgetAnchorError,
  InvalidWidgetZOrderError,
  widgetContributionPlugin,
} from "./examples/WidgetContributionPlugin.js";

export {
  type EntitySchema,
  type EntitySchemaContributionContext,
  InvalidEntitySchemaFieldError,
  InvalidEntitySchemaIdError,
  entitySchemaContributionPlugin,
} from "./examples/EntitySchemaContributionPlugin.js";

export {
  type SystemContribution,
  type SystemContributionContext,
  type SystemTickPhase,
  InvalidSystemFieldError,
  InvalidSystemIdError,
  InvalidSystemPhaseError,
  InvalidSystemTickRateError,
  systemContributionPlugin,
} from "./examples/SystemContributionPlugin.js";

export {
  type ManifestSchemaContribution,
  type ManifestSchemaContributionContext,
  InvalidManifestSchemaFieldError,
  InvalidManifestSchemaIdError,
  InvalidManifestSchemaVersionError,
  manifestSchemaContributionPlugin,
} from "./examples/ManifestSchemaContributionPlugin.js";
