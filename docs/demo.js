/* BookBox docs - interactive demo.
   A self-contained miniature of the extension: search with operators,
   a sort plan you can untick, duplicate grouping, and a trash you can undo.
   No network, no storage, no access to the visitor's real bookmarks. */

(function () {
  "use strict";

  var DAY = 86400000;
  var now = Date.now();
  function daysAgo(n) { return now - n * DAY; }

  function seed() {
    return [
      {
        id: "b1", title: "MDN - JavaScript reference",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        host: "developer.mozilla.org", folder: "Unsorted",
        tags: ["frontend/js"], added: daysAgo(400), visited: daysAgo(3), read: false,
        text: "Complete JavaScript reference covering async promises, closures, and the standard library."
      },
      {
        id: "b2", title: "MDN JavaScript reference (dup)",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/?utm_source=twitter",
        host: "developer.mozilla.org", folder: "Bookmarks Bar",
        tags: [], added: daysAgo(300), visited: daysAgo(200), read: false,
        text: "Complete JavaScript reference and documentation."
      },
      {
        id: "b3", title: "A Complete Guide to CSS Grid",
        url: "https://css-tricks.com/complete-guide-grid/",
        host: "css-tricks.com", folder: "Unsorted",
        tags: ["frontend/css"], added: daysAgo(250), visited: daysAgo(1), read: false,
        text: "Two-dimensional layout with grid-template-areas, implicit tracks and subgrid alignment."
      },
      {
        id: "b4", title: "Container queries, explained",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries",
        host: "developer.mozilla.org", folder: "Unsorted",
        tags: ["frontend/css"], added: daysAgo(120), visited: daysAgo(2), read: false,
        text: "Style elements based on their parent size instead of the viewport with container queries."
      },
      {
        id: "b5", title: "Designing with colour tokens",
        url: "https://www.smashingmagazine.com/2024/colour-tokens/",
        host: "smashingmagazine.com", folder: "Misc",
        tags: ["frontend/design"], added: daysAgo(90), visited: daysAgo(6), read: false,
        text: "Build a design system from semantic colour tokens and accessible contrast pairs."
      },
      {
        id: "b6", title: "Google AI Studio",
        url: "https://aistudio.google.com/",
        host: "aistudio.google.com", folder: "Unsorted",
        tags: ["ai"], added: daysAgo(60), visited: daysAgo(2), read: true,
        text: "Prototyping environment for Gemini models with a free tier API key and embeddings."
      },
      {
        id: "b7", title: "Hacker News",
        url: "https://news.ycombinator.com/",
        host: "news.ycombinator.com", folder: "Reading / Later",
        tags: ["news"], added: daysAgo(700), visited: daysAgo(0), read: false,
        text: "Daily tech news, startup discussions and engineering posts from the community."
      },
      {
        id: "b8", title: "Old Startup Docs",
        url: "https://example-dead-site.invalid/docs/v1",
        host: "example-dead-site.invalid", folder: "Work",
        tags: [], added: daysAgo(600), visited: daysAgo(540), read: false,
        dead: "HTTP 404", text: ""
      },
      {
        id: "b9", title: "MDN JavaScript reference (third copy)",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        host: "developer.mozilla.org", folder: "Work",
        tags: ["reference"], added: daysAgo(500), visited: daysAgo(410), read: false,
        text: "JavaScript documentation."
      },
      {
        id: "b10", title: "Lo-Fi radio - beats to relax to",
        url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        host: "youtube.com", folder: "Bookmarks Bar",
        tags: [], added: daysAgo(200), visited: daysAgo(9), read: false,
        text: "Continuous livestream of instrumental hip hop beats for studying and coding."
      }
    ];
  }

  var state = {
    items: seed(),
    trash: [],
    query: "",
    tab: "library",
    selected: "",
    plan: null,
    planTo: {}
  };

  var el = {
    q: document.getElementById("demo-q"),
    results: document.getElementById("demo-results"),
    health: document.getElementById("demo-health"),
    trash: document.getElementById("demo-trash"),
    status: document.getElementById("demo-status"),
    side: document.getElementById("demo-side"),
    activeFilters: document.getElementById("demo-active-filters"),
    demo: document.getElementById("demo")
  };
  if (!el.demo) return;

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function normUrl(u) {
    try {
      var x = new URL(u);
      var host = x.hostname.replace(/^www\./, "").toLowerCase();
      var path = x.pathname.replace(/\/+$/, "").toLowerCase() || "/";
      var drop = /^(utm_|fbclid|gclid|ref$|ref_|mc_|_hs)/i;
      var keep = [];
      x.searchParams.forEach(function (v, k) {
        if (!drop.test(k)) keep.push(k + "=" + v);
      });
      keep.sort();
      return host + path + (keep.length ? "?" + keep.join("&") : "");
    } catch (e) {
      return String(u).toLowerCase();
    }
  }

  function parseQuery(raw) {
    var ops = { tag: [], site: [], folder: [], is: [], text: [] };
    raw.trim().split(/\s+/).filter(Boolean).forEach(function (tok) {
      var m = tok.match(/^(tag|site|folder|is):(.*)$/i);
      if (m && m[2]) ops[m[1].toLowerCase()].push(m[2].toLowerCase().replace(/^#/, ""));
      else if (tok.toLowerCase() === "is:unread") ops.is.push("unread");
      else ops.text.push(tok.toLowerCase());
    });
    return ops;
  }

  function matches(item, ops) {
    if (ops.site.length && !ops.site.some(function (s) { return item.host.toLowerCase().indexOf(s) !== -1; })) return false;
    if (ops.folder.length && !ops.folder.some(function (f) { return item.folder.toLowerCase().indexOf(f) !== -1; })) return false;
    if (ops.tag.length) {
      var tags = item.tags.map(function (t) { return t.toLowerCase(); });
      var ok = ops.tag.every(function (want) {
        return tags.some(function (t) { return t === want || t.indexOf(want + "/") === 0 || t.split("/").indexOf(want) !== -1; });
      });
      if (!ok) return false;
    }
    if (ops.is.indexOf("unread") !== -1 && item.read) return false;
    if (ops.text.length) {
      var hay = (item.title + " " + item.url + " " + item.host + " " + item.tags.join(" ") + " " + item.text).toLowerCase();
      if (!ops.text.every(function (t) { return hay.indexOf(t) !== -1; })) return false;
    }
    return true;
  }

  function highlight(text, ops) {
    var out = esc(text);
    (ops.text || []).forEach(function (t) {
      if (!t) return;
      var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      out = out.replace(re, '<span class="hl">$1</span>');
    });
    return out;
  }

  function dupGroups(items) {
    var map = {};
    items.forEach(function (b) {
      var k = normUrl(b.url);
      (map[k] = map[k] || []).push(b);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (g) { return g.length > 1; });
  }

  function dupIds() {
    var ids = {};
    dupGroups(state.items).forEach(function (g) {
      g.slice(1).forEach(function (b) { ids[b.id] = true; });
    });
    return ids;
  }

  function age(days) {
    if (days < 30) return Math.max(1, Math.round(days)) + "d";
    if (days < 365) return Math.round(days / 30) + "mo";
    return Math.round(days / 365) + "y";
  }

  function toast(msg, undo) {
    var old = document.querySelector(".demo-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "demo-toast";
    t.innerHTML = '<span>' + esc(msg) + "</span>";
    if (undo) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Undo";
      b.addEventListener("click", function () { undo(); t.remove(); });
      t.appendChild(b);
    }
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 220);
    }, undo ? 7000 : 3200);
  }

  // ---------- rendering ----------

  function row(item, opts) {
    opts = opts || {};
    var ops = parseQuery(state.query);
    var dup = dupIds();
    var badges = [];

    if (item.dead) badges.push('<span class="badge bad">404</span>');
    if (dup[item.id]) badges.push('<span class="badge warn">duplicate</span>');
    if (item.read) badges.push('<span class="badge ok">read</span>');
    item.tags.forEach(function (t) { badges.push('<span class="tag">' + esc(t) + "</span>"); });

    var lastVisit = item.visited ? age((now - item.visited) / DAY) : "-";

    return (
      '<button type="button" class="mock-row' + (state.selected === item.id ? " sel" : "") + '" role="listitem" data-id="' + item.id + '">' +
        '<span class="ico"></span>' +
        "<div>" +
          '<div class="t' + (item.read ? " done" : "") + '">' + highlight(item.title, ops) + "</div>" +
          '<div class="u">' + esc(item.host) + "</div>" +
          '<div class="meta-row">' + badges.join("") +
            '<span class="badge">' + esc(item.folder) + "</span>" +
            (opts.showAge ? '<span class="badge">last visit ' + lastVisit + "</span>" : "") +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function renderLibrary() {
    var ops = parseQuery(state.query);
    var list = state.items.filter(function (b) { return matches(b, ops); });

    el.activeFilters.innerHTML = []
      .concat(ops.tag.map(function (v) { return '<button type="button" data-drop="tag:' + esc(v) + '">tag:' + esc(v) + " &times;</button>"; }))
      .concat(ops.site.map(function (v) { return '<button type="button" data-drop="site:' + esc(v) + '">site:' + esc(v) + " &times;</button>"; }))
      .join("");

    if (!list.length) {
      el.results.innerHTML = '<div class="demo-empty-row">No bookmarks match. Try <code>tag:frontend</code> or clear the box.</div>';
    } else {
      el.results.innerHTML = list.map(function (b) { return row(b, { showAge: true }); }).join("");
    }

    var dups = dupGroups(state.items).length;
    el.status.innerHTML =
      "<strong>" + list.length + "</strong> of " + state.items.length + " bookmarks" +
      (dups ? " &middot; <strong>" + dups + "</strong> duplicate group" + (dups > 1 ? "s" : "") : "") +
      " &middot; stays in your browser";

    renderSide();
  }

  function renderHealth() {
    var dup = dupGroups(state.items);
    var dead = state.items.filter(function (b) { return b.dead; });
    var stale = state.items.filter(function (b) {
      return !b.dead && b.visited && (now - b.visited) / DAY > 180;
    });

    var parts = [];

    parts.push('<div class="demo-group">');
    parts.push('<div class="demo-group-head"><span class="mono">Duplicates</span><span class="badge hot">' + (dup.length ? dup.length + " groups" : "none") + "</span></div>");
    if (!dup.length) parts.push('<div class="demo-empty-row">Nothing duplicated.</div>');
    dup.forEach(function (g) {
      parts.push('<div class="demo-group-body">' + g.map(function (b) { return row(b, {}); }).join("") +
        '<button type="button" class="demo-inline-btn" data-merge="' + esc(g[0].id) + '">Keep first, merge the rest</button>' +
        "</div>");
    });
    parts.push("</div>");

    parts.push('<div class="demo-group">');
    parts.push('<div class="demo-group-head"><span class="mono">Dead links</span><span class="badge bad">' + dead.length + "</span></div>");
    if (!dead.length) parts.push('<div class="demo-empty-row">No dead links found.</div>');
    dead.forEach(function (b) {
      parts.push('<div class="demo-group-body">' + row(b, {}) +
        '<button type="button" class="demo-inline-btn" data-trash="' + esc(b.id) + '">Move to trash</button></div>');
    });
    parts.push("</div>");

    parts.push('<div class="demo-group">');
    parts.push('<div class="demo-group-head"><span class="mono">Stale saves</span><span class="badge warn">' + stale.length + "</span></div>");
    if (!stale.length) parts.push('<div class="demo-empty-row">Nothing has gone stale.</div>');
    stale.forEach(function (b) {
      parts.push('<div class="demo-group-body">' + row(b, { showAge: true }) + "</div>");
    });
    parts.push("</div>");

    el.health.innerHTML = parts.join("");
  }

  function renderTrash() {
    if (!state.trash.length) {
      el.trash.innerHTML = '<div class="demo-empty-row">The trash is empty. Delete something from the library or the health tab.</div>';
      return;
    }
    el.trash.innerHTML =
      '<div class="demo-empty-row" style="padding-bottom:10px">Everything in here is restorable for 30 days.</div>' +
      state.trash.map(function (b) {
        return '<div class="demo-trash-row">' +
          "<div><strong>" + esc(b.title) + "</strong><span>" + esc(b.host) + "</span></div>" +
          '<button type="button" class="demo-inline-btn" data-restore="' + esc(b.id) + '">Restore</button>' +
        "</div>";
      }).join("");
  }

  function renderSide() {
    if (state.plan) return renderPlan();

    var item = state.items.filter(function (b) { return b.id === state.selected; })[0];
    if (!item) {
      el.side.innerHTML =
        '<div class="card demo-empty">' +
          '<h3><span class="bar"></span> Nothing selected yet</h3>' +
          "<ul>" +
            '<li><span class="n">01</span><span>Search with plain text, or an operator like <code>tag:frontend</code> or <code>site:github.com</code>.</span></li>' +
            '<li><span class="n">02</span><span>Press <strong>Sort with proof</strong> to see a folder plan you can untick.</span></li>' +
            '<li><span class="n">03</span><span>Tap a bookmark to mark it read, tag it, or send it to trash.</span></li>' +
          "</ul>" +
        "</div>";
      return;
    }

    var dups = dupGroups(state.items).filter(function (g) {
      return g.some(function (b) { return b.id === item.id; });
    })[0];

    el.side.innerHTML =
      '<div class="card">' +
        '<h3><span class="bar"></span> ' + esc(item.title) + "</h3>" +
        '<ul class="demo-detail">' +
          '<li><span class="n">01</span><span><strong>Folder</strong> ' + esc(item.folder) + "</span></li>" +
          '<li><span class="n">02</span><span><strong>Tags</strong> ' + (item.tags.length ? item.tags.map(esc).join(", ") : "none yet") + "</span></li>" +
          '<li><span class="n">03</span><span><strong>Address</strong> <code>' + esc(item.host) + "</code></span></li>" +
          '<li><span class="n">04</span><span><strong>Last visit</strong> ' + (item.visited ? age((now - item.visited) / DAY) + " ago" : "never") + "</span></li>" +
        "</ul>" +
        (dups ? '<p class="demo-why">' + dups.length + " copies of this page are saved. Removing the extras keeps one bookmark and folds their tags in.</p>" : "") +
        '<div class="demo-side-actions">' +
          '<button type="button" class="demo-action primary" data-action="read">' + (item.read ? "Mark unread" : "Mark read") + "</button>" +
          '<button type="button" class="demo-action" data-action="tag">Add tag</button>' +
          '<button type="button" class="demo-action" data-action="trash-one">Trash</button>' +
        "</div>" +
      "</div>";
  }

  function planFor(item) {
    var t = (item.title + " " + item.text).toLowerCase();
    if (/css|grid|container|layout|style/.test(t)) return { folder: "Frontend / CSS", why: "page text mentions layout and CSS", conf: "92%" };
    if (/javascript|promise|closure|ecmascript/.test(t)) return { folder: "Frontend / JavaScript", why: "title and text reference JavaScript", conf: "96%" };
    if (/colour|design|token|palette/.test(t)) return { folder: "Design / Systems", why: "page text covers design tokens", conf: "88%" };
    if (/ai|gemini|prompt|model/.test(t)) return { folder: "Tools / AI", why: "host and text mention an AI tool", conf: "84%" };
    if (/news|startup/.test(t)) return { folder: "Reading / News", why: "community news site", conf: "79%" };
    return { folder: "Reading / Later", why: "no strong signal, safest default", conf: "61%" };
  }

  function renderPlan() {
    var ops = parseQuery(state.query);
    var list = state.plan.map(function (id) {
      return state.items.filter(function (b) { return b.id === id; })[0];
    }).filter(Boolean);

    el.side.innerHTML =
      '<div class="card">' +
        '<h3><span class="bar"></span> Sort plan</h3>' +
        '<p class="demo-why">Every move is shown before it happens. Untick anything you disagree with.</p>' +
        '<div class="demo-sort-list">' +
          (list.length ? list.map(function (b) {
            var p = state.planTo[b.id];
            return '<label class="demo-sort-row">' +
              '<input type="checkbox" data-plan="' + b.id + '" checked>' +
              '<span><strong>' + esc(b.title) + '</strong>' +
                '<span class="why">' + esc(b.folder) + ' <span class="arrow">&rarr;</span> ' + esc(p.folder) + " - " + esc(p.why) + "</span>" +
              '</span><span class="conf">' + p.conf + "</span>" +
            "</label>";
          }).join("") : '<div class="demo-empty-row">Nothing to sort in this view.</div>') +
        "</div>" +
        '<div class="demo-side-actions">' +
          '<button type="button" class="demo-action primary" data-action="apply">Apply ' + list.length + ' move' + (list.length === 1 ? "" : "s") + "</button>" +
          '<button type="button" class="demo-action" data-action="cancel">Cancel</button>' +
        "</div>" +
      "</div>";
  }

  function render() {
    // The library list is always kept in sync, so switching tabs or restoring
    // from the trash never leaves stale rows behind.
    renderLibrary();
    if (state.tab === "health") renderHealth();
    if (state.tab === "trash") renderTrash();
    if (!el.q.value && state.query) el.q.value = state.query;
  }

  // ---------- actions ----------

  function moveToTrash(ids) {
    var set = {};
    ids.forEach(function (id) { set[id] = true; });
    var removed = state.items.filter(function (b) { return set[b.id]; });
    state.items = state.items.filter(function (b) { return !set[b.id]; });
    state.trash = removed.concat(state.trash);

    toast(
      removed.length + " bookmark" + (removed.length === 1 ? "" : "s") + " moved to trash",
      function () {
        state.items = state.items.concat(removed);
        var back = {};
        removed.forEach(function (b) { back[b.id] = true; });
        state.trash = state.trash.filter(function (b) { return !back[b.id]; });
        render();
      }
    );
    if (set[state.selected]) state.selected = "";
    render();
  }

  function mergeGroup(keepId) {
    var keep = state.items.filter(function (b) { return b.id === keepId; })[0];
    if (!keep) return;
    var key = normUrl(keep.url);
    var group = state.items.filter(function (b) { return normUrl(b.url) === key; });
    var others = group.filter(function (b) { return b.id !== keepId; });

    others.forEach(function (b) {
      b.tags.forEach(function (t) { if (keep.tags.indexOf(t) === -1) keep.tags.push(t); });
    });
    var ids = others.map(function (b) { return b.id; });
    var tagsBefore = keep.tags.slice();

    moveToTrash(ids);
    toast("Merged " + others.length + " duplicate" + (others.length === 1 ? "" : "s") + " into one", function () {
      keep.tags = tagsBefore;
    });
  }

  el.demo.addEventListener("click", function (e) {
    var t = e.target.closest("button, input, label");
    if (!t || !el.demo.contains(t)) return;

    if (t.classList.contains("demo-tab")) {
      var panel = t.getAttribute("data-panel");
      if (!panel) return;
      state.tab = panel;
      Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-tab"), function (b) {
        var on = b === t;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-panel"), function (p) {
        p.hidden = p.getAttribute("data-panel") !== panel;
      });
      state.plan = null;
      render();
      return;
    }

    if (t.dataset.try) {
      var mode = t.dataset.try;
      if (mode === "grid") { state.query = "tag:frontend"; el.q.value = state.query; }
      if (mode === "dead") {
        state.tab = "health";
        Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-tab"), function (b) {
          var on = b.getAttribute("data-panel") === "health";
          b.classList.toggle("on", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-panel"), function (p) {
          p.hidden = p.getAttribute("data-panel") !== "health";
        });
      }
      if (mode === "reset") {
        state.items = seed();
        state.trash = [];
        state.query = "";
        state.selected = "";
        state.plan = null;
        el.q.value = "";
        toast("Library reset");
      }
      render();
      return;
    }

    if (t.dataset.drop) {
      var dropOp = t.dataset.drop.split(":")[0];
      state.query = state.query
        .split(/\s+/)
        .filter(function (tok) { return tok.toLowerCase().indexOf(dropOp + ":") !== 0; })
        .join(" ");
      el.q.value = state.query;
      render();
      return;
    }

    if (t.dataset.row !== undefined) return;

    var rowEl = t.closest(".mock-row");
    if (rowEl && !t.classList.contains("demo-inline-btn")) {
      state.selected = rowEl.dataset.id === state.selected ? "" : rowEl.dataset.id;
      state.plan = null;
      render();
      return;
    }

    if (t.dataset.merge) { mergeGroup(t.dataset.merge); return; }
    if (t.dataset.trash) { moveToTrash([t.dataset.trash]); return; }

    if (t.dataset.restore) {
      var id = t.dataset.restore;
      var item = state.trash.filter(function (b) { return b.id === id; })[0];
      state.trash = state.trash.filter(function (b) { return b.id !== id; });
      if (item) state.items.push(item);
      toast("Restored to " + (item ? item.folder : "library"));
      render();
      return;
    }

    var action = t.dataset.action;
    if (!action) return;

    if (action === "sort") {
      if (!state.items.length) { toast("The library is empty - reset it first"); return; }
      var ops = parseQuery(state.query);
      var candidates = state.items.filter(function (b) { return !b.dead && matches(b, ops); });
      if (!candidates.length) { toast("Nothing in this view to sort"); return; }
      state.selected = "";
      state.planTo = {};
      state.plan = candidates.map(function (b) {
        state.planTo[b.id] = planFor(b);
        return b.id;
      });
      render();
      return;
    }
    if (action === "dupes") {
      var n = dupGroups(state.items).length;
      toast(n ? n + " duplicate group" + (n === 1 ? "" : "s") + " found - open Health" : "No duplicates found");
      return;
    }
    if (action === "trash") {
      state.tab = "trash";
      Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-tab"), function (b) {
        var on = b.getAttribute("data-panel") === "trash";
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      Array.prototype.forEach.call(el.demo.querySelectorAll(".demo-panel"), function (p) {
        p.hidden = p.getAttribute("data-panel") !== "trash";
      });
      render();
      return;
    }
    if (action === "cancel") { state.plan = null; render(); return; }

    if (action === "apply") {
      var chosen = Array.prototype.slice.call(el.demo.querySelectorAll("[data-plan]"))
        .filter(function (c) { return c.checked; })
        .map(function (c) { return c.dataset.plan; });
      if (!chosen.length) { toast("Nothing ticked - nothing moved"); return; }
      chosen.forEach(function (id) {
        state.items.forEach(function (b) {
          if (b.id === id && state.planTo[id]) b.folder = state.planTo[id].folder;
        });
      });
      var count = chosen.length;
      state.plan = null;
      toast(count + " bookmark" + (count === 1 ? "" : "s") + " filed");
      render();
      return;
    }

    var sel = state.items.filter(function (b) { return b.id === state.selected; })[0];
    if (!sel) { toast("Pick a bookmark first"); return; }

    if (action === "read") { sel.read = !sel.read; render(); return; }
    if (action === "tag") {
      var next = sel.tags.length ? "" : "reading";
      if (next && sel.tags.indexOf(next) === -1) sel.tags.push(next);
      toast(next ? "Tagged " + next : "Already tagged");
      render();
      return;
    }
    if (action === "trash-one") { moveToTrash([sel.id]); return; }
  });

  el.q.addEventListener("input", function () {
    state.query = el.q.value;
    state.plan = null;
    state.selected = "";
    render();
  });

  render();
})();
