// ============================================================
// Logi Assembly v27 - UI Utilities
// ============================================================

import * as state from './state.js';

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// STATUS INDICATOR
// ============================================================
export function setStatus(message, type = '') {
  const indicator = document.getElementById('statusIndicator');
  if (indicator) {
    indicator.textContent = message;
    indicator.className = `status-text ${type}`;
  }
}

// ============================================================
// LOADING OVERLAY
// ============================================================
export function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.toggle('show', show);
  }
}

// ============================================================
// MODAL DIALOGS
// ============================================================
export function showModal(title, content, buttons = []) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const footerEl = document.getElementById('modalFooter');
  
  titleEl.textContent = title;
  bodyEl.innerHTML = content;
  
  footerEl.innerHTML = buttons.map(btn => 
    `<button class="btn ${btn.class || 'btn-primary'}" onclick="${btn.action ? btn.action.name + '()' : ''}">${btn.label}</button>`
  ).join('');
  
  // Attach button handlers
  const footerButtons = footerEl.querySelectorAll('button');
  buttons.forEach((btn, index) => {
    if (btn.action) {
      footerButtons[index].onclick = btn.action;
    }
  });
  
  overlay.classList.add('show');
}

export function hideModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('show');
}

// ============================================================
// CONTEXT MENU
// ============================================================
export function showContextMenu(x, y, items) {
  const menu = document.getElementById('contextMenu');
  
  menu.innerHTML = items.map(item => {
    if (item.divider) {
      return '<div class="context-menu-divider"></div>';
    }
    return `
      <div class="context-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.action || ''}">
        <span class="context-menu-icon">${item.icon || ''}</span>
        ${item.label}
      </div>
    `;
  }).join('');
  
  // Attach handlers
  menu.querySelectorAll('.context-menu-item[data-action]').forEach((el, i) => {
    const item = items.filter(it => !it.divider)[i];
    if (item && item.handler) {
      el.onclick = () => {
        hideContextMenu();
        item.handler();
      };
    }
  });
  
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');
}

export function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (menu) {
    menu.classList.remove('show');
  }
}

// ============================================================
// SIDE PANEL
// ============================================================
export function openSidePanel() {
  document.getElementById('sidePanel').classList.add('open');
}

export function closeSidePanel() {
  document.getElementById('sidePanel').classList.remove('open');
}

export function setSidePanelContent(title, content, footerButtons = []) {
  document.getElementById('panelTitle').textContent = title;
  document.getElementById('panelContent').innerHTML = content;
  
  const footer = document.getElementById('panelFooter');
  footer.innerHTML = footerButtons.map(btn => 
    `<button class="btn ${btn.class || 'btn-primary'}">${btn.label}</button>`
  ).join('');
  
  // Attach handlers
  const buttons = footer.querySelectorAll('button');
  footerButtons.forEach((btn, i) => {
    if (btn.action) {
      buttons[i].onclick = btn.action;
    }
  });
}

// ============================================================
// DROPDOWN MENUS
// ============================================================
export function toggleExportDropdown() {
  document.getElementById('exportDropdown').classList.toggle('show');
  document.getElementById('lockDropdown')?.classList.remove('show');
}

export function toggleLockDropdown() {
  document.getElementById('lockDropdown').classList.toggle('show');
  document.getElementById('exportDropdown')?.classList.remove('show');
}

export function closeLockDropdown() {
  document.getElementById('lockDropdown')?.classList.remove('show');
}

export function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
}

// ============================================================
// NAVIGATION
// ============================================================
export function navigateTo(page) {
  state.setCurrentPage(page);
  
  // Toggle body class for tree view (controls FAB visibility)
  document.body.classList.toggle('tree-view', page === 'tree');
  
  // Hide all pages
  document.getElementById('homePage').classList.remove('show');
  document.getElementById('assembliesPage').classList.remove('show');
  document.getElementById('treePage').style.display = 'none';
  
  // Hide tree controls by default
  document.getElementById('treeControlsWrapper').style.display = 'none';
  document.getElementById('treeControls').style.display = 'none';
  document.querySelector('.legend')?.style.setProperty('display', 'none');
  
  // Show/hide back button
  const backBtn = document.getElementById('backBtn');
  const breadcrumb = document.getElementById('breadcrumb');
  
  if (page === 'home') {
    document.getElementById('homePage').classList.add('show');
    backBtn.style.display = 'none';
    breadcrumb.style.display = 'none';
  } else if (page === 'assemblies') {
    document.getElementById('assembliesPage').classList.add('show');
    backBtn.style.display = 'flex';
    breadcrumb.style.display = 'flex';
    document.getElementById('breadcrumbText').textContent = state.currentProject?.name || 'Project';
  } else if (page === 'tree') {
    document.getElementById('treePage').style.display = 'block';
    document.getElementById('treeControlsWrapper').style.display = 'flex';
    document.getElementById('treeControls').style.display = 'contents';
    document.querySelector('.legend')?.style.setProperty('display', 'flex');
    backBtn.style.display = 'flex';
    breadcrumb.style.display = 'flex';
    document.getElementById('breadcrumbText').textContent = 
      `${state.currentProject?.name || 'Project'} / ${state.currentAssemblyName || 'Assembly'}`;
  }
}

export function navigateBack() {
  if (state.currentPage === 'tree') {
    navigateTo('assemblies');
  } else if (state.currentPage === 'assemblies') {
    navigateTo('home');
  }
}

// ============================================================
// ADMIN UI
// ============================================================
export function showAdminUI(user) {
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('visible'));
  document.getElementById('loginBtn').style.display = 'none';
  document.getElementById('userBadge').style.display = 'flex';
  
  const displayName = user.name || user.email.split('@')[0];
  document.getElementById('userName').textContent = `👤 ${displayName}`;
  document.getElementById('userName').title = user.email;
}

export function showGuestUI(user) {
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('visible'));
  document.getElementById('loginBtn').style.display = 'none';
  document.getElementById('userBadge').style.display = 'flex';
  document.getElementById('userBadge').style.background = 'rgba(52, 152, 219, 0.2)';
  document.getElementById('userBadge').style.color = '#3498db';
  
  const displayName = user.name || user.email.split('@')[0];
  document.getElementById('userName').textContent = `👁 ${displayName}`;
  document.getElementById('userName').title = `${user.email} (Guest)`;
}

export function hideAdminUI() {
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('visible'));
  document.getElementById('loginBtn').style.display = 'flex';
  document.getElementById('userBadge').style.display = 'none';
  document.getElementById('userBadge').style.background = '';
  document.getElementById('userBadge').style.color = '';
}

// ============================================================
// UNDO BUTTON
// ============================================================
export function updateUndoButton() {
  const undoBtn = document.getElementById('undoBtn');
  if (undoBtn) {
    undoBtn.disabled = state.positionHistory.length === 0;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
