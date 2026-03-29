// ============================================================
// Logi Assembly v27 - Nodes Module
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast, showModal, hideModal, hideContextMenu, escapeHtml } from './ui.js';
import { loadAssemblyData, renderGraph } from './graph.js';

// ============================================================
// ADD ROOT NODE
// ============================================================
export function showAddRootNodeMenu(screenX, screenY, svgX, svgY) {
  // Check if a root node (L1) already exists
  const rootNodes = state.nodes.filter(n => n.goesInto.length === 0);
  
  // If root node exists, don't show the "Add Root Node" option
  if (rootNodes.length > 0) {
    // Don't show menu - there can only be one L1 node
    return;
  }
  
  const menu = document.getElementById('contextMenu');
  
  menu.innerHTML = `
    <div class="context-menu-item" onclick="window.addRootNodeAt(${svgX}, ${svgY})">
      <span class="context-menu-icon">➕</span> Add Root Node (L1)
    </div>
  `;
  
  menu.style.left = screenX + 'px';
  menu.style.top = screenY + 'px';
  menu.classList.add('show');
}

export async function addRootNodeAt(x, y) {
  hideContextMenu();
  
  if (!state.isAdmin || !state.currentAssemblyId) {
    showToast('Please select an assembly first', 'error');
    return;
  }
  
  showModal(
    'Add Root Node',
    `<div class="form-group">
      <label class="form-label">Node Name</label>
      <input type="text" class="form-input" id="newRootNodeName" placeholder="Enter node name">
    </div>
    <div class="form-group">
      <label class="form-label">Part Number (optional)</label>
      <input type="text" class="form-input" id="newRootNodePN" placeholder="Enter part number">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Add', class: 'btn-primary', action: () => saveRootNodeAt(x, y) }
    ]
  );
  
  setTimeout(() => document.getElementById('newRootNodeName')?.focus(), 100);
}

async function saveRootNodeAt(x, y) {
  const name = document.getElementById('newRootNodeName').value.trim();
  const partNumber = document.getElementById('newRootNodePN').value.trim();
  
  if (!name) {
    showToast('Name is required', 'error');
    return;
  }
  
  try {
    const { data, error } = await db.from('logi_nodes').insert({
      assembly_id: state.currentAssemblyId,
      name: name,
      part_number: partNumber || null,
      x: x,
      y: y,
      status: 'NOT_STARTED',
      deleted: false
    }).select().single();
    
    if (error) throw error;
    
    hideModal();
    showToast('Root node added (L1)', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error adding root node:', e);
    showToast('Failed to add node: ' + e.message, 'error');
  }
}

// ============================================================
// ADD CHILD NODE
// ============================================================
export function addChildNode(parentId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const parent = state.nodes.find(n => n.id === parentId);
  if (!parent) return;
  
  // Calculate next sequence number for siblings
  const siblingSeqs = state.links
    .filter(l => l.parent_id === parentId)
    .map(l => state.nodes.find(n => n.id === l.child_id))
    .filter(Boolean)
    .map(n => n.sequence_num || 0);
  const nextSeq = siblingSeqs.length > 0 ? Math.max(...siblingSeqs) + 1 : 1;
  
  showModal(
    'Add Child Node',
    `<div class="form-group">
      <label class="form-label">Node Name</label>
      <input type="text" class="form-input" id="newChildNodeName" placeholder="Enter node name">
    </div>
    <div class="form-group">
      <label class="form-label">Part Number (optional)</label>
      <input type="text" class="form-input" id="newChildNodePN" placeholder="Enter part number">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fastener (optional)</label>
        <input type="text" class="form-input" id="newChildFastener" placeholder="e.g., M6x20">
      </div>
      <div class="form-group" style="max-width:80px;">
        <label class="form-label">Seq #</label>
        <input type="number" class="form-input" id="newChildSeq" value="${nextSeq}" min="0" placeholder="#">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <input type="text" class="form-input" id="newChildNotes" placeholder="Assembly notes...">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Add', class: 'btn-primary', action: () => saveChildNode(parentId) }
    ]
  );
  
  setTimeout(() => document.getElementById('newChildNodeName')?.focus(), 100);
}

async function saveChildNode(parentId) {
  const name = document.getElementById('newChildNodeName').value.trim();
  const partNumber = document.getElementById('newChildNodePN').value.trim();
  const fastener = document.getElementById('newChildFastener').value.trim();
  const seqNum = parseInt(document.getElementById('newChildSeq').value) || 0;
  const seqTag = seqNum > 0 ? String(seqNum) : null;
  const notes = document.getElementById('newChildNotes').value.trim();
  
  if (!name) {
    showToast('Name is required', 'error');
    return;
  }
  
  const parent = state.nodes.find(n => n.id === parentId);
  if (!parent) return;
  
  try {
    // Create node
    const { data: newNode, error: nodeError } = await db.from('logi_nodes').insert({
      assembly_id: state.currentAssemblyId,
      name: name,
      part_number: partNumber || null,
      sequence_num: seqNum,
      sequence_tag: seqTag,
      notes: notes || null,
      x: (parent.x || 400) - 150,
      y: (parent.y || 300) + 100,
      status: 'NOT_STARTED',
      deleted: false
    }).select().single();
    
    if (nodeError) throw nodeError;
    
    // Create link
    const { error: linkError } = await db.from('logi_links').insert({
      assembly_id: state.currentAssemblyId,
      parent_id: parentId,
      child_id: newNode.id,
      fastener: fastener || null
    });
    
    if (linkError) throw linkError;
    
    hideModal();
    showToast('Child node added', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error adding child node:', e);
    showToast('Failed to add node: ' + e.message, 'error');
  }
}

// ============================================================
// DELETE NODE
// ============================================================
export function confirmDeleteNode(nodeId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  showModal(
    'Delete Node',
    `<p>Are you sure you want to delete "<strong>${escapeHtml(node.name)}</strong>"?</p>
     <p style="color:#e74c3c;margin-top:10px;font-size:13px;">⚠️ This will also delete all links to this node!</p>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Delete', class: 'btn-danger', action: () => deleteNode(nodeId) }
    ]
  );
}

async function deleteNode(nodeId) {
  try {
    // Hard delete links
    await db.from('logi_links').delete().or(`parent_id.eq.${nodeId},child_id.eq.${nodeId}`);
    
    // Hard delete node
    const { error } = await db.from('logi_nodes').delete().eq('id', nodeId);
    if (error) throw error;
    
    hideModal();
    showToast('Node deleted', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error deleting node:', e);
    showToast('Failed to delete node: ' + e.message, 'error');
  }
}

// ============================================================
// LOCK/UNLOCK NODE
// ============================================================
export async function toggleNodeLock(nodeId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const isCurrentlyLocked = state.lockedNodes.has(nodeId);
  const node = state.nodes.find(n => n.id === nodeId);
  
  if (!node) return;
  
  try {
    const treeY = node.treeY ?? node.tree_y ?? node.y;
    
    const { error } = await db.from('logi_nodes').update({
      is_locked: !isCurrentlyLocked,
      x: node.x,
      y: node.y,
      tree_y: treeY
    }).eq('id', nodeId);
    
    if (error) throw error;
    
    if (isCurrentlyLocked) {
      state.removeLockedNode(nodeId);
      node.fx = null;
      node.fy = null;
      showToast('Node unlocked', 'success');
    } else {
      node.tree_y = treeY;
      state.addLockedNode(nodeId);
      node.fx = node.x;
      node.fy = node.y;
      showToast('Node locked', 'success');
    }
    
    renderGraph();
  } catch (e) {
    console.error('Error toggling lock:', e);
    showToast('Failed to update lock state', 'error');
  }
}

// ============================================================
// LOCK/UNLOCK ALL
// ============================================================
export async function lockAllVisibleNodes() {
  if (!state.isAdmin) return;
  
  const visibleNodes = state.nodes.filter(n => {
    if (state.currentLevelFilter !== 'all' && n.level > parseInt(state.currentLevelFilter)) {
      return false;
    }
    return true;
  });
  
  try {
    for (const node of visibleNodes) {
      // Save tree positions (treeY is the actual position in tree mode)
      const treeY = node.treeY ?? node.tree_y ?? node.y;
      const treeX = node.treeX ?? node.x;
      
      await db.from('logi_nodes').update({
        is_locked: true,
        x: node.x,
        y: node.y,
        tree_y: treeY
      }).eq('id', node.id);
      
      // Update local state
      node.tree_y = treeY;
      state.addLockedNode(node.id);
      node.fx = node.x;
      node.fy = node.y;
    }
    
    showToast(`Locked ${visibleNodes.length} nodes`, 'success');
    renderGraph();
  } catch (e) {
    console.error('Error locking nodes:', e);
    showToast('Failed to lock nodes', 'error');
  }
}

export async function unlockAllNodes() {
  if (!state.isAdmin) return;
  
  try {
    await db.from('logi_nodes')
      .update({ is_locked: false })
      .eq('assembly_id', state.currentAssemblyId);
    
    state.nodes.forEach(n => {
      n.fx = null;
      n.fy = null;
    });
    state.clearLockedNodes();
    
    showToast('All nodes unlocked', 'success');
    renderGraph();
  } catch (e) {
    console.error('Error unlocking nodes:', e);
    showToast('Failed to unlock nodes', 'error');
  }
}

// ============================================================
// SAVE POSITIONS
// ============================================================
export async function saveAllPositions() {
  if (!state.isAdmin) return;
  
  const isTreeMode = state.currentLayoutMode === 'tree';
  
  try {
    for (const node of state.nodes) {
      const updateData = {
        x: node.x,
        y: node.y
      };
      
      // Also save tree positions if in tree mode or if they exist
      if (isTreeMode) {
        if (node.treeY != null || node.tree_y != null) {
          updateData.tree_y = node.treeY || node.tree_y;
        }
        if (node.treeX != null) {
          updateData.tree_x = node.treeX;
        }
      }
      
      await db.from('logi_nodes').update(updateData).eq('id', node.id);
    }
    
    // Reset save button
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.style.background = '#27ae60';
      saveBtn.textContent = '💾 Save';
    }
    
    showToast('Positions saved', 'success');
  } catch (e) {
    console.error('Error saving positions:', e);
    showToast('Failed to save positions', 'error');
  }
}

// ============================================================
// UNDO POSITIONS
// ============================================================
export function undoPositions() {
  const lastState = state.popPositionHistory();
  if (!lastState) return;
  
  lastState.nodes.forEach(saved => {
    const node = state.nodes.find(n => n.id === saved.id);
    if (node) {
      // Restore tree positions
      if (saved.tree_y != null) {
        node.tree_y = saved.tree_y;
        node.treeY = saved.tree_y;
      }
      node.x = saved.x ?? node.x;
      node.y = saved.y ?? node.y;
      if (state.lockedNodes.has(node.id)) {
        node.fx = node.x;
        node.fy = node.y;
      }
    }
  });
  
  renderGraph();
  showToast('Position restored', 'info');
}

// ============================================================
// REFRESH UNLOCKED NODES
// ============================================================
export function refreshUnlockedNodes() {
  if (!state.isAdmin) return;
  
  // In tree mode: clear tree_y for unlocked nodes so layout recomputes them
  state.nodes.forEach(n => {
    if (!state.lockedNodes.has(n.id)) {
      n.tree_y = null;
      n.treeY = null;
      n.fx = null;
      n.fy = null;
    }
  });
  
  renderGraph();
  showToast('Layout refreshed (unlocked nodes repositioned)', 'info');
}

// ============================================================
// EXPORTS TO WINDOW
// ============================================================
window.addRootNodeAt = addRootNodeAt;
window.addChildNode = addChildNode;
window.confirmDeleteNode = confirmDeleteNode;
window.toggleNodeLock = toggleNodeLock;
window.lockAllVisibleNodes = lockAllVisibleNodes;
window.unlockAllNodes = unlockAllNodes;
window.saveAllPositions = saveAllPositions;
window.undoPositions = undoPositions;
window.refreshUnlockedNodes = refreshUnlockedNodes;
