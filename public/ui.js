// Shared markup for the BookBox popup and the preview page.
// Both shells are thin: they call renderShell() and then load app.js.

const BRAND_ICON = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <path d="M9 12h6"/>
    <path d="M9 16h4"/>
  </svg>`;

export function shellMarkup() {
  // Starts hidden rather than visible: the shell begins in the no-key state and
  // applyAiVisibility() lifts it once settings load. That avoids AI buttons
  // flashing into view for a moment on every open.
  return `
  <div class="ext-shell no-key" id="ext-shell">
    <header class="ext-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${BRAND_ICON}</span>
        <div>
          <h1 class="brand-name">BookBox</h1>
          <p class="brand-sub" id="mode-indicator">Your bookmarks, sorted</p>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="icon-btn" id="palette-btn" title="Command palette (Ctrl+K)">
          <span>⌘K</span>
        </button>
        <button type="button" class="icon-btn" id="rescan-btn" title="Rescan bookmarks">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
            <path d="M21 3v6h-6"/>
          </svg>
          <span>Scan</span>
        </button>
      </div>
    </header>

    <nav class="tab-bar" role="tablist" aria-label="BookBox sections">
      <button type="button" class="tab-btn is-active" role="tab" aria-selected="true" aria-controls="panel-browse" tabindex="0" data-tab="browse">Browse</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" aria-controls="panel-organize" tabindex="-1" data-tab="organize">Organize</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" aria-controls="panel-cleanup" tabindex="-1" data-tab="cleanup">
        Cleanup <span class="tab-badge" id="cleanup-badge" hidden>0</span>
      </button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" aria-controls="panel-library" tabindex="-1" data-tab="library">
        Library <span class="tab-badge" id="library-badge" hidden>0</span>
      </button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" aria-controls="panel-preview" tabindex="-1" data-tab="preview">
        Preview <span class="tab-badge is-accent" id="preview-badge" hidden>0</span>
      </button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" aria-controls="panel-settings" tabindex="-1" data-tab="settings">Settings</button>
    </nav>

    <div class="status-banner" id="status-banner" hidden role="status" aria-live="polite"></div>

    <div class="toast-host" id="toast-host" aria-live="polite" aria-atomic="true"></div>

    <div class="backup-bar" id="backup-bar" hidden>
      <span id="backup-bar-text">Backup available</span>
      <div class="backup-bar-actions">
        <button type="button" class="btn-inline" id="undo-history-btn" hidden>Undo last</button>
        <button type="button" class="btn-inline" id="restore-backup-btn">Restore</button>
      </div>
    </div>

    <div class="trash-bar" id="trash-bar" hidden>
      <span id="trash-bar-text"></span>
      <button type="button" class="btn-inline" id="trash-restore-all-btn">Restore all</button>
      <button type="button" class="btn-inline is-danger" id="trash-empty-btn">Empty</button>
    </div>

    <div class="tag-bar" id="tag-bar"></div>

    <main class="ext-main">
      <!-- ORGANIZE -->
      <section class="tab-panel" id="panel-organize" role="tabpanel" hidden>
        <div class="section-block">
          <div class="section-head">
            <h2>Sorting engine</h2>
          </div>
          <div class="engine-toggle" role="radiogroup" aria-label="Sorting mode">
            <label class="engine-option">
              <input type="radio" name="sort-engine" value="local" checked />
              <span class="engine-card">
                <strong>Smart Local</strong>
                <span>Free, instant, 100% private</span>
              </span>
            </label>
            <label class="engine-option">
              <input type="radio" name="sort-engine" value="ai" />
              <span class="engine-card">
                <strong>AI Sorting</strong>
                <span id="ai-engine-hint">Gemini, Groq, or OpenRouter</span>
              </span>
            </label>
          </div>
          <p class="field-help" id="ai-estimate"></p>
          <p class="field-help" id="rules-hint">Rules always win over AI and local sorting.</p>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Include in plan</h2>
          </div>
          <label class="check-row">
            <input type="checkbox" id="opt-read-content" checked />
            <span>Read actual website content for smarter sorting</span>
          </label>
          <label class="check-row">
            <input type="checkbox" id="opt-existing-folders" checked />
            <span>Reuse existing folders instead of duplicating them</span>
          </label>
          <label class="check-row">
            <input type="checkbox" id="opt-remove-dupes" checked />
            <span>Remove duplicates, keeping their tags and notes</span>
          </label>
          <label class="check-row">
            <input type="checkbox" id="opt-remove-dead" checked />
            <span>Remove confirmed dead links (bot walls are kept)</span>
          </label>
          <label class="check-row">
            <input type="checkbox" id="opt-safe-clean" />
            <span>Safe clean only — exact duplicates and hard 404s, nothing else</span>
          </label>
        </div>

        <div class="progress-wrap" id="content-progress-wrap" hidden>
          <div class="progress-track">
            <div class="progress-bar" id="content-progress-bar"></div>
          </div>
          <span class="progress-text" id="content-progress-text">Reading page content 0 / 0...</span>
        </div>

        <div class="action-stack">
          <button type="button" class="btn-primary" id="build-plan-btn">Generate preview</button>
          <button type="button" class="btn-secondary" id="quick-dead-scan-btn">Quick safe clean</button>
          <button type="button" class="btn-secondary" id="save-tabs-btn">Save open tabs as a folder</button>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Folders</h2>
            <span class="count-pill" id="folder-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">
            Drag a bookmark onto a folder to move it. Right-click labels to rename or merge.
          </p>
          <div id="similar-folders" class="section-block" hidden></div>
          <div id="folder-tree" class="folder-manage-tree"></div>
          <button type="button" class="btn-secondary ai-only" id="folder-ai-btn">Name messy folders with AI</button>
          <div id="folder-ai-result" class="item-list" hidden></div>
        </div>
      </section>

      <!-- BROWSE (home) -->
      <section class="tab-panel is-active" id="panel-browse" role="tabpanel">
        <div class="stats-strip">
          <div class="stat-cell">
            <span class="stat-value" id="stat-total">0</span>
            <span class="stat-label">Bookmarks</span>
          </div>
          <div class="stat-cell">
            <span class="stat-value is-warn" id="stat-dupes">0</span>
            <span class="stat-label">Duplicates</span>
          </div>
          <div class="stat-cell">
            <span class="stat-value is-danger" id="stat-dead">—</span>
            <span class="stat-label">Dead links</span>
          </div>
          <div class="stat-cell">
            <span class="stat-value" id="stat-health">—</span>
            <span class="stat-label">Health</span>
          </div>
        </div>

        <div class="browse-search">
          <div class="search-box-wrap">
            <input type="search" id="search-input" class="search-input" placeholder="Search bookmarks, page text, notes, or tags..." aria-label="Search bookmarks" />
            <span class="search-hint">⌘K</span>
          </div>
          <div class="browse-tools">
            <button type="button" class="btn-inline" id="browse-filter-toggle" aria-expanded="false">Filters</button>
            <button type="button" class="btn-inline ai-only" id="semantic-toggle" aria-pressed="false" title="Find pages by meaning, not just words">Meaning search</button>
            <div class="browse-sort">
              <label for="sort-select" class="sr-only">Sort results</label>
              <select id="sort-select" aria-label="Sort results">
                <option value="relevance">Relevance</option>
                <option value="useful">Most useful</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
                <option value="opened">Most opened</option>
              </select>
            </div>
            <label for="group-select" class="sr-only">Group results</label>
            <select id="group-select" aria-label="Group results" class="group-select">
              <option value="none">No grouping</option>
              <option value="folder">Group by folder</option>
              <option value="domain">Group by site</option>
            </select>
            <div class="view-toggle" role="group" aria-label="View style">
              <button type="button" class="view-btn is-active" data-view="list" title="List view" aria-label="List view">☰</button>
              <button type="button" class="view-btn" data-view="compact" title="Compact view" aria-label="Compact view">≡</button>
            </div>
            <span class="search-count" id="search-count" role="status" aria-live="polite"></span>
          </div>
          <div class="browse-subtools">
            <button type="button" class="btn-inline" id="bulk-toggle-btn" aria-pressed="false">Select</button>
            <div class="bulk-actions" id="bulk-actions" hidden>
              <span class="bulk-count" id="bulk-count">0 selected</span>
              <button type="button" class="btn-inline" id="bulk-all-btn">All</button>
              <button type="button" class="btn-inline" id="bulk-tag-btn">Tag</button>
              <button type="button" class="btn-inline" id="bulk-readlater-btn">Read later</button>
              <button type="button" class="btn-inline" id="bulk-copy-btn">Copy links</button>
              <button type="button" class="btn-inline is-danger" id="bulk-trash-btn">Trash</button>
            </div>
          </div>
        </div>

        <div class="recent-searches" id="recent-searches"></div>

        <div class="saved-collections" id="saved-collections"></div>

        <div class="browse-filters" id="browse-filters" hidden>
          <div class="folder-chips" id="search-folder-chips"></div>
          <div class="filter-grid">
            <div class="filter-cell">
              <label for="search-domain">Site</label>
              <select id="search-domain"></select>
            </div>
            <div class="filter-cell">
              <label for="search-added">Added</label>
              <select id="search-added">
                <option value="0">Any time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="365">Last year</option>
              </select>
            </div>
            <div class="filter-cell">
              <label for="search-visited">Last opened</label>
              <select id="search-visited">
                <option value="any">Any time</option>
                <option value="30">Within 30 days</option>
                <option value="90">Within 3 months</option>
                <option value="never">Never opened</option>
              </select>
            </div>
          </div>
          <div class="folder-chips" id="search-tag-chips"></div>
          <div class="browse-filter-actions">
            <button type="button" class="btn-inline" id="build-index-btn">Build full-page index</button>
            <button type="button" class="btn-inline" id="save-collection-btn">Save as collection</button>
          </div>
          <div class="progress-wrap" id="index-progress-wrap" hidden>
            <div class="progress-track">
              <div class="progress-bar" id="index-progress-bar"></div>
            </div>
            <span class="progress-text" id="index-progress-text"></span>
          </div>
          <p class="field-help" id="index-status">No index yet — build one to search inside page text.</p>
        </div>

        <div class="item-list browse-list" id="search-results"></div>
      </section>

      <!-- LIBRARY: rules, tags, read-later, notes -->
      <section class="tab-panel" id="panel-library" role="tabpanel" hidden>
        <div class="section-block">
          <div class="section-head">
            <h2>Rules</h2>
            <span class="count-pill" id="rules-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">If a bookmark matches a rule, it goes to that folder — every time.</p>

          <div class="rule-form">
            <select id="rule-field" aria-label="Rule field">
              <option value="domain">Site is</option>
              <option value="title">Title contains</option>
              <option value="url">URL contains</option>
            </select>
            <input type="text" id="rule-match" placeholder="github.com" />
            <input type="text" id="rule-folder" placeholder="Development / Repos" />
            <button type="button" class="btn-inline" id="rule-add-btn">Add rule</button>
          </div>

          <div class="ai-only rule-form is-pair" id="rule-ai-row">
            <input type="text" id="rule-ai-input" placeholder="Describe a rule: anything from substack goes to Reading / Newsletters" aria-label="Describe a rule in plain words" />
            <button type="button" class="btn-inline" id="rule-ai-btn">Make rule</button>
          </div>
          <p class="field-help ai-only" id="rule-ai-status"></p>

          <div id="rules-list" class="item-list"></div>
          <button type="button" class="btn-secondary" id="rules-run-btn" hidden>Apply rules to matching bookmarks</button>

          <div class="rule-tools">
            <label for="rule-test-url" class="field-help">Test a URL against your rules</label>
            <div class="rule-form is-pair">
              <input type="text" id="rule-test-url" placeholder="https://github.com/some/repo" />
              <button type="button" class="btn-inline" id="rule-test-btn">Which rule wins?</button>
            </div>
            <div class="action-row">
              <button type="button" class="btn-inline" id="rules-export-btn">Export rules</button>
              <button type="button" class="btn-inline" id="rules-import-btn">Import rules</button>
              <input type="file" id="rules-import-file" accept=".json,application/json" hidden />
            </div>
            <p class="field-help">Rules are checked top to bottom. Drag a row (or use ↑ ↓) to change priority.</p>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Tags</h2>
            <span class="count-pill" id="tag-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Use <code>frontend/css</code> so filtering <code>frontend</code> catches the family. Drag one tag onto another to nest it.</p>
          <div id="tag-manage-list" class="item-list"></div>
          <div id="tag-merge-preview" class="merge-preview" hidden></div>
          <button type="button" class="btn-secondary" id="suggest-tags-btn">Suggest tags for untagged bookmarks</button>
          <div id="tag-suggestions-list" class="item-list" hidden></div>
          <div class="ai-only">
            <button type="button" class="btn-secondary" id="tag-ai-suggest-btn">Suggest from my tag vocabulary (AI)</button>
            <button type="button" class="btn-secondary" id="tag-consolidate-btn">Tidy duplicate tags (AI)</button>
            <div id="tag-ai-list" class="item-list" hidden></div>
            <div id="tag-consolidate-preview" class="merge-preview" hidden></div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Read later</h2>
            <span class="count-pill" id="readlater-count-pill"></span>
          </div>
          <div id="readlater-list" class="item-list"></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Notes</h2>
            <span class="count-pill" id="notes-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Notes are included in search and in exports.</p>
          <div id="notes-list" class="item-list"></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Ask your library</h2>
            <span class="count-pill" id="ask-engine-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Ask a question in plain words. With no API key this searches your saved page text locally; with a key it writes an answer and quotes the passages it used.</p>
          <div class="rule-form is-pair">
            <input type="text" id="ask-question" placeholder="What did I save about CSS grid?" aria-label="Ask your bookmarks" />
            <button type="button" class="btn-inline" id="ask-btn">Ask</button>
          </div>
          <div id="ask-answer" class="ask-answer" hidden></div>
          <div id="ask-followup-row" class="rule-form is-pair ai-only" hidden>
            <input type="text" id="ask-followup" placeholder="Ask a follow-up about that…" aria-label="Ask a follow-up" />
            <button type="button" class="btn-inline" id="ask-followup-btn">Ask again</button>
          </div>
        </div>
      </section>

      <!-- CLEANUP -->
      <section class="tab-panel" id="panel-cleanup" role="tabpanel" hidden>
        <div class="section-block">
          <div class="section-head">
            <h2>Exact duplicates</h2>
            <span class="count-pill" id="dupes-count-pill">0 found</span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Merging keeps the oldest copy and carries over tags, notes, and read-later status.</p>
          <div id="dupes-list" class="item-list"></div>
          <button type="button" class="btn-danger-outline" id="remove-dupes-now-btn" hidden>
            Merge selected duplicates
          </button>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Near-duplicates</h2>
            <span class="count-pill" id="near-count-pill">0 found</span>
          </div>
          <p class="field-help" style="margin-top: -4px;">The same page saved as its AMP, print, or mobile version.</p>
          <div id="near-list" class="item-list"></div>
          <button type="button" class="btn-danger-outline" id="remove-near-now-btn" hidden>
            Remove selected near-duplicates
          </button>
          <button type="button" class="btn-secondary ai-only" id="near-ai-btn">Ask AI about the uncertain pairs</button>
          <div id="near-ai-result" class="item-list" hidden></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Title conflicts</h2>
            <span class="count-pill" id="conflict-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Same page, two different titles.</p>
          <div id="conflict-list" class="item-list"></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Dead links</h2>
            <span class="count-pill" id="dead-count-pill"></span>
            <button type="button" class="btn-inline" id="run-dead-check-btn">Check links</button>
          </div>
          <div class="progress-wrap" id="dead-progress-wrap" hidden>
            <div class="progress-track">
              <div class="progress-bar" id="dead-progress-bar"></div>
            </div>
            <div class="progress-row">
              <span class="progress-text" id="dead-progress-text">Checking 0 / 0...</span>
              <button type="button" class="btn-inline is-quiet" id="cancel-dead-btn" hidden>Cancel</button>
            </div>
          </div>
          <div id="dead-list" class="item-list">
            <p class="empty-note">Run a link check to find 404s, timeouts, and unreachable pages.</p>
          </div>
          <button type="button" class="btn-danger-outline" id="remove-dead-now-btn" hidden>
            Move selected dead links to trash
          </button>

          <div class="schedule-block">
            <label for="schedule-select" class="field-help">Automatic check</label>
            <div class="rule-form">
              <select id="schedule-select" aria-label="Automatic link check schedule">
                <option value="off">Off</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <span class="field-help" id="schedule-summary">Background checks run while the browser is open.</span>
            </div>
          </div>

          <div class="section-block" id="redirect-block" hidden>
            <div class="section-head">
              <h2>Moved links</h2>
              <span class="count-pill" id="redirect-count-pill"></span>
            </div>
            <p class="field-help" style="margin-top: -4px;">These pages now live at a new address. Updating keeps the bookmark working.</p>
            <div id="redirect-list" class="item-list"></div>
            <button type="button" class="btn-inline" id="update-redirects-btn">Update all addresses</button>
          </div>

          <div class="skip-domains">
            <label for="skip-domain-input" class="field-help">Never check these sites (bot walls, intranets)</label>
            <div class="rule-form">
              <input type="text" id="skip-domain-input" placeholder="example.com" />
              <button type="button" class="btn-inline" id="skip-domain-add-btn">Skip site</button>
            </div>
            <div class="folder-chips" id="skip-domain-chips"></div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Stale &amp; unused</h2>
            <span class="count-pill" id="stale-count-pill"></span>
          </div>
          <div class="stale-controls">
            <select id="stale-select" aria-label="Staleness threshold">
              <option value="never">Never opened</option>
              <option value="90">Not opened in 3 months</option>
              <option value="180" selected>Not opened in 6 months</option>
              <option value="365">Not opened in a year</option>
            </select>
            <button type="button" class="btn-inline" id="run-stale-check-btn">Find stale</button>
          </div>
          <div id="stale-list" class="item-list">
            <p class="empty-note">Pick an age and run a stale check to find bookmarks you never open.</p>
          </div>
          <button type="button" class="btn-danger-outline" id="remove-stale-now-btn" hidden>
            Move selected stale bookmarks to trash
          </button>
          <button type="button" class="btn-secondary ai-only" id="stale-ai-btn">Explain why these are stale (AI)</button>
          <div id="stale-ai-result" class="ask-answer ai-only" hidden></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Aging folders</h2>
            <span class="count-pill" id="aging-count-pill"></span>
          </div>
          <div class="stale-controls">
            <select id="aging-select" aria-label="Folder age">
              <option value="6">Untouched for 6 months</option>
              <option value="12" selected>Untouched for a year</option>
              <option value="24">Untouched for 2 years</option>
            </select>
            <button type="button" class="btn-inline" id="run-aging-btn">Check folders</button>
          </div>
          <div id="aging-list" class="item-list">
            <p class="empty-note">Find whole folders you have stopped using.</p>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Rot score</h2>
            <span class="count-pill" id="rot-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Dead links, never-opened pages, and very old saves, ranked together.</p>
          <div id="rot-list" class="item-list"></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Trash</h2>
            <span class="count-pill" id="trash-count-pill"></span>
          </div>
          <p class="field-help" style="margin-top: -4px;">Deleted bookmarks are held here for 30 days, then cleared automatically.</p>
          <div class="trash-tools">
            <input type="search" id="trash-search" placeholder="Search trash…" aria-label="Search trash" autocomplete="off" />
            <select id="trash-age-select" aria-label="Clear trash older than">
              <option value="0">Clear older than…</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <button type="button" class="btn-inline" id="trash-clear-old-btn">Clear</button>
          </div>
          <div id="trash-list" class="item-list"></div>
        </div>
      </section>

      <!-- PREVIEW -->
      <section class="tab-panel" id="panel-preview" role="tabpanel" hidden>
        <div id="preview-empty" class="empty-state">
          <p class="empty-title">No preview yet</p>
          <p class="empty-note">Generate a plan from Organize to inspect every folder move, merge, and deletion before touching your bookmarks.</p>
          <button type="button" class="btn-primary" id="preview-generate-btn">Generate preview now</button>
        </div>

        <div id="preview-content" hidden>
          <div class="plan-summary" id="plan-summary"></div>
          <div class="plan-skip-note" id="plan-skip-note" hidden></div>

          <div class="section-block" id="preview-diff-block">
            <div class="section-head">
              <h2>What changes</h2>
            </div>
            <div class="diff-grid">
              <div class="diff-col">
                <h3>Before</h3>
                <div id="diff-before" class="diff-tree"></div>
              </div>
              <div class="diff-col">
                <h3>After</h3>
                <div id="diff-after" class="diff-tree"></div>
              </div>
            </div>
          </div>

          <div class="section-block" id="preview-removals-block" hidden>
            <div class="section-head">
              <h2>Marked for removal</h2>
              <span class="count-pill is-danger" id="preview-remove-count">0</span>
            </div>
            <div id="preview-removals-list" class="item-list"></div>
          </div>

          <div class="section-block" id="preview-merge-block" hidden>
            <div class="section-head">
              <h2>Merged duplicates</h2>
              <span class="count-pill" id="preview-merge-count">0</span>
            </div>
            <div id="preview-merge-list" class="item-list"></div>
          </div>

          <div class="section-block">
            <div class="section-head">
              <h2>Proposed folder structure</h2>
              <span class="count-pill" id="preview-folder-count">0 folders</span>
            </div>
            <div id="preview-folders-list" class="folder-tree"></div>
          </div>

          <div class="preview-footer">
            <button type="button" class="btn-primary" id="apply-plan-btn">Apply changes</button>
            <button type="button" class="btn-secondary" id="undo-apply-btn" hidden>Undo last change</button>
          </div>
        </div>
      </section>

      <!-- SETTINGS -->
      <section class="tab-panel" id="panel-settings" role="tabpanel" hidden>
        <form id="settings-form" class="settings-form">
          <div class="field-group">
            <label for="ai-provider">AI provider (free tier)</label>
            <select id="ai-provider">
              <option value="gemini">Google Gemini (AI Studio)</option>
              <option value="groq">Groq (Llama 3.3)</option>
              <option value="openrouter">OpenRouter (Free models)</option>
            </select>
          </div>

          <div class="field-group">
            <label for="ai-key">API key</label>
            <input type="password" id="ai-key" placeholder="Paste your personal API key" autocomplete="off" />
            <p class="field-help">Stored locally in your browser only. Never sent anywhere except your chosen AI provider.</p>
          </div>

          <div class="field-group">
            <label for="ai-model">Model (optional)</label>
            <input type="text" id="ai-model" placeholder="Default: gemini-2.0-flash" />
          </div>

          <div class="field-group">
            <label for="theme-select">Theme</label>
            <select id="theme-select">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </select>
          </div>

          <div class="field-group ai-only">
            <label class="check-row">
              <input type="checkbox" id="ai-file-on-save" checked />
              <span>Suggest a tag and folder for each page I save</span>
            </label>
            <p class="field-help">One request per saved page. Leave this off and saved pages land untagged in Unsorted.</p>
          </div>

          <div class="field-group">
            <label for="protect-list">Never touch these folders or sites</label>
            <textarea id="protect-list" rows="3" placeholder="Work / Archive&#10;bank.example.com"></textarea>
            <p class="field-help">One per line. Anything here is excluded from cleanup and sorting.</p>
          </div>

          <button type="submit" class="btn-primary">Save settings</button>
        </form>

        <div class="section-block">
          <div class="section-head">
            <h2>Keyboard shortcuts</h2>
            <button type="button" class="btn-inline" id="tour-btn">Show me around</button>
          </div>
          <div class="shortcut-grid">
            <div><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>B</kbd><span>Open BookBox</span></div>
            <div><kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd><span>Save current page</span></div>
            <div><kbd>⌘K</kbd><span>Jump to anything</span></div>
            <div><kbd>/</kbd><span>Focus search</span></div>
            <div><kbd>↑</kbd><kbd>↓</kbd><span>Move through results</span></div>
            <div><kbd>Enter</kbd><span>Open the highlighted bookmark</span></div>
            <div><kbd>T</kbd><span>Tag the highlighted bookmark</span></div>
            <div><kbd>N</kbd><span>Note the highlighted bookmark</span></div>
            <div><kbd>Space</kbd><span>Pin or unpin</span></div>
            <div><kbd>Esc</kbd><span>Close dialogs</span></div>
          </div>
          <p class="field-help">Typing <code>bb</code> then a search in the address bar opens BookBox with that query.</p>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Backups</h2>
          </div>
          <p class="field-help">BookBox keeps a rolling history of your last actions. Restoring adds bookmarks into a new folder without deleting anything current.</p>
          <button type="button" class="btn-secondary" id="restore-backup-settings-btn">Restore last backup</button>

          <div class="section-head" style="margin-top: 14px;">
            <h2>Export</h2>
          </div>
          <div class="export-grid">
            <button type="button" class="btn-secondary" id="export-json-btn">JSON</button>
            <button type="button" class="btn-secondary" id="export-html-btn">Bookmarks HTML</button>
            <button type="button" class="btn-secondary" id="export-md-btn">Markdown</button>
            <button type="button" class="btn-secondary" id="export-csv-btn">CSV</button>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Import</h2>
          </div>
          <p class="field-help">Point this at a browser bookmarks HTML export to adopt the library on day one. You see a preview before anything changes.</p>
          <input type="file" id="import-file" accept=".html,text/html" />
          <div class="import-preview" id="import-preview" hidden>
            <div class="import-summary" id="import-summary"></div>
            <div class="import-folders" id="import-folders"></div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" id="import-cancel-btn">Cancel</button>
              <button type="button" class="btn-primary" id="import-confirm-btn">Import these</button>
            </div>
          </div>
          <div class="progress-wrap" id="import-progress-wrap" hidden>
            <div class="progress-track">
              <div class="progress-bar" id="import-progress-bar"></div>
            </div>
            <span class="progress-text" id="import-progress-text"></span>
          </div>
          <p class="field-help" id="import-status"></p>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Storage</h2>
            <span class="count-pill" id="storage-usage">—</span>
          </div>
          <div class="progress-track" style="margin-bottom: 6px;">
            <div class="progress-bar" id="storage-bar" style="width: 0%;"></div>
          </div>
          <p class="field-help" id="storage-detail">Your settings, tags, notes, backups, and page text all live in this browser.</p>
          <button type="button" class="btn-secondary" id="index-refresh-btn">Refresh page-text index</button>
          <button type="button" class="btn-secondary" id="index-prune-btn">Trim index to fit</button>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Sync across devices</h2>
            <label class="switch-row">
              <input type="checkbox" id="sync-enabled" />
              <span>Sync settings and tags</span>
            </label>
          </div>
          <p class="field-help">Uses the browser's own sync account. Only your preferences and tag names travel — page text, notes, history, and your API key never leave this device.</p>
          <p class="field-help" id="sync-status"></p>
          <div class="action-row">
            <button type="button" class="btn-inline" id="sync-now-btn">Sync now</button>
            <button type="button" class="btn-inline" id="sync-pull-btn">Pull from other devices</button>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Data health</h2>
            <span class="count-pill" id="orphan-pill">—</span>
          </div>
          <p class="field-help">Tags, notes, and read-later marks can outlive the bookmark they belonged to. Scanning finds them; cleaning removes only those leftovers.</p>
          <div class="action-row">
            <button type="button" class="btn-inline" id="orphan-scan-btn">Scan for leftovers</button>
            <button type="button" class="btn-inline" id="orphan-clean-btn" disabled>Clean them up</button>
          </div>
          <div id="orphan-list" class="item-list"></div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Privacy</h2>
            <span class="count-pill">local first</span>
          </div>
          <p class="field-help">Your bookmarks, tags, notes, and backups stay in this browser. Nothing is sent anywhere unless you turn it on.</p>
          <ul class="policy-list">
            <li>Adding an AI key sends the bookmarks you sort or ask about to that provider. Smart Local, local summaries, and local answers never use the network.</li>
            <li>Dead-link checks contact the sites you already saved, to see if they still work.</li>
            <li>Sync, if you turn it on, shares only preferences and tag names through your browser's own account. Your API key never syncs.</li>
            <li>No analytics, no telemetry, no ads, and no selling data.</li>
          </ul>
          <details class="policy-more">
            <summary>Full policy and permissions</summary>
            <p><strong>Bookmarks</strong> — read, organise, and clean up your saved pages. <strong>Storage</strong> — keep your library, backups, and page text local. <strong>History</strong> — show which saved pages you visit. <strong>Tabs</strong> — open and save pages you choose. <strong>Context menus</strong> — the right-click save action. <strong>Alarms</strong> — an optional scheduled link check. <strong>All sites</strong> — only to fetch page text you ask to index and to test whether saved links still work.</p>
            <p>You can export your library any time as HTML, JSON, Markdown, or CSV. Uninstalling the extension removes everything it stored.</p>
          </details>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Diagnostics</h2>
          </div>
          <p class="field-help">If something goes wrong, copy this and you'll have the details.</p>
          <textarea id="diag-output" class="note-input" rows="5" readonly placeholder="No errors recorded."></textarea>
          <div class="action-row">
            <button type="button" class="btn-inline" id="diag-copy-btn">Copy diagnostics</button>
            <button type="button" class="btn-inline" id="diag-run-btn">Run self-check</button>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <h2>Backup history</h2>
          </div>
          <div id="history-list" class="item-list"></div>
        </div>
      </section>
    </main>

    <!-- Dialogs -->
    <div class="modal-backdrop" id="prompt-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
        <h2 class="modal-title" id="prompt-title">Enter a value</h2>
        <p class="field-help" id="prompt-help" hidden></p>
        <input type="text" id="prompt-input" class="note-input" style="margin-bottom: 12px;" />
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="prompt-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="prompt-ok">Save</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="tag-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tag-dialog-title">
        <h2 class="modal-title" id="tag-dialog-title">Tags</h2>
        <input type="search" id="tag-dialog-filter" class="note-input" placeholder="Filter tags…" autocomplete="off" aria-label="Filter tags" />
        <div class="modal-body" id="tag-dialog-list"></div>
        <div class="modal-create">
          <input type="text" id="tag-dialog-input" placeholder="New tag (e.g. frontend/css)" maxlength="40" list="tag-suggestions" autocomplete="off" />
          <datalist id="tag-suggestions"></datalist>
          <button type="button" class="btn-inline" id="tag-dialog-create">Add</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="tag-dialog-close">Cancel</button>
          <button type="button" class="btn-primary" id="tag-dialog-save">Save tags</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="note-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
        <h2 class="modal-title" id="note-dialog-title">Note</h2>
        <textarea id="note-dialog-input" rows="5" class="note-input" placeholder="Why you saved this, what you found useful..."></textarea>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="note-dialog-close">Cancel</button>
          <button type="button" class="btn-primary" id="note-dialog-save">Save note</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="reader-dialog" hidden>
      <div class="modal-card is-wide reader-card" role="dialog" aria-modal="true" aria-labelledby="reader-title">
        <div class="reader-head">
          <div>
            <h2 class="modal-title" id="reader-title">Reading</h2>
            <p class="field-help" id="reader-meta"></p>
          </div>
          <button type="button" class="tag-btn" id="reader-close" title="Close" aria-label="Close reader">✕</button>
        </div>
        <div class="reader-tabs" role="tablist" aria-label="Reader sections">
          <button type="button" class="reader-tab is-active" role="tab" aria-selected="true" data-reader-tab="text">Page text</button>
          <button type="button" class="reader-tab" role="tab" aria-selected="false" data-reader-tab="annotate">Annotations</button>
        </div>
        <div class="reader-body" id="reader-text-panel">
          <p class="reader-summary" id="reader-summary" hidden></p>
          <div class="ai-only">
            <button type="button" class="btn-inline" id="reader-ai-summary-btn">Write an AI summary</button>
          </div>
          <p class="empty-note" id="reader-empty">No page text saved yet. Build the index with page content on, then open this again.</p>
          <div id="reader-text" class="reader-text"></div>
        </div>
        <div class="reader-body" id="reader-annotate-panel" hidden>
          <p class="field-help">Highlight a sentence in Page text, then choose <strong>Save highlight</strong>. Annotations are searchable and export with your notes.</p>
          <div class="rule-form">
            <input type="text" id="annotation-input" placeholder="Add your own annotation…" aria-label="Annotation text" />
            <button type="button" class="btn-inline" id="annotation-add-btn">Save annotation</button>
          </div>
          <button type="button" class="btn-inline" id="save-highlight-btn" hidden>Save highlight</button>
          <div id="annotation-list" class="item-list"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="reader-note-btn">Edit note</button>
          <button type="button" class="btn-secondary" id="reader-open-btn">Open page</button>
          <button type="button" class="btn-primary" id="reader-done-btn">Done</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="collection-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="collection-dialog-title">
        <h2 class="modal-title" id="collection-dialog-title">Edit collection</h2>
        <label class="field-label" for="collection-name">Name</label>
        <input type="text" id="collection-name" />
        <label class="field-label" for="collection-query">Query</label>
        <input type="text" id="collection-query" placeholder="react tag:frontend site:github.com" />
        <p class="field-help">Supports <code>tag:</code>, <code>site:</code>, <code>has:note</code>, <code>before:</code> and plain words.</p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="collection-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="collection-save">Save collection</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="tour-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <h2 class="modal-title" id="tour-title">A quick tour</h2>
        <div id="tour-body" class="tour-body"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="tour-skip">Skip</button>
          <button type="button" class="btn-primary" id="tour-next">Next</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="palette" hidden>
      <div class="modal-card is-wide" role="dialog" aria-modal="true" aria-labelledby="palette-input-label">
        <h2 class="modal-title" id="palette-input-label">Jump to</h2>
        <input type="text" id="palette-input" class="search-input" placeholder="Search bookmarks or type a command..." />
        <div class="palette-results" id="palette-results"></div>
        <p class="field-help">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>

    <div class="modal-backdrop" id="confirm-dialog" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 class="modal-title" id="confirm-title">Confirm</h2>
        <div class="modal-body" id="confirm-body"></div>
        <label class="check-row" id="confirm-dontask-row" hidden>
          <input type="checkbox" id="confirm-dontask" />
          <span id="confirm-dontask-text">Do not ask again</span>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="confirm-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="confirm-ok">Confirm</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function renderShell(host = document.body) {
  host.innerHTML = shellMarkup();
}
