import {
  findDuplicates,
  normalizeUrl,
  formatContentSnippet,
  findNearDuplicates,
  fetchAllPageContent,
  organizeLocally,
  organizeWithAI,
  checkDeadLinks,
  buildChangePlan,
  searchBookmarks,
  findStaleBookmarks,
  describeLastVisit,
  collectTags,
  tagKey,
  getDomain,
  readingTime,
  evaluateRules,
  applyRules,
  scoreClassification,
  findTitleConflicts,
  findAgingFolders,
  findSimilar,
  tagLineage,
  tagMatches,
  renameTag,
  mergeTags,
  runCollection,
  parseBookmarksHtml,
  toNetscapeHtml,
  toMarkdown,
  toCsv,
  tokenize
} from './organizer.js';
import {
  PROVIDER_LABELS,
  hasKey,
  estimateRequest,
  requestModel,
  requestJson,
  requestEmbeddings,
  supportsEmbeddings,
  localAnswer,
  localSummary
} from './ai.js';
import {
  cosineSimilarity,
  rankByVector,
  embeddingText,
  PROMPTS,
  sanitizeTagAssignments,
  buildMergePlan,
  applyMergePlan,
  tagVocabulary,
  pickCitation,
  normalizeRuleDraft,
  uncertainPairs,
  describeFolder,
  describeStale
} from './ai-features.js';
import {
  IS_EXTENSION,
  STORAGE,
  STORAGE_NAMES,
  storageGet,
  storageSet,
  storageRemove,
  storageUsage,
  formatBytes,
  pruneIndex,
  resolveTheme,
  bytesOf,
  SYNC_KEYS,
  isSyncAvailable,
  syncGet,
  syncSet,
  settingsForSync
} from './storage.js';
import { findOrphans, orphanCount, withoutOrphans, describeOrphans } from './data-health.js';
import {
  el,
  escapeHtml,
  attr,
  debounce,
  openModal,
  closeModal,
  topModal,
  anyModalOpen,
  copyText,
  plural,
  relTime
} from './ui-kit.js';
import {
  fuzzyIncludes,
  parseQuery,
  passesOperators,
  matchContext,
  usefulnessScore,
  groupResults,
  looksLikeUrl
} from './search-plus.js';

const NOW = Date.now();
const DAY = 86400000;
const TRASH_DAYS = 30;
const ago = (d) => NOW - d * DAY;

const demoContent = (description, headings, excerpt, text = '') => ({ description, headings, excerpt, text });

const DEMO_BOOKMARKS_SEED = [
  {
    id: '1', title: 'MDN Web Docs — JavaScript', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    folderName: 'Unsorted', dateAdded: ago(400), _demoLastVisit: ago(3),
    _demoContent: demoContent(
      'Complete JavaScript reference covering async promises, closures, and the standard library.',
      'JavaScript Guide · Reference', 'Learn modern ECMAScript syntax, DOM APIs, and closures.',
      'JavaScript is a lightweight interpreted programming language with first-class functions. Covers Array prototype methods, Promise chaining, async await, event loop scheduling, modules, and strict mode.'
    )
  },
  {
    id: '2', title: 'MDN JavaScript Reference (dup)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/?utm_source=twitter',
    folderName: 'Bookmarks Bar', dateAdded: ago(300), _demoLastVisit: ago(200),
    _demoContent: demoContent('Complete JavaScript reference and documentation.', 'JavaScript Reference', 'MDN JavaScript documentation.')
  },
  {
    id: '3', title: 'GitHub — Trending Repositories', url: 'https://github.com/trending',
    folderName: 'Unsorted', dateAdded: ago(250), _demoLastVisit: ago(1),
    _demoContent: demoContent(
      'Open source repositories the developer community is excited about today.',
      'Trending Repositories · Open Source', 'Explore popular Git projects, CLI tools, and new frameworks.',
      'Browse trending repositories across languages including Python, TypeScript, and Rust. Filter by spoken language and date range.'
    )
  },
  {
    id: '4', title: 'Google AI Studio', url: 'https://aistudio.google.com/',
    folderName: 'Unsorted', dateAdded: ago(120), _demoLastVisit: ago(2),
    _demoContent: demoContent(
      'Prototyping environment for Gemini language models with a free tier API key.',
      'Build with Gemini · Free API Key', 'Test prompts, structured JSON output, and large context windows.',
      'Generate an API key without a credit card to experiment with Gemini models, structured JSON responses, embeddings, and long context prompts.'
    )
  },
  {
    id: '5', title: 'Groq Cloud Console', url: 'https://console.groq.com/',
    folderName: 'Misc', dateAdded: ago(90), _demoLastVisit: ago(6),
    _demoContent: demoContent(
      'Ultra-fast LLM inference API running open-source Llama models with a free tier.',
      'API Keys · Llama 3.3 · Playground', 'Low-latency tokens per second for chat completions.',
      'Groq serves open models with very low latency. Free tier covers personal experimentation with rate limits per minute.'
    )
  },
  {
    id: '6', title: 'Figma', url: 'https://www.figma.com/',
    folderName: 'Bookmarks Bar', dateAdded: ago(500), _demoLastVisit: ago(4),
    _demoContent: demoContent(
      'Collaborative interface design, prototyping, and shared design systems.',
      'Design · Prototype · Dev Mode', 'Create vector UI components and clickable UX prototypes.',
      'Build design systems with auto-layout frames, component variants, and interactive prototype connections.'
    )
  },
  {
    id: '7', title: 'Coolors', url: 'https://coolors.co/',
    folderName: 'Misc', dateAdded: ago(500), _demoLastVisit: 0,
    _demoContent: demoContent(
      'Color palette generator with hex swatches and contrast checking.',
      'Palette Generator · Contrast Checker', 'Generate harmonious palettes and export CSS variables.',
      'Lock colors, generate variations, and verify WCAG contrast ratios for accessible text.'
    )
  },
  {
    id: '8', title: 'Old Startup Docs (404)', url: 'https://example-dead-site.invalid/docs/v1',
    folderName: 'Work', dateAdded: ago(600), _demoDead: 'HTTP 404',
    _demoContent: demoContent('', '', '')
  },
  {
    id: '9', title: 'Lo-Fi Girl — Beats to Relax/Study To', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    folderName: 'Bookmarks Bar', dateAdded: ago(200), _demoLastVisit: ago(9),
    _demoContent: demoContent(
      '24/7 lo-fi hip hop radio livestream with instrumental music for focus.',
      'lofi hip hop radio · beats to relax/study to', 'Ambient background music stream on YouTube.',
      'Continuous livestream of chill instrumental hip hop beats for studying and coding sessions.'
    )
  },
  {
    id: '10', title: 'YouTube Lo-Fi Stream (dup)', url: 'https://youtube.com/watch?v=jfKfPfyJRdk&ref=share',
    folderName: 'Unsorted', dateAdded: ago(150), _demoLastVisit: ago(120),
    _demoContent: demoContent('24/7 lo-fi hip hop radio livestream.', 'lofi hip hop radio', 'Chill beats to study to.')
  },
  {
    id: '11', title: 'Hacker News', url: 'https://news.ycombinator.com/',
    folderName: 'Reading / Later', dateAdded: ago(700), _demoLastVisit: ago(0),
    _demoContent: demoContent(
      'Daily tech news, startup discussions, and engineering posts.',
      'Top Stories · Show HN · Ask HN', 'Community-curated articles on software engineering and startups.',
      'Discussion threads on systems programming, hiring, hardware, and entrepreneurship with community voting.'
    )
  },
  {
    id: '12', title: 'Smashing Magazine — Complete CSS Grid Guide', url: 'https://www.smashingmagazine.com/guides/css-grid/',
    folderName: 'Unsorted', dateAdded: ago(330), _demoLastVisit: ago(15),
    _demoContent: demoContent(
      'In-depth frontend guide to CSS Grid layout and responsive styling.',
      'CSS Grid Layout · Responsive Design · Subgrid', 'Master two-dimensional CSS layouts with code snippets.',
      'Covers grid-template-areas, implicit tracks, subgrid alignment, and responsive breakpoint strategies for modern frontend layouts.'
    )
  },
  {
    id: '13', title: 'Excalidraw', url: 'https://excalidraw.com/',
    folderName: 'Misc / Tools', dateAdded: ago(360), _demoLastVisit: ago(30),
    _demoContent: demoContent(
      'Collaborative virtual whiteboard for hand-drawn diagrams.',
      'Whiteboard · Hand-Drawn Diagrams', 'Draw architecture diagrams and export SVG or PNG.',
      'Sketch flowcharts, system diagrams, and wireframes with a hand-drawn aesthetic and real-time sharing.'
    )
  },
  {
    id: '14', title: 'Notion Workspace', url: 'https://www.notion.so/',
    folderName: 'Work', dateAdded: ago(260), _demoLastVisit: ago(5),
    _demoContent: demoContent(
      'All-in-one workspace for notes, wikis, and task boards.',
      'Docs · Wikis · Projects', 'Organize notes, roadmaps, and knowledge bases.',
      'Combine databases, kanban boards, and nested pages into a single workspace for teams.'
    )
  },
  {
    id: '15', title: 'Expired Deal Page (410)', url: 'https://deals-archive.invalid/promo-2022',
    folderName: 'Shopping', dateAdded: ago(800), _demoDead: 'HTTP 410',
    _demoContent: demoContent('', '', '')
  },
  {
    id: '16', title: 'Unreachable Local Dev Server', url: 'http://192.168.99.42:8080/dashboard',
    folderName: 'Work', dateAdded: ago(45), _demoLastVisit: ago(40), _demoDead: 'Timed out',
    _demoContent: demoContent('', '', '')
  },
  {
    id: '17', title: 'Reddit — r/webdev', url: 'https://www.reddit.com/r/webdev/',
    folderName: 'Bookmarks Bar', dateAdded: ago(280), _demoLastVisit: ago(7),
    _demoContent: demoContent(
      'Forum for web developers to share projects and career advice.',
      'r/webdev · Community Discussions', 'Discuss frontend, backend, and indie projects.',
      'Weekly threads cover portfolio reviews, salary discussion, framework comparisons, and debugging help.'
    )
  },
  {
    id: '18', title: 'GitHub Trending (dup)', url: 'https://github.com/trending/',
    folderName: 'Misc / References', dateAdded: ago(240), _demoLastVisit: ago(90),
    _demoContent: demoContent('Trending open source repositories on GitHub.', 'Trending', 'Popular developer projects.')
  },
  {
    id: '19', title: 'React Docs — Full API Reference (AMP)', url: 'https://amp.react.dev/reference/react',
    folderName: 'Misc', dateAdded: ago(100), _demoLastVisit: ago(20),
    _demoContent: demoContent(
      'Official React API reference for hooks and components.',
      'React Reference · Hooks', 'Complete reference for useState, useEffect, and component APIs.',
      'Lists every built-in hook with signatures, caveats, and usage examples for concurrent rendering.'
    )
  },
  {
    id: '20', title: 'React Reference (mobile)', url: 'https://m.react.dev/reference/react/',
    folderName: 'Reading', dateAdded: ago(99), _demoLastVisit: ago(60),
    _demoContent: demoContent('Official React API reference for hooks.', 'React Reference', 'Hooks and component APIs.')
  },
  {
    id: '21', title: 'Web.dev — Learn CSS', url: 'https://web.dev/learn/css',
    folderName: 'Unsorted', dateAdded: ago(180), _demoLastVisit: ago(12),
    _demoContent: demoContent(
      'Structured course covering CSS layout, color, typography, and animation.',
      'Learn CSS · Layout · Color', 'A free course from the Chrome team on modern CSS.',
      'Lessons on the box model, flexbox, grid, custom properties, and responsive design patterns.'
    )
  },
  {
    id: '22', title: 'Wayback Archive (blocked)', url: 'https://web.archive.org/web/20240101000000/https://example.com',
    folderName: 'Reading', dateAdded: ago(140), _demoLastVisit: ago(50), _demoBlocked: 'HTTP 429 (bot wall)',
    _demoContent: demoContent('Internet Archive snapshot.', 'Wayback Machine', 'Browse archived web pages.')
  },
  {
    id: '23', title: 'CSS-Tricks (old address)', url: 'http://css-tricks.com/snippets/css/complete-guide-grid/',
    folderName: 'Misc / References', dateAdded: ago(500), _demoLastVisit: ago(90),
    _demoRedirect: 'https://css-tricks.com/snippets/css/complete-guide-grid/',
    _demoContent: demoContent(
      'Complete guide to CSS Grid with diagrams of every property.',
      'A Complete Guide to Grid', 'Covers grid-template-columns, gap, and auto-placement.',
      'Every grid property is explained with visual examples you can copy.'
    )
  }
];

const state = {
  bookmarks: [],
  // Which panel is on screen. Drives tab-aware rendering so hidden panels are
  // not rebuilt on every action.
  activeTab: 'browse',
  contentCache: new Map(),
  indexTextCache: new Map(),
  visitCache: new Map(),
  tagMap: {},
  readLater: {},
  notes: {},
  rules: [],
  collections: [],
  histories: [],
  protect: [],
  skipDomains: [],
  activeTags: [],
  duplicates: [],
  nearDuplicates: [],
  conflicts: [],
  deadLinks: [],
  staleLinks: [],
  agingFolders: [],
  selectedDupes: new Set(),
  selectedNear: new Set(),
  selectedDead: new Set(),
  selectedStale: new Set(),
  checkedDead: false,
  checkedStale: false,
  checkedAging: false,
  plan: null,
  backup: null,
  trash: [],
  busy: false,
  useExistingFolders: true,
  activeCollection: null,
  semanticOn: false,
  search: { query: '', folder: 'all', domain: 'all', addedWithin: '0', visitedWithin: 'any', tags: [] },
  settings: { provider: 'gemini', apiKey: '', model: '', theme: 'dark', syncEnabled: false, tourDone: false, fileOnSave: true },
  paletteIndex: 0,
  paletteItems: [],
  browseView: 'list',
  browseSort: 'relevance',
  browseGroup: 'none',
  browseLimit: 120,
  bulkMode: false,
  bulkSelected: new Set(),
  pins: [],
  recentSearches: [],
  indexMeta: {},
  dragId: null,
  lastResults: [],
  tagDialogHiddenTicks: [],
  planSkipped: new Set(),
  trashQuery: '',
  linkCheckAbort: null,
  redirects: [],
  annotations: {},
  explainId: null
};

let demoBookmarks = DEMO_BOOKMARKS_SEED.map((b) => ({ ...b }));
let migratePending = false;


const els = {
  modeIndicator: el('mode-indicator'),
  statusBanner: el('status-banner'),
  backupBar: el('backup-bar'),
  backupBarText: el('backup-bar-text'),
  restoreBackupBtn: el('restore-backup-btn'),
  undoHistoryBtn: el('undo-history-btn'),
  trashBar: el('trash-bar'),
  trashBarText: el('trash-bar-text'),
  trashRestoreAllBtn: el('trash-restore-all-btn'),
  trashEmptyBtn: el('trash-empty-btn'),
  rescanBtn: el('rescan-btn'),
  paletteBtn: el('palette-btn'),
  tabs: document.querySelectorAll('.tab-btn'),
  panels: document.querySelectorAll('.tab-panel'),
  cleanupBadge: el('cleanup-badge'),
  libraryBadge: el('library-badge'),
  previewBadge: el('preview-badge'),
  statTotal: el('stat-total'),
  statDupes: el('stat-dupes'),
  statDead: el('stat-dead'),
  statHealth: el('stat-health'),
  aiEngineHint: el('ai-engine-hint'),
  aiEstimate: el('ai-estimate'),
  askQuestion: el('ask-question'),
  askBtn: el('ask-btn'),
  askAnswer: el('ask-answer'),
  askEnginePill: el('ask-engine-pill'),
  tourDialog: el('tour-dialog'),
  tourTitle: el('tour-title'),
  tourBody: el('tour-body'),
  tourNext: el('tour-next'),
  tourSkip: el('tour-skip'),
  tourBtn: el('tour-btn'),
  rulesHint: el('rules-hint'),
  optReadContent: el('opt-read-content'),
  optExistingFolders: el('opt-existing-folders'),
  optRemoveDupes: el('opt-remove-dupes'),
  optRemoveDead: el('opt-remove-dead'),
  optSafeClean: el('opt-safe-clean'),
  contentProgressWrap: el('content-progress-wrap'),
  contentProgressBar: el('content-progress-bar'),
  contentProgressText: el('content-progress-text'),
  buildPlanBtn: el('build-plan-btn'),
  quickDeadScanBtn: el('quick-dead-scan-btn'),
  saveTabsBtn: el('save-tabs-btn'),
  tagBar: el('tag-bar'),
  dupesCountPill: el('dupes-count-pill'),
  dupesList: el('dupes-list'),
  nearCountPill: el('near-count-pill'),
  nearList: el('near-list'),
  removeDupesNowBtn: el('remove-dupes-now-btn'),
  removeNearNowBtn: el('remove-near-now-btn'),
  conflictCountPill: el('conflict-count-pill'),
  conflictList: el('conflict-list'),
  deadCountPill: el('dead-count-pill'),
  removeDeadNowBtn: el('remove-dead-now-btn'),
  runDeadCheckBtn: el('run-dead-check-btn'),
  deadProgressWrap: el('dead-progress-wrap'),
  deadProgressBar: el('dead-progress-bar'),
  deadProgressText: el('dead-progress-text'),
  cancelDeadBtn: el('cancel-dead-btn'),
  redirectList: el('redirect-list'),
  redirectCountPill: el('redirect-count-pill'),
  scheduleSelect: el('schedule-select'),
  scheduleSummary: el('schedule-summary'),
  redirectBlock: el('redirect-block'),
  updateRedirectsBtn: el('update-redirects-btn'),
  deadList: el('dead-list'),
  skipDomainInput: el('skip-domain-input'),
  skipDomainAddBtn: el('skip-domain-add-btn'),
  skipDomainChips: el('skip-domain-chips'),
  staleSelect: el('stale-select'),
  runStaleCheckBtn: el('run-stale-check-btn'),
  staleCountPill: el('stale-count-pill'),
  staleList: el('stale-list'),
  removeStaleNowBtn: el('remove-stale-now-btn'),
  agingSelect: el('aging-select'),
  runAgingBtn: el('run-aging-btn'),
  agingCountPill: el('aging-count-pill'),
  agingList: el('aging-list'),
  trashCountPill: el('trash-count-pill'),
  trashList: el('trash-list'),
  trashSearch: el('trash-search'),
  trashAgeSelect: el('trash-age-select'),
  trashClearOldBtn: el('trash-clear-old-btn'),
  rotList: el('rot-list'),
  rotPill: el('rot-pill'),
  indexBtn: el('build-index-btn'),
  indexProgressWrap: el('index-progress-wrap'),
  indexProgressBar: el('index-progress-bar'),
  indexProgressText: el('index-progress-text'),
  indexStatus: el('index-status'),
  saveCollectionBtn: el('save-collection-btn'),
  savedCollections: el('saved-collections'),
  searchInput: el('search-input'),
  searchFolderChips: el('search-folder-chips'),
  searchDomain: el('search-domain'),
  searchAdded: el('search-added'),
  searchVisited: el('search-visited'),
  searchTagChips: el('search-tag-chips'),
  searchResults: el('search-results'),
  searchCount: el('search-count'),
  browseFilters: el('browse-filters'),
  browseFilterToggle: el('browse-filter-toggle'),
  viewButtons: document.querySelectorAll('.view-btn'),
  previewEmpty: el('preview-empty'),
  previewContent: el('preview-content'),
  previewGenerateBtn: el('preview-generate-btn'),
  planSummary: el('plan-summary'),
  planSkipNote: el('plan-skip-note'),
  diffBefore: el('diff-before'),
  diffAfter: el('diff-after'),
  previewRemovalsBlock: el('preview-removals-block'),
  previewRemoveCount: el('preview-remove-count'),
  previewRemovalsList: el('preview-removals-list'),
  previewMergeBlock: el('preview-merge-block'),
  previewMergeCount: el('preview-merge-count'),
  previewMergeList: el('preview-merge-list'),
  previewFolderCount: el('preview-folder-count'),
  previewFoldersList: el('preview-folders-list'),
  applyPlanBtn: el('apply-plan-btn'),
  undoApplyBtn: el('undo-apply-btn'),
  settingsForm: el('settings-form'),
  aiProvider: el('ai-provider'),
  aiFileOnSave: el('ai-file-on-save'),
  aiKey: el('ai-key'),
  aiModel: el('ai-model'),
  themeSelect: el('theme-select'),
  protectList: el('protect-list'),
  exportJsonBtn: el('export-json-btn'),
  exportHtmlBtn: el('export-html-btn'),
  exportMdBtn: el('export-md-btn'),
  exportCsvBtn: el('export-csv-btn'),
  importFile: el('import-file'),
  importPreview: el('import-preview'),
  importSummary: el('import-summary'),
  importFolders: el('import-folders'),
  importConfirmBtn: el('import-confirm-btn'),
  importCancelBtn: el('import-cancel-btn'),
  importProgressWrap: el('import-progress-wrap'),
  importProgressBar: el('import-progress-bar'),
  importProgressText: el('import-progress-text'),
  importStatus: el('import-status'),
  historyList: el('history-list'),
  restoreBackupSettingsBtn: el('restore-backup-settings-btn'),
  rulesCountPill: el('rules-count-pill'),
  ruleField: el('rule-field'),
  ruleMatch: el('rule-match'),
  ruleFolder: el('rule-folder'),
  ruleAddBtn: el('rule-add-btn'),
  rulesList: el('rules-list'),
  rulesRunBtn: el('rules-run-btn'),
  tagCountPill: el('tag-count-pill'),
  tagManageList: el('tag-manage-list'),
  readlaterCountPill: el('readlater-count-pill'),
  readlaterList: el('readlater-list'),
  notesCountPill: el('notes-count-pill'),
  notesList: el('notes-list'),
  tagDialog: el('tag-dialog'),
  tagDialogList: el('tag-dialog-list'),
  tagDialogFilter: el('tag-dialog-filter'),
  tagSuggestions: el('tag-suggestions'),
  tagDialogInput: el('tag-dialog-input'),
  tagDialogCreate: el('tag-dialog-create'),
  tagDialogClose: el('tag-dialog-close'),
  tagDialogTitle: el('tag-dialog-title'),
  noteDialog: el('note-dialog'),
  noteDialogTitle: el('note-dialog-title'),
  noteDialogInput: el('note-dialog-input'),
  readerDialog: el('reader-dialog'),
  readerTitle: el('reader-title'),
  readerMeta: el('reader-meta'),
  readerText: el('reader-text'),
  readerSummary: el('reader-summary'),
  readerEmpty: el('reader-empty'),
  readerTextPanel: el('reader-text-panel'),
  readerAnnotatePanel: el('reader-annotate-panel'),
  readerClose: el('reader-close'),
  readerDoneBtn: el('reader-done-btn'),
  readerOpenBtn: el('reader-open-btn'),
  readerNoteBtn: el('reader-note-btn'),
  annotationInput: el('annotation-input'),
  annotationAddBtn: el('annotation-add-btn'),
  annotationList: el('annotation-list'),
  saveHighlightBtn: el('save-highlight-btn'),
  collectionDialog: el('collection-dialog'),
  collectionName: el('collection-name'),
  collectionQuery: el('collection-query'),
  collectionSave: el('collection-save'),
  collectionCancel: el('collection-cancel'),
  tagMergePreview: el('tag-merge-preview'),
  suggestTagsBtn: el('suggest-tags-btn'),
  tagSuggestionsList: el('tag-suggestions-list'),
  noteDialogSave: el('note-dialog-save'),
  noteDialogClose: el('note-dialog-close'),
  palette: el('palette'),
  paletteInput: el('palette-input'),
  paletteResults: el('palette-results'),
  confirmDialog: el('confirm-dialog'),
  confirmTitle: el('confirm-title'),
  confirmBody: el('confirm-body'),
  confirmDontaskRow: el('confirm-dontask-row'),
  confirmDontask: el('confirm-dontask'),
  confirmDontaskText: el('confirm-dontask-text'),
  confirmCancel: el('confirm-cancel'),
  confirmOk: el('confirm-ok'),
  promptDialog: el('prompt-dialog'),
  promptTitle: el('prompt-title'),
  promptHelp: el('prompt-help'),
  promptInput: el('prompt-input'),
  promptCancel: el('prompt-cancel'),
  promptOk: el('prompt-ok'),
  toastHost: el('toast-host'),
  sortSelect: el('sort-select'),
  groupSelect: el('group-select'),
  ruleTestUrl: el('rule-test-url'),
  ruleTestBtn: el('rule-test-btn'),
  rulesExportBtn: el('rules-export-btn'),
  rulesImportBtn: el('rules-import-btn'),
  rulesImportFile: el('rules-import-file'),
  recentSearches: el('recent-searches'),
  bulkToggleBtn: el('bulk-toggle-btn'),
  bulkActions: el('bulk-actions'),
  bulkCount: el('bulk-count'),
  bulkAllBtn: el('bulk-all-btn'),
  bulkTagBtn: el('bulk-tag-btn'),
  bulkReadlaterBtn: el('bulk-readlater-btn'),
  bulkCopyBtn: el('bulk-copy-btn'),
  bulkTrashBtn: el('bulk-trash-btn'),
  importPreview: el('import-preview'),
  folderTree: el('folder-tree'),
  similarFolders: el('similar-folders'),
  folderCountPill: el('folder-count-pill'),
  storageUsageText: el('storage-usage'),
  storageBar: el('storage-bar'),
  storageDetail: el('storage-detail'),
  indexRefreshBtn: el('index-refresh-btn'),
  indexPruneBtn: el('index-prune-btn'),
  diagOutput: el('diag-output'),
  diagCopyBtn: el('diag-copy-btn'),
  diagRunBtn: el('diag-run-btn'),
  syncEnabled: el('sync-enabled'),
  syncStatus: el('sync-status'),
  syncNowBtn: el('sync-now-btn'),
  syncPullBtn: el('sync-pull-btn'),
  orphanPill: el('orphan-pill'),
  orphanScanBtn: el('orphan-scan-btn'),
  orphanCleanBtn: el('orphan-clean-btn'),
  orphanList: el('orphan-list'),
  semanticToggle: el('semantic-toggle'),
  readerAiSummaryBtn: el('reader-ai-summary-btn'),
  askFollowup: el('ask-followup'),
  askFollowupBtn: el('ask-followup-btn'),
  askFollowupRow: el('ask-followup-row'),
  tagAiSuggestBtn: el('tag-ai-suggest-btn'),
  tagConsolidateBtn: el('tag-consolidate-btn'),
  tagAiList: el('tag-ai-list'),
  tagConsolidatePreview: el('tag-consolidate-preview'),
  nearAiBtn: el('near-ai-btn'),
  nearAiResult: el('near-ai-result'),
  staleAiBtn: el('stale-ai-btn'),
  staleAiResult: el('stale-ai-result'),
  folderAiBtn: el('folder-ai-btn'),
  folderAiResult: el('folder-ai-result'),
  ruleAiInput: el('rule-ai-input'),
  ruleAiBtn: el('rule-ai-btn'),
  ruleAiStatus: el('rule-ai-status')
};



/* ---------- Helpers ---------- */

function showStatus(message, type = 'info') {
  if (!els.statusBanner) return;
  els.statusBanner.textContent = message;
  els.statusBanner.className = `status-banner${type === 'ok' ? ' is-ok' : type === 'error' ? ' is-error' : ''}`;
  els.statusBanner.hidden = false;
}

function clearStatus() {
  if (els.statusBanner) els.statusBanner.hidden = true;
}

function sendMessageSafe(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function getDefaultParentId() {
  if (!IS_EXTENSION) return null;
  try {
    const tree = await chrome.bookmarks.getTree();
    const root = tree && tree[0];
    const children = (root && root.children) || [];
    const folders = children.filter((c) => !c.url);
    const other = folders.find((c) => c.id === '2' || /other bookmarks/i.test(c.title || ''));
    if (other) return other.id;
    const bar = folders.find((c) => c.id === '1' || /bookmarks bar|favorites bar/i.test(c.title || ''));
    if (bar) return bar.id;
    if (folders[0]) return folders[0].id;
    return root ? root.id : null;
  } catch {
    return null;
  }
}

// Maps "Parent / Sub" paths to existing folder ids so we reuse instead of duplicating.
async function loadExistingFolderMap() {
  const map = new Map();
  if (!IS_EXTENSION) {
    for (const bm of demoBookmarks) {
      if (bm.folderName) map.set(bm.folderName, `demo-${bm.folderName}`);
    }
    return map;
  }
  try {
    const tree = await chrome.bookmarks.getTree();
    const walk = (nodes, pathParts) => {
      for (const node of nodes || []) {
        if (node.url) continue;
        const next = node.title ? [...pathParts, node.title] : pathParts;
        if (next.length >= 2) map.set(next.slice(-2).join(' / '), node.id);
        if (node.children) walk(node.children, next);
      }
    };
    walk(tree, []);
  } catch {
    // ignore
  }
  return map;
}

/* ---------- Protection list ---------- */

function isProtected(bookmark) {
  const folder = (bookmark.folderName || '').toLowerCase();
  const domain = getDomain(bookmark.url).toLowerCase();
  return state.protect.some((entry) => {
    const needle = entry.toLowerCase();
    if (!needle) return false;
    return folder.includes(needle) || (domain && (domain === needle || domain.endsWith('.' + needle)));
  });
}

function isSkippedDomain(url) {
  const domain = getDomain(url).toLowerCase();
  return state.skipDomains.some((d) => domain === d || domain.endsWith('.' + d));
}

/* ---------- Themed confirm (window.confirm closes extension popups) ---------- */

let confirmResolver = null;

function askConfirm({ title, body, okLabel = 'Confirm', danger = false, dontAskKey = '', dontAskLabel = '', showCancel = true, cancelLabel = 'Cancel' }) {
  if (!els.confirmDialog) return Promise.resolve(true);
  if (dontAskKey && state.settings[dontAskKey]) return Promise.resolve(true);

  els.confirmTitle.textContent = title;
  els.confirmBody.innerHTML = body;
  els.confirmOk.textContent = okLabel;
  els.confirmOk.className = danger ? 'btn-danger' : 'btn-primary';
  els.confirmDontaskRow.hidden = !dontAskKey;
  els.confirmDontask.checked = false;
  if (dontAskKey) els.confirmDontaskText.textContent = dontAskLabel || 'Do not ask again';
  // Single-button dialogs (explanations) hide the cancel action entirely.
  if (els.confirmCancel) {
    els.confirmCancel.hidden = !showCancel;
    els.confirmCancel.textContent = cancelLabel;
  }

  return new Promise((resolve) => {
    const settle = (value) => {
      if (value && dontAskKey && els.confirmDontask.checked) {
        state.settings[dontAskKey] = true;
        persistSettings();
      }
      closeModal(els.confirmDialog);
      confirmResolver = null;
      resolve(value);
    };
    confirmResolver = settle;
    // onClose runs for Escape / backdrop, which count as cancelling.
    openModal(els.confirmDialog, { initialFocus: '#confirm-ok', onClose: () => settle(false) });
  });
}

function settleConfirm(value) {
  if (confirmResolver) confirmResolver(value);
}

/* ---------- Theme ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
  if (els.themeSelect) els.themeSelect.value = theme || 'dark';
  // Keep the pre-paint bootstrap in sync so the next load has no flash.
  try {
    localStorage.setItem('bookbox-theme', theme || 'dark');
  } catch {
    // storage may be blocked; the DOM attribute is still correct
  }
}

/* ---------- Global error surface ---------- */

// A blank panel with no explanation is the worst failure mode, so surface
// unexpected errors quietly with a way to copy the details.
let lastError = null;

function reportError(context, err) {
  lastError = {
    context,
    message: (err && (err.message || err)) + '',
    stack: (err && err.stack) || '',
    at: new Date().toISOString()
  };
  showStatus(`${context}: ${lastError.message}. Open Settings → Diagnostics to copy details.`, 'error');
  renderDiagnostics();
}

window.addEventListener('error', (event) => {
  reportError('Unexpected error', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  reportError('Unhandled error', event.reason);
});



/* ---------- Legacy key migration ---------- */

// tagKey() used to include the protocol. Anything stored under the old shape is
// moved to the new key so existing tags, notes, and read-later marks survive.
function migrateLegacyKeys(stored) {
  const legacy = new Set();
  const collect = (obj) => {
    for (const key of Object.keys(obj || {})) {
      if (key.includes('://')) legacy.add(key);
    }
  };
  collect(state.tagMap);
  collect(state.notes);
  collect(state.readLater);
  if (legacy.size === 0) return;

  const rekey = (obj) => {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const next = key.includes('://') ? normalizeUrl(key) : key;
      out[next] = value;
    }
    return out;
  };

  state.tagMap = rekey(state.tagMap);
  state.notes = rekey(state.notes);
  state.readLater = rekey(state.readLater);
  migratePending = true;
}

/* ---------- Persistence: history stack, trash, settings, tags, rules ---------- */

const HISTORY_MAX = 10;

async function loadAll() {
  const stored = await storageGet([
    STORAGE.settings,
    STORAGE.tags,
    STORAGE.index,
    STORAGE.backup,
    STORAGE.history,
    STORAGE.trash,
    STORAGE.readLater,
    STORAGE.notes,
    STORAGE.rules,
    STORAGE.collections,
    STORAGE.protect,
    STORAGE.skipDomains,
    STORAGE.pins,
    STORAGE.recentSearches,
    STORAGE.indexMeta,
    STORAGE.annotations
  ]);

  if (stored[STORAGE.settings]) state.settings = { ...state.settings, ...stored[STORAGE.settings] };
  state.tagMap = stored[STORAGE.tags] && typeof stored[STORAGE.tags] === 'object' ? stored[STORAGE.tags] : {};
  // Older keys used "scheme://host/path". Normalising now drops the scheme, so
  // re-key saved tags, notes, and read-later flags once to keep them attached.
  migrateLegacyKeys(stored);
  state.histories = Array.isArray(stored[STORAGE.history]) ? stored[STORAGE.history] : [];
  state.trash = Array.isArray(stored[STORAGE.trash]) ? stored[STORAGE.trash] : [];
  state.readLater = stored[STORAGE.readLater] && typeof stored[STORAGE.readLater] === 'object' ? stored[STORAGE.readLater] : {};
  state.notes = stored[STORAGE.notes] && typeof stored[STORAGE.notes] === 'object' ? stored[STORAGE.notes] : {};
  state.rules = Array.isArray(stored[STORAGE.rules]) ? stored[STORAGE.rules] : [];
  state.collections = Array.isArray(stored[STORAGE.collections]) ? stored[STORAGE.collections] : [];
  state.protect = Array.isArray(stored[STORAGE.protect]) ? stored[STORAGE.protect] : [];
  state.skipDomains = Array.isArray(stored[STORAGE.skipDomains]) ? stored[STORAGE.skipDomains] : [];
  state.pins = Array.isArray(stored[STORAGE.pins]) ? stored[STORAGE.pins] : [];
  state.recentSearches = Array.isArray(stored[STORAGE.recentSearches]) ? stored[STORAGE.recentSearches] : [];
  state.indexMeta = (stored[STORAGE.indexMeta] && typeof stored[STORAGE.indexMeta] === 'object') ? stored[STORAGE.indexMeta] : {};
  state.annotations = (stored[STORAGE.annotations] && typeof stored[STORAGE.annotations] === 'object') ? stored[STORAGE.annotations] : {};
  if (stored[STORAGE.index] && typeof stored[STORAGE.index] === 'object') {
    for (const [id, text] of Object.entries(stored[STORAGE.index])) state.indexTextCache.set(id, text || '');
  }
  if (stored[STORAGE.backup] && Array.isArray(stored[STORAGE.backup].items)) state.backup = stored[STORAGE.backup];

  // Trash expires after 30 days.
  const cutoff = Date.now() - TRASH_DAYS * DAY;
  const live = state.trash.filter((t) => (t.deletedAt || 0) > cutoff);
  if (live.length !== state.trash.length) {
    state.trash = live;
    await storageSet({ [STORAGE.trash]: state.trash });
  }
}

async function persistSettings() {
  await storageSet({ [STORAGE.settings]: state.settings });
  if (state.settings.syncEnabled) await pushSync();
}
async function persistAnnotations() {
  await storageSet({ [STORAGE.annotations]: state.annotations });
}
async function persistTags() {
  await storageSet({ [STORAGE.tags]: state.tagMap });
  if (state.settings.syncEnabled) await pushSync();
}
async function persistRules() {
  await storageSet({ [STORAGE.rules]: state.rules });
}
async function persistCollections() {
  await storageSet({ [STORAGE.collections]: state.collections });
}
async function persistTrash() {
  await storageSet({ [STORAGE.trash]: state.trash });
}
async function persistHistory() {
  await storageSet({ [STORAGE.history]: state.histories, [STORAGE.backup]: state.backup });
}
async function persistNotes() {
  await storageSet({ [STORAGE.notes]: state.notes, [STORAGE.readLater]: state.readLater });
}
async function persistProtect() {
  await storageSet({ [STORAGE.protect]: state.protect, [STORAGE.skipDomains]: state.skipDomains });
}

/* Snapshotting: every destructive action pushes one of these. */

function snapshotItems() {
  return state.bookmarks.map((b) => ({
    title: b.title,
    url: b.url,
    folderName: b.folderName || '',
    tags: state.tagMap[tagKey(b)] || [],
    note: state.notes[tagKey(b)] || '',
    readLater: Boolean(state.readLater[tagKey(b)])
  }));
}

async function pushSnapshot(label) {
  const snapshot = {
    id: `h-${Date.now()}`,
    createdAt: Date.now(),
    label,
    items: snapshotItems()
  };
  state.histories = [snapshot, ...state.histories].slice(0, HISTORY_MAX);
  state.backup = snapshot; // newest snapshot doubles as the restore target
  await persistHistory();
  renderBackupBar();
  renderHistory();
  return snapshot;
}

/* ---------- Undo toast ---------- */

let toastTimer = null;

// A short-lived toast right after a destructive action is far easier to notice
// than the persistent backup bar.
function showUndoToast(message, onUndo) {
  if (!els.toastHost) return;
  if (toastTimer) clearTimeout(toastTimer);

  els.toastHost.innerHTML = `
    <div class="toast" role="status">
      <span class="toast-text">${escapeHtml(message)}</span>
      <button type="button" class="toast-btn" data-toast-undo>Undo</button>
      <button type="button" class="toast-close" data-toast-close aria-label="Dismiss">✕</button>
    </div>`;

  const dismiss = () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (els.toastHost) els.toastHost.innerHTML = '';
  };

  els.toastHost.querySelector('[data-toast-close]')?.addEventListener('click', dismiss);
  els.toastHost.querySelector('[data-toast-undo]')?.addEventListener('click', async () => {
    dismiss();
    if (onUndo) await onUndo();
  });

  toastTimer = setTimeout(dismiss, 9000);
}

/* Undo: put the previous snapshot's bookmarks back without clearing current ones. */
async function undoLast() {
  const [latest] = state.histories;
  if (!latest || state.busy) return;
  const ok = await askConfirm({
    title: 'Undo last change?',
    body: `<p>This re-adds the bookmarks from <strong>${escapeHtml(latest.label)}</strong> into a new “Bookbox Restored” folder. Nothing current is deleted.</p>`,
    okLabel: 'Undo'
  });
  if (!ok) return;
  await recreateFromItems(latest.items, `Bookbox Restored (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`);
  await scanBookmarks();
  showStatus('Change undone via a restored folder.', 'ok');
}



/* ---------- Trash + rebuild ---------- */

async function trashBookmarks(ids, reason) {
  const idSet = new Set(ids);
  const victims = state.bookmarks.filter((b) => idSet.has(b.id));
  for (const bm of victims) {
    state.trash.push({
      url: bm.url,
      title: bm.title,
      folderName: bm.folderName,
      dateAdded: bm.dateAdded,
      reason,
      deletedAt: Date.now(),
      tags: state.tagMap[tagKey(bm)] || [],
      note: state.notes[tagKey(bm)] || '',
      readLater: Boolean(state.readLater[tagKey(bm)])
    });
  }
  await persistTrash();
  state.trash = state.trash.slice(-500);
  return victims.length;
}

async function removeBookmarksById(ids) {
  if (IS_EXTENSION) {
    let removed = 0;
    for (const id of ids) {
      try {
        await chrome.bookmarks.remove(id);
        removed += 1;
      } catch {
        // may already be gone
      }
    }
    return removed;
  }
  const idSet = new Set(ids);
  const before = demoBookmarks.length;
  demoBookmarks = demoBookmarks.filter((b) => !idSet.has(b.id));
  return before - demoBookmarks.length;
}

async function moveToTrash(ids, reason) {
  await trashBookmarks(ids, reason);
  const removed = await removeBookmarksById(ids);
  await persistTrash();
  return removed;
}

async function recreateFromItems(items, rootTitle) {
  if (!IS_EXTENSION) {
    const restored = items.map((item, index) => ({
      id: `restored-${Date.now()}-${index}`,
      title: item.title,
      url: item.url,
      folderName: item.folderName || 'Restored',
      dateAdded: Date.now(),
      _demoContent: demoContent('', '', '')
    }));
    // Skip URLs we already have.
    const existing = new Set(demoBookmarks.map((b) => b.url));
    demoBookmarks = [...demoBookmarks, ...restored.filter((r) => !existing.has(r.url))];
    reapplyMetaForItems(items);
    return;
  }

  const parentId = await getDefaultParentId();
  const container = await chrome.bookmarks.create({ parentId: parentId || '1', title: rootTitle });
  const folderCache = new Map();

  for (const item of items) {
    if (!item.url) continue;
    let targetId = container.id;
    const pathParts = String(item.folderName || '').split(' / ').filter(Boolean);
    let currentPath = '';
    for (const part of pathParts) {
      currentPath = currentPath ? `${currentPath} / ${part}` : part;
      if (!folderCache.has(currentPath)) {
        try {
          const created = await chrome.bookmarks.create({ parentId: targetId, title: part });
          folderCache.set(currentPath, created.id);
        } catch {
          folderCache.set(currentPath, targetId);
        }
      }
      targetId = folderCache.get(currentPath);
    }
    try {
      await chrome.bookmarks.create({ parentId: targetId, title: item.title || item.url, url: item.url });
    } catch {
      // Skip individual invalid entries instead of aborting the whole restore
    }
  }
  reapplyMetaForItems(items);
}

function reapplyMetaForItems(items) {
  for (const item of items) {
    if (!item.url) continue;
    const key = tagKey({ url: item.url });
    if (Array.isArray(item.tags) && item.tags.length) state.tagMap[key] = item.tags;
    if (item.note) state.notes[key] = item.note;
    if (item.readLater) state.readLater[key] = true;
  }
  persistTags();
  persistNotes();
}

async function trashRestoreAll() {
  if (state.trash.length === 0) return;
  const items = [...state.trash];
  state.trash = [];
  await persistTrash();
  await recreateFromItems(items, `Bookbox Restored (${new Date().toLocaleDateString()})`);
  await scanBookmarks();
  showStatus(`Restored ${items.length} bookmark${items.length === 1 ? '' : 's'} from trash.`, 'ok');
}

async function trashEmpty() {
  if (state.trash.length === 0) return;
  const ok = await askConfirm({
    title: 'Empty trash permanently?',
    body: `<p>${state.trash.length} bookmark${state.trash.length === 1 ? '' : 's'} will be gone for good. This can’t be undone.</p>`,
    okLabel: 'Empty trash',
    danger: true
  });
  if (!ok) return;
  state.trash = [];
  await persistTrash();
  renderTrash();
  showStatus('Trash emptied.', 'ok');
}



/* ---------- Backup bar + history ---------- */

function describeBackup(backup) {
  const time = new Date(backup.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const count = (backup.items || []).length;
  return `Backup ready · ${backup.label} at ${time} · ${count} bookmark${count === 1 ? '' : 's'}`;
}

function renderBackupBar() {
  if (!els.backupBar) return;
  if (!state.backup) {
    els.backupBar.hidden = true;
  } else {
    els.backupBar.hidden = false;
    els.backupBarText.textContent = describeBackup(state.backup);
  }
  if (els.undoHistoryBtn) {
    els.undoHistoryBtn.hidden = state.histories.length === 0;
    els.undoHistoryBtn.textContent = 'Undo last';
  }
}

function renderHistory() {
  if (!els.historyList) return;
  if (state.histories.length === 0) {
    els.historyList.innerHTML = '<p class="empty-note">No actions recorded yet. Every cleanup and organize step lands here.</p>';
    return;
  }
  els.historyList.innerHTML = state.histories
    .map((h, index) => {
      const when = new Date(h.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(h.label)}</div>
          <div class="item-meta">${escapeHtml(when)} · ${h.items.length} bookmarks captured</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-restore-history="${index}">${index === 0 ? 'Undo' : 'Restore'}</button>
        </div>
      </div>`;
    })
    .join('');

  els.historyList.querySelectorAll('[data-restore-history]').forEach((btn) => {
    btn.addEventListener('click', () => restoreHistory(Number(btn.dataset.restoreHistory)));
  });
}

async function restoreHistory(index) {
  const snapshot = state.histories[index];
  if (!snapshot || state.busy) return;
  const ok = await askConfirm({
    title: 'Restore this snapshot?',
    body: `<p><strong>${escapeHtml(snapshot.label)}</strong> — ${snapshot.items.length} bookmarks will be re-added in a new folder. Current bookmarks stay where they are.</p>`,
    okLabel: 'Restore'
  });
  if (!ok) return;
  state.busy = true;
  try {
    await recreateFromItems(snapshot.items, `Bookbox Restored (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`);
    await scanBookmarks();
    showStatus('Snapshot restored into a new folder.', 'ok');
  } catch (err) {
    showStatus(`Restore failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
  }
}



/* ---------- Tags ---------- */

let tagDialogBookmark = null;

function tagsFor(bookmark) {
  return state.tagMap[tagKey(bookmark)] || [];
}

function setTagsFor(bookmark, tags) {
  const key = tagKey(bookmark);
  const clean = Array.from(
    new Set(
      tags
        .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean)
    )
  ).slice(0, 16);
  if (clean.length === 0) delete state.tagMap[key];
  else state.tagMap[key] = clean;
}

function noteFor(bookmark) {
  return state.notes[tagKey(bookmark)] || '';
}

function isReadLater(bookmark) {
  return Boolean(state.readLater[tagKey(bookmark)]);
}

async function toggleReadLater(bookmark) {
  const key = tagKey(bookmark);
  if (state.readLater[key]) delete state.readLater[key];
  else state.readLater[key] = true;
  await persistNotes();
  renderAll();
  showStatus(state.readLater[key] ? 'Added to read later.' : 'Removed from read later.', 'ok');
}

function renderTagBar() {
  const all = collectTags(state.tagMap);
  if (!els.tagBar) return;
  if (all.length === 0) {
    els.tagBar.innerHTML = '<span class="field-help" style="margin:0;">No tags yet. Use the # button on any bookmark.</span>';
    return;
  }
  // Collapse child tags into their parent so the bar stays short.
  const parents = new Set(all.map((t) => t.split('/')[0]));
  els.tagBar.innerHTML = [...parents]
    .sort()
    .map(
      (tag) => `
      <button type="button" class="chip-btn ${state.activeTags.includes(tag) ? 'is-active' : ''}" data-tag="${escapeHtml(tag)}">
        #${escapeHtml(tag)}
      </button>`
    )
    .join('');

  els.tagBar.querySelectorAll('[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      state.activeTags = state.activeTags.includes(tag)
        ? state.activeTags.filter((t) => t !== tag)
        : [...state.activeTags, tag];
      state.search.tags = state.activeTags;
      renderTagBar();
      renderSearch();
    });
  });
}

// Renders the checkbox list; the filter box narrows it without losing ticks.
function renderTagDialogList(filter = '') {
  const known = collectTags(state.tagMap);
  // Newly typed tags aren't persisted yet, so fold them into the visible set.
  const carried = new Set(state.tagDialogHiddenTicks || []);
  const all = [...new Set([...known, ...carried])].sort();
  const needle = filter.trim().toLowerCase();
  const shown = needle ? all.filter((tag) => tag.toLowerCase().includes(needle)) : all;

  const visible = els.tagDialogList
    ? [...els.tagDialogList.querySelectorAll('input[type="checkbox"]')]
    : [];
  const wasCheckedVisible = new Set(visible.filter((i) => i.checked).map((i) => i.value));
  const wasUncheckedVisible = new Set(visible.filter((i) => !i.checked).map((i) => i.value));

  // Ticks for rows that are about to disappear behind a filter.
  const carriedNow = new Set(carried);
  for (const tag of wasCheckedVisible) carriedNow.add(tag);
  for (const tag of wasUncheckedVisible) carriedNow.delete(tag);
  state.tagDialogHiddenTicks = [...carriedNow];

  const current = new Set(tagDialogBookmark ? tagsFor(tagDialogBookmark) : []);
  for (const tag of carriedNow) current.add(tag);

  els.tagDialogList.innerHTML = shown.length
    ? shown
        .map(
          (tag) => `
          <label class="check-row">
            <input type="checkbox" value="${attr(tag)}" ${current.has(tag) ? 'checked' : ''} />
            <span>#${escapeHtml(tag)}</span>
          </label>`
        )
        .join('')
    : `<p class="empty-note">${needle ? 'No tag matches that filter.' : 'No tags yet — create the first one below.'}</p>`;

  if (els.tagSuggestions) {
    els.tagSuggestions.innerHTML = all.map((tag) => `<option value="${attr(tag)}"></option>`).join('');
  }
}

function openTagDialog(bookmark) {
  if (!els.tagDialog) return;
  tagDialogBookmark = bookmark;
  els.tagDialogTitle.textContent = `Tags for “${bookmark.title.slice(0, 46)}”`;
  state.tagDialogHiddenTicks = [...tagsFor(bookmark)];
  if (els.tagDialogFilter) els.tagDialogFilter.value = '';
  els.tagDialogList.innerHTML = '';
  renderTagDialogList('');
  els.tagDialogInput.value = '';
  openModal(els.tagDialog, { initialFocus: '#tag-dialog-filter', onClose: closeTagDialog });
}

function closeTagDialog() {
  closeModal(els.tagDialog);
  tagDialogBookmark = null;
  state.tagDialogHiddenTicks = [];
}

// Selections hidden by the filter must survive a save, so merge instead of replacing.
function selectedTagValues() {
  const visible = [...els.tagDialogList.querySelectorAll('input[type="checkbox"]')];
  const hiddenChecked = [...(state.tagDialogHiddenTicks || [])];
  const checkedVisible = visible.filter((i) => i.checked).map((i) => i.value);
  const uncheckedVisible = new Set(visible.filter((i) => !i.checked).map((i) => i.value));
  return [...new Set([...checkedVisible, ...hiddenChecked.filter((t) => !uncheckedVisible.has(t))])];
}

async function saveTagDialog() {
  if (!tagDialogBookmark) return;
  setTagsFor(tagDialogBookmark, selectedTagValues());
  await persistTags();
  closeTagDialog();
  renderAll();
  showStatus('Tags saved.', 'ok');
}

async function createTagFromDialog() {
  const value = els.tagDialogInput.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!value || !tagDialogBookmark) return;

  // Add to the working set rather than persisting immediately, so the dialog
  // (and its filter) stays exactly where it was.
  state.tagDialogHiddenTicks = [...new Set([...(state.tagDialogHiddenTicks || []), value])];
  els.tagDialogInput.value = '';
  if (els.tagDialogFilter && els.tagDialogFilter.value) {
    // A brand-new tag may not match the filter; clear it so the new row is visible.
    els.tagDialogFilter.value = '';
  }
  renderTagDialogList('');
  if (els.tagDialogInput) els.tagDialogInput.focus();
}

/* Tag management: rename, merge, bulk reapply */

function renderTagManage() {
  const all = collectTags(state.tagMap);
  if (els.tagCountPill) els.tagCountPill.textContent = `${all.length} tag${all.length === 1 ? '' : 's'}`;
  if (!els.tagManageList) return;

  if (all.length === 0) {
    els.tagManageList.innerHTML = '<p class="empty-note">No tags yet.</p>';
    return;
  }

  const tree = tagTree(all);
  els.tagManageList.innerHTML = [...tree.entries()]
    .map(([parent, children]) => {
      // Count the whole family, matching how a `frontend` filter catches frontend/css.
      const family = [parent, ...children.map((c) => c.full)];
      const count = Object.values(state.tagMap).filter((list) =>
        (list || []).some((t) => family.includes(t))
      ).length;
      const childRows = children
        .map((child) => {
          const childCount = Object.values(state.tagMap).filter((list) => (list || []).includes(child.full)).length;
          return `
          <div class="item-row tag-child-row">
            <div class="item-body">
              <div class="item-title">#${escapeHtml(child.full)}</div>
              <div class="item-meta">${childCount} bookmark${childCount === 1 ? '' : 's'}</div>
            </div>
            <div class="row-actions">
              <button type="button" class="btn-inline" data-rename-tag="${escapeHtml(child.full)}">Rename</button>
              <button type="button" class="btn-inline" data-merge-tag="${escapeHtml(child.full)}">Merge</button>
            </div>
          </div>`;
        })
        .join('');
      return `
      <div class="item-row tag-root-row" draggable="true" data-tag-drag="${escapeHtml(parent)}">
        <div class="item-body">
          <div class="item-title">#${escapeHtml(parent)}</div>
          <div class="item-meta">${count} bookmark${count === 1 ? '' : 's'}${children.length ? ` · ${children.length} nested` : ''}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-rename-tag="${escapeHtml(parent)}">Rename</button>
          <button type="button" class="btn-inline" data-merge-tag="${escapeHtml(parent)}">Merge</button>
        </div>
      </div>
      ${childRows}`;
    })
    .join('');

  // Dragging one tag onto another nests it as a sub-tag.
  els.tagManageList.querySelectorAll('[data-tag-drag]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/tag', row.dataset.tagDrag);
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('is-drop-target');
      const dragged = e.dataTransfer.getData('text/tag');
      const target = row.dataset.tagDrag;
      if (!dragged || !target || dragged === target || dragged.startsWith(`${target}/`)) return;
      state.tagMap = renameTag(state.tagMap, dragged, `${target}/${dragged.split('/').pop()}`);
      await persistTags();
      renderAll();
      showStatus(`Nested #${dragged} under #${target}.`, 'ok');
    });
  });

  els.tagManageList.querySelectorAll('[data-rename-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const from = btn.dataset.renameTag;
      const to = await askText({ title: `Rename #${from}`, value: from, okLabel: 'Rename' });
      if (!to || to === from) return;
      state.tagMap = renameTag(state.tagMap, from, to);
      if (state.activeTags.includes(from)) state.activeTags = state.activeTags.map((t) => (t === from ? to : t));
      await persistTags();
      renderAll();
      showStatus(`Renamed #${from} to #${to}.`, 'ok');
    });
  });

  els.tagManageList.querySelectorAll('[data-merge-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const from = btn.dataset.mergeTag;
      const into = await askText({
        title: `Merge #${from} into…`,
        help: 'Type the tag that should keep the bookmarks. You will see a preview before anything changes.',
        okLabel: 'Preview merge'
      });
      if (!into || into === from) return;
      await previewTagMerge(from, into);
      els.tagMergePreview?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
}

/* ---------- Themed prompt (window.prompt closes extension popups) ---------- */

let promptResolver = null;

function askText({ title, help = '', value = '', okLabel = 'Save' }) {
  if (!els.promptDialog) return Promise.resolve(null);
  els.promptTitle.textContent = title;
  els.promptHelp.textContent = help;
  els.promptHelp.hidden = !help;
  els.promptInput.value = value;
  els.promptOk.textContent = okLabel;

  return new Promise((resolve) => {
    const settle = (result) => {
      promptResolver = null;
      closeModal(els.promptDialog);
      resolve(result);
    };
    promptResolver = settle;
    openModal(els.promptDialog, { initialFocus: '#prompt-input', onClose: () => settle(null) });
    setTimeout(() => {
      els.promptInput.focus();
      els.promptInput.select();
    }, 20);
  });
}

function settlePrompt(value) {
  if (promptResolver) promptResolver(value);
}

/* ---------- First-run tour + shortcuts ---------- */

const TOUR_STEPS = [
  {
    title: 'Browse is home',
    body: 'Every visit starts here. Search titles, page text, notes, and tags at once, then sort and filter without leaving the list.'
  },
  {
    title: 'Organize makes the plan',
    body: 'Smart Local sorts using real page content with no key. You always see a preview of every move before anything changes, and can untick items you disagree with.'
  },
  {
    title: 'Cleanup is separate',
    body: 'Duplicates, dead links, and stale saves each have their own section. Nothing is deleted instantly — it goes to a 30-day trash you can restore from.'
  },
  {
    title: 'Rules beat everything',
    body: 'A rule like “site is github.com → Development / Repos” always wins over sorting. Add rules on the Library tab, and check which rule wins with the tester.'
  },
  {
    title: 'Your data stays yours',
    body: 'Everything is stored in your browser. A backup is saved before each change, and you can export to HTML, JSON, Markdown, or CSV any time.'
  }
];

let tourIndex = 0;

function renderTour() {
  const step = TOUR_STEPS[tourIndex];
  if (!els.tourBody) return;
  els.tourBody.innerHTML = `
    <p class="tour-count">${tourIndex + 1} of ${TOUR_STEPS.length}</p>
    <p>${escapeHtml(step.body)}</p>`;
  if (els.tourTitle) els.tourTitle.textContent = step.title;
  if (els.tourNext) els.tourNext.textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Start using it' : 'Next';
}

async function finishTour() {
  state.settings = { ...state.settings, tourDone: true };
  await persistSettings();
  closeModal(els.tourDialog);
}

function openTour() {
  if (!els.tourDialog) return;
  tourIndex = 0;
  renderTour();
  // Dismissing with Escape or a backdrop click counts as having seen it, so the
  // tour cannot come back on every single open.
  openModal(els.tourDialog, {
    initialFocus: '#tour-next',
    onClose: () => {
      if (!state.settings.tourDone) finishTour();
    }
  });
}

/* ---------- Reader + annotations ---------- */

let readerBookmark = null;

function bookmarkText(bm) {
  const content = bm.content || state.contentCache.get(bm.id) || null;
  return {
    text: state.indexTextCache.get(bm.id) || content?.text || bm._demoContent?.text || '',
    description: content?.description || bm._demoContent?.description || '',
    headings: content?.headings || bm._demoContent?.headings || ''
  };
}

function estimateReadTime(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!words) return '';
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

function annotationsFor(bm) {
  return state.annotations[tagKey(bm)] || [];
}

async function saveAnnotation(bm, value, type = 'note') {
  const key = tagKey(bm);
  const list = state.annotations[key] || [];
  list.push({ id: `a-${Date.now()}`, text: String(value).trim().slice(0, 600), type, at: Date.now() });
  state.annotations[key] = list;
  await persistAnnotations();
}

function openReader(bm) {
  if (!els.readerDialog || !bm) return;
  readerBookmark = bm;
  els.readerTitle.textContent = bm.title;
  const { text, description, headings } = bookmarkText(bm);
  const minutes = estimateReadTime(text);
  els.readerMeta.textContent = [getDomain(bm.url), minutes, description].filter(Boolean).join(' · ');
  els.readerText.textContent = text;
  els.readerEmpty.hidden = Boolean(text);
  els.readerText.hidden = !text;

  // A short summary is useful even with no key, so it is always the local one.
  const summary = localSummary(bm);
  if (els.readerSummary) {
    els.readerSummary.hidden = !summary;
    els.readerSummary.textContent = summary ? `Summary: ${summary}` : '';
  }

  setReaderTab('text');
  renderAnnotations();

  openModal(els.readerDialog, { initialFocus: '#reader-close', onClose: () => { readerBookmark = null; } });
}

function setReaderTab(tab) {
  els.readerDialog.querySelectorAll('[data-reader-tab]').forEach((btn) => {
    const active = btn.dataset.readerTab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  if (els.readerTextPanel) els.readerTextPanel.hidden = tab !== 'text';
  if (els.readerAnnotatePanel) els.readerAnnotatePanel.hidden = tab !== 'annotate';
}

function renderAnnotations() {
  if (!els.annotationList || !readerBookmark) return;
  const list = annotationsFor(readerBookmark);
  if (list.length === 0) {
    els.annotationList.innerHTML = '<p class="empty-note">No annotations yet.</p>';
    return;
  }
  els.annotationList.innerHTML = list
    .map(
      (item, index) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-meta">${item.type === 'highlight' ? 'highlight' : 'annotation'} · ${new Date(item.at).toLocaleDateString()}</div>
          <div class="item-title">${escapeHtml(item.text)}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="tag-btn" data-annotation-remove="${index}" title="Remove" aria-label="Remove annotation">✕</button>
        </div>
      </div>`
    )
    .join('');

  els.annotationList.querySelectorAll('[data-annotation-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = tagKey(readerBookmark);
      state.annotations[key].splice(Number(btn.dataset.annotationRemove), 1);
      await persistAnnotations();
      renderAnnotations();
    });
  });
}

function selectedReaderText() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  const anchor = sel.anchorNode;
  if (!els.readerText.contains(anchor)) return '';
  return String(sel.toString()).trim().slice(0, 600);
}

/* ---------- AI features ---------- */

// Shared guard: every AI action goes through here so behaviour is consistent.
function aiReady() {
  if (!hasKey(state.settings)) return false;
  return true;
}

// Semantic results are cached per query so a re-render does not re-embed.
const semanticCache = new Map();

// Called by renderSearch. Returns cached rows immediately, or null and fills the
// cache in the background so the next render picks them up.
function semanticOverride(query) {
  if (!state.semanticOn || !query || query.length < 3) return null;
  const key = query.trim().toLowerCase();
  if (semanticCache.has(key)) return semanticCache.get(key);
  if (semanticCache.has(`pending:${key}`)) return null;
  semanticCache.set(`pending:${key}`, true);
  semanticResults(query)
    .then((rows) => {
      semanticCache.delete(`pending:${key}`);
      if (rows && rows.length) {
        semanticCache.set(key, rows);
        // Only re-render if the query is still the same one.
        if ((state.search.query || '').trim().toLowerCase() === key) renderSearch();
      }
    })
    .catch(() => semanticCache.delete(`pending:${key}`));
  return null;
}

function aiUnavailableMessage(err) {
  showStatus(`AI unavailable (${err.message || 'unknown error'}).`, 'error');
}

// #1 Reader summary written by the model, replacing the extractive one.
async function aiReaderSummary() {
  if (!aiReady() || !readerBookmark) return;
  const bm = readerBookmark;
  const text = String(bm.content?.text || bm.indexText || '').slice(0, 3500);
  if (!text) {
    showStatus('No page text saved for this bookmark yet.', 'info');
    return;
  }
  if (els.readerAiSummaryBtn) {
    els.readerAiSummaryBtn.disabled = true;
    els.readerAiSummaryBtn.textContent = 'Writing…';
  }
  try {
    const summary = await requestModel({
      settings: state.settings,
      system: PROMPTS.summary,
      user: `Title: ${bm.title}\nAddress: ${bm.url}\n\nPage text:\n${text}`,
      maxOutputTokens: 160
    });
    if (els.readerSummary) {
      els.readerSummary.hidden = false;
      els.readerSummary.textContent = `Summary: ${String(summary || '').trim()}`;
    }
    showStatus('Summary written by AI.', 'ok');
  } catch (err) {
    aiUnavailableMessage(err);
  } finally {
    if (els.readerAiSummaryBtn) {
      els.readerAiSummaryBtn.disabled = false;
      els.readerAiSummaryBtn.textContent = 'Write an AI summary';
    }
  }
}

// #2 Tag suggestions constrained to the tags the user already uses.
async function aiSuggestTags() {
  if (!els.tagAiList) return;
  const vocabulary = tagVocabulary(state.tagMap);
  if (vocabulary.length < 3) {
    showStatus('Add a few tags first — AI suggestions pick from your own vocabulary.', 'info');
    return;
  }
  const untagged = state.bookmarks.filter((bm) => tagsFor(bm).length === 0).slice(0, 20);
  if (untagged.length === 0) {
    showStatus('Every bookmark already has a tag.', 'info');
    return;
  }
  els.tagAiList.hidden = false;
  els.tagAiList.innerHTML = '<p class="empty-note">Asking the model…</p>';
  try {
    const raw = await requestJson({
      settings: state.settings,
      system: PROMPTS.tags,
      user: `Allowed tags: ${vocabulary.join(', ')}\n\nBookmarks:\n${untagged
        .map((bm) => `- id=${bm.id} — ${bm.title} (${getDomain(bm.url)}) — ${String(bm.content?.text || bm.indexText || '').slice(0, 160)}`)
        .join('\n')}`,
      maxOutputTokens: 600
    });
    const picks = sanitizeTagAssignments(raw, untagged.map((bm) => bm.id), vocabulary);
    renderAiTagSuggestions(picks, untagged);
  } catch (err) {
    els.tagAiList.innerHTML = '<p class="empty-note">Could not get suggestions. Try again in a moment.</p>';
    aiUnavailableMessage(err);
  }
}

function renderAiTagSuggestions(picks, bookmarks) {
  const rows = Object.entries(picks);
  if (rows.length === 0) {
    els.tagAiList.innerHTML = '<p class="empty-note">The model had no confident tag for these pages.</p>';
    return;
  }
  els.tagAiList.innerHTML = rows
    .map(([id, tags]) => {
      const bm = bookmarks.find((b) => b.id === id);
      if (!bm) return '';
      return `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(bm.title.slice(0, 70))}</div>
          <div class="item-meta">${tags.map((t) => `#${escapeHtml(t)}`).join(' ')}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-accept-ai-tag="${attr(id)}" data-tags="${attr(tags.join('|'))}">Accept</button>
        </div>
      </div>`;
    })
    .join('');

  els.tagAiList.querySelectorAll('[data-accept-ai-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.acceptAiTag);
      if (!bm) return;
      const key = tagKey(bm);
      const incoming = btn.dataset.tags.split('|').filter(Boolean);
      state.tagMap[key] = [...new Set([...(state.tagMap[key] || []), ...incoming])];
      await persistTags();
      renderAll();
      btn.closest('.item-row')?.remove();
      showStatus(`Tagged with ${incoming.map((t) => `#${t}`).join(' ')}.`, 'ok');
    });
  });
}

// #3 Tag consolidation: propose merges, show a diff, apply only on confirm.
let pendingMergePlan = null;

async function aiConsolidateTags() {
  const vocabulary = tagVocabulary(state.tagMap);
  if (vocabulary.length < 4) {
    showStatus('You need a few more tags before consolidating.', 'info');
    return;
  }
  if (!els.tagConsolidatePreview) return;
  els.tagConsolidatePreview.hidden = false;
  els.tagConsolidatePreview.innerHTML = '<p class="merge-tally">Looking for duplicate tags…</p>';
  try {
    const raw = await requestJson({
      settings: state.settings,
      system: PROMPTS.consolidate,
      user: `Tags in use:\n${vocabulary.join(', ')}`,
      maxOutputTokens: 500
    });
    const plan = buildMergePlan(raw, vocabulary);
    if (plan.length === 0) {
      els.tagConsolidatePreview.innerHTML = '<p class="merge-tally">No duplicate tags found — your tag list is already tidy.</p>';
      return;
    }
    pendingMergePlan = plan;
    const affected = plan.reduce(
      (sum, row) => sum + state.bookmarks.filter((bm) => (state.tagMap[tagKey(bm)] || []).some((t) => row.from.includes(t))).length,
      0
    );
    els.tagConsolidatePreview.innerHTML = `
      ${plan
        .map(
          (row) => `
        <div class="merge-row">
          <span>${row.from.map((t) => `#${escapeHtml(t)}`).join(', ')}</span>
          <span class="merge-arrow">→</span>
          <strong>#${escapeHtml(row.to)}</strong>
          <span class="merge-reason">${escapeHtml(row.reason)}</span>
        </div>`
        )
        .join('')}
      <p class="merge-tally">${affected} bookmark${affected === 1 ? '' : 's'} affected across ${plan.length} merge${plan.length === 1 ? '' : 's'}.</p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="merge-cancel-btn">Cancel</button>
        <button type="button" class="btn-primary" id="merge-apply-btn">Apply these merges</button>
      </div>`;
    els.tagConsolidatePreview.querySelector('#merge-cancel-btn').addEventListener('click', () => {
      pendingMergePlan = null;
      els.tagConsolidatePreview.hidden = true;
      els.tagConsolidatePreview.innerHTML = '';
    });
    els.tagConsolidatePreview.querySelector('#merge-apply-btn').addEventListener('click', applyPendingMerges);
  } catch (err) {
    els.tagConsolidatePreview.innerHTML = '<p class="merge-tally">Could not check your tags. Try again in a moment.</p>';
    aiUnavailableMessage(err);
  }
}

async function applyPendingMerges() {
  if (!pendingMergePlan) return;
  await pushSnapshot('Before consolidating tags');
  state.tagMap = applyMergePlan(state.tagMap, pendingMergePlan);
  const count = pendingMergePlan.length;
  pendingMergePlan = null;
  await persistTags();
  if (els.tagConsolidatePreview) {
    els.tagConsolidatePreview.hidden = true;
    els.tagConsolidatePreview.innerHTML = '';
  }
  renderAll();
  showStatus(`Merged ${count} group${count === 1 ? '' : 's'} of duplicate tags. Backup saved first.`, 'ok');
}

// #4 Semantic search: embed the library once, then rank by meaning.
const semanticStore = { vectors: new Map(), model: '' };

async function ensureEmbeddings({ progress } = {}) {
  const model = `${state.settings.provider}`;
  if (semanticStore.model !== model) {
    semanticStore.vectors.clear();
    semanticStore.model = model;
  }
  const targets = state.bookmarks.filter((bm) => bookmarkText(bm).text);
  const missing = targets.filter((bm) => !semanticStore.vectors.has(bm.id));
  if (missing.length === 0) return semanticStore.vectors.size;

  const batchSize = 16;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    if (progress) progress(`${Math.min(i + batch.length, missing.length)} / ${missing.length}`);
    const vectors = await requestEmbeddings({
      settings: state.settings,
      texts: batch.map((bm) => embeddingText(bm))
    });
    batch.forEach((bm, index) => {
      if (vectors[index]) semanticStore.vectors.set(bm.id, vectors[index]);
    });
  }
  return semanticStore.vectors.size;
}

async function toggleSemanticSearch() {
  if (!aiReady() || !els.semanticToggle) return;
  const turningOn = els.semanticToggle.getAttribute('aria-pressed') !== 'true';
  if (!turningOn) {
    state.semanticOn = false;
    els.semanticToggle.setAttribute('aria-pressed', 'false');
    renderSearch();
    return;
  }
  if (!supportsEmbeddings(state.settings.provider)) {
    showStatus(`${PROVIDER_LABELS[state.settings.provider] || 'This provider'} has no embedding model set up. Try Gemini for meaning search.`, 'info');
    return;
  }
  els.semanticToggle.classList.add('is-busy');
  els.semanticToggle.textContent = 'Preparing…';
  try {
    const total = await ensureEmbeddings({
      progress: (step) => {
        if (els.semanticToggle) els.semanticToggle.textContent = `Embedding ${step}`;
      }
    });
    state.semanticOn = true;
    els.semanticToggle.setAttribute('aria-pressed', 'true');
    showStatus(`Meaning search is on — ${total} pages embedded. Searches now match by meaning.`, 'ok');
    renderSearch();
  } catch (err) {
    state.semanticOn = false;
    els.semanticToggle.setAttribute('aria-pressed', 'false');
    aiUnavailableMessage(err);
  } finally {
    els.semanticToggle.classList.remove('is-busy');
    els.semanticToggle.textContent = 'Meaning search';
  }
}

// Runs when Meaning search is on and the user types something.
async function semanticResults(query) {
  const text = String(query || '').trim();
  if (!text || !state.semanticOn) return null;
  try {
    await ensureEmbeddings();
    const [queryVector] = await requestEmbeddings({ settings: state.settings, texts: [text] });
    if (!queryVector) return null;
    const items = state.bookmarks
      .filter((bm) => semanticStore.vectors.has(bm.id))
      .map((bm) => ({ bookmark: bm, vector: semanticStore.vectors.get(bm.id) }));
    return rankByVector(queryVector, items, { limit: state.browseLimit || 40 });
  } catch {
    // A failed embedding must fall back to normal search silently.
    return null;
  }
}

// #5 Citations in the answer, plus a follow-up question.
async function renderAskWithCitations(question, answerText, hits) {
  if (!els.askAnswer) return;
  const citations = hits.slice(0, 3).map((bm) => ({
    bookmark: bm,
    quote: pickCitation(bm.content?.text || bm.indexText || '', question)
  })).filter((row) => row.quote);

  els.askAnswer.innerHTML = `
    <p>${escapeHtml(answerText || 'No answer.')}</p>
    ${citations
      .map(
        (row) => `
      <blockquote class="citation">“${escapeHtml(row.quote)}”
        <cite>${escapeHtml(row.bookmark.title.slice(0, 60))}</cite>
      </blockquote>`
      )
      .join('')}
    ${
      hits.length
        ? `<div class="tag-row">${hits
            .map((bm) => `<button type="button" class="mini-tag" data-ask-open="${attr(bm.id)}">${escapeHtml(bm.title.slice(0, 40))}</button>`)
            .join('')}</div>`
        : ''
    }`;
  els.askAnswer.querySelectorAll('[data-ask-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.askOpen);
      if (bm) openReader(bm);
    });
  });
  if (els.askFollowupRow) els.askFollowupRow.hidden = !hasKey(state.settings);
}

// #6 AI tie-breaker for near-duplicates that local rules cannot settle.
async function aiJudgeNearDuplicates() {
  if (!aiReady() || !els.nearAiResult) return;
  const pairs = uncertainPairs(state.nearDuplicates, { maxPairs: 6 });
  if (pairs.length === 0) {
    showStatus('No near-duplicates to judge right now.', 'info');
    return;
  }
  els.nearAiResult.hidden = false;
  els.nearAiResult.innerHTML = '<p class="empty-note">Asking the model about each pair…</p>';
  const rows = [];
  for (const pair of pairs) {
    try {
      const raw = await requestJson({
        settings: state.settings,
        system: PROMPTS.duplicatePair,
        user: `Pair A: ${pair.keep.title} — ${pair.keep.url}\nPair B: ${pair.other.title} — ${pair.other.url}\nLocal signal: ${pair.localReason}`,
        maxOutputTokens: 200
      });
      const same = String(raw?.verdict || '').toLowerCase() === 'same';
      rows.push({ pair, same, reason: String(raw?.reason || '').slice(0, 160) });
    } catch (err) {
      aiUnavailableMessage(err);
      break;
    }
  }
  if (rows.length === 0) {
    els.nearAiResult.hidden = true;
    return;
  }
  els.nearAiResult.innerHTML = rows
    .map(
      ({ pair, same, reason }) => `
    <div class="item-row">
      <div class="item-body">
        <div class="item-title">${escapeHtml(pair.keep.title.slice(0, 50))} <span class="merge-arrow">vs</span> ${escapeHtml(pair.other.title.slice(0, 50))}</div>
        <div class="item-meta">${escapeHtml(reason || 'No reason given.')}</div>
      </div>
      <div class="row-actions">
        <span class="verdict-tag ${same ? 'is-same' : 'is-different'}">${same ? 'same page' : 'different'}</span>
        ${same ? `<button type="button" class="btn-inline" data-ai-merge="${attr(pair.other.id)}">Merge</button>` : ''}
      </div>
    </div>`
    )
    .join('');

  els.nearAiResult.querySelectorAll('[data-ai-merge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.aiMerge;
      if (els.nearList) {
        const box = els.nearList.querySelector(`[data-near="${id}"]`);
        if (box) {
          box.checked = true;
          box.dispatchEvent(new Event('change', { bubbles: true }));
          showStatus('Selected below — use “Remove selected near-duplicates” to merge it.', 'info');
        }
      }
    });
  });
}

// #7 Rename folders the model thinks are vague, based on what is inside them.
async function aiNameFolders() {
  if (!aiReady() || !els.folderAiResult) return;
  const byFolder = new Map();
  for (const bm of state.bookmarks) {
    const name = bm.folderName || 'Unsorted';
    if (!byFolder.has(name)) byFolder.set(name, []);
    byFolder.get(name).push(bm);
  }
  // Only folders whose names say nothing about their contents.
  const vague = /^(misc|unsorted|other|general|reading|stuff|random|imported)$/i;
  const candidates = [...byFolder.entries()]
    .filter(([name]) => vague.test(name.split(' / ').pop().trim()))
    .slice(0, 5);

  if (candidates.length === 0) {
    showStatus('No vaguely named folders found. Rename one to something like “Misc” and try again.', 'info');
    return;
  }
  els.folderAiResult.hidden = false;
  els.folderAiResult.innerHTML = '<p class="empty-note">Naming folders from their contents…</p>';
  const rows = [];
  for (const [name, items] of candidates) {
    try {
      const raw = await requestJson({
        settings: state.settings,
        system: PROMPTS.folderName,
        user: `Current name: ${name}\nBookmarks inside:\n${describeFolder(items)}`,
        maxOutputTokens: 200
      });
      const proposed = String(raw?.name || '').trim();
      if (proposed && proposed !== name && proposed.split(' / ').length <= 2) {
        rows.push({ from: name, to: proposed, reason: String(raw?.reason || '').slice(0, 120), count: items.length });
      }
    } catch (err) {
      aiUnavailableMessage(err);
      break;
    }
  }
  if (rows.length === 0) {
    els.folderAiResult.innerHTML = '<p class="empty-note">No better names suggested.</p>';
    return;
  }
  els.folderAiResult.innerHTML = rows
    .map(
      (row) => `
    <div class="item-row">
      <div class="item-body">
        <div class="item-title">${escapeHtml(row.from)} <span class="merge-arrow">→</span> ${escapeHtml(row.to)}</div>
        <div class="item-meta">${row.count} bookmark${row.count === 1 ? '' : 's'} · ${escapeHtml(row.reason)}</div>
      </div>
      <div class="row-actions">
        <button type="button" class="btn-inline" data-folder-rename="${attr(row.from)}" data-folder-to="${attr(row.to)}">Rename</button>
      </div>
    </div>`
    )
    .join('');

  els.folderAiResult.querySelectorAll('[data-folder-rename]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const from = btn.dataset.folderRename;
      const to = btn.dataset.folderTo;
      await pushSnapshot(`Before renaming ${from}`);
      try {
        await renameFolderToPath(from, to);
        await scanBookmarks();
        renderAll();
        els.folderAiResult.hidden = true;
        showStatus(`Renamed “${from}” to “${to}”.`, 'ok');
      } catch (err) {
        reportError('Could not rename the folder', err);
      }
    });
  });
}

// Renames a folder to a two-level "Parent / Subfolder" path. In a real browser
// that means renaming the folder node and, when the parent changes, moving it
// under a matching parent folder — retitling the bookmarks inside would leave
// the folder itself untouched.
async function renameFolderToPath(fromPath, toPath) {
  const parts = toPath.split(' / ').map((p) => p.trim()).filter(Boolean);
  const leaf = parts[parts.length - 1];
  const parentName = parts.length > 1 ? parts[0] : '';

  if (!IS_EXTENSION) {
    // Demo library: rewrite the path on bookmarks, including any subfolders.
    demoBookmarks = demoBookmarks.map((bm) => {
      const full = bm.folderName || 'Unsorted';
      if (full !== fromPath && !full.startsWith(`${fromPath} / `)) return bm;
      const rest = full.slice(fromPath.length);
      return { ...bm, folderName: `${toPath}${rest}` };
    });
    return;
  }

  const tree = await chrome.bookmarks.getTree();
  const node = findFolderNode(tree, fromPath);
  if (!node) throw new Error('That folder no longer exists.');
  if (node.id === '0') throw new Error('That folder cannot be renamed.');

  await chrome.bookmarks.update(node.id, { title: leaf });

  if (parentName) {
    const parentNode = findFolderNode(tree, parentName);
    const parentId = parentNode ? parentNode.id : (await chrome.bookmarks.create({ title: parentName })).id;
    if (parentId && parentId !== node.parentId) {
      await chrome.bookmarks.move(node.id, { parentId });
    }
  }
}

// #8 A plain-language reason for the current stale batch.
async function aiExplainStale() {
  if (!aiReady() || !els.staleAiResult) return;
  if (state.staleLinks.length === 0) {
    showStatus('Run a stale check first.', 'info');
    return;
  }
  els.staleAiResult.hidden = false;
  els.staleAiResult.innerHTML = '<p class="field-help">Reading the stale list…</p>';
  try {
    const raw = await requestJson({
      settings: state.settings,
      system: PROMPTS.stale,
      user: `Threshold: ${els.staleSelect ? els.staleSelect.value : 'unknown'}\nStale bookmarks:\n${describeStale(state.staleLinks)}`,
      maxOutputTokens: 260
    });
    const verdict = String(raw?.verdict || '').toLowerCase() === 'archive' ? 'Safe to archive' : 'Worth keeping';
    els.staleAiResult.innerHTML = `
      <p><strong>${escapeHtml(verdict)}.</strong> ${escapeHtml(String(raw?.reason || 'No reason given.'))}</p>
      <p class="field-help">${state.staleLinks.length} bookmark${state.staleLinks.length === 1 ? '' : 's'} in this batch.</p>`;
  } catch (err) {
    els.staleAiResult.hidden = true;
    aiUnavailableMessage(err);
  }
}

// #9 File a newly saved bookmark using the model's suggestion.
async function suggestFilingFor(item) {
  if (!aiReady() || !state.settings.fileOnSave) return null;
  const vocabulary = tagVocabulary(state.tagMap);
  try {
    const raw = await requestJson({
      settings: state.settings,
      system: PROMPTS.save,
      user: `Title: ${item.title}\nAddress: ${item.url}\nAllowed tags: ${vocabulary.slice(0, 80).join(', ') || '(none yet)'}\nExisting folders: ${[...new Set(state.bookmarks.map((b) => b.folderName).filter(Boolean))].slice(0, 40).join(' | ')}`,
      maxOutputTokens: 200
    });
    const tag = vocabulary.find((t) => t.toLowerCase() === String(raw?.tag || '').toLowerCase().trim()) || '';
    const folder = String(raw?.folder || '').trim();
    return { tag, folder: folder && folder.split(' / ').length <= 2 ? folder : '' };
  } catch {
    return null;
  }
}

// #10 Turn a sentence into a rule and show it as a draft first.
async function aiRuleFromSentence() {
  if (!aiReady() || !els.ruleAiInput) return;
  const sentence = els.ruleAiInput.value.trim();
  if (!sentence) return;
  if (els.ruleAiBtn) {
    els.ruleAiBtn.disabled = true;
    els.ruleAiBtn.textContent = 'Working…';
  }
  try {
    const raw = await requestJson({
      settings: state.settings,
      system: PROMPTS.rule,
      user: `Sentence: ${sentence}`,
      maxOutputTokens: 200
    });
    const draft = normalizeRuleDraft(raw);
    if (!draft) {
      if (els.ruleAiStatus) els.ruleAiStatus.textContent = 'That sentence did not map to a rule. Try naming a site and a folder.';
      return;
    }
    if (els.ruleAiStatus) els.ruleAiStatus.innerHTML = '';
    showRuleDraft(draft);
  } catch (err) {
    aiUnavailableMessage(err);
  } finally {
    if (els.ruleAiBtn) {
      els.ruleAiBtn.disabled = false;
      els.ruleAiBtn.textContent = 'Make rule';
    }
  }
}

function showRuleDraft(draft) {
  if (!els.rulesList) return;
  const holder = document.createElement('div');
  holder.className = 'draft-rule';
  holder.innerHTML = `
    <span>Draft rule:</span>
    <code>${escapeHtml(draft.field)} is ${escapeHtml(draft.match)}</code>
    <span class="merge-arrow">→</span>
    <code>${escapeHtml(draft.folder)}</code>
    <button type="button" class="btn-inline" data-draft-add>Add this rule</button>
    <button type="button" class="btn-inline" data-draft-discard>Discard</button>`;
  els.rulesList.prepend(holder);
  holder.querySelector('[data-draft-add]').addEventListener('click', async () => {
    state.rules = [...state.rules, draft];
    await persistRules();
    holder.remove();
    if (els.ruleAiInput) els.ruleAiInput.value = '';
    renderAll();
    showStatus(`Rule added: ${draft.field} is ${draft.match} → ${draft.folder}.`, 'ok');
  });
  holder.querySelector('[data-draft-discard]').addEventListener('click', () => holder.remove());
}

/* ---------- Ask your library ---------- */

function renderAskEngine() {
  if (!els.askEnginePill) return;
  const keyed = hasKey(state.settings);
  els.askEnginePill.textContent = keyed ? `${PROVIDER_LABELS[state.settings.provider] || 'AI'}` : 'Local';
  els.askEnginePill.title = keyed
    ? 'Answers are written by your AI key.'
    : 'No key set, so answers come from matching your saved page text.';
}

// A follow-up passes its text directly; the button passes nothing, so the event
// object must never be treated as the question.
async function askLibrary(override) {
  const raw = typeof override === 'string' ? override : (els.askQuestion ? els.askQuestion.value : '');
  const question = String(raw).trim();
  if (!question) return;
  if (!state.bookmarks.length) {
    showStatus('Nothing in your library to search yet.', 'info');
    return;
  }
  if (els.askAnswer) {
    els.askAnswer.hidden = false;
    els.askAnswer.innerHTML = '<p class="field-help">Thinking…</p>';
  }

  // Local mode always runs first: it is instant and gives the AI real sources.
  const local = localAnswer(question, state.bookmarks);
  let answer = local.answer;
  let hits = local.hits;

  if (hasKey(state.settings)) {
    // Meaning search widens the source pool when it is on.
    const semantic = state.semanticOn ? await semanticResults(question) : null;
    if (semantic && semantic.length) {
      const seen = new Set(hits.map((bm) => bm.id));
      hits = [...hits, ...semantic.map((row) => row.bookmark).filter((bm) => !seen.has(bm.id))].slice(0, 5);
    }
    try {
      const context = hits
        .map((bm) => `- ${bm.title} (${bm.url}): ${String(bm.content?.text || bm.indexText || '').slice(0, 900)}`)
        .join('\n');
      answer = await requestModel({
        settings: state.settings,
        system:
          'You answer questions about a personal bookmark library. Use only the supplied bookmarks. Answer in two or three sentences, name the bookmark you draw from, and keep specific details such as property names or versions. If the bookmarks do not cover the question, say so plainly.',
        user: `Question: ${question}\n\nBookmarks:\n${context || '(none matched)'}`,
        maxOutputTokens: 400
      });
      answer = String(answer || '').trim();
    } catch (err) {
      // A failed key must never block the local answer.
      showStatus(`AI unavailable (${err.message || 'unknown error'}). Showing the local answer.`, 'error');
    }
  }

  if (!els.askAnswer) return;
  if (hasKey(state.settings)) {
    await renderAskWithCitations(question, answer, hits);
  } else {
    els.askAnswer.innerHTML = `
      <p>${escapeHtml(answer || 'No answer.')}</p>
      ${
        hits.length
          ? `<div class="tag-row">${hits
              .map((bm) => `<button type="button" class="mini-tag" data-ask-open="${attr(bm.id)}">${escapeHtml(bm.title.slice(0, 40))}</button>`)
              .join('')}</div>`
          : ''
      }`;
    els.askAnswer.querySelectorAll('[data-ask-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bm = state.bookmarks.find((b) => b.id === btn.dataset.askOpen);
        if (bm) openReader(bm);
      });
    });
  }
}

function renderAiEstimate() {
  if (!els.aiEstimate) return;
  const mode = document.querySelector('input[name="sort-engine"]:checked')?.value || 'local';
  if (mode === 'local') {
    els.aiEstimate.textContent = 'Smart Local needs no key and sends nothing anywhere.';
    return;
  }
  if (!hasKey(state.settings)) {
    els.aiEstimate.textContent = `${PROVIDER_LABELS[state.settings.provider] || 'AI'} needs a free key in Settings first.`;
    return;
  }
  const est = estimateRequest(state.bookmarks);
  els.aiEstimate.textContent = `About ${est.count} bookmarks, roughly ${est.tokens.toLocaleString()} tokens per run on ${PROVIDER_LABELS[state.settings.provider] || 'AI'}. Free tiers usually cover this.`;
}

/* ---------- Cross-device sync ---------- */

// Only preferences and tags travel; see settingsForSync in storage.js.
async function pushSync() {
  if (!isSyncAvailable()) return false;
  const ok = await syncSet({
    [SYNC_KEYS.settings]: settingsForSync(state.settings),
    [SYNC_KEYS.tags]: state.tagMap
  });
  renderSyncStatus(ok ? 'Pushed just now' : 'Could not write to sync');
  return ok;
}

async function pullSync() {
  if (!isSyncAvailable()) {
    showStatus('Sync is a browser extension feature. It is not available in this preview.', 'info');
    return;
  }
  const stored = await syncGet([SYNC_KEYS.settings, SYNC_KEYS.tags]);
  const remoteSettings = stored[SYNC_KEYS.settings];
  const remoteTags = stored[SYNC_KEYS.tags];
  if (!remoteSettings && !remoteTags) {
    showStatus('Nothing to pull yet — turn sync on from another device first.', 'info');
    return;
  }

  const ok = await askConfirm({
    title: 'Pull from other devices?',
    body: '<p>This replaces your settings and tag names with the synced copies. Bookmarks themselves are never touched, and the API key stays as it is here.</p>',
    okLabel: 'Pull them'
  });
  if (!ok) return;

  await pushSnapshot('Before pulling synced settings');
  if (remoteSettings) {
    state.settings = { ...state.settings, ...remoteSettings, apiKey: state.settings.apiKey };
  }
  if (remoteTags && typeof remoteTags === 'object') state.tagMap = { ...remoteTags };
  await storageSet({ [STORAGE.settings]: state.settings, [STORAGE.tags]: state.tagMap });
  await loadSettingsIntoForm();
  renderAll();
  showStatus('Pulled settings and tags from your other devices.', 'ok');
}

function renderSyncStatus(note = '') {
  if (!els.syncStatus) return;
  if (els.syncEnabled) els.syncEnabled.checked = Boolean(state.settings.syncEnabled);
  if (!isSyncAvailable()) {
    els.syncStatus.textContent = 'Browser sync is unavailable here (preview). Your data still saves on this device.';
    return;
  }
  const on = state.settings.syncEnabled ? 'On' : 'Off';
  els.syncStatus.textContent = `${on}. ${note}`.trim();
}

/* ---------- Data health: orphan cleanup ---------- */

let orphanFindings = null;

function bookmarkKeys() {
  return state.bookmarks.map((bm) => ({ id: bm.id, key: tagKey(bm) }));
}

function scanOrphans() {
  const orphans = findOrphans(bookmarkKeys(), {
    tags: state.tagMap,
    notes: state.notes,
    readLater: state.readLater,
    indexText: Object.fromEntries(state.indexTextCache),
    pins: state.pins
  });
  orphanFindings = orphans;
  renderOrphans(orphans);
  return orphans;
}

function renderOrphans(orphans) {
  if (!els.orphanList) return;
  const total = orphanCount(orphans);
  if (els.orphanPill) els.orphanPill.textContent = total === 0 ? 'clean' : `${total} found`;
  if (els.orphanCleanBtn) els.orphanCleanBtn.disabled = total === 0;

  if (total === 0) {
    els.orphanList.innerHTML = '<p class="empty-note">Nothing left over. Every tag, note, and read-later mark still points at a saved bookmark.</p>';
    return;
  }
  const rows = [];
  const push = (label, keys) => {
    for (const key of keys.slice(0, 8)) {
      rows.push(`<div class="orphan-row"><span>${escapeHtml(label)}</span><span class="orphan-key">${escapeHtml(key)}</span></div>`);
    }
    if (keys.length > 8) rows.push(`<div class="orphan-row"><span class="orphan-key">…and ${keys.length - 8} more</span></div>`);
  };
  push('Tag', orphans.tags);
  push('Note', orphans.notes);
  push('Read later', orphans.readLater);
  push('Pinned id', orphans.pins);
  push('Page text', orphans.index);
  els.orphanList.innerHTML = rows.join('');
}

async function cleanOrphans() {
  const orphans = orphanFindings || scanOrphans();
  const total = orphanCount(orphans);
  if (total === 0) return;
  const ok = await askConfirm({
    title: 'Remove leftovers?',
    body: `<p>This removes the leftover records that no longer belong to a bookmark: ${escapeHtml(describeOrphans(orphans))}. Bookmarks themselves are untouched, and a backup is saved first.</p>`,
    okLabel: 'Remove them'
  });
  if (!ok) return;

  await pushSnapshot('Before orphan cleanup');
  const cleaned = withoutOrphans(
    {
      tags: state.tagMap,
      notes: state.notes,
      readLater: state.readLater,
      indexText: Object.fromEntries(state.indexTextCache),
      pins: state.pins
    },
    orphans
  );

  state.tagMap = cleaned.tags;
  state.notes = cleaned.notes;
  state.readLater = cleaned.readLater;
  state.pins = cleaned.pins;
  state.indexTextCache = new Map(Object.entries(cleaned.indexText));

  await storageSet({
    [STORAGE.tags]: state.tagMap,
    [STORAGE.notes]: state.notes,
    [STORAGE.readLater]: state.readLater,
    [STORAGE.pins]: state.pins
  });
  // Prune the index too, since removing entries may bring it under budget.
  const pruned = pruneIndex(Object.fromEntries(state.indexTextCache), state.indexMeta);
  state.indexTextCache = new Map(Object.entries(pruned.index));
  await storageSet({
    [STORAGE.index]: pruned.index,
    [STORAGE.indexMeta]: state.indexMeta
  });
  orphanFindings = null;
  renderOrphans({ tags: [], notes: [], readLater: [], pins: [], index: [] });
  renderAll();
  showStatus(`Removed ${describeOrphans(orphans)}. Backup saved first.`, 'ok');
}

/* ---------- Tag tree, merge preview, suggestions ---------- */

// Nests "frontend/css" under "frontend" so the manage list mirrors the filter behaviour.
function tagTree(tags) {
  const roots = new Map();
  for (const tag of tags) {
    const [parent, ...rest] = tag.split('/');
    if (!roots.has(parent)) roots.set(parent, []);
    if (rest.length) roots.get(parent).push({ full: tag, leaf: rest.join('/') });
  }
  return roots;
}

function findTagMergePreview(from, into) {
  const affected = state.bookmarks.filter((bm) => (state.tagMap[tagKey(bm)] || []).includes(from));
  const already = affected.filter((bm) => (state.tagMap[tagKey(bm)] || []).includes(into));
  return { affected: affected.length, already: already.length };
}

async function previewTagMerge(from, into) {
  if (!els.tagMergePreview) return;
  const target = String(into || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!target || target === from) {
    els.tagMergePreview.hidden = true;
    return;
  }
  const { affected, already } = findTagMergePreview(from, target);
  els.tagMergePreview.hidden = false;
  els.tagMergePreview.innerHTML = `
    <p><strong>#${escapeHtml(from)} → #${escapeHtml(target)}</strong></p>
    <p class="field-help">${affected} bookmark${plural(affected, '')} carry #${escapeHtml(from)}; ${already} already have #${escapeHtml(target)}.</p>
    <div class="action-row">
      <button type="button" class="btn-inline" id="tag-merge-confirm">Merge now</button>
      <button type="button" class="btn-inline is-quiet" id="tag-merge-cancel">Cancel</button>
    </div>`;

  const confirmBtn = document.getElementById('tag-merge-confirm');
  const cancelBtn = document.getElementById('tag-merge-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      els.tagMergePreview.hidden = true;
      renderTagManage();
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      state.tagMap = mergeTags(state.tagMap, from, target);
      await persistTags();
      els.tagMergePreview.hidden = true;
      renderAll();
      showStatus(`Merged #${from} into #${target}.`, 'ok');
    });
  }
}

// Guesses tags from two cheap signals: what else is tagged on the same site,
// and what else is tagged in the same folder. No key needed.
function suggestTagsFor(bm) {
  if ((state.tagMap[tagKey(bm)] || []).length > 0) return [];
  const domain = getDomain(bm.url);
  // Track which neighbours support each tag, so one page in a busy folder
  // can't tag everything in it.
  const evidence = new Map();
  const note = (tag, kind, id) => {
    if (!evidence.has(tag)) evidence.set(tag, { site: new Set(), folder: new Set() });
    evidence.get(tag)[kind].add(id);
  };

  for (const other of state.bookmarks) {
    if (other.id === bm.id) continue;
    const tags = state.tagMap[tagKey(other)] || [];
    if (tags.length === 0) continue;
    const sameSite = domain && getDomain(other.url) === domain;
    const sameFolder = other.folderName && bm.folderName === other.folderName;
    for (const tag of tags) {
      if (sameSite) note(tag, 'site', other.id);
      if (sameFolder) note(tag, 'folder', other.id);
    }
  }

  const { headings } = bookmarkText(bm);
  const words = new Set(String(headings).toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 3));

  return [...evidence.entries()]
    // A tag needs a same-site page behind it, or two different pages in the folder.
    .filter(([, e]) => e.site.size >= 1 || e.folder.size >= 2)
    .map(([tag, e]) => {
      let score = e.site.size * 3 + e.folder.size;
      if (words.has(tag.split('/').pop())) score += 2;
      return [tag, score];
    })
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 3);
}

function renderTagSuggestions() {
  if (!els.tagSuggestionsList) return;
  const rows = state.bookmarks
    .map((bm) => ({ bm, tags: suggestTagsFor(bm) }))
    .filter((row) => row.tags.length > 0)
    .slice(0, 10);

  els.tagSuggestionsList.hidden = false;
  if (rows.length === 0) {
    els.tagSuggestionsList.innerHTML = '<p class="empty-note">No suggestions — tag a few bookmarks first, and untagged pages in the same site or folder will be suggested here.</p>';
    return;
  }

  els.tagSuggestionsList.innerHTML = rows
    .map(
      (row, index) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(row.bm.title)}</div>
          <div class="tag-row">${row.tags.map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-accept-suggestion="${index}">Accept</button>
        </div>
      </div>`
    )
    .join('');

  els.tagSuggestionsList.querySelectorAll('[data-accept-suggestion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = rows[Number(btn.dataset.acceptSuggestion)];
      if (!row) return;
      const key = tagKey(row.bm);
      state.tagMap[key] = [...new Set([...(state.tagMap[key] || []), ...row.tags])];
      await persistTags();
      renderAll();
      renderTagSuggestions();
      showStatus(`Tagged “${row.bm.title.slice(0, 28)}”.`, 'ok');
    });
  });
}

/* ---------- Collection editor ---------- */

function openCollectionEditor(collection) {
  if (!els.collectionDialog) return Promise.resolve(null);
  els.collectionName.value = collection.name || '';
  els.collectionQuery.value = collection.query || '';
  return new Promise((resolve) => {
    const finish = async (save) => {
      if (save) {
        const name = els.collectionName.value.trim().slice(0, 40);
        if (!name) {
          els.collectionName.focus();
          return;
        }
        collection.name = name;
        collection.query = els.collectionQuery.value.trim();
        // Query operators replace the older per-field filters on this collection.
        collection.folder = 'all';
        collection.domain = 'all';
        collection.addedWithin = '0';
        collection.visitedWithin = 'any';
        collection.tags = [];
        await persistCollections();
        renderSearch();
        showStatus('Collection updated.', 'ok');
      }
      closeModal(els.collectionDialog);
      resolve(save);
    };
    els.collectionSave.onclick = () => finish(true);
    els.collectionCancel.onclick = () => finish(false);
    openModal(els.collectionDialog, { initialFocus: '#collection-name', onClose: () => resolve(null) });
  });
}

/* ---------- Note dialog ---------- */

let noteDialogBookmark = null;

function openNoteDialog(bookmark) {
  if (!els.noteDialog) return;
  noteDialogBookmark = bookmark;
  els.noteDialogTitle.textContent = `Note for “${bookmark.title.slice(0, 40)}”`;
  els.noteDialogInput.value = noteFor(bookmark);
  openModal(els.noteDialog, { initialFocus: '#note-dialog-input', onClose: closeNoteDialog });
}

function closeNoteDialog() {
  closeModal(els.noteDialog);
  noteDialogBookmark = null;
}

async function saveNoteDialog() {
  if (!noteDialogBookmark) return;
  const key = tagKey(noteDialogBookmark);
  const value = els.noteDialogInput.value.trim();
  if (value) state.notes[key] = value;
  else delete state.notes[key];
  await persistNotes();
  closeNoteDialog();
  renderAll();
  showStatus(value ? 'Note saved.' : 'Note removed.', 'ok');
}



/* ---------- Tabs ---------- */

function switchTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    // Only the selected tab sits in the tab order; arrows move between them.
    btn.tabIndex = active ? 0 : -1;
  });
  els.panels.forEach((panel) => {
    const active = panel.id === `panel-${tabName}`;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
  // The panel is now visible, so this is the moment to build its contents.
  renderTab(tabName);
  if (tabName === 'settings') {
    renderStorageUsage();
    renderDiagnostics();
    renderSyncStatus();
    // Rescan each visit so the badge reflects the library as it is now.
    scanOrphans();
  }
}

/* ---------- Settings ---------- */

async function loadSettingsIntoForm() {
  els.aiProvider.value = state.settings.provider;
  els.aiKey.value = state.settings.apiKey;
  els.aiModel.value = state.settings.model;
  if (els.aiFileOnSave) els.aiFileOnSave.checked = state.settings.fileOnSave !== false;
  if (els.protectList) els.protectList.value = state.protect.join('\n');
  applyTheme(state.settings.theme || 'dark');
  updateAiHint();
  renderSyncStatus();
}

async function saveSettings(e) {
  e.preventDefault();
  state.settings = {
    ...state.settings,
    provider: els.aiProvider.value,
    apiKey: els.aiKey.value.trim(),
    model: els.aiModel.value.trim(),
    theme: els.themeSelect ? els.themeSelect.value : state.settings.theme,
    fileOnSave: els.aiFileOnSave ? els.aiFileOnSave.checked : state.settings.fileOnSave !== false
  };
  if (els.protectList) {
    state.protect = els.protectList.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    await persistProtect();
  }
  await persistSettings();
  applyTheme(state.settings.theme);
  // A new key can change which AI features exist, so rebuild the view.
  updateAiHint();
  applyAiVisibility();
  recomputeFindings();
  renderAll();
  showStatus(
    els.aiKey.value.trim() ? 'Settings saved. AI features are now available.' : 'Settings saved locally.',
    'ok'
  );
}

function updateAiHint() {
  const labels = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };
  const name = labels[state.settings.provider] || 'AI';
  if (els.aiEngineHint) {
    els.aiEngineHint.textContent = state.settings.apiKey ? `${name} key configured` : `${name} (add key in Settings)`;
  }
  if (els.rulesHint) {
    els.rulesHint.textContent = state.rules.length
      ? `${state.rules.length} rule${state.rules.length === 1 ? '' : 's'} active — these win over AI and local sorting.`
      : 'Rules always win over AI and local sorting.';
  }
  applyAiVisibility();
}

// One switch for every AI control. With no key they disappear rather than sit
// there as dead buttons; the local features beside them keep working.
function applyAiVisibility() {
  const shell = document.getElementById('ext-shell');
  const keyed = hasKey(state.settings);
  if (shell) shell.classList.toggle('no-key', !keyed);
  if (els.semanticToggle) {
    if (!keyed) {
      state.semanticOn = false;
      els.semanticToggle.setAttribute('aria-pressed', 'false');
    }
    // Meaning search also needs an embedding model, which only some providers
    // have. Hide it rather than offer a button that cannot work.
    const canEmbed = keyed && supportsEmbeddings(state.settings.provider);
    els.semanticToggle.classList.toggle('ai-unsupported', !canEmbed);
    if (!canEmbed) {
      state.semanticOn = false;
      els.semanticToggle.setAttribute('aria-pressed', 'false');
    }
  }
}

/* ---------- Scanning ---------- */

function flattenChromeTree(nodes, pathParts = []) {
  const list = [];
  for (const node of nodes) {
    if (node.url) {
      const folderName = pathParts.slice(-2).join(' / ') || 'Bookmarks';
      const content = state.contentCache.get(node.id) || null;
      list.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || node.url,
        url: node.url,
        folderName,
        dateAdded: node.dateAdded || 0,
        content,
        indexText: state.indexTextCache.get(node.id) || content?.text || '',
        tags: []
      });
    } else if (Array.isArray(node.children)) {
      const nextParts = node.title ? [...pathParts, node.title] : pathParts;
      list.push(...flattenChromeTree(node.children, nextParts));
    }
  }
  return list;
}

async function scanBookmarks() {
  clearStatus();
  // Folder assignments may have changed, so folder/domain facet counts are stale.
  facetCache = null;
  try {
    if (IS_EXTENSION) {
      const tree = await chrome.bookmarks.getTree();
      state.bookmarks = flattenChromeTree(tree || []);
    } else {
      state.bookmarks = demoBookmarks.map((b) => {
        const content = state.contentCache.get(b.id) || b._demoContent || null;
        return {
          ...b,
          content,
          indexText: state.indexTextCache.get(b.id) || content?.text || '',
          lastVisit: state.visitCache.get(b.id) || b._demoLastVisit || 0
        };
      });
    }
  } catch (err) {
    showStatus(`Could not read bookmarks: ${err.message || 'Permission denied'}. Reload the extension and try again.`, 'error');
    state.bookmarks = [];
  }

  for (const bm of state.bookmarks) {
    bm.tags = tagsFor(bm);
    bm.note = noteFor(bm);
    bm.readLater = isReadLater(bm);
  }

  recomputeFindings();
  renderAll();
}

function recomputeFindings() {
  state.duplicates = findDuplicates(state.bookmarks);
  state.nearDuplicates = findNearDuplicates(state.bookmarks);
  state.conflicts = findTitleConflicts(state.bookmarks);

  const exactRemovals = new Set(state.duplicates.flatMap((g) => g.duplicates.map((d) => d.id)));
  state.nearDuplicates = state.nearDuplicates
    .map((group) => ({ ...group, matches: group.matches.filter((m) => !exactRemovals.has(m.bookmark.id)) }))
    .filter((group) => group.matches.length > 0);

  const liveIds = new Set(state.bookmarks.map((b) => b.id));
  // Map lookups here instead of a linear find per id; with a few thousand
  // bookmarks the loop below went quadratic.
  const byId = new Map(state.bookmarks.map((b) => [b.id, b]));
  state.selectedDupes = new Set([...state.selectedDupes].filter((id) => liveIds.has(id)));
  if (state.selectedDupes.size === 0) {
    state.selectedDupes = new Set(
      state.duplicates.flatMap((g) => g.duplicates.map((d) => d.id)).filter((id) => {
        const bm = byId.get(id);
        return bm && !isProtected(bm);
      })
    );
  }
  state.selectedNear = new Set([...state.selectedNear].filter((id) => liveIds.has(id)));
  if (state.selectedNear.size === 0) {
    state.selectedNear = new Set(
      state.nearDuplicates.flatMap((g) => g.matches.map((m) => m.bookmark.id)).filter((id) => {
        const bm = byId.get(id);
        return bm && !isProtected(bm);
      })
    );
  }
  state.deadLinks = state.deadLinks.filter((d) => liveIds.has(d.bookmark.id));
  state.selectedDead = new Set([...state.selectedDead].filter((id) => liveIds.has(id)));
  state.staleLinks = state.staleLinks.filter((d) => liveIds.has(d.bookmark.id));
  state.selectedStale = new Set([...state.selectedStale].filter((id) => liveIds.has(id)));
}

// Renders the pieces that belong to one tab. Panels are hidden with `hidden`,
// but rebuilding their HTML still costs layout work and string concatenation,
// so only the visible panel is re-rendered. Switching tabs renders on demand.
function renderTab(tabName) {
  if (tabName === 'browse') {
    renderStats();
    renderSearch();
  } else if (tabName === 'organize') {
    renderStats();
    renderFolderTree();
    renderAiEstimate();
  } else if (tabName === 'cleanup') {
    renderDuplicates();
    renderNearDuplicates();
    renderConflicts();
    renderDeadLinks();
    renderStale();
    renderAging();
    renderRotList();
    renderRedirectList();
    renderSchedule();
    renderTrash();
  } else if (tabName === 'library') {
    renderLibrary();
    renderIndexAge();
    renderAskEngine();
  } else if (tabName === 'preview') {
    renderPreviewPlan();
  }
}

function renderAll() {
  // Always-visible chrome: the stat strip sits in Browse, the tag bar under the
  // tabs, and the AI hint is shared. These are cheap text updates.
  renderStats();
  renderTagBar();
  updateAiHint();

  // Then only the panel the user is actually looking at.
  renderTab(state.activeTab || 'browse');
}

function renderStats() {
  const dupeCount = state.duplicates.reduce((sum, g) => sum + g.duplicates.length, 0);
  const nearCount = state.nearDuplicates.reduce((sum, g) => sum + g.matches.length, 0);
  const total = state.bookmarks.length;

  if (els.statTotal) els.statTotal.textContent = String(total);
  if (els.statDupes) els.statDupes.textContent = String(dupeCount + nearCount);
  if (els.statDead) els.statDead.textContent = state.checkedDead ? String(state.deadLinks.length) : '—';

  if (els.statHealth) {
    const problems = dupeCount + nearCount + state.deadLinks.length + state.staleLinks.length;
    const health = total === 0 ? 0 : Math.max(0, Math.round(100 - (problems / total) * 100));
    els.statHealth.textContent = total === 0 ? '—' : `${health}%`;
  }

  const cleanupTotal =
    dupeCount + nearCount + state.deadLinks.length + state.staleLinks.length + state.conflicts.length;
  if (els.cleanupBadge) {
    els.cleanupBadge.textContent = String(cleanupTotal);
    els.cleanupBadge.hidden = cleanupTotal === 0;
  }
  if (els.libraryBadge) {
    const readLaterCount = Object.keys(state.readLater).length;
    els.libraryBadge.textContent = String(readLaterCount);
    els.libraryBadge.hidden = readLaterCount === 0;
  }

  // Toolbar badge surfaces cleanup work without opening anything.
  if (IS_EXTENSION && chrome.action && chrome.action.setBadgeText) {
    const problems = dupeCount + nearCount + state.deadLinks.length;
    try {
      chrome.action.setBadgeText({ text: problems > 0 ? String(Math.min(problems, 99)) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#e0a450' });
    } catch {
      // badge is cosmetic
    }
  }
}



/* ---------- Row rendering ---------- */

function bookmarkRow(bookmark, { checkAttr, checked, tagClass, tagText, meta, tagButton = true }) {
  const owned = tagsFor(bookmark).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('');
  const note = noteFor(bookmark);
  const readLater = isReadLater(bookmark);
  const minutes = readingTime(bookmark.indexText || bookmark.content?.text || '');

  return `
    <div class="item-row">
      <input type="checkbox" ${checkAttr}="${escapeHtml(bookmark.id)}" ${checked ? 'checked' : ''} aria-label="Select" />
      <div class="item-body">
        <div class="item-title">${escapeHtml(bookmark.title)}</div>
        <div class="item-meta">${escapeHtml(meta)}</div>
        <div class="tag-row">
          ${owned}
          ${readLater ? '<span class="mini-tag is-accent">read later</span>' : ''}
          ${minutes ? `<span class="mini-tag is-muted">${escapeHtml(minutes)}</span>` : ''}
          ${note ? '<span class="mini-tag is-muted">note</span>' : ''}
        </div>
      </div>
      <div class="row-actions">
        <span class="tag ${tagClass}">${escapeHtml(tagText)}</span>
        ${tagButton ? `<button type="button" class="tag-btn" data-tag-for="${attr(bookmark.id)}" title="Edit tags" aria-label="Edit tags for ${attr(bookmark.title)}">#</button>` : ''}
      </div>
    </div>`;
}

function wireRows(container) {
  container.querySelectorAll('[data-tag-for]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.tagFor);
      if (bm) openTagDialog(bm);
    });
  });
}

/* ---------- Duplicates ---------- */

function renderDuplicates() {
  const count = state.duplicates.reduce((sum, g) => sum + g.duplicates.length, 0);
  if (els.dupesCountPill) els.dupesCountPill.textContent = `${count} found`;

  if (!els.dupesList) return;
  if (count === 0) {
    els.dupesList.innerHTML = '<p class="empty-note">No exact duplicates found.</p>';
  } else {
    els.dupesList.innerHTML = state.duplicates
      .flatMap((group) =>
        group.duplicates.map((dup) =>
          bookmarkRow(dup, {
            checkAttr: 'data-dupe',
            checked: state.selectedDupes.has(dup.id),
            tagClass: 'tag-warn',
            tagText: 'Merge into keeper',
            meta: `Keeper: “${group.keep.title}” · ${getDomain(dup.url)}`
          })
        )
      )
      .join('');

    els.dupesList.querySelectorAll('[data-dupe]').forEach((input) => {
      input.addEventListener('change', () => {
        toggleSelection(state.selectedDupes, input.dataset.dupe, input.checked);
        updateActionButtons();
      });
    });
    wireRows(els.dupesList);
  }
  updateActionButtons();
}

function renderNearDuplicates() {
  const count = state.nearDuplicates.reduce((sum, g) => sum + g.matches.length, 0);
  if (els.nearCountPill) els.nearCountPill.textContent = `${count} found`;

  if (!els.nearList) return;
  if (count === 0) {
    els.nearList.innerHTML = '<p class="empty-note">No near-duplicate pages found.</p>';
    return;
  }

  els.nearList.innerHTML = state.nearDuplicates
    .flatMap((group) =>
      group.matches.map((match) =>
        bookmarkRow(match.bookmark, {
          checkAttr: 'data-near',
          checked: state.selectedNear.has(match.bookmark.id),
          tagClass: 'tag-warn',
          tagText: match.reason,
          meta: `Same page as “${group.keep.title}”`
        })
      )
    )
    .join('');

  els.nearList.querySelectorAll('[data-near]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleSelection(state.selectedNear, input.dataset.near, input.checked);
      updateActionButtons();
    });
  });
  wireRows(els.nearList);
}

function renderConflicts() {
  if (!els.conflictList) return;
  if (els.conflictCountPill) els.conflictCountPill.textContent = `${state.conflicts.length} found`;

  if (state.conflicts.length === 0) {
    els.conflictList.innerHTML = '<p class="empty-note">No conflicting titles.</p>';
    return;
  }

  els.conflictList.innerHTML = state.conflicts
    .map(
      (conflict) => `
      <div class="conflict-card">
        <div class="item-meta">${escapeHtml(conflict.normalizedUrl.replace(/^https?:\/\//, '').slice(0, 70))}</div>
        ${conflict.items
          .map(
            (bm) => `
          <div class="conflict-title-row">
            <span class="item-title">${escapeHtml(bm.title)}</span>
            <span class="mini-tag is-muted">${escapeHtml(bm.folderName)}</span>
          </div>`
          )
          .join('')}
      </div>`
    )
    .join('');
}

/* ---------- Dead links ---------- */

/* ---------- Moved links ---------- */

function renderRedirectList() {
  if (!els.redirectList) return;
  const rows = state.redirects || [];
  if (els.redirectBlock) els.redirectBlock.hidden = rows.length === 0;
  if (els.redirectCountPill) els.redirectCountPill.textContent = rows.length ? `${rows.length} found` : '';
  if (rows.length === 0) {
    els.redirectList.innerHTML = '';
    return;
  }

  els.redirectList.innerHTML = rows
    .map((row, index) => {
      const bm = row.bookmark;
      return `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(bm.title)}</div>
          <div class="item-meta">${escapeHtml(shortenUrl(bm.url))} → ${escapeHtml(shortenUrl(row.redirect))}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-update-redirect="${index}">Update</button>
        </div>
      </div>`;
    })
    .join('');

  els.redirectList.querySelectorAll('[data-update-redirect]').forEach((btn) => {
    btn.addEventListener('click', () => updateRedirect(Number(btn.dataset.updateRedirect)));
  });
  if (els.updateRedirectsBtn) els.updateRedirectsBtn.hidden = rows.length < 2;
}

function shortenUrl(url) {
  return String(url || '').replace(/^https?:\/\//, '').slice(0, 72);
}

async function updateRedirect(index) {
  const row = state.redirects[index];
  if (!row) return;
  const { bookmark, redirect } = row;
  try {
    await pushSnapshot('Before updating a moved link');
    if (IS_EXTENSION) {
      await chrome.bookmarks.update(bookmark.id, { url: redirect });
    } else {
      demoBookmarks = demoBookmarks.map((b) => {
        if (b.id !== bookmark.id) return b;
        const moved = { ...b, url: redirect };
        // Move tags, notes, and read-later flags to the new address so they survive.
        const oldKey = tagKey(b.url);
        const newKey = tagKey(redirect);
        if (state.tagMap[oldKey]) {
          state.tagMap[newKey] = state.tagMap[oldKey];
          delete state.tagMap[oldKey];
        }
        if (state.notes[oldKey]) {
          state.notes[newKey] = state.notes[oldKey];
          delete state.notes[oldKey];
        }
        if (state.readLater[oldKey]) {
          state.readLater[newKey] = state.readLater[oldKey];
          delete state.readLater[oldKey];
        }
        return moved;
      });
      await persistTags();
      await persistNotes();
    }
    state.redirects.splice(index, 1);
    await scanBookmarks();
    renderRedirectList();
    renderTrash();
    showStatus('Address updated.', 'ok');
  } catch (err) {
    reportError('Could not update the address', err);
  }
}

async function updateAllRedirects() {
  const rows = [...(state.redirects || [])];
  if (rows.length === 0) return;
  const ok = await askConfirm({
    title: `Update ${rows.length} address${plural(rows.length, '')}?`,
    body: '<p>Each bookmark is pointed at the address it now redirects to. Tags and notes follow along. A backup is saved first.</p>',
    okLabel: 'Update all'
  });
  if (!ok) return;
  try {
    await pushSnapshot('Before updating moved links');
    for (const row of rows) {
      if (IS_EXTENSION) {
        try {
          await chrome.bookmarks.update(row.bookmark.id, { url: row.redirect });
        } catch {
          // bookmark vanished
        }
      }
    }
    if (!IS_EXTENSION) {
      const map = new Map(rows.map((r) => [r.bookmark.id, r.redirect]));
      demoBookmarks = demoBookmarks.map((b) => (map.has(b.id) ? { ...b, url: map.get(b.id) } : b));
    }
    state.redirects = [];
    await scanBookmarks();
    renderRedirectList();
    showStatus(`Updated ${rows.length} address${plural(rows.length, '')}.`, 'ok');
  } catch (err) {
    reportError('Could not update the addresses', err);
  }
}

/* ---------- Scheduled checks ---------- */

function renderSchedule() {
  if (!els.scheduleSelect) return;
  const mode = state.settings.autoCheck || 'off';
  els.scheduleSelect.value = mode;
  if (els.scheduleSummary) {
    const last = state.settings.lastAutoCheck
      ? new Date(state.settings.lastAutoCheck).toLocaleString()
      : 'never';
    els.scheduleSummary.textContent =
      mode === 'off'
        ? 'Background checks are off. You can still check links any time.'
        : `Checks run while the browser is open. Last run: ${last}.`;
  }
}

async function saveSchedule() {
  if (!els.scheduleSelect) return;
  state.settings = { ...state.settings, autoCheck: els.scheduleSelect.value };
  await persistSettings();
  renderSchedule();
  if (IS_EXTENSION) await sendMessageSafe({ type: 'SET_SCHEDULE', mode: state.settings.autoCheck });
  showStatus(
    state.settings.autoCheck === 'off'
      ? 'Automatic checks turned off.'
      : `Automatic checks set to ${state.settings.autoCheck}.`,
    'ok'
  );
}

function renderDeadLinks() {
  if (!els.deadList) return;
  if (els.deadCountPill) els.deadCountPill.textContent = state.checkedDead ? `${state.deadLinks.length} found` : '';

  if (!state.checkedDead) {
    els.deadList.innerHTML =
      '<p class="empty-note">Run a link check to find 404s and timeouts. Bot walls (403/429) are kept automatically.</p>';
  } else if (state.deadLinks.length === 0) {
    els.deadList.innerHTML = '<p class="empty-note">All checked bookmarks are reachable.</p>';
  } else {
    els.deadList.innerHTML = state.deadLinks
      .map((item) => {
        const bm = item.bookmark;
        const blocked = item.category === 'blocked';
        return bookmarkRow(bm, {
          checkAttr: 'data-dead',
          checked: state.selectedDead.has(bm.id),
          tagClass: blocked ? 'tag-move' : 'tag-danger',
          tagText: item.reason || 'Dead',
          meta: bm.url
        });
      })
      .join('');

    els.deadList.querySelectorAll('[data-dead]').forEach((input) => {
      input.addEventListener('change', () => {
        toggleSelection(state.selectedDead, input.dataset.dead, input.checked);
        updateActionButtons();
      });
    });
    wireRows(els.deadList);
  }
  updateActionButtons();
}

/* ---------- Stale ---------- */

function renderStale() {
  if (!els.staleList) return;
  if (els.staleCountPill) els.staleCountPill.textContent = state.checkedStale ? `${state.staleLinks.length} found` : '';

  if (!state.checkedStale) {
    els.staleList.innerHTML = '<p class="empty-note">Pick an age and run a stale check to find bookmarks you never open.</p>';
  } else if (state.staleLinks.length === 0) {
    els.staleList.innerHTML = '<p class="empty-note">Nothing stale in that range — your bookmarks are all in use.</p>';
  } else {
    els.staleList.innerHTML = state.staleLinks
      .map((item) =>
        bookmarkRow(item.bookmark, {
          checkAttr: 'data-stale',
          checked: state.selectedStale.has(item.bookmark.id),
          tagClass: 'tag-warn',
          tagText: describeLastVisit(item.lastVisit),
          meta: `${item.bookmark.folderName} · added ${new Date(item.bookmark.dateAdded).toLocaleDateString()}`
        })
      )
      .join('');

    els.staleList.querySelectorAll('[data-stale]').forEach((input) => {
      input.addEventListener('change', () => {
        toggleSelection(state.selectedStale, input.dataset.stale, input.checked);
        updateActionButtons();
      });
    });
    wireRows(els.staleList);
  }
  updateActionButtons();
}

/* ---------- Aging folders ---------- */

function renderAging() {
  if (!els.agingList) return;
  if (els.agingCountPill) els.agingCountPill.textContent = state.checkedAging ? `${state.agingFolders.length} found` : '';

  if (!state.checkedAging) {
    els.agingList.innerHTML = '<p class="empty-note">Find whole folders you have stopped using.</p>';
    return;
  }
  if (state.agingFolders.length === 0) {
    els.agingList.innerHTML = '<p class="empty-note">Every folder has recent activity.</p>';
    return;
  }

  els.agingList.innerHTML = state.agingFolders
    .map(
      (group) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(group.folder)}</div>
          <div class="item-meta">${group.count} bookmarks · newest added ${new Date(group.newest).toLocaleDateString()} · last opened ${escapeHtml(describeLastVisit(group.lastVisit))}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-aging-review="${escapeHtml(group.folder)}">Review</button>
        </div>
      </div>`
    )
    .join('');

  els.agingList.querySelectorAll('[data-aging-review]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.search = { ...state.search, folder: btn.dataset.agingReview.split(' / ')[0], tags: [] };
      state.activeTags = [];
      switchTab('browse');
      renderSearch();
    });
  });
}

/* ---------- Trash ---------- */

function renderTrash() {
  if (!els.trashList) return;
  if (els.trashCountPill) els.trashCountPill.textContent = `${state.trash.length} held`;

  if (els.trashBar) {
    els.trashBar.hidden = state.trash.length === 0;
    if (state.trash.length > 0) {
      const daysLeft = Math.min(
        ...state.trash.map((t) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - t.deletedAt) / DAY)))
      );
      els.trashBarText.textContent = `${state.trash.length} in trash · clears in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    }
  }

  if (state.trash.length === 0) {
    els.trashList.innerHTML = '<p class="empty-note">Trash is empty. Deleted bookmarks land here for 30 days.</p>';
    return;
  }

  // Newest first, then optionally narrowed by the trash search box.
  const ordered = state.trash.slice().reverse();
  const needle = String(state.trashQuery || '').trim().toLowerCase();
  const shown = needle
    ? ordered.filter((item) =>
        `${item.title || ''} ${item.url || ''} ${(item.tags || []).join(' ')} ${item.note || ''}`
          .toLowerCase()
          .includes(needle)
      )
    : ordered;

  if (shown.length === 0) {
    els.trashList.innerHTML = `<p class="empty-note">Nothing in trash matches “${escapeHtml(state.trashQuery)}”.</p>`;
    return;
  }

  els.trashList.innerHTML = shown
    .map((item) => {
      const index = state.trash.indexOf(item);
      const ageDays = Math.floor((Date.now() - item.deletedAt) / DAY);
      return `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-meta">${escapeHtml(item.reason || 'Removed')} · ${new Date(item.deletedAt).toLocaleDateString()} · ${ageDays} day${plural(ageDays, '')} ago</div>
          ${
            (item.tags && item.tags.length) || item.note || item.readLater
              ? `<div class="tag-row">
                  ${(item.tags || []).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}
                  ${item.readLater ? '<span class="mini-tag is-accent">read later</span>' : ''}
                </div>
                ${item.note ? `<div class="search-note">📝 ${escapeHtml(item.note.slice(0, 140))}</div>` : ''}`
              : ''
          }
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-trash-restore="${index}">Restore</button>
          <button type="button" class="tag-btn" data-trash-purge="${index}" title="Delete permanently" aria-label="Delete ${attr(item.title)} permanently">✕</button>
        </div>
      </div>`;
    })
    .join('');

  els.trashList.querySelectorAll('[data-trash-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.trashRestore);
      const [item] = state.trash.splice(index, 1);
      await persistTrash();
      await recreateFromItems([item], `Bookbox Restored (${new Date().toLocaleDateString()})`);
      await scanBookmarks();
      showStatus('Restored from trash.', 'ok');
    });
  });

  els.trashList.querySelectorAll('[data-trash-purge]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.trashPurge);
      const item = state.trash[index];
      if (!item) return;
      const ok = await askConfirm({
        title: 'Delete permanently?',
        body: `<p><strong>${escapeHtml(item.title)}</strong> is removed from trash for good. This cannot be undone.</p>`,
        okLabel: 'Delete forever'
      });
      if (!ok) return;
      state.trash.splice(index, 1);
      await persistTrash();
      renderTrash();
      showStatus('Deleted from trash.', 'ok');
    });
  });
}

// Drops trash older than the chosen age, leaving the rest alone.
async function clearOldTrash() {
  const days = Number(els.trashAgeSelect ? els.trashAgeSelect.value : 0);
  if (!days) {
    showStatus('Pick an age first.', 'info');
    return;
  }
  const cutoff = Date.now() - days * DAY;
  const doomed = state.trash.filter((t) => (t.deletedAt || 0) < cutoff);
  if (doomed.length === 0) {
    showStatus(`Nothing in trash is older than ${days} days.`, 'info');
    return;
  }
  const ok = await askConfirm({
    title: `Clear ${doomed.length} old item${plural(doomed.length, '')}?`,
    body: `<p>Everything deleted more than ${days} days ago leaves the trash permanently.</p>`,
    okLabel: 'Clear them'
  });
  if (!ok) return;
  state.trash = state.trash.filter((t) => (t.deletedAt || 0) >= cutoff);
  await persistTrash();
  renderTrash();
  showStatus(`Cleared ${doomed.length} old item${plural(doomed.length, '')}.`, 'ok');
}

/* ---------- Rot score ---------- */

// One ranked list of bookmarks that have stopped earning their place:
// dead links, never opened, and very old. Higher score means more rot.
function renderRotList() {
  if (!els.rotList) return;
  if (els.rotPill) {
    // Count is filled after scoring, so the pill always matches the list.
    els.rotPill.textContent = '';
  }
  const deadIds = new Set(state.deadLinks.map((d) => d.bookmark?.id).filter(Boolean));

  const scored = state.bookmarks
    .filter((bm) => !isProtected(bm))
    .map((bm) => {
      const daysOld = bm.dateAdded ? Math.floor((Date.now() - bm.dateAdded) / DAY) : 3650;
      const last = bm.lastVisit || 0;
      const daysSinceUse = last ? Math.floor((Date.now() - last) / DAY) : null;
      let score = 0;
      const reasons = [];

      if (deadIds.has(bm.id)) {
        score += 50;
        reasons.push('dead link');
      }
      if (last === 0) {
        score += 25;
        reasons.push('never opened');
      } else if (daysSinceUse > 365) {
        score += 15;
        reasons.push(`not opened in ${Math.floor(daysSinceUse / 365)}+ year${Math.floor(daysSinceUse / 365) === 1 ? '' : 's'}`);
      }
      if (daysOld > 730) {
        score += 15;
        reasons.push('saved over 2 years ago');
      } else if (daysOld > 365) {
        score += 8;
        reasons.push('saved over a year ago');
      }

      return { bm, score, reasons };
    })
    .filter((row) => row.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (scored.length === 0) {
    if (els.rotPill) els.rotPill.textContent = 'clean';
    els.rotList.innerHTML = '<p class="empty-note">Nothing looks stale — every bookmark has been opened recently or saved lately.</p>';
    return;
  }
  if (els.rotPill) els.rotPill.textContent = `${scored.length} flagged`;

  els.rotList.innerHTML = scored
    .map(
      (row) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(row.bm.title)}</div>
          <div class="item-meta">${escapeHtml(row.reasons.join(' · '))}</div>
        </div>
        <span class="tag ${row.score >= 50 ? 'tag-danger' : row.score >= 40 ? 'tag-warn' : 'tag-move'}">${row.score}</span>
      </div>`
    )
    .join('');
}

function toggleSelection(set, id, checked) {
  if (checked) set.add(id);
  else set.delete(id);
}

function updateActionButtons() {
  const map = [
    [els.removeDupesNowBtn, state.selectedDupes.size, 'duplicate'],
    [els.removeNearNowBtn, state.selectedNear.size, 'near-duplicate'],
    [els.removeDeadNowBtn, state.selectedDead.size, 'dead link'],
    [els.removeStaleNowBtn, state.selectedStale.size, 'stale bookmark']
  ];
  for (const [btn, count, noun] of map) {
    if (!btn) continue;
    btn.hidden = count === 0;
    btn.disabled = state.busy;
    btn.textContent = `Move ${count} selected ${noun}${count === 1 ? '' : 's'} to trash`;
  }
  if (els.removeDupesNowBtn && state.selectedDupes.size > 0) {
    els.removeDupesNowBtn.textContent = `Merge ${state.selectedDupes.size} duplicate${state.selectedDupes.size === 1 ? '' : 's'}`;
  }
}



/* ---------- Library panel ---------- */

function renderLibrary() {
  renderRules();
  renderTagManage();
  renderReadLater();
  renderNotes();
}

function renderRules() {
  if (els.rulesCountPill) els.rulesCountPill.textContent = `${state.rules.length} rule${state.rules.length === 1 ? '' : 's'}`;
  if (!els.rulesList) return;

  if (state.rules.length === 0) {
    els.rulesList.innerHTML = '<p class="empty-note">No rules yet. Add one above and Bookbox will always file those bookmarks the same way.</p>';
    if (els.rulesRunBtn) els.rulesRunBtn.hidden = true;
    return;
  }

  const fieldLabel = { domain: 'site', title: 'title contains', url: 'URL contains' };
  els.rulesList.innerHTML = state.rules
    .map(
      (rule, index) => `
      <div class="item-row rule-row" draggable="true" data-rule-row="${index}">
        <span class="rule-grip" aria-hidden="true">⠿</span>
        <input type="checkbox" data-rule-toggle="${index}" ${rule.enabled === false ? '' : 'checked'} aria-label="Enable rule" />
        <div class="item-body">
          <div class="item-title">${escapeHtml(fieldLabel[rule.field] || rule.field)} “${escapeHtml(rule.match)}”</div>
          <div class="item-meta">→ ${escapeHtml(rule.folder)}${rule.enabled === false ? ' · off' : ''}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="tag-btn" data-rule-up="${index}" title="Move up" aria-label="Move rule up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="tag-btn" data-rule-down="${index}" title="Move down" aria-label="Move rule down" ${index === state.rules.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="tag-btn" data-rule-why="${index}" title="Why does this rule win?" aria-label="Explain rule priority">?</button>
          <button type="button" class="tag-btn" data-rule-delete="${index}" title="Delete rule" aria-label="Delete this rule">✕</button>
        </div>
      </div>`
    )
    .join('');

  els.rulesList.querySelectorAll('[data-rule-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      state.rules[Number(input.dataset.ruleToggle)].enabled = input.checked;
      await persistRules();
      updateAiHint();
    });
  });
  els.rulesList.querySelectorAll('[data-rule-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.rules.splice(Number(btn.dataset.ruleDelete), 1);
      await persistRules();
      renderLibrary();
      updateAiHint();
    });
  });

  // Rules are matched top to bottom, so order is a real setting.
  const moveRule = async (from, to) => {
    if (to < 0 || to >= state.rules.length) return;
    const [rule] = state.rules.splice(from, 1);
    state.rules.splice(to, 0, rule);
    await persistRules();
    renderLibrary();
    showStatus(`Rule moved to position ${to + 1}.`, 'ok');
  };
  els.rulesList.querySelectorAll('[data-rule-up]').forEach((btn) => {
    btn.addEventListener('click', () => moveRule(Number(btn.dataset.ruleUp), Number(btn.dataset.ruleUp) - 1));
  });
  els.rulesList.querySelectorAll('[data-rule-down]').forEach((btn) => {
    btn.addEventListener('click', () => moveRule(Number(btn.dataset.ruleDown), Number(btn.dataset.ruleDown) + 1));
  });
  els.rulesList.querySelectorAll('[data-rule-why]').forEach((btn) => {
    btn.addEventListener('click', () => explainRule(Number(btn.dataset.ruleWhy)));
  });

  // Drag handles reorder as well, with the buttons as the keyboard path.
  let dragFrom = null;
  els.rulesList.querySelectorAll('[data-rule-row]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      dragFrom = Number(row.dataset.ruleRow);
      e.dataTransfer?.setData('text/plain', String(dragFrom));
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      els.rulesList.querySelectorAll('.is-drop-target').forEach((r) => r.classList.remove('is-drop-target'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('is-drop-target');
      const to = Number(row.dataset.ruleRow);
      if (dragFrom === null || dragFrom === to) return;
      const from = dragFrom;
      dragFrom = null;
      await moveRule(from, to);
    });
  });

  if (els.rulesRunBtn) {
    const hits = applyRules(state.bookmarks, state.rules);
    els.rulesRunBtn.hidden = state.rules.length === 0;
    els.rulesRunBtn.disabled = hits.size === 0;
    els.rulesRunBtn.textContent =
      hits.size === 0
        ? 'No rules match right now'
        : `Preview ${hits.size} rule ${hits.size === 1 ? 'match' : 'matches'}`;
  }
}

// A dry run: show exactly which bookmarks and target folders, apply nothing.
async function previewRules() {
  const hits = applyRules(state.bookmarks, state.rules);
  if (hits.size === 0) return;

  const rows = [...hits.entries()]
    .map(([id, folder]) => {
      const bm = state.bookmarks.find((b) => b.id === id);
      const protectedItem = bm && isProtected(bm);
      const same = bm && bm.folderName === folder;
      return { bm, folder, protectedItem, same };
    })
    .filter((row) => row.bm)
    .sort((a, b) => a.folder.localeCompare(b.folder));

  const willMove = rows.filter((r) => !r.protectedItem && !r.same);
  const skipped = rows.length - willMove.length;

  const body = `
    <p>${willMove.length} bookmark${plural(willMove.length, '')} would move${skipped ? `, ${skipped} skipped (protected or already in place)` : ''}.</p>
    <div class="dry-run-list">
      ${willMove
        .slice(0, 40)
        .map(
          (row) => `
        <div class="dry-run-row">
          <span class="dry-run-title">${escapeHtml(row.bm.title)}</span>
          <span class="dry-run-arrow">→</span>
          <span class="dry-run-folder">${escapeHtml(row.folder)}</span>
        </div>`
        )
        .join('')}
      ${willMove.length > 40 ? `<p class="field-help">…and ${willMove.length - 40} more.</p>` : ''}
    </div>`;

  const ok = await askConfirm({
    title: 'Rules dry run',
    body,
    okLabel: willMove.length ? 'Apply them' : 'Close',
    danger: false
  });
  if (ok && willMove.length) await executeRules(hits);
}

// Explains why a rule wins or loses, including shadowing by a rule above it.
async function explainRule(index) {
  const rule = state.rules[index];
  if (!rule) return;
  // An earlier rule shadows this one when its match is the narrower string:
  // any bookmark matching "github.com" also matches "github", so the earlier
  // rule takes those before this one is ever consulted.
  const winner = state.rules.findIndex(
    (r, i) =>
      i < index &&
      r.enabled !== false &&
      r.field === rule.field &&
      String(r.match || '').toLowerCase().includes(String(rule.match || '').toLowerCase())
  );
  const shadowed = winner !== -1;
  const hits = state.bookmarks.filter((bm) => ruleMatchesBookmark(rule, bm));

  const body = `
    <p><strong>${escapeHtml(rule.field)} “${escapeHtml(rule.match)}”</strong> → ${escapeHtml(rule.folder)}</p>
    <p>Rules are checked from the top. This one sits at position ${index + 1} of ${state.rules.length}.</p>
    ${
      shadowed
        ? `<p class="field-help">⚠ A rule above it, <strong>${escapeHtml(state.rules[winner].match)}</strong>, also matches those bookmarks, so it wins first. Move this rule up if you want it to take priority.</p>`
        : '<p class="field-help">Nothing above it overlaps, so it takes priority for anything it matches.</p>'
    }
    <p>${hits.length} bookmark${plural(hits.length, '')} match${hits.length === 1 ? 'es' : ''} right now${
      hits.length ? `: ${hits.slice(0, 4).map((b) => escapeHtml(b.title)).join(', ')}${hits.length > 4 ? ', …' : ''}` : '.'
    }</p>`;

  await askConfirm({ title: 'Why this rule wins', body, okLabel: 'Close', danger: false, showCancel: false });
}

// Same field logic the engine uses, exposed for the tester and explainer.
function ruleMatchesBookmark(rule, bookmark) {
  const match = String(rule.match || '').toLowerCase();
  const field =
    rule.field === 'title'
      ? (bookmark.title || '').toLowerCase()
      : rule.field === 'url'
        ? (bookmark.url || '').toLowerCase()
        : getDomain(bookmark.url || '').toLowerCase();
  return Boolean(match) && field.includes(match);
}

// Paste a URL to see which rule catches it, before saving anything.
async function testRuleUrl() {
  const input = els.ruleTestUrl ? els.ruleTestUrl.value.trim() : '';
  if (!input) {
    showStatus('Paste a URL to test.', 'info');
    return;
  }
  const fake = { title: '', url: input.startsWith('http') ? input : `https://${input}`, folderName: '' };
  const winnerIndex = state.rules.findIndex((r) => r.enabled !== false && ruleMatchesBookmark(r, fake));
  const winner = winnerIndex === -1 ? null : state.rules[winnerIndex];

  const body = winner
    ? `<p><strong>${escapeHtml(winner.match)}</strong> (position ${winnerIndex + 1}) catches it → ${escapeHtml(winner.folder)}.</p>
       <p class="field-help">${state.rules
         .map((r, i) => `${i === winnerIndex ? '✓ ' : '· '}${escapeHtml(r.match)} → ${escapeHtml(r.folder)}`)
         .join('<br>')}</p>`
    : `<p>No rule matches that URL, so it would fall through to Smart Local.</p>`;

  await askConfirm({ title: 'Rule tester', body, okLabel: 'Close', danger: false, showCancel: false });
}

// Rules as JSON so they survive a reinstall or move between browsers.
async function exportRules() {
  const payload = JSON.stringify({ version: 1, rules: state.rules }, null, 2);
  await download(`bookbox-rules-${new Date().toISOString().slice(0, 10)}.json`, payload, 'application/json');
  showStatus('Rules exported.', 'ok');
}

async function importRules() {
  const file = els.rulesImportFile?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed.rules;
    if (!Array.isArray(incoming)) throw new Error('That file has no rules array.');
    const clean = incoming
      .filter((r) => r && r.match && r.folder)
      .map((r) => ({
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        field: ['domain', 'title', 'url'].includes(r.field) ? r.field : 'domain',
        match: String(r.match),
        folder: String(r.folder),
        enabled: r.enabled !== false
      }));
    if (!clean.length) throw new Error('No usable rules in that file.');

    const ok = await askConfirm({
      title: `Add ${clean.length} rule${plural(clean.length, '')}?`,
      body: '<p>They are added below your existing rules, so current priorities do not change.</p>',
      okLabel: 'Add rules'
    });
    if (!ok) return;
    state.rules.push(...clean);
    await persistRules();
    renderLibrary();
    showStatus(`${clean.length} rule${plural(clean.length, '')} imported.`, 'ok');
  } catch (err) {
    showStatus(`Could not import rules: ${err.message}`, 'error');
  } finally {
    if (els.rulesImportFile) els.rulesImportFile.value = '';
  }
}

async function addRule() {
  const match = els.ruleMatch.value.trim();
  const folder = els.ruleFolder.value.trim();
  if (!match || !folder) {
    showStatus('A rule needs both a match and a folder.', 'error');
    return;
  }
  state.rules.push({
    id: `r-${Date.now()}`,
    field: els.ruleField.value,
    match,
    folder: folder.includes('/') ? folder : `${folder} / General`,
    enabled: true
  });
  await persistRules();
  els.ruleMatch.value = '';
  els.ruleFolder.value = '';
  renderLibrary();
  updateAiHint();
  showStatus('Rule added.', 'ok');
}

async function applyRulesNow() {
  const hits = applyRules(state.bookmarks, state.rules);
  if (hits.size === 0) return;
  const ok = await askConfirm({
    title: 'Apply rules?',
    body: `<p>${hits.size} bookmark${hits.size === 1 ? '' : 's'} will move to the folder their rule names.</p>`,
    okLabel: 'Apply rules'
  });
  if (!ok) return;
  await executeRules(hits);
}

// Shared by the dry-run confirmation and the direct Apply button.
async function executeRules(hits) {
  if (hits.size === 0) return;
  state.busy = true;
  try {
    await pushSnapshot('Before applying rules');
    if (IS_EXTENSION) {
      for (const [id, folder] of hits.entries()) {
        const target = await ensureFolderPath(folder);
        const bm = state.bookmarks.find((b) => b.id === id);
        if (!bm || isProtected(bm) || !target) continue;
        await chrome.bookmarks.move(id, { parentId: target });
      }
    } else {
      demoBookmarks = demoBookmarks.map((b) => (hits.has(b.id) ? { ...b, folderName: hits.get(b.id) } : b));
    }
    await scanBookmarks();
    renderFolderTree();
    showStatus(`Moved ${hits.size} bookmarks using your rules.`, 'ok');
  } catch (err) {
    reportError('Could not apply rules', err);
  } finally {
    state.busy = false;
  }
}

async function ensureFolderPath(path) {
  const parts = String(path || '').split(' / ').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!IS_EXTENSION) return `demo-${path}`;
  let parentId = (await getDefaultParentId()) || '1';
  for (const part of parts) {
    const children = await chrome.bookmarks.getChildren(parentId);
    const existing = children.find((c) => !c.url && c.title === part);
    if (existing) parentId = existing.id;
    else parentId = (await chrome.bookmarks.create({ parentId, title: part })).id;
  }
  return parentId;
}
/* ---------- Folder tree (rename, merge, drag to move) ---------- */

function folderTreeData() {
  const parents = new Map();
  for (const bm of state.bookmarks) {
    const full = bm.folderName || 'Unsorted';
    const [parent, sub] = full.split(' / ');
    if (!parents.has(parent)) parents.set(parent, { subs: new Map(), total: 0 });
    const entry = parents.get(parent);
    entry.total += 1;
    if (sub) entry.subs.set(sub, (entry.subs.get(sub) || 0) + 1);
  }
  return [...parents.entries()]
    .map(([name, entry]) => ({
      name,
      total: entry.total,
      subs: [...entry.subs.entries()]
        .map(([subName, count]) => ({ name: subName, count }))
        .sort((a, b) => b.count - a.count)
    }))
    .sort((a, b) => b.total - a.total);
}

// Catches folders that differ only by case, punctuation, or a small typo —
// the usual source of "Dev" and "Development" both existing.
function findSimilarFolderPairs(names) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const na = normalize(a);
      const nb = normalize(b);
      if (!na || !nb) continue;
      const same = na === nb;
      // Short prefixes ("dev" / "development") are the common duplicate case.
      const prefix = na.length >= 3 && nb.length >= 3 && (na.startsWith(nb) || nb.startsWith(na));
      if (same || prefix) pairs.push({ a, b, reason: same ? 'same name, different spelling' : 'one name contains the other' });
    }
  }
  return pairs;
}

function renderSimilarFolders() {
  if (!els.similarFolders) return;
  const names = [...new Set(state.bookmarks.map((b) => b.folderName).filter(Boolean))];
  const pairs = findSimilarFolderPairs(names).slice(0, 8);
  if (pairs.length === 0) {
    els.similarFolders.hidden = true;
    els.similarFolders.innerHTML = '';
    return;
  }
  els.similarFolders.hidden = false;
  els.similarFolders.innerHTML = `
    <div class="section-head">
      <h2>Similar folders</h2>
      <span class="count-pill">${pairs.length}</span>
    </div>
    <p class="field-help">These folder names look like the same thing. Merging moves every bookmark into the first one.</p>
    ${pairs
      .map(
        (pair, index) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(pair.a)} <span class="item-meta">vs</span> ${escapeHtml(pair.b)}</div>
          <div class="item-meta">${escapeHtml(pair.reason)}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-merge-folders="${index}">Merge</button>
        </div>
      </div>`
      )
      .join('')}`;

  els.similarFolders.querySelectorAll('[data-merge-folders]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pair = pairs[Number(btn.dataset.mergeFolders)];
      if (pair) await mergeSimilarFolders(pair.a, pair.b);
    });
  });
}

async function mergeSimilarFolders(into, from) {
  const affected = state.bookmarks.filter((b) => b.folderName === from);
  if (!affected.length) return;
  const ok = await askConfirm({
    title: 'Merge these folders?',
    body: `<p>${affected.length} bookmark${plural(affected.length, '')} move from <strong>${escapeHtml(from)}</strong> into <strong>${escapeHtml(into)}</strong>. Tags and notes stay attached.</p>`,
    okLabel: 'Merge folders'
  });
  if (!ok) return;

  try {
    await pushSnapshot(`Before merging ${from} into ${into}`);
    if (IS_EXTENSION) {
      const target = await ensureFolderPath(into);
      if (!target) throw new Error('Could not create the target folder.');
      for (const bm of affected) {
        try {
          await chrome.bookmarks.move(bm.id, { parentId: target });
        } catch {
          // bookmark vanished mid-merge
        }
      }
    } else {
      demoBookmarks = demoBookmarks.map((b) => (b.folderName === from ? { ...b, folderName: into } : b));
    }
    await scanBookmarks();
    renderAll();
    showStatus(`Merged “${from}” into “${into}”.`, 'ok');
  } catch (err) {
    reportError('Could not merge folders', err);
  }
}

function renderFolderTree() {
  if (!els.folderTree) return;
  const parents = folderTreeData();
  if (els.folderCountPill) els.folderCountPill.textContent = `${parents.length} folders`;

  renderSimilarFolders();

  if (parents.length === 0) {
    els.folderTree.innerHTML = '<p class="empty-note">No folders yet.</p>';
    return;
  }

  els.folderTree.innerHTML = parents
    .map((parent) => {
      const subRows = parent.subs
        .map(
          (sub) => `
        <div class="folder-sub-row" data-drop-folder="${attr(`${parent.name} / ${sub.name}`)}">
          <span class="folder-sub-name">${escapeHtml(sub.name)}</span>
          <span class="chip-count">${sub.count}</span>
          <button type="button" class="btn-inline" data-open-folder="${attr(`${parent.name} / ${sub.name}`)}">Open all</button>
          <button type="button" class="btn-inline" data-merge-sub="${attr(`${parent.name} / ${sub.name}`)}">Merge</button>
        </div>`
        )
        .join('');
      return `
      <details class="folder-manage-card" open>
        <summary data-drop-folder="${attr(parent.name)}">
          <span class="folder-manage-name" data-rename-folder="${attr(parent.name)}">${escapeHtml(parent.name)}</span>
          <span class="count-pill">${parent.total}</span>
        </summary>
        <div class="folder-sub-list">
          ${subRows || '<p class="field-help" style="margin:4px 0 0 8px;">No subfolders yet.</p>'}
        </div>
      </details>`;
    })
    .join('');

  // One delegated handler for the whole tree. Binding per row meant a fresh
  // set of listeners on every rebuild of a potentially long folder list.
  if (els.folderTree.dataset.wired !== '1') {
    els.folderTree.dataset.wired = '1';
    els.folderTree.addEventListener('dragover', (e) => {
      const target = e.target.closest('[data-drop-folder]');
      if (!target || !state.dragId) return;
      e.preventDefault();
      target.classList.add('is-drop-target');
    });
    els.folderTree.addEventListener('dragleave', (e) => {
      e.target.closest('[data-drop-folder]')?.classList.remove('is-drop-target');
    });
    els.folderTree.addEventListener('drop', async (e) => {
      const target = e.target.closest('[data-drop-folder]');
      if (!target) return;
      e.preventDefault();
      target.classList.remove('is-drop-target');
      const id = state.dragId || e.dataTransfer?.getData('text/plain');
      state.dragId = null;
      if (id) await moveBookmarkToFolder(id, target.dataset.dropFolder);
    });
    els.folderTree.addEventListener('click', async (e) => {
      const label = e.target.closest('[data-rename-folder]');
      if (label) {
        // The label sits inside <summary>, so stop it toggling the card open.
        e.preventDefault();
        e.stopPropagation();
        renameFolderPrompt(label.dataset.renameFolder);
        return;
      }
      const merge = e.target.closest('[data-merge-sub]');
      if (merge) {
        e.preventDefault();
        e.stopPropagation();
        mergeFolderPrompt(merge.dataset.mergeSub);
        return;
      }
      const open = e.target.closest('[data-open-folder]');
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        await openFolderInTabs(open.dataset.openFolder);
      }
    });
  }
}

// Opens every bookmark in a folder as background tabs, with a cap so a huge
// folder does not bury the browser.
async function openFolderInTabs(folder) {
  const items = state.bookmarks.filter((bm) => bm.folderName === folder);
  if (items.length === 0) return;

  const CAP = 20;
  const toOpen = items.slice(0, CAP);

  if (!IS_EXTENSION) {
    showStatus(
      `Would open ${toOpen.length} tab${plural(toOpen.length, '')}${items.length > CAP ? ` (capped at ${CAP})` : ''}. Tab opening needs the installed extension.`,
      'info'
    );
    return;
  }

  const ok = await askConfirm({
    title: `Open ${toOpen.length} tab${plural(toOpen.length, '')}?`,
    body: `<p>Every bookmark in <strong>${escapeHtml(folder)}</strong> opens in a background tab${items.length > CAP ? `, capped at ${CAP} of ${items.length}` : ''}.</p>`,
    okLabel: 'Open tabs'
  });
  if (!ok) return;

  for (const bm of toOpen) {
    try {
      await chrome.tabs.create({ url: bm.url, active: false });
    } catch {
      // skip tabs the browser refuses
    }
  }
  showStatus(`Opened ${toOpen.length} tab${plural(toOpen.length, '')}.`, 'ok');
}

// Saves every http(s) tab in the current window as a collection.
async function saveOpenTabsAsCollection() {
  if (!IS_EXTENSION) {
    showStatus('Saving open tabs needs the installed extension.', 'info');
    return;
  }
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const items = tabs
    .filter((t) => t.url && /^https?:/i.test(t.url))
    .map((t) => ({
      title: t.title || t.url,
      url: t.url,
      folderName: `Open tabs (${new Date().toLocaleDateString()})`
    }));

  if (items.length === 0) {
    showStatus('No web tabs to save in this window.', 'info');
    return;
  }
  const ok = await askConfirm({
    title: `Save ${items.length} open tab${plural(items.length, '')}?`,
    body: '<p>They land in a new folder so you can sort them later.</p>',
    okLabel: 'Save tabs'
  });
  if (!ok) return;

  try {
    await pushSnapshot('Before saving open tabs');
    await recreateFromItems(items, `Open tabs (${new Date().toLocaleDateString()})`);
    await scanBookmarks();
    renderAll();
    showStatus(`Saved ${items.length} open tab${plural(items.length, '')} into a new folder.`, 'ok');
  } catch (err) {
    reportError('Could not save open tabs', err);
  }
}

async function moveBookmarkToFolder(id, folder) {
  const bm = state.bookmarks.find((b) => b.id === id);
  if (!bm || !folder) return;
  if (bm.folderName === folder) {
    showStatus(`Already in ${folder}.`, 'info');
    return;
  }
  if (isProtected(bm)) {
    showStatus('That bookmark is on your “never touch” list.', 'error');
    return;
  }

  try {
    await pushSnapshot(`Before moving “${bm.title.slice(0, 30)}”`);
    if (IS_EXTENSION) {
      const target = await ensureFolderPath(folder);
      if (!target) throw new Error('Could not create that folder');
      await chrome.bookmarks.move(id, { parentId: target });
    } else {
      demoBookmarks = demoBookmarks.map((b) => (b.id === id ? { ...b, folderName: folder } : b));
    }
    await scanBookmarks();
    renderFolderTree();
    showStatus(`Moved to ${folder}.`, 'ok');
  } catch (err) {
    reportError('Could not move bookmark', err);
  }
}

async function renameFolderPrompt(folderName) {
  const next = await askText({
    title: `Rename “${folderName}”`,
    help: 'Bookmarks inside move with the folder.',
    value: folderName,
    okLabel: 'Rename'
  });
  const clean = String(next || '').trim();
  if (!clean || clean === folderName) return;
  if (clean.includes('/')) {
    showStatus('Folder names cannot contain “/”.', 'error');
    return;
  }

  try {
    await pushSnapshot(`Before renaming “${folderName}”`);
    if (IS_EXTENSION) {
      const tree = await chrome.bookmarks.getTree();
      const node = findFolderNode(tree, folderName);
      if (!node) throw new Error('Folder not found');
      await chrome.bookmarks.update(node.id, { title: clean });
    } else {
      demoBookmarks = demoBookmarks.map((b) => {
        const full = b.folderName || 'Unsorted';
        if (full !== folderName && !full.startsWith(`${folderName} / `)) return b;
        return { ...b, folderName: full.replace(folderName, clean) };
      });
    }
    await scanBookmarks();
    renderFolderTree();
    showStatus(`Renamed to ${clean}.`, 'ok');
  } catch (err) {
    reportError('Could not rename folder', err);
  }
}

// "Merge" folds a subfolder's bookmarks into another folder path.
async function mergeFolderPrompt(fromPath) {
  const parents = folderTreeData().map((p) => p.name);
  const into = await askText({
    title: `Merge “${fromPath}” into…`,
    help: `Type a folder path, for example “${parents[0] || 'Reading'} / Later”.`,
    value: parents[0] || '',
    okLabel: 'Merge'
  });
  const target = String(into || '').trim();
  if (!target || target === fromPath) return;

  const items = state.bookmarks.filter((bm) => bm.folderName === fromPath && !isProtected(bm));
  if (items.length === 0) {
    showStatus('No movable bookmarks in that folder.', 'info');
    return;
  }

  try {
    await pushSnapshot(`Before merging “${fromPath}”`);
    if (IS_EXTENSION) {
      const targetId = await ensureFolderPath(target);
      if (!targetId) throw new Error('Could not create that folder');
      for (const bm of items) await chrome.bookmarks.move(bm.id, { parentId: targetId });
    } else {
      const ids = new Set(items.map((b) => b.id));
      demoBookmarks = demoBookmarks.map((b) => (ids.has(b.id) ? { ...b, folderName: target } : b));
    }
    await scanBookmarks();
    renderFolderTree();
    showStatus(`Merged ${items.length} bookmark${plural(items.length, '')} into ${target}.`, 'ok');
  } catch (err) {
    reportError('Could not merge folder', err);
  }
}

function findFolderNode(nodes, path) {
  for (const node of nodes || []) {
    if (!node.url && node.title === path) return node;
    if (node.children) {
      const found = findFolderNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function renderReadLater() {
  const items = state.bookmarks.filter((bm) => isReadLater(bm));
  if (els.readlaterCountPill) els.readlaterCountPill.textContent = `${items.length} queued`;
  if (!els.readlaterList) return;

  if (items.length === 0) {
    els.readlaterList.innerHTML = '<p class="empty-note">Nothing queued. Use “Read later” on any bookmark.</p>';
    return;
  }

  els.readlaterList.innerHTML = items
    .map(
      (bm) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(bm.title)}</div>
          <div class="item-meta">${escapeHtml(getDomain(bm.url))}${bm.indexText ? ` · ${escapeHtml(readingTime(bm.indexText))}` : ''}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-done-reading="${escapeHtml(bm.id)}">Mark read</button>
        </div>
      </div>`
    )
    .join('');

  els.readlaterList.querySelectorAll('[data-done-reading]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.doneReading);
      if (bm) await toggleReadLater(bm);
    });
  });
}

function renderNotes() {
  const items = state.bookmarks.filter((bm) => noteFor(bm));
  if (els.notesCountPill) els.notesCountPill.textContent = `${items.length} noted`;
  if (!els.notesList) return;

  if (items.length === 0) {
    els.notesList.innerHTML = '<p class="empty-note">No notes yet. Add one from search results.</p>';
    return;
  }

  els.notesList.innerHTML = items
    .map(
      (bm) => `
      <div class="item-row">
        <div class="item-body">
          <div class="item-title">${escapeHtml(bm.title)}</div>
          <div class="item-meta">${escapeHtml(noteFor(bm).slice(0, 160))}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-inline" data-edit-note="${escapeHtml(bm.id)}">Edit</button>
        </div>
      </div>`
    )
    .join('');

  els.notesList.querySelectorAll('[data-edit-note]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.editNote);
      if (bm) openNoteDialog(bm);
    });
  });
}



/* ---------- Smart collections ---------- */

// These blocks sit above the results but do not depend on the query text, so
// rebuilding them on every keystroke was pure waste. Each one records the
// inputs it was last drawn from and skips the DOM work when nothing changed.
function renderSavedCollections() {
  if (!els.savedCollections) return;
  const sig = `${state.activeCollection}|${state.collections.map((c) => c.id + ':' + c.name).join(',')}`;
  if (els.savedCollections.dataset.sig === sig) return;
  els.savedCollections.dataset.sig = sig;
  if (state.collections.length === 0) {
    els.savedCollections.innerHTML = '';
    return;
  }

  els.savedCollections.innerHTML = state.collections
    .map(
      (collection) => `
      <span class="collection-chip ${state.activeCollection === collection.id ? 'is-active' : ''}">
        <button type="button" data-collection="${escapeHtml(collection.id)}">${escapeHtml(collection.name)}</button>
        <button type="button" class="collection-remove" data-collection-edit="${attr(collection.id)}" title="Edit query" aria-label="Edit collection ${attr(collection.name)}">✎</button>
        <button type="button" class="collection-remove" data-collection-remove="${attr(collection.id)}" title="Delete collection" aria-label="Delete collection ${attr(collection.name)}">✕</button>
      </span>`
    )
    .join('');

  els.savedCollections.querySelectorAll('[data-collection]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCollection = state.activeCollection === btn.dataset.collection ? null : btn.dataset.collection;
      // A collection defines its own query, so a leftover search box value
      // would look like a filter that is not applied.
      if (state.activeCollection) {
        state.search.query = '';
        if (els.searchInput) els.searchInput.value = '';
      }
      renderSearch();
    });
  });
  els.savedCollections.querySelectorAll('[data-collection-edit]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const c = state.collections.find((x) => x.id === btn.dataset.collectionEdit);
      if (c) await openCollectionEditor(c);
    });
  });
  els.savedCollections.querySelectorAll('[data-collection-remove]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.collections = state.collections.filter((c) => c.id !== btn.dataset.collectionRemove);
      if (state.activeCollection === btn.dataset.collectionRemove) state.activeCollection = null;
      await persistCollections();
      renderSearch();
    });
  });
}

async function saveCurrentCollection() {
  const name = await askText({
    title: 'Save this search as a collection',
    help: 'Collections re-run themselves, so new matching bookmarks appear automatically.',
    value: state.search.query || 'My collection',
    okLabel: 'Save collection'
  });
  if (!name || !name.trim()) return;
  state.collections.push({
    id: `c-${Date.now()}`,
    name: name.trim().slice(0, 40),
    query: state.search.query,
    folder: state.search.folder,
    domain: state.search.domain,
    addedWithin: state.search.addedWithin,
    visitedWithin: state.search.visitedWithin,
    tags: state.search.tags
  });
  await persistCollections();
  renderSearch();
  showStatus('Collection saved. It updates itself as your bookmarks change.', 'ok');
}

/* ---------- Search ---------- */
/* ---------- Browse: facets, sorting, bulk select ---------- */

// Facet counts let you see where things are before clicking a filter.
// Facets only change when the library or its folders change, but this used to
// run on every keystroke. Cache it and invalidate from scanBookmarks.
let facetCache = null;

function computeFacets(bookmarks) {
  if (facetCache && facetCache.source === bookmarks) return facetCache.value;
  const folders = new Map();
  const domains = new Map();
  for (const bm of bookmarks) {
    const folder = (bm.folderName || 'Uncategorized').split(' / ')[0];
    folders.set(folder, (folders.get(folder) || 0) + 1);
    const domain = getDomain(bm.url);
    if (domain) domains.set(domain, (domains.get(domain) || 0) + 1);
  }
  const value = { folders, domains };
  facetCache = { source: bookmarks, value };
  return value;
}

function tagCounts() {
  const counts = new Map();
  for (const [key, tags] of Object.entries(state.tagMap)) {
    if (!key) continue;
    for (const tag of tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}

function renderSearchFilters() {
  const { folders, domains } = computeFacets(state.bookmarks);

  const folderChips = ['all', ...[...folders.keys()].sort()];
  if (!folderChips.includes(state.search.folder)) state.search.folder = 'all';

  if (els.searchFolderChips) {
    // Facets change only with the library or the active folder, not with the
    // query, so skip this rebuild while typing.
    const sig = `${state.search.folder}|${folderChips.join(',')}|${state.bookmarks.length}`;
    if (els.searchFolderChips.dataset.sig !== sig) {
      els.searchFolderChips.dataset.sig = sig;
      els.searchFolderChips.innerHTML = folderChips
        .map((folder) => {
          const count = folder === 'all' ? state.bookmarks.length : folders.get(folder) || 0;
          return `
        <button type="button" class="chip-btn ${state.search.folder === folder ? 'is-active' : ''}" data-folder="${attr(folder)}">
          ${folder === 'all' ? 'All folders' : escapeHtml(folder)}
          <span class="chip-count">${count}</span>
        </button>`;
        })
        .join('');

      wireChips(els.searchFolderChips, 'data-folder', (folder) => {
        state.search.folder = folder;
        resetBrowsePage();
      });
      // Dropping a row on a folder chip files it there directly.
      els.searchFolderChips.querySelectorAll('[data-folder]').forEach((chip) => {
        const folder = chip.dataset.folder;
        if (folder === 'all') return;
        chip.addEventListener('dragover', (e) => {
          if (!state.dragId) return;
          e.preventDefault();
          chip.classList.add('is-drop-target');
        });
        chip.addEventListener('dragleave', () => chip.classList.remove('is-drop-target'));
        chip.addEventListener('drop', async (e) => {
          e.preventDefault();
          chip.classList.remove('is-drop-target');
          const id = state.dragId || e.dataTransfer?.getData('text/plain');
          state.dragId = null;
          if (id) await moveBookmarkToFolder(id, folder);
        });
      });
    }
  }

  const domainList = [...domains.entries()].sort((a, b) => b[1] - a[1]);
  if (els.searchDomain) {
    const sig = `${state.search.domain}|${domainList.map(([d, c]) => d + ':' + c).join(',')}`;
    if (els.searchDomain.dataset.sig !== sig) {
      els.searchDomain.dataset.sig = sig;
      els.searchDomain.innerHTML =
        '<option value="all">Any site</option>' +
        domainList
          .map(([domain, count]) => `<option value="${attr(domain)}">${escapeHtml(domain)} (${count})</option>`)
          .join('');
    }
    els.searchDomain.value = domains.has(state.search.domain) ? state.search.domain : 'all';
  }

  if (els.searchTagChips) {
    const counts = tagCounts();
    const tags = [...counts.keys()].sort();
    const sig = `${state.search.tags.join(',')}|${tags.map((t) => t + ':' + counts.get(t)).join(',')}`;
    if (els.searchTagChips.dataset.sig !== sig) {
      els.searchTagChips.dataset.sig = sig;
      els.searchTagChips.innerHTML = tags
        .map(
          (tag) => `
        <button type="button" class="chip-btn ${state.search.tags.includes(tag) ? 'is-active' : ''}" data-search-tag="${attr(tag)}">
          #${escapeHtml(tag)} <span class="chip-count">${counts.get(tag)}</span>
        </button>`
        )
        .join('');
      wireChips(els.searchTagChips, 'data-search-tag', (tag) => {
        state.search.tags = state.search.tags.includes(tag)
          ? state.search.tags.filter((t) => t !== tag)
          : [...state.search.tags, tag];
        resetBrowsePage();
      });
    }
  }
}

function wireChips(container, attribute, handler) {
  container.querySelectorAll(`[${attribute}]`).forEach((btn) => {
    btn.addEventListener('click', () => handler(btn.getAttribute(attribute)));
  });
}

function resetBrowsePage() {
  state.browseLimit = 120;
  renderSearch();
}

/* ---------- Sorting ---------- */

function sortResults(results, mode) {
  const list = [...results];
  switch (mode) {
    case 'newest':
      return list.sort((a, b) => (b.bookmark.dateAdded || 0) - (a.bookmark.dateAdded || 0));
    case 'oldest':
      return list.sort((a, b) => (a.bookmark.dateAdded || 0) - (b.bookmark.dateAdded || 0));
    case 'title':
      return list.sort((a, b) => (a.bookmark.title || '').localeCompare(b.bookmark.title || ''));
    case 'opened':
      return list.sort((a, b) => (b.bookmark.lastVisit || 0) - (a.bookmark.lastVisit || 0));
    default:
      return list;
  }
}

/* ---------- Recent searches ---------- */

function rememberSearch(query) {
  const clean = String(query || '').trim();
  if (clean.length < 2) return;
  state.recentSearches = [clean, ...state.recentSearches.filter((q) => q !== clean)].slice(0, 5);
  storageSet({ [STORAGE.recentSearches]: state.recentSearches });
}

function renderRecentSearches() {
  if (!els.recentSearches) return;
  const items = state.recentSearches;
  const sig = `${state.search.query}|${items.join(',')}`;
  if (els.recentSearches.dataset.sig === sig) return;
  els.recentSearches.dataset.sig = sig;
  if (items.length === 0 || state.search.query) {
    els.recentSearches.innerHTML = '';
    els.recentSearches.hidden = true;
    return;
  }
  els.recentSearches.hidden = false;
  els.recentSearches.innerHTML =
    '<span class="recent-label">Recent:</span>' +
    items
      .map(
        (q) => `<button type="button" class="chip-btn" data-recent="${attr(q)}">${escapeHtml(q)}</button>`
      )
      .join('');
  wireChips(els.recentSearches, 'data-recent', (query) => {
    state.search.query = query;
    els.searchInput.value = query;
    renderSearch();
  });
}

/* ---------- Bulk selection ---------- */

function renderBulkBar() {
  if (els.bulkToggleBtn) {
    els.bulkToggleBtn.classList.toggle('is-active', state.bulkMode);
    els.bulkToggleBtn.setAttribute('aria-pressed', String(state.bulkMode));
    els.bulkToggleBtn.textContent = state.bulkMode ? 'Done' : 'Select';
  }
  if (els.bulkActions) {
    els.bulkActions.hidden = !state.bulkMode;
    // Only the count and mode affect this bar; skip the rebuild when they match.
    const sig = `${state.bulkMode}|${state.bulkSelected.size}`;
    if (els.bulkActions.dataset.sig === sig) return;
    els.bulkActions.dataset.sig = sig;
    if (state.bulkMode) {
      const count = state.bulkSelected.size;
      els.bulkCount.textContent = `${count} selected`;
      for (const btn of [els.bulkTagBtn, els.bulkReadlaterBtn, els.bulkCopyBtn, els.bulkTrashBtn]) {
        if (btn) btn.disabled = count === 0;
      }
    }
  }
}

function clearBulkSelection() {
  state.bulkSelected = new Set();
  state.bulkMode = false;
  renderBulkBar();
}

async function bulkTagSelected() {
  const ids = [...state.bulkSelected];
  if (ids.length === 0) return;
  const input = await askText({
    title: `Tag ${ids.length} bookmark${plural(ids.length, '')}`,
    help: 'Separate multiple tags with spaces. Use frontend/css for a nested tag.',
    okLabel: 'Add tags'
  });
  if (!input) return;
  const tags = String(input)
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);
  if (tags.length === 0) return;

  for (const id of ids) {
    const bm = state.bookmarks.find((b) => b.id === id);
    if (!bm) continue;
    setTagsFor(bm, [...tagsFor(bm), ...tags]);
  }
  await persistTags();
  await scanBookmarks();
  showStatus(`Added ${tags.length} tag${plural(tags.length, '')} to ${ids.length} bookmark${plural(ids.length, '')}.`, 'ok');
}

async function bulkReadLaterSelected() {
  const ids = [...state.bulkSelected];
  if (ids.length === 0) return;
  for (const id of ids) {
    const bm = state.bookmarks.find((b) => b.id === id);
    if (bm) state.readLater[tagKey(bm)] = true;
  }
  await persistNotes();
  await scanBookmarks();
  showStatus(`${ids.length} bookmark${plural(ids.length, '')} queued for later.`, 'ok');
}

async function bulkCopySelected() {
  const ids = [...state.bulkSelected];
  const lines = ids
    .map((id) => state.bookmarks.find((b) => b.id === id))
    .filter(Boolean)
    .map((bm) => bm.url);
  if (lines.length === 0) return;
  const ok = await copyText(lines.join('\n'));
  showStatus(ok ? `Copied ${lines.length} link${plural(lines.length, '')}.` : 'Could not copy to the clipboard.', ok ? 'ok' : 'error');
}

async function bulkTrashSelected() {
  const ids = [...state.bulkSelected];
  if (ids.length === 0) return;
  const ok = await askConfirm({
    title: `Move ${ids.length} bookmark${plural(ids.length, '')} to trash?`,
    body: '<p>They stay in Trash for 30 days and can be restored.</p>',
    okLabel: 'Move to trash',
    danger: true
  });
  if (!ok) return;
  state.busy = true;
  try {
    await pushSnapshot(`Before trashing ${ids.length} selected bookmarks`);
    await moveToTrash(ids, 'Bulk selection');
    clearBulkSelection();
    await scanBookmarks();
    showStatus(`Moved ${ids.length} bookmark${plural(ids.length, '')} to trash.`, 'ok');
  } finally {
    state.busy = false;
  }
}

/* ---------- Empty-state groups ---------- */

// An empty search box shows useful buckets instead of dumping the whole library.
function renderEmptyState() {
  const now = Date.now();
  const groups = [
    {
      title: 'Recently added',
      items: [...state.bookmarks].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, 6)
    },
    {
      title: 'Read later',
      items: state.bookmarks.filter((bm) => isReadLater(bm)).slice(0, 6)
    },
    {
      title: 'Never opened',
      items: state.bookmarks.filter((bm) => !bm.lastVisit).slice(0, 6)
    },
    {
      title: 'Opened this month',
      items: state.bookmarks.filter((bm) => bm.lastVisit && now - bm.lastVisit < 30 * DAY).slice(0, 6)
    }
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    els.searchResults.innerHTML = '<p class="empty-note">No bookmarks yet. Save a page from the toolbar or import a file in Settings.</p>';
    return;
  }

  els.searchResults.innerHTML = groups
    .map(
      (group) => `
      <section class="browse-group">
        <h3 class="browse-group-title">${escapeHtml(group.title)}</h3>
        ${group.items
          .map(
            (bm) => `
          <button type="button" class="browse-row" data-open-row="${attr(bm.id)}">
            <span class="browse-row-title">${escapeHtml(bm.title)}</span>
            <span class="browse-row-meta">${escapeHtml((bm.folderName || 'Uncategorized').replace(' / ', ' › '))}</span>
          </button>`
          )
          .join('')}
      </section>`
    )
    .join('');

  els.searchResults.querySelectorAll('[data-open-row]').forEach((btn) => {
    btn.addEventListener('click', () => openBookmark(btn.dataset.openRow));
  });
}

/* ---------- Main browse render ---------- */

function renderSearch() {
  renderSearchFilters();
  renderSavedCollections();
  renderRecentSearches();
  renderBulkBar();

  if (els.sortSelect) els.sortSelect.value = state.browseSort;
  if (els.groupSelect) els.groupSelect.value = state.browseGroup;

  const visits = new Map();
  for (const bm of state.bookmarks) if (bm.lastVisit) visits.set(bm.id, bm.lastVisit);

  const collection = state.collections.find((c) => c.id === state.activeCollection);
  let results;

  if (collection) {
    const matched = runCollection(state.bookmarks, collection, {
      tagMap: state.tagMap,
      visits,
      rules: state.rules
    });
    results = matched.map((bookmark) => ({
      bookmark,
      matchReason: `Collection: ${collection.name}`,
      snippet: collectionSnippet(bookmark),
      tags: tagsFor(bookmark)
    }));
  } else {
    // Operators (tag:, site:, has:) narrow the pool before relevance runs.
    const parsed = parseQuery(state.search.query);
    const scoped = state.bookmarks.filter((bm) =>
      passesOperators(bm, parsed.operators, {
        tagMap: state.tagMap,
        notes: state.notes,
        tagKey,
        matches: tagMatches
      })
    );

    results = searchBookmarks(scoped, {
      query: parsed.text,
      folder: state.search.folder,
      domain: state.search.domain,
      addedWithin: Number(state.search.addedWithin) || 0,
      visitedWithin: state.search.visitedWithin,
      tags: state.search.tags,
      tagMap: state.tagMap,
      visits,
      notes: state.notes
    });

    // Operator-only searches (no free text) still need their results back.
    if (!parsed.text.trim() && scoped.length !== state.bookmarks.length) {
      results = scoped.map((bookmark) => ({
        bookmark,
        score: 1,
        matchReason: 'Matched your filters',
        snippet: formatContentSnippet(bookmark.content).slice(0, 160),
        tags: tagsFor(bookmark)
      }));
    }

    // Typo tolerance: only when the exact pass found nothing.
    if (results.length === 0 && parsed.text.trim().length >= 4) {
      const needle = parsed.text.trim().toLowerCase();
      const fallback = scoped.filter(
        (bm) =>
          fuzzyIncludes((bm.title || '').toLowerCase(), needle) ||
          fuzzyIncludes((bm.url || '').toLowerCase(), needle) ||
          fuzzyIncludes(formatContentSnippet(bm.content).toLowerCase(), needle)
      );
      if (fallback.length) {
        results = fallback.map((bookmark) => ({
          bookmark,
          score: 1,
          matchReason: `Fuzzy match for “${needle}”`,
          snippet: formatContentSnippet(bookmark.content).slice(0, 160),
          tags: tagsFor(bookmark)
        }));
      }
    }

    // Meaning search replaces the list when it has confident matches.
    if (state.semanticOn && parsed.text.trim()) {
      const semantic = semanticOverride(parsed.text);
      if (semantic) {
        results = semantic.map((row) => ({
          bookmark: row.bookmark,
          score: row.score,
          matchReason: `Meaning match · ${Math.round(row.score * 100)}%`,
          snippet: formatContentSnippet(row.bookmark.content).slice(0, 160),
          tags: tagsFor(row.bookmark)
        }));
      }
    }
  }

  // Pin selected bookmarks above everything else.
  const pinned = new Set(state.pins);
  if (pinned.size && state.browseSort === 'relevance' && !state.search.query) {
    results = [
      ...results.filter((r) => pinned.has(r.bookmark.id)),
      ...results.filter((r) => !pinned.has(r.bookmark.id))
    ];
  } else if (state.browseSort === 'useful') {
    results = [...results].sort((a, b) => usefulnessScore(b, visits) - usefulnessScore(a, visits));
  } else if (state.browseSort !== 'relevance') {
    results = sortResults(results, state.browseSort);
  }

  state.lastResults = results;
  const total = results.length;
  const visible = results.slice(0, state.browseLimit);

  if (els.searchCount) {
    const truncated = total > visible.length;
    els.searchCount.textContent = truncated
      ? `Showing ${visible.length} of ${total} — refine or load more`
      : `${total} result${plural(total, '')}`;
  }

  if (total === 0) {
    const directUrl = looksLikeUrl(state.search.query);
    if (directUrl) {
      els.searchResults.innerHTML = `
        <p class="empty-note">Nothing saved matches that. It looks like an address though:</p>
        <a class="result-row-btn" href="${attr(directUrl.url)}" target="_blank" rel="noopener noreferrer">
          Open ${escapeHtml(directUrl.label)}
        </a>`;
      return;
    }
    if (!state.search.query && state.search.folder === 'all' && state.search.domain === 'all' && state.search.tags.length === 0) {
      renderEmptyState();
      return;
    }
    els.searchResults.innerHTML =
      '<p class="empty-note">No matching bookmarks. Try a broader topic or clear a filter.</p>';
    return;
  }

  const hasQuery = Boolean(state.search.query) || Boolean(collection);

  // A typed address sits above the results so Enter-style intent still works.
  const directUrl = !collection && state.browseGroup === 'none' ? looksLikeUrl(state.search.query) : null;
  const directRow = directUrl
    ? `<a class="result-row-btn direct-url-row" href="${attr(directUrl.url)}" target="_blank" rel="noopener noreferrer">
         <span class="direct-url-label">Open</span> ${escapeHtml(directUrl.label)}
       </a>`
    : '';

  // Grouping renders headers; otherwise one flat list.
  const grouped = groupResults(visible, state.browseGroup, getDomain);

  els.searchResults.innerHTML =
    directRow +
    (grouped
      ? grouped
          .map(
            (group) => `
        <section class="result-group">
          <h3 class="result-group-title">${escapeHtml(group.name)} <span class="chip-count">${group.items.length}</span></h3>
          ${group.items.map((item) => renderResultRow(item, { hasQuery, collection })).join('')}
        </section>`
          )
          .join('')
      : visible.map((item) => renderResultRow(item, { hasQuery, collection })).join('')) +
    (total > visible.length
      ? `<button type="button" class="btn-secondary load-more" id="load-more-btn">Load ${Math.min(120, total - visible.length)} more</button>`
      : '');

  wireSearchResults(els.searchResults);
  applyBrowseView();
}

function renderResultRow({ bookmark, matchReason, snippet, tags }, { hasQuery, collection }) {
  const note = noteFor(bookmark);
  const minutes = readingTime(bookmark.indexText || bookmark.content?.text || '');
  const selected = state.bulkSelected.has(bookmark.id);
  const suggestion = hasQuery ? '' : folderSuggestion(bookmark);
  // Showing the words around the hit explains why a row matched.
  const needle = (state.search.query || '').split(/\s+/).filter((w) => !w.includes(':')).pop() || '';
  const context =
    needle && hasQuery
      ? matchContext(bookmark.indexText || formatContentSnippet(bookmark.content), needle, 60)
      : '';
  return `
      <div class="search-result ${selected ? 'is-selected' : ''} ${state.bulkMode ? 'is-bulk' : ''}" data-result-row="${attr(bookmark.id)}" draggable="true">
        <div class="search-result-top">
          ${
            state.bulkMode
              ? `<input type="checkbox" class="bulk-check" data-bulk-check="${attr(bookmark.id)}" ${selected ? 'checked' : ''} aria-label="Select ${attr(bookmark.title)}" />`
              : ''
          }
          <div class="item-title">${escapeHtml(bookmark.title)}</div>
          ${isPinned(bookmark) ? '<span class="tag tag-pin">pinned</span>' : ''}
          ${hasQuery ? `<span class="tag tag-move">${escapeHtml(matchReason)}</span>` : ''}
        </div>
        <div class="search-breadcrumb">${escapeHtml((bookmark.folderName || 'Uncategorized').replace(' / ', ' › '))}</div>
        ${snippet ? `<div class="search-snippet">${escapeHtml(snippet)}</div>` : ''}
        ${context ? `<div class="search-context">…${escapeHtml(context.replace(/^…/, ''))}</div>` : ''}
        ${note ? `<div class="search-note">📝 ${escapeHtml(note.slice(0, 160))}</div>` : ''}
        <div class="tag-row">
          ${tags.map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}
          ${isReadLater(bookmark) ? '<span class="mini-tag is-accent">read later</span>' : ''}
          ${minutes ? `<span class="mini-tag is-muted">${escapeHtml(minutes)}</span>` : ''}
          <span class="mini-tag is-muted">${escapeHtml(describeLastVisit(bookmark.lastVisit || 0))}</span>
          ${suggestion ? `<span class="mini-tag is-muted">→ ${escapeHtml(suggestion)}</span>` : ''}
        </div>
        <div class="result-actions">
          <button type="button" class="btn-inline" data-open="${attr(bookmark.id)}">Open</button>
          <button type="button" class="btn-inline" data-result-tag="${attr(bookmark.id)}">Tags</button>
          <button type="button" class="btn-inline" data-result-note="${attr(bookmark.id)}">Note</button>
          <details class="row-more">
            <summary class="btn-inline" aria-label="More actions for ${attr(bookmark.title)}">More</summary>
            <div class="row-more-menu">
              <button type="button" class="btn-inline" data-result-reader="${attr(bookmark.id)}">Read</button>
              <button type="button" class="btn-inline" data-result-readlater="${attr(bookmark.id)}">${isReadLater(bookmark) ? 'Read ✓' : 'Read later'}</button>
              <button type="button" class="btn-inline" data-result-pin="${attr(bookmark.id)}">${isPinned(bookmark) ? 'Unpin' : 'Pin'}</button>
              <button type="button" class="btn-inline" data-result-copy="${attr(bookmark.id)}">Copy</button>
              <button type="button" class="btn-inline" data-result-similar="${attr(bookmark.id)}">Similar</button>
            </div>
          </details>
        </div>
      </div>`;
}

// Suggested folder from the confidence engine, so Browse hints where things belong.
function folderSuggestion(bookmark) {
  try {
    const scored = scoreClassification(bookmark, state.rules);
    if (scored.folder && scored.folder !== bookmark.folderName) {
      return `${scored.folder} · ${scored.confidence}%`;
    }
  } catch {
    // classification is a hint, never a blocker
  }
  return '';
}

// Rows are rebuilt on every keystroke, so binding a listener per button meant
// thousands of allocations while typing. One delegated handler on the results
// container replaces eleven querySelectorAll passes and all per-row listeners.
function wireSearchResults(container) {
  if (!container || container.dataset.wired === '1') return;
  container.dataset.wired = '1';

  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[data-result-row]');
    if (!row) return;
    state.dragId = row.dataset.resultRow;
    e.dataTransfer?.setData('text/plain', state.dragId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
  });

  container.addEventListener('dragend', (e) => {
    const row = e.target.closest('[data-result-row]');
    if (!row) return;
    state.dragId = null;
    row.classList.remove('is-dragging');
    document.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
  });

  container.addEventListener('change', (e) => {
    const input = e.target.closest('[data-bulk-check]');
    if (!input) return;
    const id = input.dataset.bulkCheck;
    if (input.checked) state.bulkSelected.add(id);
    else state.bulkSelected.delete(id);
    input.closest('.search-result')?.classList.toggle('is-selected', input.checked);
    renderBulkBar();
  });

  container.addEventListener('click', (e) => {
    const loadMore = e.target.closest('#load-more-btn');
    if (loadMore) {
      state.browseLimit += 120;
      renderSearch();
      return;
    }

    const action = e.target.closest(
      '[data-open],[data-result-tag],[data-result-note],[data-result-reader],[data-result-readlater],[data-result-pin],[data-result-copy],[data-result-similar]'
    );
    if (!action) return;
    const ds = action.dataset;
    const byId = (id) => state.bookmarks.find((b) => b.id === id);

    if (ds.open) {
      const bm = byId(ds.open);
      if (bm) {
        rememberSearch(state.search.query);
        openBookmark(bm.id);
      }
    } else if (ds.resultTag) {
      const bm = byId(ds.resultTag);
      if (bm) openTagDialog(bm);
    } else if (ds.resultNote) {
      const bm = byId(ds.resultNote);
      if (bm) openNoteDialog(bm);
    } else if (ds.resultReader) {
      const bm = byId(ds.resultReader);
      if (bm) openReader(bm);
    } else if (ds.resultReadlater) {
      const bm = byId(ds.resultReadlater);
      if (bm) toggleReadLater(bm);
    } else if (ds.resultPin) {
      togglePin(ds.resultPin);
    } else if (ds.resultCopy) {
      copyBookmark(ds.resultCopy);
    } else if (ds.resultSimilar) {
      const bm = byId(ds.resultSimilar);
      if (bm) showSimilar(bm);
    }
  });
}

/* ---------- Pins and copy ---------- */

function isPinned(bookmark) {
  return state.pins.includes(bookmark.id);
}

async function togglePin(id) {
  state.pins = state.pins.includes(id) ? state.pins.filter((p) => p !== id) : [...state.pins, id];
  await storageSet({ [STORAGE.pins]: state.pins });
  renderSearch();
  showStatus(state.pins.includes(id) ? 'Pinned to the top of Browse.' : 'Unpinned.', 'ok');
}

async function copyBookmark(id) {
  const bm = state.bookmarks.find((b) => b.id === id);
  if (!bm) return;
  const ok = await copyText(`[${bm.title}](${bm.url})`);
  showStatus(ok ? 'Copied as Markdown link.' : 'Could not copy.', ok ? 'ok' : 'error');
}

/* ---------- Keyboard navigation in Browse ---------- */

function handleBrowseKey(event) {
  const panel = document.getElementById('panel-browse');
  if (!panel || panel.hidden) return;
  const target = event.target;

  if (event.key === '/' && !isTypingTarget(target)) {
    event.preventDefault();
    els.searchInput.focus();
    return;
  }

  const rows = [...els.searchResults.querySelectorAll('[data-result-row], [data-open-row]')];
  if (rows.length === 0) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!target.closest('[data-result-row], [data-open-row]')) return;
    event.preventDefault();
    const index = rows.indexOf(target.closest('[data-result-row], [data-open-row]'));
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) next.focus();
    return;
  }

  const row = target.closest('[data-result-row]');
  if (!row) return;
  const id = row.dataset.resultRow;
  const bm = state.bookmarks.find((b) => b.id === id);
  if (!bm) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    openBookmark(id);
  } else if (event.key === 't') {
    event.preventDefault();
    openTagDialog(bm);
  } else if (event.key === 'n') {
    event.preventDefault();
    openNoteDialog(bm);
  } else if (event.key === ' ') {
    event.preventDefault();
    if (!state.bulkMode) {
      state.bulkMode = true;
      renderSearch();
    }
    state.bulkSelected.add(id);
    renderBulkBar();
    renderSearch();
  }
}


function collectionSnippet(bookmark) {
  const note = noteFor(bookmark);
  if (note) return note;
  const content = bookmark.content;
  if (content) {
    const parts = [content.description, content.headings, content.excerpt].filter(Boolean).join(' — ');
    if (parts) return parts.slice(0, 160);
  }
  return (bookmark.indexText || '').slice(0, 160) || getDomain(bookmark.url);
}

function showSimilar(bookmark) {
  const similar = findSimilar(bookmark, state.bookmarks, 6);
  if (similar.length === 0) {
    showStatus('No similar bookmarks found yet. Build the index to improve matching.', 'info');
    return;
  }
  state.search = { query: '', folder: 'all', domain: 'all', addedWithin: '0', visitedWithin: 'any', tags: [] };
  state.activeCollection = null;

  els.searchResults.innerHTML = `
    <p class="field-help">Similar to “${escapeHtml(bookmark.title)}”:</p>
    ${similar
      .map(
        ({ bookmark: bm, score }) => `
      <div class="search-result">
        <div class="search-result-top">
          <div class="item-title">${escapeHtml(bm.title)}</div>
          <span class="tag tag-move">${Math.round(score * 100)}% similar</span>
        </div>
        <div class="search-breadcrumb">${escapeHtml((bm.folderName || '').replace(' / ', ' › '))}</div>
        <div class="result-actions">
          <button type="button" class="btn-inline" data-open="${escapeHtml(bm.id)}">Open</button>
          <button type="button" class="btn-inline" data-result-tag="${escapeHtml(bm.id)}">Tags</button>
        </div>
      </div>`
      )
      .join('')}`;

  els.searchResults.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openBookmark(btn.dataset.open));
  });
  els.searchResults.querySelectorAll('[data-result-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bm = state.bookmarks.find((b) => b.id === btn.dataset.resultTag);
      if (bm) openTagDialog(bm);
    });
  });
  renderSavedCollections();
  if (els.searchCount) els.searchCount.textContent = `${similar.length} similar`;
}

async function openBookmark(id) {
  const bm = state.bookmarks.find((b) => b.id === id);
  if (!bm) return;
  if (IS_EXTENSION) await sendMessageSafe({ type: 'OPEN_URL', url: bm.url });
  else window.open(bm.url, '_blank', 'noopener');
}



/* ---------- Visits ---------- */

async function loadVisits() {
  if (state.bookmarks.length === 0) return;
  if (IS_EXTENSION) {
    const urls = state.bookmarks.map((b) => b.url).filter(Boolean);
    const res = await sendMessageSafe({ type: 'GET_VISITS', urls });
    const visits = (res && res.visits) || {};
    for (const bm of state.bookmarks) {
      const last = visits[bm.url] || 0;
      bm.lastVisit = last;
      state.visitCache.set(bm.id, last);
    }
    return;
  }
  for (const bm of state.bookmarks) {
    const last = bm._demoLastVisit || state.visitCache.get(bm.id) || 0;
    bm.lastVisit = last;
    if (last) state.visitCache.set(bm.id, last);
  }
}

/* ---------- Dead links ---------- */

function renderSkipDomains() {
  if (!els.skipDomainChips) return;
  els.skipDomainChips.innerHTML = state.skipDomains
    .map(
      (domain) => `
      <button type="button" class="chip-btn is-active" data-skip-remove="${escapeHtml(domain)}">
        ${escapeHtml(domain)} ✕
      </button>`
    )
    .join('');
  els.skipDomainChips.querySelectorAll('[data-skip-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.skipDomains = state.skipDomains.filter((d) => d !== btn.dataset.skipRemove);
      await persistProtect();
      renderSkipDomains();
    });
  });
}

async function runDeadLinkCheck({ onlySafe = false } = {}) {
  if (state.busy) return;
  switchTab('cleanup');
  state.busy = true;
  state.linkCheckAbort = new AbortController();
  if (els.runDeadCheckBtn) els.runDeadCheckBtn.disabled = true;
  if (els.quickDeadScanBtn) els.quickDeadScanBtn.disabled = true;
  if (els.cancelDeadBtn) els.cancelDeadBtn.hidden = false;
  if (els.deadProgressWrap) els.deadProgressWrap.hidden = false;
  if (els.deadProgressBar) els.deadProgressBar.style.width = '0%';

  const targets = state.bookmarks.filter((bm) => !isSkippedDomain(bm.url) && !isProtected(bm));
  if (els.deadProgressText) els.deadProgressText.textContent = `Checking 0 / ${targets.length}...`;

  const checkFn = async (bm, ctx) => {
    if (IS_EXTENSION) {
      const res = await sendMessageSafe({ type: 'CHECK_LINK', url: bm.url });
      return res || { ok: true, category: 'ok', reason: 'Not checked' };
    }
    await new Promise((r, j) => {
      const t = setTimeout(r, 20);
      ctx?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        j(new DOMException('Cancelled', 'AbortError'));
      }, { once: true });
    });
    if (bm._demoDead) return { ok: false, category: 'dead', reason: bm._demoDead };
    if (bm._demoBlocked) return { ok: true, category: 'blocked', reason: bm._demoBlocked };
    if (bm._demoRedirect) return { ok: true, category: 'ok', reason: 'Active', redirect: bm._demoRedirect };
    return { ok: true, category: 'ok', reason: 'Active' };
  };

  try {
    const { results: found, cancelled } = await checkDeadLinks(
      targets,
      checkFn,
      (done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 100;
        if (els.deadProgressBar) els.deadProgressBar.style.width = `${pct}%`;
        if (els.deadProgressText) els.deadProgressText.textContent = `Checking ${done} / ${total}...`;
      },
      { signal: state.linkCheckAbort.signal, concurrency: 5, perDomainGap: 300 }
    );

    // Bot walls and redirects are reported but never treated as dead.
    const dead = found.filter((item) => !item.ok && item.category !== 'blocked');
    const blocked = found.filter((item) => item.ok && item.category === 'blocked');
    state.redirects = found.filter((item) => item.redirect).map((item) => ({ bookmark: item.bookmark, redirect: item.redirect }));

    state.checkedDead = true;
    state.deadLinks = [...dead, ...blocked];
    state.selectedDead = new Set(dead.map((d) => d.bookmark.id));
    renderStats();
    renderDeadLinks();
    renderTrash();
    if (cancelled) {
      showStatus(`Check stopped after ${found.length} problem${plural(found.length, '')} found. Results so far are kept.`, 'info');
    } else {
      showStatus(
        dead.length > 0
          ? `Found ${dead.length} dead link${dead.length === 1 ? '' : 's'}${blocked.length ? ` and ${blocked.length} bot wall${blocked.length === 1 ? '' : 's'} (kept)` : ''}.`
          : 'Link check finished — no dead links found.',
        dead.length > 0 ? 'info' : 'ok'
      );
    }
    if (state.redirects.length) {
      renderRedirectList();
    }

    if (onlySafe) {
      // Safe clean finishes here so the result and undo stay in view.
      switchTab('cleanup');
    }
  } catch (err) {
    showStatus(`Link check failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
    state.linkCheckAbort = null;
    if (els.runDeadCheckBtn) els.runDeadCheckBtn.disabled = false;
    if (els.quickDeadScanBtn) els.quickDeadScanBtn.disabled = false;
    if (els.cancelDeadBtn) els.cancelDeadBtn.hidden = true;
    if (els.deadProgressWrap) els.deadProgressWrap.hidden = true;
    renderRedirectList();
    updateActionButtons();
  }
}

/* ---------- Stale ---------- */

async function runStaleCheck() {
  if (state.busy) return;
  state.busy = true;
  if (els.runStaleCheckBtn) els.runStaleCheckBtn.disabled = true;
  try {
    await loadVisits();
    const mode = els.staleSelect.value;
    const days = mode === 'never' ? 0 : Number(mode);
    const visits = new Map();
    for (const bm of state.bookmarks) visits.set(bm.id, bm.lastVisit || 0);

    state.staleLinks = findStaleBookmarks(
      state.bookmarks.filter((bm) => !isProtected(bm)),
      visits,
      mode === 'never' ? 'never' : 'days',
      days
    ).map((bm) => ({ bookmark: bm, lastVisit: bm.lastVisit || 0 }));

    state.checkedStale = true;
    state.selectedStale = new Set(state.staleLinks.map((s) => s.bookmark.id));
    renderStale();
    renderStats();
    showStatus(
      state.staleLinks.length > 0
        ? `Found ${state.staleLinks.length} bookmark${state.staleLinks.length === 1 ? '' : 's'} matching that age.`
        : 'No stale bookmarks in that range.',
      state.staleLinks.length > 0 ? 'info' : 'ok'
    );
  } catch (err) {
    showStatus(`Stale check failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
    if (els.runStaleCheckBtn) els.runStaleCheckBtn.disabled = false;
    updateActionButtons();
  }
}

/* ---------- Aging folders ---------- */

function runAgingCheck() {
  const months = Number(els.agingSelect.value) || 12;
  state.agingFolders = findAgingFolders(
    state.bookmarks.filter((bm) => !isProtected(bm)),
    months
  );
  state.checkedAging = true;
  renderAging();
  showStatus(
    state.agingFolders.length > 0
      ? `${state.agingFolders.length} folder${state.agingFolders.length === 1 ? '' : 's'} have gone quiet.`
      : 'Every folder has recent activity.',
    'ok'
  );
}

/* ---------- Full-page index ---------- */
/* ---------- Storage panel and diagnostics ---------- */

async function renderStorageUsage() {
  if (!els.storageUsageText) return;
  try {
    const { used, limit, perKey } = await storageUsage();
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    els.storageUsageText.textContent = limit
      ? `${formatBytes(used)} of ${formatBytes(limit)}`
      : `${formatBytes(used)} used`;
    if (els.storageBar) {
      // Without a hard limit the bar tracks a soft 5 MB reference instead.
      const reference = limit || 5 * 1024 * 1024;
      const width = Math.min(100, Math.max(1, Math.round((used / reference) * 100)));
      els.storageBar.style.width = `${width}%`;
      els.storageBar.style.background = width > 85 ? 'var(--danger)' : '';
    }
    if (els.storageDetail) {
      const biggest = Object.entries(perKey).sort((a, b) => b[1] - a[1])[0];
      const named = {
        [STORAGE.index]: 'page text index',
        [STORAGE.history]: 'backup history',
        [STORAGE.trash]: 'trash',
        [STORAGE.tags]: 'tags'
      };
      const tail = limit ? `${pct}% of the browser limit used` : 'no hard limit — the extension has unlimited storage';
      els.storageDetail.textContent = biggest
        ? `${tail}. Biggest is ${named[biggest[0]] || biggest[0]} at ${formatBytes(biggest[1])}.`
        : 'Nothing stored yet.';
    }
  } catch {
    els.storageUsageText.textContent = 'Unavailable';
  }
}

function renderDiagnostics() {
  if (!els.diagOutput) return;
  if (!lastError) {
    els.diagOutput.value = '';
    els.diagOutput.placeholder = 'No errors recorded.';
    return;
  }
  els.diagOutput.value = [
    `Context: ${lastError.context}`,
    `Message: ${lastError.message}`,
    `When: ${lastError.at}`,
    '',
    lastError.stack
  ].join('\n');
}

// A quick health check the user can run themselves instead of reporting "it broke".
async function runSelfCheck() {
  const lines = [];
  const add = (ok, label, detail = '') => lines.push(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);

  add(state.bookmarks.length > 0, 'Bookmarks loaded', `${state.bookmarks.length} found`);
  add(Boolean(els.confirmDialog), 'Confirm dialog present');
  add(Boolean(els.promptDialog), 'Prompt dialog present');
  add(Boolean(els.tagDialog), 'Tag dialog present');
  add(Boolean(els.searchResults), 'Result list present');

  const dupeCount = state.duplicates.reduce((sum, g) => sum + g.duplicates.length, 0);
  add(true, 'Duplicate scan', `${dupeCount} extra copies`);
  add(true, 'Page text index', `${state.indexTextCache.size} pages`);

  try {
    const { used, limit } = await storageUsage();
    add(
      limit === null || used < limit,
      'Storage within quota',
      limit === null ? `${formatBytes(used)} used, no hard limit` : `${formatBytes(used)} of ${formatBytes(limit)}`
    );
  } catch {
    add(false, 'Storage readable');
  }

  lines.push('', 'Engine checks');
  for (const result of runEngineChecks()) {
    add(result.ok, result.name, result.detail);
  }

  const text = lines.join('\n');
  if (els.diagOutput) els.diagOutput.value = text;
  const firstFail = lines.find((l) => l.startsWith('✗'));
  showStatus(
    firstFail ? `Self-check: ${firstFail.replace('✗ ', '')}` : 'Self-check passed.',
    firstFail ? 'error' : 'ok'
  );
}

// Pure-function checks. They live in the app so they can run anywhere the
// extension does, instead of needing a separate test page.
function runEngineChecks() {
  const results = [];
  const check = (name, fn) => {
    try {
      results.push({ name, ok: true, detail: String(fn() || '') });
    } catch (err) {
      results.push({ name, ok: false, detail: err.message || String(err) });
    }
  };
  const assert = (cond, message) => {
    if (!cond) throw new Error(message);
  };

  check('normalizeUrl drops tracking params', () => {
    const out = normalizeUrl('https://example.com/page?utm_source=x&id=7');
    assert(out.includes('id=7'), `lost id param: ${out}`);
    assert(!out.includes('utm_source'), `kept utm: ${out}`);
    return out;
  });

  check('normalizeUrl ignores protocol and www', () => {
    const a = normalizeUrl('http://www.example.com/a/');
    const b = normalizeUrl('https://example.com/a');
    assert(a === b, `${a} !== ${b}`);
    return a;
  });

  check('normalizeUrl keeps different paths apart', () => {
    assert(
      normalizeUrl('https://example.com/a') !== normalizeUrl('https://example.com/b'),
      'different paths matched'
    );
    return 'distinct';
  });

  check('normalizeUrl is cache-safe', () => {
    // The result is memoised, so repeated calls must stay identical and a
    // different input must never return the previous answer.
    const first = normalizeUrl('https://cache.example/one/');
    const again = normalizeUrl('https://cache.example/one/');
    const other = normalizeUrl('https://cache.example/two/');
    assert(first === again, 'repeat call changed');
    assert(first !== other, 'cache leaked between inputs');
    return first;
  });

  check('findDuplicates groups the same page', () => {
    const groups = findDuplicates([
      { id: '1', url: 'https://example.com/x', title: 'A' },
      { id: '2', url: 'http://www.example.com/x/', title: 'A copy' },
      { id: '3', url: 'https://other.com/', title: 'B' }
    ]);
    assert(groups.length === 1, `expected 1 group, got ${groups.length}`);
    assert(groups[0].duplicates.length === 1, `expected 1 copy, got ${groups[0].duplicates.length}`);
    return `${groups.length} group`;
  });

  check('findDuplicates finds nothing for distinct pages', () => {
    const groups = findDuplicates([
      { id: '1', url: 'https://a.com/1' },
      { id: '2', url: 'https://b.com/2' }
    ]);
    assert(groups.length === 0, `expected none, got ${groups.length}`);
    return 'clean';
  });

  check('parseBookmarksHtml reads a Netscape export', () => {
    const html = `<DL><p><DT><H3>Work</H3><DL><p>
      <DT><A HREF="https://example.com/a" ADD_DATE="1700000000">Example A</A>
      <DT><A HREF="https://example.com/b" ADD_DATE="1700000100">Example B</A>
      </DL><p></DL><p>`;
    const items = parseBookmarksHtml(html);
    assert(items.length === 2, `expected 2, got ${items.length}`);
    return `${items.length} bookmarks`;
  });

  check('parseBookmarksHtml survives junk input', () => {
    const items = parseBookmarksHtml('<p>not a bookmark file</p>');
    assert(Array.isArray(items), 'did not return an array');
    assert(items.length === 0, `expected 0, got ${items.length}`);
    return 'no crash';
  });

  check('toCsv escapes commas and quotes', () => {
    const csv = toCsv([{ title: 'A, B "quoted"', url: 'https://x.com/', folderName: 'Work' }], {});
    assert(csv.includes('"A, B ""quoted"""'), `escaping wrong: ${csv.split('\n')[1]}`);
    return 'escaped';
  });

  check('findOrphans keeps live records', () => {
    const orphans = findOrphans(
      [{ id: '1', key: 'example.com/page' }],
      { tags: { 'example.com/page': ['ok'] }, notes: {}, readLater: {}, pins: ['1'], indexText: { 1: 'text' } }
    );
    assert(orphanCount(orphans) === 0, `false positives: ${describeOrphans(orphans)}`);
    return 'no false positives';
  });

  check('findOrphans spots dead tags and notes', () => {
    const orphans = findOrphans(
      [{ id: '1', key: 'example.com/page' }],
      {
        tags: { 'example.com/page': ['ok'], 'gone.com/x': ['lost'] },
        notes: { 'gone.com/x': 'a note' },
        readLater: { 'gone.com/x': true },
        pins: ['1', '99'],
        indexText: { 1: 'text', 99: 'orphan text' }
      }
    );
    assert(orphans.tags.length === 1, `tags: ${orphans.tags.length}`);
    assert(orphans.notes.length === 1, `notes: ${orphans.notes.length}`);
    assert(orphans.pins.length === 1 && orphans.pins[0] === '99', `pins: ${orphans.pins}`);
    assert(orphans.index.length === 1 && orphans.index[0] === '99', `index: ${orphans.index}`);
    return '4 leftovers found';
  });

  check('withoutOrphans removes only the leftovers', () => {
    const cleaned = withoutOrphans(
      {
        tags: { keep: ['a'], drop: ['b'] },
        notes: { keep: 'n', drop: 'm' },
        readLater: { drop: true },
        indexText: { keep: 't', drop: 'u' },
        pins: ['keep', 'drop']
      },
      { tags: ['drop'], notes: ['drop'], readLater: ['drop'], index: ['drop'], pins: ['drop'] }
    );
    assert(Object.keys(cleaned.tags).join() === 'keep', `tags kept: ${Object.keys(cleaned.tags)}`);
    assert(Object.keys(cleaned.notes).join() === 'keep', `notes kept: ${Object.keys(cleaned.notes)}`);
    assert(Object.keys(cleaned.indexText).join() === 'keep', `index kept: ${Object.keys(cleaned.indexText)}`);
    assert(cleaned.pins.length === 1 && cleaned.pins[0] === 'keep', `pins: ${cleaned.pins}`);
    return 'cleaned precisely';
  });

  /* ---------- AI feature helpers ---------- */

  check('cosineSimilarity matches identical vectors', () => {
    const score = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    assert(Math.abs(score - 1) < 1e-9, `expected 1, got ${score}`);
    return '1.0';
  });

  check('cosineSimilarity rejects mismatched shapes', () => {
    assert(cosineSimilarity([1, 2], [1, 2, 3]) === 0, 'should be 0 for different lengths');
    assert(cosineSimilarity([], []) === 0, 'should be 0 for empty vectors');
    return 'safe fallback';
  });

  check('rankByVector orders by meaning and drops weak matches', () => {
    const rows = rankByVector(
      [1, 0],
      [
        { id: 'near', vector: [0.9, 0.1] },
        { id: 'far', vector: [0, 1] }
      ],
      { minScore: 0.5 }
    );
    assert(rows.length === 1 && rows[0].id === 'near', `got ${rows.map((r) => r.id)}`);
    return '1 of 2 kept';
  });

  check('sanitizeTagAssignments blocks invented tags', () => {
    const out = sanitizeTagAssignments(
      { assignments: { a: ['design', 'Made Up'], ghost: ['design'] } },
      ['a'],
      ['design', 'css']
    );
    assert(out.a && out.a.length === 1 && out.a[0] === 'design', `got ${JSON.stringify(out)}`);
    assert(!out.ghost, 'kept an unknown bookmark id');
    return 'filtered';
  });

  check('sanitizeTagAssignments caps at three tags', () => {
    const out = sanitizeTagAssignments({ assignments: { a: ['a1', 'a2', 'a3', 'a4'] } }, ['a'], ['a1', 'a2', 'a3', 'a4']);
    assert(out.a.length === 3, `expected 3, got ${out.a.length}`);
    return '3 max';
  });

  check('buildMergePlan rejects self-merges and invented tags', () => {
    const plan = buildMergePlan(
      {
        merges: [
          { from: ['js', 'JS'], to: 'javascript', reason: 'same' },
          { from: ['javascript'], to: 'javascript' },
          { from: ['nope'], to: 'made-up' }
        ]
      },
      ['js', 'JS', 'javascript']
    );
    assert(plan.length === 1, `expected 1 safe merge, got ${plan.length}`);
    assert(plan[0].to === 'javascript' && plan[0].from.length === 2, JSON.stringify(plan[0]));
    return '1 merge, 2 tags in';
  });

  check('buildMergePlan does not merge the same tag twice', () => {
    const plan = buildMergePlan(
      { merges: [{ from: ['a'], to: 'b' }, { from: ['a'], to: 'c' }] },
      ['a', 'b', 'c']
    );
    assert(plan.length === 1, `expected 1, got ${plan.length}`);
    return 'deduped';
  });

  check('applyMergePlan rewrites tags and keeps families', () => {
    const next = applyMergePlan(
      { k1: ['JS', 'css/grid'], k2: ['runtime'] },
      [{ from: ['JS'], to: 'javascript' }, { from: ['runtime'], to: 'javascript' }]
    );
    assert(next.k1.includes('javascript'), `k1: ${next.k1}`);
    assert(next.k1.includes('css/grid'), `k1 lost the nested tag: ${next.k1}`);
    assert(next.k2.includes('javascript'), `k2: ${next.k2}`);
    assert(next.k1.length === 2, `expected no duplicates, got ${next.k1}`);
    return 'rewritten';
  });

  check('applyMergePlan follows nested parents', () => {
    const next = applyMergePlan({ k: ['dev/js/deep'] }, [{ from: ['dev'], to: 'development' }]);
    assert(next.k[0] === 'development/js/deep', `got ${next.k[0]}`);
    return 'nested parent';
  });

  check('tagVocabulary includes parent paths', () => {
    const vocab = tagVocabulary({ a: ['design/figma'], b: ['css'] });
    assert(vocab.includes('design'), `missing parent: ${vocab}`);
    assert(vocab.includes('design/figma'), `missing leaf: ${vocab}`);
    assert(vocab.includes('css'), `missing tag: ${vocab}`);
    return `${vocab.length} tags`;
  });

  check('pickCitation quotes a sentence containing the query words', () => {
    const text =
      'Databases keep rows. Grid layout uses place-items to centre a box vertically. Unrelated closing sentence here.';
    const quote = pickCitation(text, 'centre a box');
    assert(quote.includes('place-items'), `wrong sentence: ${quote}`);
    return quote.slice(0, 24) + '…';
  });

  check('pickCitation survives empty text', () => {
    assert(pickCitation('', 'anything') === '', 'should return empty string');
    return 'empty';
  });

  check('normalizeRuleDraft builds a usable rule', () => {
    const rule = normalizeRuleDraft({ field: 'domain', match: 'substack.com', folder: 'Reading / Newsletters' });
    assert(rule && rule.field === 'domain' && rule.enabled === true, JSON.stringify(rule));
    return `${rule.field} → ${rule.folder}`;
  });

  check('normalizeRuleDraft rejects bad input', () => {
    assert(normalizeRuleDraft({ field: 'nonsense', match: 'x', folder: 'A' }) === null, 'accepted a bad field');
    assert(normalizeRuleDraft({ field: 'domain', match: '', folder: 'A' }) === null, 'accepted an empty match');
    assert(normalizeRuleDraft({ field: 'domain', match: 'x', folder: 'A / B / C' }) === null, 'accepted 3 levels');
    return 'rejected 3';
  });

  check('uncertainPairs caps the number of model calls', () => {
    const groups = [
      { keep: { id: 'k' }, matches: [{ bookmark: { id: '1' }, reason: 'x' }] },
      { keep: { id: 'k2' }, matches: [{ bookmark: { id: '2' }, reason: 'y' }, { bookmark: { id: '3' }, reason: 'z' }] }
    ];
    const pairs = uncertainPairs(groups, { maxPairs: 2 });
    assert(pairs.length === 2, `expected 2, got ${pairs.length}`);
    assert(pairs[0].localReason === 'x', 'lost the local reason');
    return 'capped at 2';
  });

  check('describeFolder lists bookmarks for naming', () => {
    const text = describeFolder([
      { title: 'Figma tips', folderName: 'Misc' },
      { title: 'Colour theory', folderName: 'Misc' }
    ]);
    assert(text.includes('Figma tips') && text.includes('Colour theory'), text);
    return '2 lines';
  });

  check('describeStale includes the last-opened date', () => {
    const text = describeStale([{ bookmark: { title: 'Old post' }, lastVisit: Date.UTC(2024, 0, 15) }]);
    assert(text.includes('Old post') && text.includes('2024-01-15'), text);
    return 'dated';
  });

  check('describeStale handles a never-opened page', () => {
    const text = describeStale([{ bookmark: { title: 'Unread' } }]);
    assert(text.includes('never'), text);
    return 'never';
  });

  check('searchBookmarks is stable across repeat queries', () => {
    // Search caches lowercased text on the bookmark object. Running the same
    // query twice must return the same rows, and a changed query must not.
    const lib = [
      { id: '1', title: 'CSS Grid Guide', url: 'https://a.example/grid', folderName: 'Frontend', dateAdded: 1, content: { description: 'grid layout' } },
      { id: '2', title: 'Cooking Notes', url: 'https://b.example/food', folderName: 'Life', dateAdded: 2, content: { description: 'salt' } }
    ];
    const opts = { tagMap: {}, visits: new Map(), notes: {} };
    const first = searchBookmarks(lib, { ...opts, query: 'grid' });
    const again = searchBookmarks(lib, { ...opts, query: 'grid' });
    const other = searchBookmarks(lib, { ...opts, query: 'salt' });
    assert(first.length === again.length, 'repeat query changed');
    assert(first[0]?.bookmark.id === again[0]?.bookmark.id, 'repeat order changed');
    assert(other[0]?.bookmark.id === '2', 'second query reused the first cache');
    return `${first.length} then ${other.length}`;
  });

  check('localAnswer finds the closest saved page', () => {
    const { answer, hits } = localAnswer('css grid', [
      { id: '1', title: 'CSS Grid Guide', url: 'https://a.com', content: { text: 'Grid uses place-items to centre.' } },
      { id: '2', title: 'Cooking', url: 'https://b.com', content: { text: 'Add salt.' } }
    ]);
    assert(hits.length === 1 && hits[0].title === 'CSS Grid Guide', `hits: ${hits.map((h) => h.title)}`);
    assert(answer.includes('CSS Grid Guide'), answer);
    return 'matched 1 page';
  });

  check('localAnswer says so when nothing matches', () => {
    const { answer, hits } = localAnswer('kubernetes', [
      { id: '1', title: 'CSS Grid Guide', url: 'https://a.com', content: { text: 'Grid.' } }
    ]);
    assert(hits.length === 0, 'should not match');
    assert(answer.toLowerCase().includes('nothing'), answer);
    return 'honest miss';
  });

  check('localSummary describes a saved page without a key', () => {
    const summary = localSummary({
      title: 'Smashing CSS Grid',
      url: 'https://smashing.example/grid',
      content: { text: 'Learn named grid areas. Then use grid-template-areas for layout regions.' }
    });
    assert(typeof summary === 'string' && summary.length > 0, 'empty summary');
    return summary.slice(0, 30) + '…';
  });

  return results;
}

/* ---------- Index staleness ---------- */
// The page-text index only goes stale as bookmarks change, so show its age and
// how many saved pages it has not covered yet.
function renderIndexAge() {
  if (!els.indexStatus) return;
  const covered = state.indexTextCache ? state.indexTextCache.size : 0;
  if (covered === 0) {
    els.indexStatus.textContent = "No page text indexed yet — build the index to search inside pages.";
    return;
  }

  const stamps = Object.values(state.indexMeta || {})
    .map((entry) => entry && entry.savedAt)
    .filter(Boolean);
  const newest = stamps.length ? Math.max(...stamps) : 0;
  const missing = state.bookmarks.filter((bm) => !state.indexTextCache.get(bm.id)).length;

  const parts = [covered + " page" + plural(covered, "") + " indexed"];
  if (newest) parts.push("updated " + relTime(newest));
  if (missing > 0) parts.push(missing + " not indexed");

  els.indexStatus.textContent = parts.join(" · ");
}


async function buildSearchIndex() {
  if (state.busy) return;
  state.busy = true;
  if (els.indexBtn) els.indexBtn.disabled = true;
  if (els.indexProgressWrap) els.indexProgressWrap.hidden = false;
  if (els.indexProgressBar) els.indexProgressBar.style.width = '0%';
  if (els.indexStatus) els.indexStatus.textContent = 'Indexing full page text...';

  const targets = state.bookmarks.filter((bm) => !state.indexTextCache.get(bm.id));
  if (els.indexProgressText) els.indexProgressText.textContent = `Indexing 0 / ${targets.length} pages...`;

  const fetchFn = async (bm) => {
    if (IS_EXTENSION) {
      const res = await sendMessageSafe({ type: 'FETCH_PAGE_CONTENT', url: bm.url });
      return res || { description: '', headings: '', excerpt: '', text: '' };
    }
    await new Promise((r) => setTimeout(r, 20));
    return bm._demoContent || { description: '', headings: '', excerpt: '', text: '' };
  };

  try {
    const fetched = await fetchAllPageContent(targets, fetchFn, (done, total) => {
      const pct = total ? Math.round((done / total) * 100) : 100;
      if (els.indexProgressBar) els.indexProgressBar.style.width = `${pct}%`;
      if (els.indexProgressText) els.indexProgressText.textContent = `Indexing ${done} / ${total} pages...`;
    });

    for (const [id, content] of fetched.entries()) {
      state.indexTextCache.set(id, content.text || '');
      if (content.text) state.contentCache.set(id, content);
      state.indexMeta[id] = { savedAt: Date.now() };
    }

    // Keep the page-text index inside its budget so the library never hits a
    // hard storage quota. Oldest entries go first.
    const pruned = pruneIndex(
      Object.fromEntries(state.indexTextCache),
      state.indexMeta
    );
    if (pruned.evicted > 0) {
      state.indexTextCache = new Map(Object.entries(pruned.index));
      showStatus(`Index trimmed by ${pruned.evicted} old page${plural(pruned.evicted, '')} to stay within storage limits.`, 'info');
    }
    await storageSet({
      [STORAGE.index]: Object.fromEntries(state.indexTextCache),
      [STORAGE.indexMeta]: state.indexMeta
    });

    for (const bm of state.bookmarks) bm.indexText = state.indexTextCache.get(bm.id) || '';

    const words = [...state.indexTextCache.values()].reduce((sum, t) => sum + t.split(/\s+/).filter(Boolean).length, 0);
    renderIndexAge();
    if (els.indexProgressText) {
      els.indexProgressText.textContent = `Indexed ${targets.length} new pages · ${words.toLocaleString()} words searchable`;
    }
    renderSearch();
    showStatus('Index built. Search now matches body text and notes.', 'ok');
  } catch (err) {
    showStatus(`Index failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
    if (els.indexBtn) els.indexBtn.disabled = false;
    if (els.indexProgressWrap) els.indexProgressWrap.hidden = true;
  }
}



/* ---------- Destructive actions ---------- */

// Merging duplicates: keep the oldest copy, carry over tags, note, and read-later from the copies.
async function mergeDuplicates() {
  const ids = [...state.selectedDupes];
  if (ids.length === 0 || state.busy) return;

  const ok = await askConfirm({
    title: `Merge ${ids.length} duplicate${ids.length === 1 ? '' : 's'}?`,
    body: '<p>Bookbox keeps one copy per page and folds the extra tags, notes, and read-later status into it. The removed copies go to Trash for 30 days.</p>',
    okLabel: 'Merge'
  });
  if (!ok) return;

  state.busy = true;
  updateActionButtons();
  try {
    await pushSnapshot('Before merging duplicates');

    const byKeep = new Map();
    for (const group of state.duplicates) {
      const chosen = group.duplicates.filter((d) => ids.includes(d.id));
      if (chosen.length) byKeep.set(group.keep.id, { keep: group.keep, copies: chosen });
    }

    for (const { keep, copies } of byKeep.values()) {
      const keepKey = tagKey(keep);
      const mergedTags = new Set(state.tagMap[keepKey] || []);
      let mergedNote = state.notes[keepKey] || '';
      let mergedReadLater = Boolean(state.readLater[keepKey]);

      for (const copy of copies) {
        const key = tagKey(copy);
        for (const tag of state.tagMap[key] || []) mergedTags.add(tag);
        if (!mergedNote && state.notes[key]) mergedNote = state.notes[key];
        if (state.readLater[key]) mergedReadLater = true;
        delete state.tagMap[key];
        delete state.notes[key];
        delete state.readLater[key];
      }

      if (mergedTags.size) state.tagMap[keepKey] = [...mergedTags];
      if (mergedNote) state.notes[keepKey] = mergedNote;
      if (mergedReadLater) state.readLater[keepKey] = true;
    }

    await persistTags();
    await persistNotes();
    await moveToTrash(ids, 'Duplicate (merged)');

    state.selectedDupes = new Set();
    await scanBookmarks();
    showStatus(`Merged ${byKeep.size} page${byKeep.size === 1 ? '' : 's'} — tags and notes carried over.`, 'ok');
  } catch (err) {
    showStatus(`Merge failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
    updateActionButtons();
  }
}

async function removeSelection({ ids, label, reason, cleanup }) {
  if (state.busy || ids.length === 0) return;
  state.busy = true;
  updateActionButtons();
  try {
    await pushSnapshot(`Before removing ${label}s`);
    const removed = await moveToTrash(ids, reason || `Removed ${label}`);
    if (cleanup) cleanup();
    await scanBookmarks();
    const message = `Moved ${removed} ${label}${plural(removed, '')} to trash`;
    showStatus(`${message}. Restore anytime from Cleanup → Trash.`, 'ok');
    showUndoToast(message, undoLast);
  } catch (err) {
    reportError(`Could not remove ${label}s`, err);
  } finally {
    state.busy = false;
    updateActionButtons();
  }
}

const removeDuplicatesNow = () => mergeDuplicates();

const removeNearNow = () =>
  removeSelection({
    ids: [...state.selectedNear],
    label: 'near-duplicate',
    reason: 'Near-duplicate',
    cleanup: () => {
      state.selectedNear = new Set();
      state.nearDuplicates = [];
    }
  });

const removeDeadNow = () =>
  removeSelection({
    ids: [...state.selectedDead],
    label: 'dead link',
    reason: 'Dead link',
    cleanup: () => {
      state.selectedDead = new Set();
      state.deadLinks = [];
    }
  });

const removeStaleNow = () =>
  removeSelection({
    ids: [...state.selectedStale],
    label: 'stale bookmark',
    reason: 'Stale / unused',
    cleanup: () => {
      state.selectedStale = new Set();
      state.staleLinks = [];
    }
  });

/* Safe clean: only zero-risk actions — exact duplicates and hard 404s. */

async function quickSafeClean() {
  if (state.busy) return;
  const exactIds = state.duplicates
    .flatMap((g) => g.duplicates.map((d) => d.id))
    .filter((id) => {
      const bm = state.bookmarks.find((b) => b.id === id);
      return bm && !isProtected(bm);
    });

  const ok = await askConfirm({
    title: 'Run safe clean?',
    body: `<p>This checks every link, then merges <strong>${exactIds.length}</strong> exact duplicate${exactIds.length === 1 ? '' : 's'} and trashes links that return a hard 404 or 410. Nothing else changes, and everything goes to Trash first.</p>`,
    okLabel: 'Run safe clean'
  });
  if (!ok) return;

  await runDeadLinkCheck({ onlySafe: true });

  state.busy = true;
  try {
    await pushSnapshot('Before safe clean');
    const deadIds = state.deadLinks
      .filter((d) => d.category !== 'blocked' && !isProtected(d.bookmark))
      .map((d) => d.bookmark.id);

    let mergedNow = 0;
    if (exactIds.length) {
      const before = state.selectedDupes;
      state.selectedDupes = new Set(exactIds);
      await mergeDuplicatesSilent();
      state.selectedDupes = before;
      mergedNow = exactIds.length;
    }
    if (deadIds.length) await moveToTrash(deadIds, 'Dead link (404)');

    await scanBookmarks();
    showStatus(
      `Safe clean done: ${mergedNow} merge${mergedNow === 1 ? '' : 's'} and ${deadIds.length} dead link${deadIds.length === 1 ? '' : 's'} trashed.`,
      'ok'
    );
  } catch (err) {
    showStatus(`Safe clean failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
  }
}

// Same as mergeDuplicates but without the confirm prompt (safe clean already asked).
async function mergeDuplicatesSilent() {
  const ids = [...state.selectedDupes];
  if (ids.length === 0) return;
  const byKeep = new Map();
  for (const group of state.duplicates) {
    const chosen = group.duplicates.filter((d) => ids.includes(d.id));
    if (chosen.length) byKeep.set(group.keep.id, { keep: group.keep, copies: chosen });
  }
  for (const { keep, copies } of byKeep.values()) {
    const keepKey = tagKey(keep);
    const mergedTags = new Set(state.tagMap[keepKey] || []);
    for (const copy of copies) {
      const key = tagKey(copy);
      for (const tag of state.tagMap[key] || []) mergedTags.add(tag);
      delete state.tagMap[key];
    }
    if (mergedTags.size) state.tagMap[keepKey] = [...mergedTags];
  }
  await persistTags();
  await moveToTrash(ids, 'Duplicate (merged)');
}



/* ---------- Content fetch ---------- */

async function ensureContent(bookmarks) {
  const toFetch = bookmarks.filter((b) => !state.contentCache.has(b.id));
  if (toFetch.length === 0) {
    for (const bm of bookmarks) bm.content = state.contentCache.get(bm.id) || bm.content || null;
    return;
  }

  els.buildPlanBtn.textContent = 'Reading website content...';
  els.contentProgressWrap.hidden = false;
  els.contentProgressBar.style.width = '0%';
  els.contentProgressText.textContent = `Reading page content 0 / ${toFetch.length}...`;

  const fetchFn = async (bm) => {
    if (IS_EXTENSION) {
      const res = await sendMessageSafe({ type: 'FETCH_PAGE_CONTENT', url: bm.url });
      return res || { description: '', headings: '', excerpt: '', text: '' };
    }
    await new Promise((r) => setTimeout(r, 20));
    return bm._demoContent || { description: '', headings: '', excerpt: '', text: '' };
  };

  const fetched = await fetchAllPageContent(toFetch, fetchFn, (done, total) => {
    const pct = total ? Math.round((done / total) * 100) : 100;
    els.contentProgressBar.style.width = `${pct}%`;
    els.contentProgressText.textContent = `Reading page content ${done} / ${total}...`;
  });

  for (const [id, content] of fetched.entries()) state.contentCache.set(id, content);
  els.contentProgressWrap.hidden = true;

  for (const bm of bookmarks) {
    bm.content = state.contentCache.get(bm.id) || bm.content || null;
    if (bm.content?.text && !state.indexTextCache.get(bm.id)) {
      state.indexTextCache.set(bm.id, bm.content.text);
      bm.indexText = bm.content.text;
    }
  }
}

/* ---------- Classification with confidence and rules ---------- */

function classifyWithSignals(bookmarks) {
  const assignments = new Map();
  const signals = new Map();
  for (const bm of bookmarks) {
    const result = scoreClassification(bm, state.rules);
    assignments.set(bm.id, result.folder);
    signals.set(bm.id, { confidence: result.confidence, signals: result.signals });
  }
  return { assignments, signals };
}

/* ---------- Plan generation ---------- */

async function generatePreviewPlan() {
  if (state.busy) return;
  clearStatus();
  const mode = document.querySelector('input[name="sort-engine"]:checked')?.value || 'local';
  const readContent = els.optReadContent.checked;
  const safeOnly = els.optSafeClean ? els.optSafeClean.checked : false;
  state.useExistingFolders = els.optExistingFolders ? els.optExistingFolders.checked : true;

  const removeIds = [];
  const removeReasons = new Map();
  const addRemoval = (ids, reason) => {
    for (const id of ids) {
      if (!removeReasons.has(id)) {
        removeIds.push(id);
        removeReasons.set(id, reason);
      }
    }
  };

  if (els.optRemoveDupes.checked || safeOnly) {
    addRemoval([...state.selectedDupes], 'Duplicate');
    if (!safeOnly) addRemoval([...state.selectedNear], 'Near-duplicate');
  }
  if (els.optRemoveDead.checked || safeOnly) {
    addRemoval(
      state.deadLinks
        .filter((d) => d.category !== 'blocked')
        .filter((d) => state.selectedDead.has(d.bookmark.id))
        .map((d) => d.bookmark.id),
      'Dead link'
    );
  }

  // Protected bookmarks never move or get removed.
  const protectedIds = new Set(state.bookmarks.filter((bm) => isProtected(bm)).map((bm) => bm.id));
  for (const id of protectedIds) {
    removeReasons.delete(id);
    const index = removeIds.indexOf(id);
    if (index >= 0) removeIds.splice(index, 1);
  }

  const removeSet = new Set(removeIds);
  const kept = state.bookmarks.filter((b) => !removeSet.has(b.id));

  state.busy = true;
  els.buildPlanBtn.disabled = true;

  try {
    if (readContent && !safeOnly) await ensureContent(kept);
    els.buildPlanBtn.textContent = mode === 'ai' && !safeOnly ? 'Asking AI to organize...' : 'Building preview...';

    let folderAssignments;
    let signals = new Map();

    if (safeOnly) {
      folderAssignments = new Map(kept.map((bm) => [bm.id, bm.folderName || 'Bookmarks / General']));
    } else if (mode === 'ai') {
      const aiAssignments = await organizeWithAI(kept, state.settings);
      folderAssignments = new Map();
      for (const bm of kept) {
        if (protectedIds.has(bm.id)) {
          folderAssignments.set(bm.id, bm.folderName);
          continue;
        }
        // Rules override AI.
        const rule = evaluateRules(bm, state.rules);
        if (rule) {
          folderAssignments.set(bm.id, rule.folder);
          signals.set(bm.id, { confidence: 100, signals: [`rule: ${rule.rule.match}`] });
        } else {
          folderAssignments.set(bm.id, aiAssignments.get(bm.id) || bm.folderName);
          signals.set(bm.id, { confidence: 70, signals: ['chosen by AI from page content'] });
        }
      }
    } else {
      const scored = classifyWithSignals(kept.filter((bm) => !protectedIds.has(bm.id)));
      folderAssignments = new Map();
      for (const bm of kept) {
        if (protectedIds.has(bm.id)) folderAssignments.set(bm.id, bm.folderName);
        else folderAssignments.set(bm.id, scored.assignments.get(bm.id));
      }
      signals = scored.signals;
    }

    const plan = buildChangePlan({ bookmarks: state.bookmarks, removeIds, removeReasons, folderAssignments });
    plan.reuseFolders = state.useExistingFolders;
    plan.folderMap = state.useExistingFolders ? await loadExistingFolderMap() : new Map();
    plan.signals = signals;
    plan.mode = safeOnly ? 'safe' : mode;
    state.plan = plan;
    // A fresh plan starts with nothing excluded.
    state.planSkipped = new Set();
    state.explainId = null;

    renderPreviewPlan();
    switchTab('preview');
    showStatus('Preview ready. Nothing changed yet — review, then apply or cancel.', 'info');
  } catch (err) {
    els.contentProgressWrap.hidden = true;
    showStatus(err.message || 'Could not generate the plan.', 'error');
  } finally {
    state.busy = false;
    els.buildPlanBtn.disabled = false;
    els.buildPlanBtn.textContent = 'Generate preview';
  }
}

/* ---------- Diff + preview rendering ---------- */

function folderCounts(bookmarks) {
  const map = new Map();
  for (const bm of bookmarks) {
    const name = bm.folderName || 'Uncategorized';
    map.set(name, (map.get(name) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderDiff(beforeList, afterList) {
  if (!els.diffBefore || !els.diffAfter) return;
  const before = folderCounts(beforeList);
  const after = folderCounts(afterList);
  const afterMap = new Map(after);

  els.diffBefore.innerHTML =
    before.length === 0
      ? '<p class="empty-note">Empty</p>'
      : before
          .map(
            ([name, count]) => `
        <div class="diff-row">
          <span class="diff-name">${escapeHtml(name)}</span>
          <span class="count-pill">${count}</span>
        </div>`
          )
          .join('');

  els.diffAfter.innerHTML =
    after.length === 0
      ? '<p class="empty-note">Empty</p>'
      : after
          .map(([name, count]) => {
            const isNew = !before.some(([b]) => b === name);
            return `
        <div class="diff-row ${isNew ? 'is-new' : ''}">
          <span class="diff-name">${escapeHtml(name)}${isNew ? ' <span class="tag tag-move">new</span>' : ''}</span>
          <span class="count-pill">${afterMap.get(name)}</span>
        </div>`;
          })
          .join('');
}

function renderPreviewPlan() {
  if (!state.plan) {
    els.previewEmpty.hidden = false;
    els.previewContent.hidden = true;
    els.previewBadge.hidden = true;
    return;
  }

  const { toRemove, tree, summary, reuseFolders, folderMap, signals, mode } = state.plan;
  els.previewEmpty.hidden = true;
  els.previewContent.hidden = false;

  const totalActions = summary.movedCount + summary.totalRemoved;
  els.previewBadge.textContent = String(totalActions);
  els.previewBadge.hidden = totalActions === 0;

  const reused = tree.reduce(
    (sum, parent) => sum + parent.subfolders.filter((sub) => folderMap && folderMap.has(sub.path)).length,
    0
  );
  const lowConfidence = signals
    ? [...signals.values()].filter((s) => s.confidence < 45).length
    : 0;

  els.planSummary.innerHTML = `
    <strong>${mode === 'safe' ? 'Safe clean' : mode === 'ai' ? 'AI plan' : 'Smart local plan'}:</strong>
    ${summary.parentCount} parents · ${summary.subfolderCount} subfolders · ${summary.totalRemoved} removed · ${summary.totalKept} kept
    ${reuseFolders ? `· reusing ${reused} of ${summary.subfolderCount} existing folders` : ''}
    ${lowConfidence ? `· <span class="tag tag-warn">${lowConfidence} low-confidence guess${lowConfidence === 1 ? '' : 'es'}</span>` : ''}`;

  // Before / after diff
  const removedIds = new Set(toRemove.map((b) => b.id));
  const afterList = [];
  for (const parent of tree) {
    for (const sub of parent.subfolders) {
      for (const item of sub.items) {
        if (!removedIds.has(item.id)) afterList.push({ ...item, folderName: sub.path });
      }
    }
  }
  renderDiff(state.bookmarks, afterList);

  // Removals
  if (toRemove.length > 0) {
    els.previewRemovalsBlock.hidden = false;
    els.previewRemoveCount.textContent = String(toRemove.length);
    els.previewRemovalsList.innerHTML = toRemove
      .map(
        (bm) => `
        <div class="item-row">
          <div class="item-body">
            <div class="item-title">${escapeHtml(bm.title)}</div>
            <div class="item-meta">${escapeHtml(getDomain(bm.url))} · goes to Trash</div>
          </div>
          <span class="tag tag-danger">${escapeHtml(bm.reason)}</span>
        </div>`
      )
      .join('');
  } else {
    els.previewRemovalsBlock.hidden = true;
  }

  // Merged duplicates
  const mergedKeepers = state.duplicates.filter((g) => g.duplicates.some((d) => removedIds.has(d.id)));
  if (mergedKeepers.length > 0 && els.previewMergeBlock) {
    els.previewMergeBlock.hidden = false;
    els.previewMergeCount.textContent = String(mergedKeepers.length);
    els.previewMergeList.innerHTML = mergedKeepers
      .map(
        (g) => `
        <div class="item-row">
          <div class="item-body">
            <div class="item-title">${escapeHtml(g.keep.title)}</div>
            <div class="item-meta">keeps tags and notes from ${g.duplicates.length} cop${g.duplicates.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <span class="tag tag-move">merged</span>
        </div>`
      )
      .join('');
  } else if (els.previewMergeBlock) {
    els.previewMergeBlock.hidden = true;
  }

  // Folder tree with confidence
  els.previewFolderCount.textContent = `${summary.parentCount} groups / ${summary.subfolderCount} subfolders`;
  els.previewFoldersList.innerHTML = tree
    .map(
      (parent, idx) => `
      <details class="folder-card" ${idx < 3 ? 'open' : ''}>
        <summary>
          <span>${escapeHtml(parent.name)}</span>
          <span class="count-pill">${parent.totalCount}</span>
        </summary>
        <div class="subfolder-list">
          ${parent.subfolders
            .map((sub) => {
              const exists = reuseFolders && folderMap && folderMap.has(sub.path);
              return `
              <div class="subfolder-group">
                <div class="subfolder-head">
                  <span>${escapeHtml(sub.name)} ${exists ? '<span class="tag tag-move">existing</span>' : ''}</span>
                  <span class="count-pill">${sub.items.length}</span>
                </div>
                <div class="folder-items" style="padding: 2px 0 0; border-top: none;">
                  ${sub.items
                    .map((item) => {
                      const signal = signals ? signals.get(item.id) : null;
                      const confidence = signal ? signal.confidence : null;
                      const cls = confidence === null ? '' : confidence >= 70 ? 'tag-ok' : confidence >= 45 ? 'tag-move' : 'tag-warn';
                      return `
                      <div class="folder-item ${state.planSkipped.has(item.id) ? 'is-skipped' : ''}">
                        <div class="folder-item-main">
                          <input type="checkbox" data-plan-skip="${attr(item.id)}" ${state.planSkipped.has(item.id) ? '' : 'checked'} aria-label="Include ${attr(item.title)} in the plan" />
                          <span class="folder-item-title">${escapeHtml(item.title)}</span>
                          ${item.willMove ? `<span class="tag tag-move">from ${escapeHtml(item.folderName)}</span>` : ''}
                          ${
                            confidence !== null
                              ? `<button type="button" class="tag ${cls} confidence-tag" data-explain-confidence="${attr(item.id)}" title="Why this folder?">${confidence}%</button>`
                              : ''
                          }
                        </div>
                        ${
                          signal && signal.signals.length
                            ? `<div class="item-meta explain-signals" ${state.explainId === item.id ? '' : 'hidden'}>${escapeHtml(signal.signals.join(' · '))}</div>`
                            : ''
                        }
                      </div>`;
                    })
                    .join('')}
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </details>`
    )
    .join('');

  els.undoApplyBtn.hidden = state.histories.length === 0;

  // Per-item opt-out; skipped rows stay where they are when the plan applies.
  els.previewFoldersList.querySelectorAll('[data-plan-skip]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = box.dataset.planSkip;
      if (box.checked) state.planSkipped.delete(id);
      else state.planSkipped.add(id);
      // Re-render counts so the summary matches what will happen.
      renderPreviewPlan();
    });
  });

  els.previewFoldersList.querySelectorAll('[data-explain-confidence]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.explainConfidence;
      state.explainId = state.explainId === id ? null : id;
      renderPreviewPlan();
    });
  });

  renderPlanSkipSummary();
}

// Shows how many items were opted out, with a one-click way back to all.
function renderPlanSkipSummary() {
  if (!els.planSkipNote) return;
  const skipped = state.planSkipped.size;
  els.planSkipNote.hidden = skipped === 0;
  if (skipped === 0) return;
  els.planSkipNote.innerHTML = `${skipped} item${plural(skipped, '')} excluded from this plan.
    <button type="button" class="btn-inline" id="plan-skip-reset">Include all again</button>`;
  const reset = document.getElementById('plan-skip-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      state.planSkipped.clear();
      renderPreviewPlan();
      renderPlanSkipSummary();
    });
  }
}



/* ---------- Apply ---------- */

async function applyPlan() {
  if (!state.plan || state.busy) return;
  state.busy = true;
  els.applyPlanBtn.disabled = true;
  els.applyPlanBtn.textContent = 'Applying...';

  try {
    await pushSnapshot('Before organizing');
    const { reuseFolders, folderMap } = state.plan;

    // Merge duplicate targets before anything moves, so their tags survive.
    const removedIds = state.plan.toRemove.map((b) => b.id);
    const duplicatesRemoved = new Set(
      state.duplicates.filter((g) => g.duplicates.some((d) => removedIds.includes(d.id))).flatMap((g) => g.duplicates.map((d) => d.id))
    );
    if (duplicatesRemoved.size) {
      for (const group of state.duplicates) {
        const keepKey = tagKey(group.keep);
        const mergedTags = new Set(state.tagMap[keepKey] || []);
        for (const copy of group.duplicates) {
          if (!removedIds.includes(copy.id)) continue;
          for (const tag of state.tagMap[tagKey(copy)] || []) mergedTags.add(tag);
        }
        if (mergedTags.size) state.tagMap[keepKey] = [...mergedTags];
      }
      await persistTags();
    }

    await trashBookmarks(removedIds, 'Removed by organize plan');
    await removeBookmarksById(removedIds);

    if (IS_EXTENSION) {
      const parentRootId = await getDefaultParentId();
      const rootFolder = await chrome.bookmarks.create({
        parentId: parentRootId || '1',
        title: `Bookbox Organized (${new Date().toLocaleDateString()})`
      });

      for (const parent of state.plan.tree) {
        let parentNodeId;
        try {
          parentNodeId = (await chrome.bookmarks.create({ parentId: rootFolder.id, title: parent.name })).id;
        } catch {
          parentNodeId = rootFolder.id;
        }

        for (const sub of parent.subfolders) {
          let subNodeId;
          const existing = reuseFolders && folderMap ? folderMap.get(sub.path) : null;
          if (existing) {
            subNodeId = existing; // Reuse the folder the user already has
          } else {
            try {
              subNodeId = (await chrome.bookmarks.create({ parentId: parentNodeId, title: sub.name })).id;
            } catch {
              subNodeId = parentNodeId;
            }
          }

          for (const item of sub.items) {
            if (state.planSkipped.has(item.id)) continue;
            try {
              await chrome.bookmarks.move(item.id, { parentId: subNodeId });
            } catch {
              // skip bookmarks that no longer exist
            }
          }
        }
      }
    } else {
      const removeSet = new Set(removedIds);
      const next = [];
      for (const parent of state.plan.tree) {
        for (const sub of parent.subfolders) {
          for (const item of sub.items) {
            if (!removeSet.has(item.id) && !state.planSkipped.has(item.id)) next.push({ ...item, folderName: sub.path });
          }
        }
      }
      demoBookmarks = next;
    }

    const { totalRemoved, parentCount, subfolderCount } = state.plan.summary;
    state.plan = null;
    await scanBookmarks();
    renderPreviewPlan();
    showStatus(
      `Applied! ${parentCount} parents, ${subfolderCount} subfolders, ${totalRemoved} moved to trash. Undo is in the header.`,
      'ok'
    );
  } catch (err) {
    showStatus(`Could not apply changes: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    state.busy = false;
    els.applyPlanBtn.disabled = false;
    els.applyPlanBtn.textContent = 'Apply changes';
  }
}

/* ---------- Export ---------- */

function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = JSON.stringify(
    {
      app: 'Bookbox',
      exportedAt: new Date().toISOString(),
      count: state.bookmarks.length,
      bookmarks: state.bookmarks.map(({ content, indexText, ...rest }) => ({
        ...rest,
        tags: tagsFor(rest),
        note: noteFor(rest),
        readLater: isReadLater(rest)
      })),
      tags: state.tagMap,
      notes: state.notes,
      readLater: state.readLater,
      rules: state.rules,
      collections: state.collections
    },
    null,
    2
  );
  download(`bookbox-bookmarks-${new Date().toISOString().slice(0, 10)}.json`, payload);
  showStatus('JSON exported with tags, notes, rules, and collections.', 'ok');
}

function exportBookmarksHtml() {
  download(`bookbox-bookmarks-${new Date().toISOString().slice(0, 10)}.html`, toNetscapeHtml(state.bookmarks), 'text/html');
  showStatus('Bookmarks HTML exported — import it straight into any browser.', 'ok');
}

function exportMarkdown() {
  download(`bookbox-bookmarks-${new Date().toISOString().slice(0, 10)}.md`, toMarkdown(state.bookmarks.map((bm) => ({ ...bm, note: noteFor(bm) }))), 'text/markdown');
  showStatus('Markdown exported for Obsidian or Notion.', 'ok');
}

function exportCsv() {
  download(`bookbox-bookmarks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(state.bookmarks.map((bm) => ({ ...bm, note: noteFor(bm) })), state.tagMap), 'text/csv');
  showStatus('CSV exported.', 'ok');
}

/* ---------- Import ---------- */

// Nothing is written until the user confirms, because import adopts folders.
let pendingImport = null;

async function importBookmarksFile(file) {
  if (!file) return;
  pendingImport = null;
  els.importPreview.hidden = true;
  els.importProgressWrap.hidden = false;
  els.importProgressBar.style.width = '35%';
  els.importProgressText.textContent = 'Reading bookmarks file...';

  try {
    const text = await file.text();
    els.importProgressBar.style.width = '60%';
    const parsed = parseBookmarksHtml(text);
    if (parsed.length === 0) {
      els.importProgressWrap.hidden = true;
      els.importStatus.textContent = 'No bookmarks found in that file.';
      return;
    }

    const existing = new Set(state.bookmarks.map((b) => tagKey(b)));
    const fresh = parsed.filter((item) => !existing.has(tagKey(item)));
    const skipped = parsed.length - fresh.length;

    pendingImport = { fresh, parsed, skipped };
    els.importProgressWrap.hidden = true;
    els.importProgressBar.style.width = '0%';
    renderImportPreview();
  } catch (err) {
    els.importProgressWrap.hidden = true;
    reportError('Import failed', err);
  }
}

function renderImportPreview() {
  if (!pendingImport || !els.importPreview) return;
  const { fresh, skipped } = pendingImport;

  els.importPreview.hidden = false;
  els.importSummary.innerHTML = `
    <strong>${fresh.length} new bookmark${plural(fresh.length, '')}</strong>
    ${skipped ? `<span class="import-skip">${skipped} already saved — skipped</span>` : ''}`;

  const folders = new Map();
  for (const item of fresh) {
    const folder = (item.folderName || 'Unsorted').split(' / ')[0];
    folders.set(folder, (folders.get(folder) || 0) + 1);
  }
  els.importFolders.innerHTML = [...folders.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(
      ([folder, count]) =>
        `<div class="import-folder-row"><span>${escapeHtml(folder)}</span><span class="chip-count">${count}</span></div>`
    )
    .join('');

  els.importConfirmBtn.disabled = fresh.length === 0;
}

async function confirmImport() {
  if (!pendingImport || pendingImport.fresh.length === 0) return;
  const { fresh } = pendingImport;

  els.importPreview.hidden = true;
  els.importProgressWrap.hidden = false;
  els.importProgressBar.style.width = '70%';
  els.importProgressText.textContent = `Adding ${fresh.length} bookmarks...`;

  try {
    await pushSnapshot('Before import');
    await recreateFromItems(fresh, `Bookbox Import (${new Date().toLocaleDateString()})`);
    els.importProgressBar.style.width = '100%';
    els.importStatus.textContent = `Imported ${fresh.length} bookmark${plural(fresh.length, '')}.`;
    pendingImport = null;
    await scanBookmarks();
    showStatus('Import finished.', 'ok');
  } catch (err) {
    reportError('Import failed', err);
  } finally {
    setTimeout(() => {
      els.importProgressWrap.hidden = true;
      els.importProgressBar.style.width = '0%';
    }, 1200);
  }
}

function cancelImport() {
  pendingImport = null;
  if (els.importPreview) els.importPreview.hidden = true;
  if (els.importProgressWrap) els.importProgressWrap.hidden = true;
  if (els.importStatus) els.importStatus.textContent = 'Import cancelled. Nothing changed.';
}




/* ---------- Command palette ---------- */

const PALETTE_COMMANDS = [
  { label: 'Scan bookmarks', hint: 'Refresh from the browser', run: () => scanBookmarks() },
  { label: 'Generate organize preview', hint: 'Sort into folders', run: () => { switchTab('organize'); generatePreviewPlan(); } },
  // These show their results on Cleanup, so the tab has to move with them.
  { label: 'Check dead links', hint: 'Cleanup', run: () => { switchTab('cleanup'); runDeadLinkCheck(); } },
  { label: 'Find stale bookmarks', hint: 'Cleanup', run: () => { switchTab('cleanup'); runStaleCheck(); } },
  { label: 'Quick safe clean', hint: 'Cleanup — duplicates and hard 404s only', run: () => { switchTab('cleanup'); quickSafeClean(); } },
  { label: 'Build full-page index', hint: 'Search inside pages', run: () => { switchTab('browse'); buildSearchIndex(); } },
  { label: 'Open trash', hint: 'Recover deleted bookmarks', run: () => { switchTab('cleanup'); } },
  { label: 'Add rule', hint: 'Library', run: () => { switchTab('library'); els.ruleMatch.focus(); } },
  { label: 'Export JSON', hint: 'Settings', run: exportJson },
  { label: 'Export bookmarks HTML', hint: 'Settings', run: exportBookmarksHtml },
  { label: 'Toggle theme', hint: 'Dark / light', run: toggleTheme },
  // Jumping straight to a section saves a click and doubles as discoverability.
  { label: 'Go to Browse', hint: 'Search and filters', run: () => switchTab('browse') },
  { label: 'Go to Organize', hint: 'Folders and rules', run: () => switchTab('organize') },
  { label: 'Go to Cleanup', hint: 'Duplicates and dead links', run: () => switchTab('cleanup') },
  { label: 'Go to Library', hint: 'Rules, collections, tags', run: () => switchTab('library') },
  { label: 'Go to Settings', hint: 'Theme, key, storage, exports', run: () => switchTab('settings') }
];

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  state.settings.theme = next;
  applyTheme(next);
  persistSettings();
}

function openPalette() {
  if (!els.palette) return;
  state.paletteIndex = 0;
  els.paletteInput.value = '';
  openModal(els.palette, { initialFocus: '#palette-input', onClose: closePalette });
  renderPaletteNow('');
}

function closePalette() {
  closeModal(els.palette);
}

// Typing re-renders are debounced; arrow keys and opening use the immediate version.
const debouncedPalette = debounce((query) => renderPaletteNow(query), 90);

function renderPalette(query) {
  debouncedPalette(query);
}

function renderPaletteNow(query) {
  const q = query.trim().toLowerCase();
  const items = [];

  for (const cmd of PALETTE_COMMANDS) {
    if (!q || cmd.label.toLowerCase().includes(q) || cmd.hint.toLowerCase().includes(q)) {
      items.push({ kind: 'command', label: cmd.label, hint: cmd.hint, run: cmd.run });
    }
  }

  if (q) {
    const matches = state.bookmarks
      .filter((bm) => `${bm.title} ${bm.url} ${bm.folderName}`.toLowerCase().includes(q))
      .slice(0, 8);
    for (const bm of matches) {
      items.push({
        kind: 'bookmark',
        label: bm.title,
        hint: bm.folderName || getDomain(bm.url),
        run: () => openBookmark(bm.id)
      });
    }
  }

  state.paletteItems = items.slice(0, 12);
  if (state.paletteIndex >= state.paletteItems.length) state.paletteIndex = 0;

  els.paletteResults.innerHTML = state.paletteItems.length
    ? state.paletteItems
        .map(
          (item, index) => `
        <button type="button" class="palette-row ${index === state.paletteIndex ? 'is-active' : ''}" data-palette-index="${index}">
          <span class="palette-label">${item.kind === 'bookmark' ? '🔖 ' : '▸ '}${escapeHtml(item.label)}</span>
          <span class="palette-hint">${escapeHtml(item.hint)}</span>
        </button>`
        )
        .join('')
    : '<p class="empty-note">Nothing matches.</p>';

  els.paletteResults.querySelectorAll('[data-palette-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = state.paletteItems[Number(btn.dataset.paletteIndex)];
      closePalette();
      if (item) item.run();
    });
  });
}

function runPaletteSelection() {
  // Enter can land before the debounced filter has rebuilt the list, so rebuild
  // from the live input first. Otherwise Enter runs whatever happened to be
  // highlighted under the previous query.
  if (els.paletteInput) renderPaletteNow(els.paletteInput.value);
  const item = state.paletteItems[state.paletteIndex] || state.paletteItems[0];
  closePalette();
  if (item) item.run();
}



/* ---------- Event wiring ---------- */

els.tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// Arrow keys move between tabs, Home/End jump to the ends — the standard pattern.
els.tabs.forEach((btn) => {
  btn.addEventListener('keydown', (e) => {
    const list = [...els.tabs];
    const index = list.indexOf(btn);
    let next = null;
    if (e.key === 'ArrowRight') next = list[(index + 1) % list.length];
    else if (e.key === 'ArrowLeft') next = list[(index - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (!next) return;
    e.preventDefault();
    switchTab(next.dataset.tab);
    next.focus();
  });
});

els.rescanBtn.addEventListener('click', async () => {
  await scanBookmarks();
  await loadVisits();
  renderSearch();
  showStatus('Bookmarks rescanned.', 'ok');
});

els.buildPlanBtn.addEventListener('click', generatePreviewPlan);

// The estimate follows whichever sorting mode is selected.
document.querySelectorAll('input[name="sort-engine"]').forEach((radio) => {
  radio.addEventListener('change', renderAiEstimate);
});
renderAiEstimate();

if (els.askBtn) {
  els.askBtn.addEventListener('click', askLibrary);
  els.askQuestion.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askLibrary();
    }
  });
}

// Tour: wired once, shows again from Settings.
if (els.tourDialog) {
  els.tourNext.addEventListener('click', () => {
    if (tourIndex >= TOUR_STEPS.length - 1) {
      finishTour();
      showStatus('You are set. Press ⌘K any time to jump around.', 'ok');
      return;
    }
    tourIndex += 1;
    renderTour();
  });
  els.tourSkip.addEventListener('click', finishTour);
}
if (els.tourBtn) els.tourBtn.addEventListener('click', openTour);
els.previewGenerateBtn.addEventListener('click', generatePreviewPlan);
els.quickDeadScanBtn.addEventListener('click', quickSafeClean);
if (els.saveTabsBtn) els.saveTabsBtn.addEventListener('click', saveOpenTabsAsCollection);
els.runDeadCheckBtn.addEventListener('click', () => runDeadLinkCheck());

if (els.cancelDeadBtn) {
  els.cancelDeadBtn.addEventListener('click', () => {
    if (state.linkCheckAbort) state.linkCheckAbort.abort();
    els.cancelDeadBtn.disabled = true;
    els.cancelDeadBtn.textContent = 'Stopping…';
    setTimeout(() => {
      els.cancelDeadBtn.disabled = false;
      els.cancelDeadBtn.textContent = 'Cancel';
    }, 1200);
  });
}
if (els.updateRedirectsBtn) els.updateRedirectsBtn.addEventListener('click', updateAllRedirects);
if (els.scheduleSelect) {
  els.scheduleSelect.addEventListener('change', saveSchedule);
  renderSchedule();
}
els.runStaleCheckBtn.addEventListener('click', runStaleCheck);
els.runAgingBtn.addEventListener('click', runAgingCheck);
els.indexBtn.addEventListener('click', buildSearchIndex);
els.saveCollectionBtn.addEventListener('click', saveCurrentCollection);
els.removeDupesNowBtn.addEventListener('click', removeDuplicatesNow);
els.removeNearNowBtn.addEventListener('click', removeNearNow);
els.removeDeadNowBtn.addEventListener('click', removeDeadNow);
els.removeStaleNowBtn.addEventListener('click', removeStaleNow);
els.applyPlanBtn.addEventListener('click', applyPlan);
els.undoApplyBtn.addEventListener('click', undoLast);
els.restoreBackupBtn.addEventListener('click', () => restoreHistory(0));
els.undoHistoryBtn.addEventListener('click', undoLast);
els.trashRestoreAllBtn.addEventListener('click', trashRestoreAll);
els.trashEmptyBtn.addEventListener('click', trashEmpty);
if (els.trashSearch) {
  els.trashSearch.addEventListener('input', (e) => {
    state.trashQuery = e.target.value;
    renderTrash();
  });
}
if (els.trashClearOldBtn) els.trashClearOldBtn.addEventListener('click', clearOldTrash);
els.settingsForm.addEventListener('submit', saveSettings);
// Changing provider changes which AI features are possible, so update the
// Meaning search toggle before the form is saved.
if (els.aiProvider) {
  els.aiProvider.addEventListener('change', () => {
    const canEmbed = hasKey(state.settings) && supportsEmbeddings(els.aiProvider.value);
    els.semanticToggle?.classList.toggle('ai-unsupported', !canEmbed);
  });
}
els.restoreBackupSettingsBtn.addEventListener('click', () => restoreHistory(0));

/* Storage + diagnostics */
if (els.indexRefreshBtn) {
  els.indexRefreshBtn.addEventListener('click', async () => {
    state.indexTextCache.clear();
    state.indexMeta = {};
    await storageSet({ [STORAGE.index]: {}, [STORAGE.indexMeta]: {} });
    renderIndexAge();
    showStatus('Index cleared. Use Build full-page index in Browse to rebuild it.', 'info');
  });
}
if (els.indexPruneBtn) {
  els.indexPruneBtn.addEventListener('click', async () => {
    const pruned = pruneIndex(Object.fromEntries(state.indexTextCache), state.indexMeta);
    state.indexTextCache = new Map(Object.entries(pruned.index));
    await storageSet({
      [STORAGE.index]: Object.fromEntries(state.indexTextCache),
      [STORAGE.indexMeta]: state.indexMeta
    });
    renderIndexAge();
    await renderStorageUsage();
    showStatus(
      pruned.evicted ? `Trimmed ${pruned.evicted} old page${plural(pruned.evicted, '')} from the index.` : 'Index already fits comfortably.',
      'ok'
    );
  });
}
if (els.diagCopyBtn) {
  els.diagCopyBtn.addEventListener('click', async () => {
    const text = els.diagOutput.value || 'No errors recorded.';
    const ok = await copyText(text);
    showStatus(ok ? 'Diagnostics copied.' : 'Could not copy.', ok ? 'ok' : 'error');
  });
}
if (els.diagRunBtn) els.diagRunBtn.addEventListener('click', runSelfCheck);

/* ---------- Sync + data health wiring ---------- */

if (els.syncEnabled) {
  els.syncEnabled.addEventListener('change', async () => {
    state.settings = { ...state.settings, syncEnabled: els.syncEnabled.checked };
    await storageSet({ [STORAGE.settings]: state.settings });
    if (els.syncEnabled.checked) {
      const ok = await pushSync();
      showStatus(
        ok ? 'Sync is on. Settings and tags now follow you to your other computers.' : 'Sync could not be turned on here; everything still saves on this device.',
        ok ? 'ok' : 'info'
      );
    } else {
      renderSyncStatus('Off — nothing is being shared.');
      showStatus('Sync is off. Your data stays on this device only.', 'info');
    }
  });
}
if (els.syncNowBtn) {
  els.syncNowBtn.addEventListener('click', async () => {
    if (!state.settings.syncEnabled) {
      showStatus('Turn sync on first.', 'info');
      return;
    }
    const ok = await pushSync();
    showStatus(ok ? 'Pushed settings and tags.' : 'Sync is unavailable in this preview.', ok ? 'ok' : 'info');
  });
}
if (els.syncPullBtn) els.syncPullBtn.addEventListener('click', pullSync);

if (els.orphanScanBtn) {
  els.orphanScanBtn.addEventListener('click', () => {
    const orphans = scanOrphans();
    const total = orphanCount(orphans);
    showStatus(total === 0 ? 'No leftovers found.' : `${total} leftover record${total === 1 ? '' : 's'} found.`, total === 0 ? 'ok' : 'info');
  });
}
if (els.orphanCleanBtn) els.orphanCleanBtn.addEventListener('click', cleanOrphans);

/* ---------- AI feature wiring ---------- */

if (els.readerAiSummaryBtn) els.readerAiSummaryBtn.addEventListener('click', aiReaderSummary);
if (els.tagAiSuggestBtn) els.tagAiSuggestBtn.addEventListener('click', aiSuggestTags);
if (els.tagConsolidateBtn) els.tagConsolidateBtn.addEventListener('click', aiConsolidateTags);
if (els.semanticToggle) els.semanticToggle.addEventListener('click', toggleSemanticSearch);
if (els.nearAiBtn) els.nearAiBtn.addEventListener('click', aiJudgeNearDuplicates);
if (els.staleAiBtn) els.staleAiBtn.addEventListener('click', aiExplainStale);
if (els.folderAiBtn) els.folderAiBtn.addEventListener('click', aiNameFolders);
if (els.ruleAiBtn) els.ruleAiBtn.addEventListener('click', aiRuleFromSentence);
if (els.ruleAiInput) {
  els.ruleAiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      aiRuleFromSentence();
    }
  });
}
if (els.askFollowupBtn) {
  els.askFollowupBtn.addEventListener('click', () => {
    const q = els.askFollowup ? els.askFollowup.value.trim() : '';
    if (!q) return;
    els.askFollowup.value = '';
    askLibrary(q);
  });
}
if (els.askFollowup) {
  els.askFollowup.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.askFollowupBtn?.click();
    }
  });
}

els.exportJsonBtn.addEventListener('click', exportJson);
els.exportHtmlBtn.addEventListener('click', exportBookmarksHtml);
els.exportMdBtn.addEventListener('click', exportMarkdown);
els.exportCsvBtn.addEventListener('click', exportCsv);
els.importFile.addEventListener('change', (e) => importBookmarksFile(e.target.files?.[0]));
if (els.importConfirmBtn) els.importConfirmBtn.addEventListener('click', confirmImport);
if (els.importCancelBtn) els.importCancelBtn.addEventListener('click', cancelImport);

els.ruleAddBtn.addEventListener('click', addRule);
els.ruleMatch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addRule();
  }
});
els.rulesRunBtn.addEventListener('click', previewRules);

if (els.ruleTestBtn) els.ruleTestBtn.addEventListener('click', testRuleUrl);
if (els.ruleTestUrl) {
  els.ruleTestUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      testRuleUrl();
    }
  });
}
if (els.rulesExportBtn) els.rulesExportBtn.addEventListener('click', exportRules);
if (els.rulesImportBtn && els.rulesImportFile) {
  els.rulesImportBtn.addEventListener('click', () => els.rulesImportFile.click());
  els.rulesImportFile.addEventListener('change', importRules);
}

els.skipDomainAddBtn.addEventListener('click', async () => {
  const value = els.skipDomainInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!value) return;
  if (!state.skipDomains.includes(value)) state.skipDomains.push(value);
  await persistProtect();
  els.skipDomainInput.value = '';
  renderSkipDomains();
  showStatus(`${value} will be skipped in future link checks.`, 'ok');
});

const debouncedSearchRender = debounce(() => {
  state.browseLimit = 120;
  renderSearch();
}, 120);

els.searchInput.addEventListener('input', (e) => {
  state.search.query = e.target.value;
  state.activeCollection = null;
  debouncedSearchRender();
});
els.searchDomain.addEventListener('change', (e) => {
  state.search.domain = e.target.value;
  state.activeCollection = null;
  renderSearch();
});
els.searchAdded.addEventListener('change', (e) => {
  state.search.addedWithin = e.target.value;
  renderSearch();
});
els.searchVisited.addEventListener('change', (e) => {
  state.search.visitedWithin = e.target.value;
  renderSearch();
});

/* Browse: collapsible filters */
if (els.browseFilterToggle && els.browseFilters) {
  els.browseFilterToggle.addEventListener('click', () => {
    const open = els.browseFilters.hidden;
    els.browseFilters.hidden = !open;
    els.browseFilterToggle.setAttribute('aria-expanded', String(open));
    els.browseFilterToggle.classList.toggle('is-active', open);
  });
}

/* Browse: list vs compact */
els.viewButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.browseView = btn.dataset.view === 'compact' ? 'compact' : 'list';
    els.viewButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.browseView));
    applyBrowseView();
  });
});

/* Browse: sort, bulk select, recent searches */
if (els.sortSelect) {
  els.sortSelect.addEventListener('change', () => {
    state.browseSort = els.sortSelect.value;
    state.browseLimit = 120;
    renderSearch();
  });
  if (els.groupSelect) {
    els.groupSelect.addEventListener('change', () => {
      state.browseGroup = els.groupSelect.value;
      state.browseLimit = 120;
      renderSearch();
    });
  }
}

if (els.bulkToggleBtn) {
  els.bulkToggleBtn.addEventListener('click', () => {
    state.bulkMode = !state.bulkMode;
    if (!state.bulkMode) state.bulkSelected = new Set();
    renderSearch();
  });
}
if (els.bulkAllBtn) {
  els.bulkAllBtn.addEventListener('click', () => {
    state.bulkSelected = new Set(state.lastResults.map((r) => r.bookmark.id));
    renderSearch();
  });
}
if (els.bulkTagBtn) els.bulkTagBtn.addEventListener('click', bulkTagSelected);
if (els.bulkReadlaterBtn) els.bulkReadlaterBtn.addEventListener('click', bulkReadLaterSelected);
if (els.bulkCopyBtn) els.bulkCopyBtn.addEventListener('click', bulkCopySelected);
if (els.bulkTrashBtn) els.bulkTrashBtn.addEventListener('click', bulkTrashSelected);


function applyBrowseView() {
  if (els.searchResults) {
    els.searchResults.classList.toggle('is-compact', state.browseView === 'compact');
  }
}

els.themeSelect.addEventListener('change', async () => {
  state.settings.theme = els.themeSelect.value;
  applyTheme(state.settings.theme);
  await persistSettings();
});

/* Tag dialog */
els.tagDialogClose.addEventListener('click', closeTagDialog);
els.tagDialogCreate.addEventListener('click', createTagFromDialog);
els.tagDialogInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createTagFromDialog();
  }
});
if (els.tagDialogFilter) {
  els.tagDialogFilter.addEventListener('input', (e) => renderTagDialogList(e.target.value));
  els.tagDialogFilter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = els.tagDialogList.querySelector('input[type="checkbox"]');
      if (first) first.checked = !first.checked;
    }
  });
}
els.tagDialog.addEventListener('click', (e) => {
  if (e.target === els.tagDialog) closeTagDialog();
});
el('tag-dialog-save').addEventListener('click', saveTagDialog);

/* Note dialog */
els.noteDialogClose.addEventListener('click', closeNoteDialog);
els.noteDialogSave.addEventListener('click', saveNoteDialog);

// Reader: tabs, annotations, highlights.
if (els.readerDialog) {
  els.readerClose.addEventListener('click', () => closeModal(els.readerDialog));
  els.readerDoneBtn.addEventListener('click', () => closeModal(els.readerDialog));
  els.readerOpenBtn.addEventListener('click', () => {
    if (readerBookmark) openBookmark(readerBookmark.id);
  });
  els.readerNoteBtn.addEventListener('click', () => {
    if (readerBookmark) openNoteDialog(readerBookmark);
  });
  els.readerDialog.querySelectorAll('[data-reader-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setReaderTab(btn.dataset.readerTab));
  });
  els.annotationAddBtn.addEventListener('click', async () => {
    const value = els.annotationInput.value.trim();
    if (!value || !readerBookmark) return;
    await saveAnnotation(readerBookmark, value);
    els.annotationInput.value = '';
    renderAnnotations();
    showStatus('Annotation saved.', 'ok');
  });
  els.annotationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.annotationAddBtn.click();
    }
  });
  // A text selection turns on the highlight button; clicking saves it.
  els.readerText.addEventListener('mouseup', () => {
    if (!els.saveHighlightBtn) return;
    const selected = selectedReaderText();
    els.saveHighlightBtn.hidden = !selected;
    els.saveHighlightBtn.dataset.text = selected;
  });
  els.saveHighlightBtn?.addEventListener('click', async () => {
    const text = els.saveHighlightBtn.dataset.text || selectedReaderText();
    if (!text || !readerBookmark) return;
    await saveAnnotation(readerBookmark, text, 'highlight');
    els.saveHighlightBtn.hidden = true;
    setReaderTab('annotate');
    renderAnnotations();
    showStatus('Highlight saved.', 'ok');
  });
}

// Library: tag suggestions and tagged-collection editing.
if (els.suggestTagsBtn) {
  els.suggestTagsBtn.addEventListener('click', () => renderTagSuggestions());
}

/* Confirm dialog (Escape and backdrop are handled by the shared modal layer) */
els.confirmCancel.addEventListener('click', () => settleConfirm(false));
els.confirmOk.addEventListener('click', () => settleConfirm(true));

/* Prompt dialog */
els.promptCancel.addEventListener('click', () => settlePrompt(null));
els.promptOk.addEventListener('click', () => settlePrompt(els.promptInput.value));
els.promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    settlePrompt(els.promptInput.value);
  }
});

/* Palette */
els.paletteBtn.addEventListener('click', openPalette);
els.paletteInput.addEventListener('input', (e) => debouncedPalette(e.target.value));
els.palette.addEventListener('click', (e) => {
  if (e.target === els.palette) closePalette();
});

document.addEventListener('keydown', (e) => {
  // Modals own Escape and Tab; the app only handles its own shortcut layer.
  const modalLayerOpen = anyModalOpen();

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (els.palette.hidden) openPalette();
    else closePalette();
    return;
  }

  if (e.key === 'Escape') {
    if (!els.palette.hidden) closePalette();
    return;
  }

  if (!els.palette.hidden) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Rebuild from the live input first so arrows move within the right list.
      renderPaletteNow(els.paletteInput.value);
      state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1);
      renderPaletteNow(els.paletteInput.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      renderPaletteNow(els.paletteInput.value);
      state.paletteIndex = Math.max(0, state.paletteIndex - 1);
      renderPaletteNow(els.paletteInput.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPaletteSelection();
    }
    return;
  }

  // Browse keyboard shortcuts (1–7 in the list).
  if (!modalLayerOpen && !isTypingTarget(e.target)) handleBrowseKey(e);
});

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/* Context-menu and omnibox arrivals from the service worker */
async function drainPending() {
  if (!IS_EXTENSION) return;
  const res = await sendMessageSafe({ type: 'DRAIN_PENDING' });
  if (!res) return;

  if (res.search) {
    state.search.query = res.search;
    if (els.searchInput) els.searchInput.value = res.search;
    switchTab('browse');
    renderSearch();
  }

  if (Array.isArray(res.pending) && res.pending.length > 0) {
    const existing = new Set(state.bookmarks.map((b) => tagKey(b)));
    const fresh = res.pending.filter((item) => item.url && !existing.has(tagKey(item)));
    if (fresh.length) {
      await pushSnapshot(`Before saving ${fresh.length} bookmark${fresh.length === 1 ? '' : 's'}`);
      // With a key, propose a tag and folder before the bookmark lands. Capped
      // because "save all tabs" can queue dozens of pages — filing every one
      // would mean a request each, which is slow and eats a free tier.
      const FILING_LIMIT = 5;
      const filed = [];
      for (const item of fresh) {
        const shouldAsk = filed.length < FILING_LIMIT;
        const suggestion = shouldAsk ? await suggestFilingFor(item) : null;
        filed.push({ ...item, folderName: (suggestion && suggestion.folder) || 'Unsorted', tags: suggestion?.tag ? [suggestion.tag] : [] });
      }
      await recreateFromItems(filed, `Bookbox Saved (${new Date().toLocaleDateString()})`);
      await scanBookmarks();
      const tagged = filed.filter((f) => f.tags && f.tags.length).length;
      showStatus(
        tagged
          ? `Saved ${fresh.length} bookmark${fresh.length === 1 ? '' : 's'}, filed with a suggested tag and folder.`
          : `Saved ${fresh.length} bookmark${fresh.length === 1 ? '' : 's'} to Bookbox.`,
        'ok'
      );
    }
  }
}

/* Demo reset (preview only) */
window.addEventListener('bookbox:reset-demo', () => {
  demoBookmarks = DEMO_BOOKMARKS_SEED.map((b) => ({ ...b }));
  state.contentCache.clear();
  state.indexTextCache.clear();
  state.visitCache.clear();
  state.tagMap = {};
  state.readLater = {};
  state.notes = {};
  state.activeTags = [];
  state.checkedDead = false;
  state.checkedStale = false;
  state.checkedAging = false;
  state.deadLinks = [];
  state.staleLinks = [];
  state.agingFolders = [];
  state.plan = null;
  state.trash = [];
  state.histories = [];
  state.backup = null;
  state.activeCollection = null;
  state.search = { query: '', folder: 'all', domain: 'all', addedWithin: '0', visitedWithin: 'any', tags: [] };
  if (els.searchInput) els.searchInput.value = '';
  if (els.indexStatus) els.indexStatus.textContent = 'No index yet — build one to search inside page text.';
  persistTrash();
  persistTags();
  persistNotes();
  persistHistory();
  renderBackupBar();
  renderHistory();
  scanBookmarks().then(() => loadVisits().then(renderSearch));
  renderPreviewPlan();
  switchTab('browse');
  showStatus('Demo bookmarks reset.', 'info');
});

/* ---------- Boot ---------- */

storageGet([STORAGE.settings]).then((stored) => applyTheme(stored?.[STORAGE.settings]?.theme || 'dark'));

// The options page opens straight to Settings, since that's the whole reason it exists.
const OPEN_TAB = new URLSearchParams(location.search).get('tab') || (document.body.classList.contains('options-body') ? 'settings' : 'browse');

const resetBtn = el('reset-demo-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => window.dispatchEvent(new Event('bookbox:reset-demo')));
}

if (!IS_EXTENSION) els.modeIndicator.textContent = 'Interactive preview (demo bookmarks)';

Promise.all([loadAll()])
  .then(() => {
    renderSkipDomains();
    // Filling the settings form is independent of reading bookmarks, so run
    // them together. First paint waits on the slower of the two, not both.
    return Promise.all([loadSettingsIntoForm(), scanBookmarks()]);
  })
  .then(async () => {
    if (migratePending) {
      migratePending = false;
      await persistTags();
      await persistNotes();
    }
  })
  .then(loadVisits)
  .then(drainPending)
  .then(() => {
    renderHistory();
    // Land on the tab in the URL so a deep link doesn't render Browse first.
    switchTab(OPEN_TAB);
    // First run only: an empty library with no tour flag gets the quick tour.
    if (!IS_EXTENSION && !state.settings.tourDone) {
      setTimeout(() => openTour(), 400);
    } else if (IS_EXTENSION && !state.settings.tourDone) {
      setTimeout(() => openTour(), 400);
    }
  })
  .catch((err) => showStatus(`Startup problem: ${err.message || 'unknown'}`, 'error'));

