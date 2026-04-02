// ============================================================
// Logi Assembly v27 - Assemblies Module
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast, showModal, hideModal, escapeHtml, navigateTo, showLoading, setStatus } from './ui.js';
import { loadAssemblyData, renderGraph } from './graph.js';

// ============================================================
// LOAD ASSEMBLIES FOR PROJECT
// ============================================================
export async function loadAssembliesForProject(projectId) {
  try {
    let query = db.from('logi_assemblies')
      .select('*')
      .eq('project_id', projectId)
      .order('name');
    
    if (!state.isAdmin) {
      query = query.eq('is_visible', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    state.setAssemblies(data || []);
    renderAssembliesPage();
    
  } catch (e) {
    console.error('Error loading assemblies:', e);
    showToast('Failed to load assemblies', 'error');
  }
}

// ============================================================
// RENDER ASSEMBLIES PAGE
// ============================================================
export function renderAssembliesPage() {
  const grid = document.getElementById('assembliesGrid');
  const projectColor = state.currentProject?.color || '#3498db';
  
  // Filter and sort assemblies
  let displayAssemblies = state.isAdmin ? [...state.assemblies] : state.assemblies.filter(a => a.is_visible);
  
  // Sort: visible first, hidden at bottom
  if (state.isAdmin) {
    displayAssemblies.sort((a, b) => {
      const aVisible = a.is_visible !== false;
      const bVisible = b.is_visible !== false;
      if (aVisible === bVisible) return 0;
      return aVisible ? -1 : 1;
    });
  }
  
  let html = '';
  
  for (const assembly of displayAssemblies) {
    const isHidden = assembly.is_visible === false;
    html += `
      <div class="assembly-card ${isHidden ? 'hidden-assembly' : ''}" style="border-color:${projectColor}" onclick="window.openAssemblyFromCard('${assembly.id}', '${escapeHtml(assembly.name)}')">
        <h4>${escapeHtml(assembly.name)}</h4>
        <span class="node-count" id="asmCount_${assembly.id}">Loading nodes...</span>
        ${state.isAdmin ? `
          <div class="assembly-card-footer">
            <div class="visibility-toggle" onclick="event.stopPropagation()">
              <input type="checkbox" id="asmVis_${assembly.id}" ${assembly.is_visible !== false ? 'checked' : ''} onchange="window.toggleAssemblyVisibility('${assembly.id}', this.checked)">
              <label for="asmVis_${assembly.id}">
                <span class="toggle-switch"></span>
              </label>
            </div>
            <div class="project-card-actions">
              <button class="project-edit-btn" onclick="event.stopPropagation(); window.renameAssemblyById('${assembly.id}')">✏️</button>
              <button class="project-delete-btn" onclick="event.stopPropagation(); window.confirmDeleteAssemblyById('${assembly.id}')">🗑️</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  if (state.isAdmin) {
    html += `
      <div class="assembly-card add-card" onclick="window.createNewAssemblyInProject()">
        <span style="font-size:32px;">➕</span>
        <span>New Assembly</span>
      </div>
    `;
  }
  
  grid.innerHTML = html;
  loadAssemblyCountsForPage();
}

// ============================================================
// LOAD ASSEMBLY COUNTS
// ============================================================
async function loadAssemblyCountsForPage() {
  for (const assembly of state.assemblies) {
    try {
      const { count, error } = await db.from('logi_nodes')
        .select('count', { count: 'exact', head: true })
        .eq('assembly_id', assembly.id)
        .eq('deleted', false);
      
      if (!error) {
        const countEl = document.getElementById(`asmCount_${assembly.id}`);
        if (countEl) {
          countEl.textContent = `${count || 0} node${count === 1 ? '' : 's'}`;
        }
      }
    } catch (e) {
      console.error('Error loading count for assembly:', assembly.id, e);
    }
  }
}

// ============================================================
// OPEN ASSEMBLY FROM CARD
// ============================================================
export async function openAssemblyFromCard(assemblyId, assemblyName) {
  state.setCurrentAssembly(assemblyId, assemblyName);
  
  // Update assembly dropdown
  const select = document.getElementById('assemblySelect');
  select.innerHTML = state.assemblies.map(a => 
    `<option value="${a.id}" ${a.id === assemblyId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
  ).join('');
  
  navigateTo('tree');
  await loadAssemblyData(assemblyId);
}

// ============================================================
// LOAD ASSEMBLIES (for dropdown in tree view)
// ============================================================
export async function loadAssemblies() {
  try {
    let query = db.from('logi_assemblies').select('*').order('name');
    
    if (state.currentProject) {
      query = query.eq('project_id', state.currentProject.id);
    }
    
    if (!state.isAdmin) {
      query = query.eq('is_visible', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    state.setAssemblies(data || []);
    
    // Update dropdown
    const select = document.getElementById('assemblySelect');
    if (state.assemblies.length === 0) {
      select.innerHTML = '<option value="">No assemblies</option>';
    } else {
      select.innerHTML = state.assemblies.map(a => 
        `<option value="${a.id}">${escapeHtml(a.name)}</option>`
      ).join('');
    }
    
  } catch (e) {
    console.error('Error loading assemblies:', e);
    showToast('Failed to load assemblies', 'error');
  }
}

// ============================================================
// CREATE NEW ASSEMBLY IN PROJECT
// ============================================================
export function createNewAssemblyInProject() {
  if (!state.isAdmin) return;
  
  showModal(
    'New Assembly',
    `<div class="form-group">
      <label class="form-label">Assembly Name</label>
      <input type="text" class="form-input" id="newAssemblyName" placeholder="Enter assembly name">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Create', class: 'btn-primary', action: saveNewAssemblyInProject }
    ]
  );
  
  setTimeout(() => document.getElementById('newAssemblyName')?.focus(), 100);
}

async function saveNewAssemblyInProject() {
  const name = document.getElementById('newAssemblyName').value.trim();
  
  if (!name) {
    showToast('Assembly name is required', 'error');
    return;
  }
  
  try {
    const { data: newAssembly, error: assemblyError } = await db
      .from('logi_assemblies')
      .insert({
        name: name,
        project_id: state.currentProject?.id,
        is_visible: true
      })
      .select()
      .single();
    
    if (assemblyError) throw assemblyError;
    
    // Create a root node
    const { error: nodeError } = await db
      .from('logi_nodes')
      .insert({
        assembly_id: newAssembly.id,
        name: name,
        status: 'NOT_STARTED',
        x: 800,
        y: 400
      });
    
    if (nodeError) throw nodeError;
    
    showToast(`Assembly "${name}" created`, 'success');
    hideModal();
    
    await loadAssembliesForProject(state.currentProject.id);
  } catch (e) {
    console.error('Error creating assembly:', e);
    showToast('Failed to create assembly: ' + e.message, 'error');
  }
}

// ============================================================
// CREATE NEW ASSEMBLY IN TREE VIEW
// ============================================================
export function createNewAssemblyInTree() {
  if (!state.isAdmin) return;
  
  showModal(
    'New Assembly',
    `<div class="form-group">
      <label class="form-label">Assembly Name</label>
      <input type="text" class="form-input" id="newAssemblyName" placeholder="Enter assembly name">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Create', class: 'btn-primary', action: saveNewAssemblyInTree }
    ]
  );
  
  setTimeout(() => document.getElementById('newAssemblyName')?.focus(), 100);
}

async function saveNewAssemblyInTree() {
  const name = document.getElementById('newAssemblyName').value.trim();
  
  if (!name) {
    showToast('Assembly name is required', 'error');
    return;
  }
  
  try {
    const { data: newAssembly, error: assemblyError } = await db
      .from('logi_assemblies')
      .insert({
        name: name,
        project_id: state.currentProject?.id,
        is_visible: true
      })
      .select()
      .single();
    
    if (assemblyError) throw assemblyError;
    
    // Create root node
    await db.from('logi_nodes').insert({
      assembly_id: newAssembly.id,
      name: name,
      status: 'NOT_STARTED',
      x: 800,
      y: 400
    });
    
    showToast(`Assembly "${name}" created`, 'success');
    hideModal();
    
    await loadAssemblies();
    document.getElementById('assemblySelect').value = newAssembly.id;
    state.setCurrentAssembly(newAssembly.id, name);
    await loadAssemblyData(newAssembly.id);
  } catch (e) {
    console.error('Error creating assembly:', e);
    showToast('Failed to create assembly: ' + e.message, 'error');
  }
}

// ============================================================
// RENAME ASSEMBLY
// ============================================================
export function renameAssemblyById(assemblyId) {
  if (!state.isAdmin) return;
  
  const assembly = state.assemblies.find(a => a.id === assemblyId);
  if (!assembly) return;
  
  showModal(
    'Rename Assembly',
    `<div class="form-group">
      <label class="form-label">Assembly Name</label>
      <input type="text" class="form-input" id="renameAssemblyInput" value="${escapeHtml(assembly.name)}">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Rename', class: 'btn-primary', action: () => saveRenameAssembly(assemblyId) }
    ]
  );
  
  setTimeout(() => {
    const input = document.getElementById('renameAssemblyInput');
    input?.focus();
    input?.select();
  }, 100);
}

async function saveRenameAssembly(assemblyId) {
  const name = document.getElementById('renameAssemblyInput').value.trim();
  
  if (!name) {
    showToast('Assembly name is required', 'error');
    return;
  }
  
  try {
    const { error } = await db.from('logi_assemblies').update({
      name: name,
      updated_at: new Date().toISOString()
    }).eq('id', assemblyId);
    
    if (error) throw error;
    
    hideModal();
    showToast('Assembly renamed', 'success');
    
    if (state.currentPage === 'assemblies') {
      await loadAssembliesForProject(state.currentProject.id);
    } else {
      await loadAssemblies();
    }
  } catch (e) {
    console.error('Error renaming assembly:', e);
    showToast('Failed to rename assembly: ' + e.message, 'error');
  }
}

export function renameAssembly() {
  if (state.currentAssemblyId) {
    renameAssemblyById(state.currentAssemblyId);
  }
}

// ============================================================
// TOGGLE ASSEMBLY VISIBILITY
// ============================================================
export async function toggleAssemblyVisibility(assemblyId, isVisible) {
  if (!state.isAdmin) return;
  
  try {
    const { error } = await db.from('logi_assemblies').update({
      is_visible: isVisible,
      updated_at: new Date().toISOString()
    }).eq('id', assemblyId);
    
    if (error) throw error;
    
    const assembly = state.assemblies.find(a => a.id === assemblyId);
    if (assembly) assembly.is_visible = isVisible;
    
    showToast(`Assembly ${isVisible ? 'visible' : 'hidden'}`, 'success');
    renderAssembliesPage();
  } catch (e) {
    console.error('Error updating visibility:', e);
    showToast('Failed to update visibility', 'error');
  }
}

// ============================================================
// DELETE ASSEMBLY
// ============================================================
export function confirmDeleteAssemblyById(assemblyId) {
  if (!state.isAdmin) return;
  
  const assembly = state.assemblies.find(a => a.id === assemblyId);
  if (!assembly) return;
  
  showModal(
    'Delete Assembly',
    `<p>Are you sure you want to delete "<strong>${escapeHtml(assembly.name)}</strong>"?</p>
     <p style="color:#e74c3c;margin-top:10px;font-size:13px;">⚠️ This will also delete all nodes and links!</p>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Delete', class: 'btn-danger', action: () => deleteAssemblyById(assemblyId) }
    ]
  );
}

async function deleteAssemblyById(assemblyId) {
  try {
    await db.from('logi_links').delete().eq('assembly_id', assemblyId);
    await db.from('logi_nodes').delete().eq('assembly_id', assemblyId);
    const { error } = await db.from('logi_assemblies').delete().eq('id', assemblyId);
    
    if (error) throw error;
    
    hideModal();
    showToast('Assembly deleted', 'success');
    
    if (state.currentPage === 'assemblies') {
      await loadAssembliesForProject(state.currentProject.id);
    } else {
      await loadAssemblies();
    }
  } catch (e) {
    console.error('Error deleting assembly:', e);
    showToast('Failed to delete assembly: ' + e.message, 'error');
  }
}

export function confirmDeleteAssembly() {
  if (state.currentAssemblyId) {
    confirmDeleteAssemblyById(state.currentAssemblyId);
  }
}

// ============================================================
// DUPLICATE ASSEMBLY
// ============================================================
export async function duplicateAssembly() {
  if (!state.isAdmin || !state.currentAssemblyId) return;
  
  const assembly = state.assemblies.find(a => a.id === state.currentAssemblyId);
  if (!assembly) return;
  
  showLoading(true);
  setStatus('Duplicating...', 'loading');
  
  try {
    // Create new assembly
    const { data: newAssembly, error: assemblyError } = await db
      .from('logi_assemblies')
      .insert({
        name: `${assembly.name} (Copy)`,
        project_id: assembly.project_id,
        is_visible: true
      })
      .select()
      .single();
    
    if (assemblyError) throw assemblyError;
    
    // Get all nodes
    const { data: oldNodes, error: nodesError } = await db
      .from('logi_nodes')
      .select('*')
      .eq('assembly_id', state.currentAssemblyId)
      .eq('deleted', false);
    
    if (nodesError) throw nodesError;
    
    // Copy nodes
    const nodeIdMap = new Map();
    for (const oldNode of oldNodes) {
      const { data: newNode, error } = await db
        .from('logi_nodes')
        .insert({
          assembly_id: newAssembly.id,
          name: oldNode.name,
          part_number: oldNode.part_number,
          status: oldNode.status,
          qty: oldNode.qty,
          group_num: oldNode.group_num,
          sequence_num: oldNode.sequence_num,
          notes: oldNode.notes,
          is_orphan: oldNode.is_orphan,
          is_locked: oldNode.is_locked,
          x: oldNode.x,
          y: oldNode.y
        })
        .select()
        .single();
      
      if (error) throw error;
      nodeIdMap.set(oldNode.id, newNode.id);
    }
    
    // Get and copy links
    const { data: oldLinks, error: linksError } = await db
      .from('logi_links')
      .select('*')
      .eq('assembly_id', state.currentAssemblyId);
    
    if (!linksError && oldLinks) {
      for (const oldLink of oldLinks.filter(l => l.deleted !== true)) {
        const newParentId = nodeIdMap.get(oldLink.parent_id);
        const newChildId = nodeIdMap.get(oldLink.child_id);
        
        if (newParentId && newChildId) {
          await db.from('logi_links').insert({
            assembly_id: newAssembly.id,
            parent_id: newParentId,
            child_id: newChildId,
            fastener: oldLink.fastener,
            qty: oldLink.qty
          });
        }
      }
    }
    
    showToast('Assembly duplicated', 'success');
    await loadAssemblies();
    
    document.getElementById('assemblySelect').value = newAssembly.id;
    state.setCurrentAssembly(newAssembly.id, newAssembly.name);
    await loadAssemblyData(newAssembly.id);
    
  } catch (e) {
    console.error('Error duplicating assembly:', e);
    showToast('Failed to duplicate: ' + e.message, 'error');
  }
  
  showLoading(false);
  setStatus('');
}

// ============================================================
// EXPORT TO WINDOW
// ============================================================
window.openAssemblyFromCard = openAssemblyFromCard;
window.createNewAssemblyInProject = createNewAssemblyInProject;
window.createNewAssemblyInTree = createNewAssemblyInTree;
window.renameAssemblyById = renameAssemblyById;
window.renameAssembly = renameAssembly;
window.toggleAssemblyVisibility = toggleAssemblyVisibility;
window.confirmDeleteAssemblyById = confirmDeleteAssemblyById;
window.confirmDeleteAssembly = confirmDeleteAssembly;
window.duplicateAssembly = duplicateAssembly;
