// ============================================================
// panel-manager.js — Windows-style panel system for Coding Mode
// Panels stack vertically. Each has: close / minimize / maximize.
// On desktop: draggable by titlebar, resizable by bottom edge.
// On mobile: same controls, full-width stacked panels.
// ============================================================

const PanelManager = (() => {

  // Panel state registry
  const panels = {};
  let dragState = null;
  let resizeState = null;
  let zCounter = 10;

  const PANEL_IDS = ['panel-brief', 'panel-editor', 'panel-preview'];
  const PANEL_LABELS = {
    'panel-brief':   'Project Brief',
    'panel-editor':  'Code Editor',
    'panel-preview': 'Live Preview',
  };

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    PANEL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      panels[id] = {
        minimized: false,
        maximized: false,
        // Desktop position/size (set on first show)
        x: null, y: null, w: null, h: null,
        savedX: null, savedY: null, savedW: null, savedH: null,
      };
      // Add resize handle for desktop
      if (!el.querySelector('.resize-handle')) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.addEventListener('mousedown', (e) => startResize(e, id));
        el.appendChild(handle);
      }
    });

    layoutPanels();
    window.addEventListener('resize', layoutPanels);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    // Touch support
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  // ─── Layout: set initial positions ───────────────────────
  function layoutPanels() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;
    const ww = workspace.offsetWidth;
    const wh = workspace.offsetHeight;

    if (isMobile()) {
      // Mobile: remove inline positioning, let CSS stack them
      PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.style.height = '';
        el.style.zIndex = '';
      });
    } else {
      // Desktop: stack vertically, equal thirds
      const visible = PANEL_IDS.filter(id => {
        const s = panels[id];
        return s && !s.minimized;
      });
      const taskbarH = 40;
      const availH = wh - taskbarH;
      const panelH = Math.floor(availH / (visible.length || 1));
      const gap = 6;

      let topOffset = 0;
      PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        const s = panels[id];
        if (!el || !s) return;

        if (s.minimized) return;

        if (!s.maximized) {
          if (s.x === null) {
            // First time: init position
            s.x = gap;
            s.y = topOffset + gap;
            s.w = ww - gap * 2;
            s.h = panelH - gap * 2;
          }
          applyPos(id);
          topOffset += panelH;
        }
      });
    }
    updateTaskbar();
  }

  function applyPos(id) {
    const el = document.getElementById(id);
    const s = panels[id];
    if (!el || !s || isMobile()) return;
    el.style.position = 'absolute';
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    el.style.width = s.w + 'px';
    el.style.height = s.h + 'px';
  }

  // ─── Panel controls ───────────────────────────────────────
  function closePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    panels[id].minimized = true;
    panels[id].maximized = false;
    updateTaskbar();
    // If all closed, show taskbar message
  }

  function minimizePanel(id) {
    const el = document.getElementById(id);
    const s = panels[id];
    if (!el || !s) return;
    if (s.minimized) return;
    s.minimized = true;
    s.maximized = false;
    el.style.display = 'none';
    updateTaskbar();
    if (!isMobile()) redistribute();
  }

  function maximizePanel(id) {
    const el = document.getElementById(id);
    const s = panels[id];
    if (!el || !s) return;

    if (s.maximized) {
      // Restore
      s.maximized = false;
      el.classList.remove('panel-maximized');
      if (!isMobile()) applyPos(id);
    } else {
      // Save current pos then maximize
      s.savedX = s.x; s.savedY = s.y;
      s.savedW = s.w; s.savedH = s.h;
      s.maximized = true;
      el.classList.add('panel-maximized');
      el.style.zIndex = ++zCounter;
      if (!isMobile()) {
        const workspace = document.getElementById('workspace');
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = workspace.offsetWidth + 'px';
        el.style.height = (workspace.offsetHeight - 40) + 'px';
      }
    }
  }

  function restorePanel(id) {
    const el = document.getElementById(id);
    const s = panels[id];
    if (!el || !s) return;
    el.style.display = 'flex';
    s.minimized = false;
    s.maximized = false;
    el.classList.remove('panel-maximized');
    if (!isMobile()) {
      // Restore saved position or redistribute
      if (s.savedX !== null) {
        s.x = s.savedX; s.y = s.savedY;
        s.w = s.savedW; s.h = s.savedH;
        applyPos(id);
      } else {
        s.x = null; // Force recalc
        redistribute();
      }
    }
    updateTaskbar();
  }

  // Redistribute visible panels evenly after restore/close
  function redistribute() {
    const workspace = document.getElementById('workspace');
    if (!workspace || isMobile()) return;
    const ww = workspace.offsetWidth;
    const wh = workspace.offsetHeight;
    const taskbarH = 40;
    const gap = 6;
    const visible = PANEL_IDS.filter(id => panels[id] && !panels[id].minimized);
    const panelH = Math.floor((wh - taskbarH) / (visible.length || 1));

    visible.forEach((id, i) => {
      const s = panels[id];
      s.x = gap;
      s.y = i * panelH + gap;
      s.w = ww - gap * 2;
      s.h = panelH - gap * 2;
      applyPos(id);
    });
  }

  // ─── Taskbar ──────────────────────────────────────────────
  function updateTaskbar() {
    const bar = document.getElementById('workspace-taskbar');
    if (!bar) return;
    bar.innerHTML = '';

    PANEL_IDS.forEach(id => {
      const s = panels[id];
      if (!s || !s.minimized) return;
      const btn = document.createElement('button');
      btn.className = 'taskbar-btn';
      btn.textContent = PANEL_LABELS[id] || id;
      btn.onclick = () => restorePanel(id);
      bar.appendChild(btn);
    });

    bar.style.display = PANEL_IDS.some(id => panels[id]?.minimized) ? 'flex' : 'none';
  }

  // ─── Drag ─────────────────────────────────────────────────
  function startDrag(e, id) {
    if (isMobile()) return;
    // Only drag from titlebar itself, not buttons
    if (e.target.classList.contains('panel-btn') ||
        e.target.classList.contains('tab-btn') ||
        e.target.classList.contains('refresh-btn')) return;

    const s = panels[id];
    if (!s || s.maximized) return;

    const el = document.getElementById(id);
    el.style.zIndex = ++zCounter;

    dragState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: s.x,
      origY: s.y,
    };
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const s = panels[dragState.id];
      s.x = dragState.origX + dx;
      s.y = dragState.origY + dy;
      applyPos(dragState.id);
    }
    if (resizeState) {
      const dy = e.clientY - resizeState.startY;
      const s = panels[resizeState.id];
      s.h = Math.max(80, resizeState.origH + dy);
      applyPos(resizeState.id);
    }
  }

  function onMouseUp() {
    dragState = null;
    resizeState = null;
  }

  // Touch drag
  function startTouchDrag(e, id) {
    if (isMobile()) return;
    const touch = e.touches[0];
    const s = panels[id];
    if (!s || s.maximized) return;
    dragState = {
      id,
      startX: touch.clientX,
      startY: touch.clientY,
      origX: s.x,
      origY: s.y,
    };
  }

  function onTouchMove(e) {
    if (!dragState && !resizeState) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (dragState) {
      const dx = touch.clientX - dragState.startX;
      const dy = touch.clientY - dragState.startY;
      const s = panels[dragState.id];
      s.x = dragState.origX + dx;
      s.y = dragState.origY + dy;
      applyPos(dragState.id);
    }
  }

  function onTouchEnd() {
    dragState = null;
    resizeState = null;
  }

  // ─── Resize ───────────────────────────────────────────────
  function startResize(e, id) {
    if (isMobile()) return;
    const s = panels[id];
    if (!s || s.maximized) return;
    resizeState = {
      id,
      startY: e.clientY,
      origH: s.h,
    };
    e.preventDefault();
    e.stopPropagation();
  }

  // ─── Reset all panels (called when entering editor) ───────
  function resetPanels() {
    PANEL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'flex';
      el.classList.remove('panel-maximized');
      if (panels[id]) {
        panels[id].minimized = false;
        panels[id].maximized = false;
        panels[id].x = null;
        panels[id].y = null;
      }
    });
    layoutPanels();
  }

  return { init, resetPanels, closePanel, minimizePanel, maximizePanel, restorePanel };
})();

// Global bindings
function closePanel(id)    { PanelManager.closePanel(id); }
function minimizePanel(id) { PanelManager.minimizePanel(id); }
function maximizePanel(id) { PanelManager.maximizePanel(id); }
function startDrag(e, id)  { PanelManager.startDrag?.(e, id); }

// Re-export startDrag properly
(function() {
  const orig = PanelManager;
  window._pm = orig;
})();

// Direct drag binding (PanelManager.startDrag must be accessible from HTML onmousedown)
document.addEventListener('DOMContentLoaded', () => {
  PanelManager.init();
  // Re-expose startDrag after init
  window.startDrag = (e, id) => PanelManager.startDrag(e, id);
});
