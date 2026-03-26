// ============================================================
// Logi Assembly v28 - Links Module
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast, showModal, hideModal, hideContextMenu, escapeHtml, openSidePanel, closeSidePanel, setSidePanelContent } from './ui.js';
import { loadAssemblyData } from './graph.js';

// ============================================================
// EDIT LINK (Fastener, Loctite, Torque) - Opens in Side Panel
// ============================================================
export function editLinkFastener(linkId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const link = state.links.find(l => l.id === linkId);
  if (!link) return;
  
  const sourceNode = state.nodes.find(n => n.id === link.child_id);
  const targetNode = state.nodes.find(n => n.id === link.parent_id);
  
  const content = `
    <p style="margin-bottom:15px;color:#666;font-size:13px;padding:0 5px;">
      <strong>${escapeHtml(sourceNode?.name || 'Unknown')}</strong><br>
      ↓<br>
      <strong>${escapeHtml(targetNode?.name || 'Unknown')}</strong>
    </p>
    
    <div class="form-group">
      <label class="form-label">Fastener Type</label>
      <input type="text" class="form-input" id="linkFastener" value="${escapeHtml(link.fastener || '')}" placeholder="e.g., M6x20, CBE10">
    </div>
    
    <div class="form-group">
      <label class="form-label">Quantity</label>
      <input type="number" class="form-input" id="linkQty" value="${link.qty || 1}" min="1">
    </div>
    
    <div class="form-group">
      <label class="form-label">Loctite</label>
      <select class="form-select" id="linkLoctite">
        <option value="" ${!link.loctite ? 'selected' : ''}>None</option>
        <option value="222" ${link.loctite === '222' ? 'selected' : ''}>222 (Purple - Low)</option>
        <option value="243" ${link.loctite === '243' ? 'selected' : ''}>243 (Blue - Medium)</option>
        <option value="262" ${link.loctite === '262' ? 'selected' : ''}>262 (Red - High)</option>
        <option value="263" ${link.loctite === '263' ? 'selected' : ''}>263 (Green - High)</option>
        <option value="271" ${link.loctite === '271' ? 'selected' : ''}>271 (Red - High Strength)</option>
        <option value="290" ${link.loctite === '290' ? 'selected' : ''}>290 (Green - Wicking)</option>
      </select>
    </div>
    
    <div class="form-group">
      <label class="form-label">Torque Value</label>
      <input type="number" class="form-input" id="linkTorqueValue" value="${link.torque_value || ''}" placeholder="e.g., 25">
    </div>
    
    <div class="form-group">
      <label class="form-label">Torque Unit</label>
      <select class="form-select" id="linkTorqueUnit">
        <option value="Nm" ${link.torque_unit === 'Nm' || !link.torque_unit ? 'selected' : ''}>Nm</option>
        <option value="ft-lb" ${link.torque_unit === 'ft-lb' ? 'selected' : ''}>ft-lb</option>
        <option value="in-lb" ${link.torque_unit === 'in-lb' ? 'selected' : ''}>in-lb</option>
        <option value="kgf-cm" ${link.torque_unit === 'kgf-cm' ? 'selected' : ''}>kgf-cm</option>
      </select>
    </div>
    
    <div style="margin-top:15px;padding:10px;background:#f5f5f5;border-radius:6px;font-size:11px;color:#666;">
      <strong>Reference:</strong><br>
      <span style="color:#9b59b6;">●</span> 222 = Low (Purple)<br>
      <span style="color:#3498db;">●</span> 243 = Medium (Blue)<br>
      <span style="color:#e74c3c;">●</span> 262/271 = High (Red)
    </div>
  `;
  
  setSidePanelContent('Edit Link', content, [
    { label: 'Cancel', class: 'btn-secondary', action: closeSidePanel },
    { label: 'Delete Link', class: 'btn-danger', action: () => confirmDeleteLinkFromPanel(linkId) },
    { label: 'Save', class: 'btn-primary', action: () => saveLinkProperties(linkId) }
  ]);
  
  openSidePanel();
  setTimeout(() => document.getElementById('linkFastener')?.focus(), 100);
}

async function saveLinkProperties(linkId) {
  const fastener = document.getElementById('linkFastener').value.trim();
  const qty = parseInt(document.getElementById('linkQty').value) || 1;
  const loctite = document.getElementById('linkLoctite').value || null;
  const torqueValue = document.getElementById('linkTorqueValue').value.trim();
  const torqueUnit = document.getElementById('linkTorqueUnit').value;
  
  try {
    const { error } = await db.from('logi_links').update({
      fastener: fastener || null,
      qty: qty,
      loctite: loctite,
      torque_value: torqueValue ? parseFloat(torqueValue) : null,
      torque_unit: torqueValue ? torqueUnit : null
    }).eq('id', linkId);
    
    if (error) throw error;
    
    closeSidePanel();
    showToast('Link updated', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error updating link:', e);
    showToast('Failed to update link: ' + e.message, 'error');
  }
}

function confirmDeleteLinkFromPanel(linkId) {
  if (confirm('Delete this link? The nodes will remain.')) {
    deleteLink(linkId);
  }
}

// ============================================================
// DELETE LINK
// ============================================================
export function confirmDeleteLink(linkId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const link = state.links.find(l => l.id === linkId);
  if (!link) return;
  
  const sourceNode = state.nodes.find(n => n.id === link.child_id);
  const targetNode = state.nodes.find(n => n.id === link.parent_id);
  
  showModal(
    'Delete Link',
    `<p>Are you sure you want to delete the link between:</p>
     <p style="margin:10px 0;font-weight:600;">
       ${escapeHtml(sourceNode?.name || 'Unknown')} → ${escapeHtml(targetNode?.name || 'Unknown')}
     </p>
     <p style="color:#888;font-size:12px;">The nodes will remain, only the connection will be removed.</p>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Delete', class: 'btn-danger', action: () => deleteLink(linkId) }
    ]
  );
}

async function deleteLink(linkId) {
  try {
    const { error } = await db.from('logi_links').update({ deleted: true }).eq('id', linkId);
    if (error) throw error;
    
    hideModal();
    showToast('Link deleted', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error deleting link:', e);
    showToast('Failed to delete link: ' + e.message, 'error');
  }
}

// ============================================================
// CREATE LINK (Connect existing nodes)
// ============================================================
export function showConnectNodeMenu(childId) {
  hideContextMenu();
  
  if (!state.isAdmin) return;
  
  const childNode = state.nodes.find(n => n.id === childId);
  if (!childNode) return;
  
  // Get potential parents (nodes that this node doesn't already connect to)
  const existingParents = new Set(childNode.goesInto);
  const potentialParents = state.nodes.filter(n => 
    n.id !== childId && !existingParents.has(n.id)
  );
  
  if (potentialParents.length === 0) {
    showToast('No available nodes to connect to', 'info');
    return;
  }
  
  // Sort by level (lower level = closer to root = more likely parent)
  potentialParents.sort((a, b) => a.level - b.level);
  
  const options = potentialParents.map(n => 
    `<option value="${n.id}">${escapeHtml(n.name)} (L${n.level})</option>`
  ).join('');
  
  showModal(
    'Connect to Parent',
    `<p style="margin-bottom:15px;color:#666;font-size:13px;">
      Connect "<strong>${escapeHtml(childNode.name)}</strong>" (L${childNode.level}) to a parent:
    </p>
    <div class="form-group">
      <label class="form-label">Select Parent Node</label>
      <select class="form-select" id="connectParentId" style="max-height:200px;">${options}</select>
    </div>
    
    <div class="form-row" style="display:flex;gap:10px;">
      <div class="form-group" style="flex:2;">
        <label class="form-label">Fastener</label>
        <input type="text" class="form-input" id="connectFastener" placeholder="e.g., M6x20">
      </div>
      <div class="form-group" style="flex:1;">
        <label class="form-label">Qty</label>
        <input type="number" class="form-input" id="connectQty" value="1" min="1">
      </div>
    </div>
    
    <div class="form-group">
      <label class="form-label">Loctite</label>
      <select class="form-select" id="connectLoctite">
        <option value="">None</option>
        <option value="222">222 (Purple - Low)</option>
        <option value="243">243 (Blue - Medium)</option>
        <option value="262">262 (Red - High)</option>
        <option value="271">271 (Red - High Strength)</option>
      </select>
    </div>
    
    <div class="form-group">
      <label class="form-label">Torque</label>
      <div style="display:flex;gap:10px;">
        <input type="number" class="form-input" id="connectTorqueValue" placeholder="e.g., 25" style="flex:1;">
        <select class="form-select" id="connectTorqueUnit" style="flex:1;">
          <option value="Nm">Nm</option>
          <option value="ft-lb">ft-lb</option>
          <option value="in-lb">in-lb</option>
        </select>
      </div>
    </div>
    
    <p style="margin-top:10px;color:#888;font-size:11px;">
      💡 Tip: Parent should be a lower level (closer to L1) than this node.
    </p>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Connect', class: 'btn-primary', action: () => createConnection(childId) }
    ]
  );
}

async function createConnection(childId) {
  const parentId = document.getElementById('connectParentId').value;
  const fastener = document.getElementById('connectFastener').value.trim();
  const qty = parseInt(document.getElementById('connectQty').value) || 1;
  const loctite = document.getElementById('connectLoctite').value || null;
  const torqueValue = document.getElementById('connectTorqueValue').value.trim();
  const torqueUnit = document.getElementById('connectTorqueUnit').value;
  
  if (!parentId) {
    showToast('Please select a parent node', 'error');
    return;
  }
  
  try {
    const { error } = await db.from('logi_links').insert({
      assembly_id: state.currentAssemblyId,
      parent_id: parentId,
      child_id: childId,
      fastener: fastener || null,
      qty: qty,
      loctite: loctite,
      torque_value: torqueValue ? parseFloat(torqueValue) : null,
      torque_unit: torqueValue ? torqueUnit : null
    });
    
    if (error) throw error;
    
    hideModal();
    showToast('Connection created', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error creating connection:', e);
    showToast('Failed to create connection: ' + e.message, 'error');
  }
}

// ============================================================
// EXPORTS TO WINDOW
// ============================================================
window.editLinkFastener = editLinkFastener;
window.confirmDeleteLink = confirmDeleteLink;
window.showConnectNodeMenu = showConnectNodeMenu;
