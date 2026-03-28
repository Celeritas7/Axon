// ============================================================
// Logi Assembly v29 - Main Application
// ============================================================

import { db, testConnection, updateDbIndicator } from './database.js';
import * as state from './state.js';
import {
  showToast, navigateTo, navigateBack, hideContextMenu, closeAllDropdowns,
  toggleExportDropdown, toggleLockDropdown, closeLockDropdown, updateUndoButton
} from './ui.js';
import { checkAdminStatus, handleLogin, handleLogout } from './auth.js';
import { loadProjects } from './projects.js';
import {
  loadAssemblies, createNewAssemblyInTree, renameAssembly,
  confirmDeleteAssembly, duplicateAssembly
} from './assemblies.js';
import { loadAssemblyData, renderGraph, expandAll, collapseAll } from './graph.js';
import {
  showAddRootNodeMenu, lockAllVisibleNodes, unlockAllNodes,
  saveAllPositions, undoPositions, refreshUnlockedNodes
} from './nodes.js';
import './links.js'; // Import for side effects (window exports)
import { downloadPNG, downloadSVG, showExportOptions } from './export.js';
import './chatbot.js'; // Import chatbot for side effects (window exports)
import './import.js'; // CSV import functionality

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  console.log('Logi Assembly v29 initializing...');
  
  // Test database connection
  const connected = await testConnection();
  updateDbIndicator(connected);
  
  if (!connected) {
    showToast('Database connection failed', 'error');
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Check admin status (will trigger Google Sign-In)
  checkAdminStatus();
  
  // Load projects
  await loadProjects();
  
  // Navigate to home
  navigateTo('home');
  
  console.log('Logi Assembly v29 ready');
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Assembly dropdown change
  document.getElementById('assemblySelect').addEventListener('change', async (e) => {
    const assemblyId = e.target.value;
    if (assemblyId) {
      const assembly = state.assemblies.find(a => a.id === assemblyId);
      state.setCurrentAssembly(assemblyId, assembly?.name || '');
      await loadAssemblyData(assemblyId);
    }
  });
  
  // Level filter change
  document.getElementById('levelFilter').addEventListener('change', (e) => {
    state.setLevelFilter(e.target.value);
    renderGraph();
  });
  
  // Color mode change
  document.getElementById('colorMode').addEventListener('change', (e) => {
    state.setColorMode(e.target.value);
    renderGraph();
  });
  
  // Layout mode is always tree — no listener needed
  
  // Keyboard events
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      state.setShiftKeyPressed(true);
    }
    
    // Escape to close menus/panels
    if (e.key === 'Escape') {
      hideContextMenu();
      closeAllDropdowns();
    }
  });
  
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      state.setShiftKeyPressed(false);
    }
  });
  
  // Click outside to close menus
  document.addEventListener('click', (e) => {
    // Close context menu
    if (!e.target.closest('.context-menu')) {
      hideContextMenu();
    }
    
    // Close dropdowns
    if (!e.target.closest('.dropdown')) {
      closeAllDropdowns();
    }
  });
  
  // Right-click on tree container
  document.getElementById('treeContainer').addEventListener('contextmenu', (e) => {
    if (!state.isAdmin) return;
    if (state.currentPage !== 'tree') return;
    
    // Only show menu if clicking on empty space
    if (e.target.tagName === 'svg' || e.target.closest('svg') && !e.target.closest('.node') && !e.target.closest('.link-group')) {
      e.preventDefault();
      
      // Get SVG coordinates
      const svg = document.getElementById('treeSvg');
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      showAddRootNodeMenu(e.clientX, e.clientY, x, y);
    }
  });
  
  // Window resize
  window.addEventListener('resize', () => {
    if (state.currentPage === 'tree' && state.nodes.length > 0) {
      renderGraph();
    }
  });
}

// ============================================================
// EXPORT FUNCTIONS TO WINDOW
// ============================================================

// Navigation
window.navigateTo = navigateTo;
window.navigateBack = navigateBack;

// Auth
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;

// Assembly actions (for header buttons)
window.createNewAssemblyInTree = createNewAssemblyInTree;
window.renameAssembly = renameAssembly;
window.confirmDeleteAssembly = confirmDeleteAssembly;
window.duplicateAssembly = duplicateAssembly;

// Tree controls
window.refreshUnlockedNodes = refreshUnlockedNodes;
window.expandAll = expandAll;
window.collapseAll = collapseAll;
window.undoPositions = undoPositions;
window.saveAllPositions = saveAllPositions;

// Lock controls
window.toggleLockDropdown = toggleLockDropdown;
window.closeLockDropdown = closeLockDropdown;
window.lockAllVisibleNodes = lockAllVisibleNodes;
window.unlockAllNodes = unlockAllNodes;

// Export controls
window.toggleExportDropdown = toggleExportDropdown;
window.downloadPNG = () => showExportOptions('png');
window.downloadSVG = () => showExportOptions('svg');

// Sequence number toggle
window.toggleSequenceNumbers = function() {
  state.setShowSequenceNumbers(!state.showSequenceNumbers);
  const btn = document.getElementById('seqToggleBtn');
  if (btn) {
    btn.style.background = state.showSequenceNumbers ? '#3498db' : '#95a5a6';
    btn.title = state.showSequenceNumbers ? 'Hide Sequence Numbers' : 'Show Sequence Numbers';
  }
  renderGraph();
  showToast(`Sequence numbers ${state.showSequenceNumbers ? 'visible' : 'hidden'}`, 'info');
};

// Level headers toggle
window.toggleLevelHeaders = function() {
  state.setShowLevelHeaders(!state.showLevelHeaders);
  const btn = document.getElementById('levelToggleBtn');
  if (btn) {
    btn.style.background = state.showLevelHeaders ? '#3498db' : '#95a5a6';
    btn.title = state.showLevelHeaders ? 'Hide Level Headers' : 'Show Level Headers';
  }
  renderGraph();
  showToast(`Level headers ${state.showLevelHeaders ? 'visible' : 'hidden'}`, 'info');
};

// Separator lines toggle
window.toggleSeparatorLines = function() {
  state.setShowSeparatorLines(!state.showSeparatorLines);
  const btn = document.getElementById('separatorToggleBtn');
  if (btn) {
    btn.style.background = state.showSeparatorLines ? '#3498db' : '#95a5a6';
    btn.title = state.showSeparatorLines ? 'Hide Group Separators' : 'Show Group Separators';
  }
  renderGraph();
  showToast(`Separator lines ${state.showSeparatorLines ? 'visible' : 'hidden'}`, 'info');
};

// Layout mode is always tree — no toggle needed
window.setLayoutMode = function() {};

// FAB Add Node - tap the floating + button
window.fabAddNode = function() {
  if (!state.isAdmin) {
    showToast('Sign in to add nodes', 'warning');
    return;
  }
  if (!state.currentAssemblyId) {
    showToast('Select an assembly first', 'warning');
    return;
  }
  
  // Check if root exists
  const rootNodes = state.nodes.filter(n => n.goesInto && n.goesInto.length === 0);
  if (state.nodes.length === 0 || rootNodes.length === 0) {
    // Add root node
    window.addRootNodeAt(400, 300);
  } else {
    // Show a quick selection of which node to add a child to
    const nodeList = state.nodes
      .filter(n => !n.deleted)
      .sort((a, b) => (a.level || 1) - (b.level || 1))
      .map(n => `<option value="${n.id}">L${n.level} - ${n.name}</option>`)
      .join('');
    
    import('./ui.js').then(({ showModal, hideModal }) => {
      showModal(
        'Add Child Node',
        `<div class="form-group">
          <label class="form-label">Add child to:</label>
          <select class="form-select" id="fabParentSelect" style="font-size:16px;padding:10px;">
            ${nodeList}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Node Name</label>
          <input type="text" class="form-input" id="fabNodeName" placeholder="Enter name" style="font-size:16px;padding:10px;">
        </div>
        <div class="form-group">
          <label class="form-label">Part Number (optional)</label>
          <input type="text" class="form-input" id="fabNodePN" placeholder="Part number" style="font-size:16px;padding:10px;">
        </div>
        <div class="form-group">
          <label class="form-label">Fastener (optional)</label>
          <input type="text" class="form-input" id="fabNodeFastener" placeholder="e.g. M6x20" style="font-size:16px;padding:10px;">
        </div>`,
        [
          { label: 'Cancel', class: 'btn-secondary', action: hideModal },
          { label: 'Add', class: 'btn-primary', action: () => window._fabSaveChild() }
        ]
      );
      setTimeout(() => document.getElementById('fabNodeName')?.focus(), 100);
    });
  }
};

// Save child from FAB modal
window._fabSaveChild = async function() {
  const parentId = document.getElementById('fabParentSelect').value;
  const name = document.getElementById('fabNodeName').value.trim();
  const partNumber = document.getElementById('fabNodePN').value.trim();
  const fastener = document.getElementById('fabNodeFastener').value.trim();
  
  if (!name) {
    showToast('Name is required', 'error');
    return;
  }
  
  try {
    const parent = state.nodes.find(n => n.id === parentId);
    const { data: nodeData, error: nodeError } = await import('./database.js').then(m => 
      m.db.from('logi_nodes').insert({
        assembly_id: state.currentAssemblyId,
        name: name,
        part_number: partNumber || null,
        x: (parent?.x || 400) - 200,
        y: (parent?.y || 300),
        status: 'NOT_STARTED',
        deleted: false
      }).select().single()
    );
    
    if (nodeError) throw nodeError;
    
    // Create link
    const { error: linkError } = await import('./database.js').then(m =>
      m.db.from('logi_links').insert({
        assembly_id: state.currentAssemblyId,
        parent_id: parentId,
        child_id: nodeData.id,
        fastener: fastener || null
      })
    );
    
    if (linkError) throw linkError;
    
    import('./ui.js').then(({ hideModal }) => hideModal());
    showToast('Node added', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('FAB add child error:', e);
    showToast('Failed: ' + e.message, 'error');
  }
};

// Side panel
window.closeSidePanel = () => {
  document.getElementById('sidePanel').classList.remove('open');
};

// ============================================================
// START APPLICATION
// ============================================================
document.addEventListener('DOMContentLoaded', init);
