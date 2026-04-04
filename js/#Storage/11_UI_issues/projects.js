// ============================================================
// Logi Assembly v27 - Projects Module
// ============================================================

import { db } from './database.js';
import { PROJECT_COLORS, PROJECT_EMOJIS, getRandomEmoji, getRandomColor } from './config.js';
import * as state from './state.js';
import { showToast, showModal, hideModal, escapeHtml, navigateTo } from './ui.js';
import { loadAssembliesForProject, renderAssembliesPage } from './assemblies.js';

// ============================================================
// LOAD PROJECTS
// ============================================================
export async function loadProjects() {
  try {
    let query = db.from('logi_projects').select('*').order('name');
    
    // Guest only sees visible projects
    if (!state.isAdmin) {
      query = query.eq('is_visible', true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error loading projects:', error);
      // Fallback to legacy mode
      loadAssembliesLegacy();
      return;
    }
    
    state.setProjects(data || []);
    renderProjects();
    
  } catch (e) {
    console.error('Failed to load projects:', e);
    loadAssembliesLegacy();
  }
}

// ============================================================
// LEGACY MODE (No projects table)
// ============================================================
async function loadAssembliesLegacy() {
  console.log('Loading in legacy mode (no projects)');
  // Navigate directly to tree view with assembly selection
  navigateTo('tree');
}

// ============================================================
// RENDER PROJECTS
// ============================================================
export function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  
  // Filter and sort projects
  let displayProjects = state.isAdmin ? [...state.projects] : state.projects.filter(p => p.is_visible);
  
  // Sort: visible first, hidden at bottom
  if (state.isAdmin) {
    displayProjects.sort((a, b) => {
      if (a.is_visible === b.is_visible) return 0;
      return a.is_visible ? -1 : 1;
    });
  }
  
  let html = '';
  
  for (const project of displayProjects) {
    const isHidden = !project.is_visible;
    html += `
      <div class="project-card ${isHidden ? 'hidden-project' : ''}" onclick="window.openProject('${project.id}')">
        <div class="project-card-color-bar" style="background:${project.color || '#3498db'}"></div>
        <div class="project-card-header">
          <span class="project-card-icon">${project.icon || '📁'}</span>
          <div class="project-card-title">
            <h3>${escapeHtml(project.name)}</h3>
            <span class="assembly-count" id="projectCount_${project.id}">Loading...</span>
          </div>
        </div>
        <div class="project-card-description">${escapeHtml(project.description || 'No description')}</div>
        <div class="project-card-footer">
          ${state.isAdmin ? `
            <div class="visibility-toggle" onclick="event.stopPropagation()">
              <input type="checkbox" id="vis_${project.id}" ${project.is_visible ? 'checked' : ''} onchange="window.toggleProjectVisibility('${project.id}', this.checked)">
              <label for="vis_${project.id}">
                <span class="toggle-switch"></span>
                <span>${project.is_visible ? 'Visible' : 'Hidden'}</span>
              </label>
            </div>
            <div class="project-card-actions">
              <button class="project-edit-btn" onclick="event.stopPropagation(); window.editProject('${project.id}')">✏️</button>
              <button class="project-delete-btn" onclick="event.stopPropagation(); window.confirmDeleteProject('${project.id}')">🗑️</button>
            </div>
          ` : '<span></span>'}
        </div>
      </div>
    `;
  }
  
  // Add "New Project" card for admin
  if (state.isAdmin) {
    html += `
      <div class="project-card add-card" onclick="window.createNewProject()">
        <span class="add-icon">➕</span>
        <span>New Project</span>
      </div>
    `;
  }
  
  grid.innerHTML = html;
  loadProjectCounts();
}

// ============================================================
// LOAD PROJECT COUNTS
// ============================================================
async function loadProjectCounts() {
  for (const project of state.projects) {
    try {
      let query = db.from('logi_assemblies').select('count', { count: 'exact', head: true }).eq('project_id', project.id);
      
      if (!state.isAdmin) {
        query = query.eq('is_visible', true);
      }
      
      const { count, error } = await query;
      
      if (!error) {
        const countEl = document.getElementById(`projectCount_${project.id}`);
        if (countEl) {
          countEl.textContent = `${count || 0} ${count === 1 ? 'assembly' : 'assemblies'}`;
        }
      }
    } catch (e) {
      console.error('Error loading count for project:', project.id, e);
    }
  }
}

// ============================================================
// OPEN PROJECT
// ============================================================
export async function openProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  state.setCurrentProject(project);
  
  // Update assemblies page header
  document.getElementById('currentProjectIcon').textContent = project.icon || '📁';
  document.getElementById('currentProjectName').textContent = project.name;
  document.getElementById('currentProjectDesc').textContent = project.description || 'No description';
  
  // Set background color
  const assembliesPage = document.getElementById('assembliesPage');
  const rgba = hexToRgba(project.color || '#3498db', 0.08);
  assembliesPage.style.background = `linear-gradient(135deg, ${rgba} 0%, #f5f7fa 100%)`;
  
  await loadAssembliesForProject(projectId);
  navigateTo('assemblies');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================
// CREATE PROJECT
// ============================================================
export function createNewProject() {
  if (!state.isAdmin) return;
  
  const defaultEmoji = getRandomEmoji();
  const defaultColor = getRandomColor();
  
  const emojiOptions = PROJECT_EMOJIS.map(e => 
    `<button type="button" onclick="window.selectProjectEmoji('${e}')" class="${e === defaultEmoji ? 'selected' : ''}">${e}</button>`
  ).join('');
  
  const colorOptions = PROJECT_COLORS.map(c => 
    `<button type="button" style="background:${c.value}" onclick="window.selectProjectColor('${c.value}')" class="${c.value === defaultColor ? 'selected' : ''}" title="${c.name}"></button>`
  ).join('');
  
  showModal(
    'New Project',
    `<div class="form-group">
      <label class="form-label">Project Name</label>
      <input type="text" class="form-input" id="projectName" placeholder="Enter project name">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="projectDesc" placeholder="Enter project description"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Icon</label>
      <div class="emoji-picker" id="emojiPicker">${emojiOptions}</div>
      <input type="hidden" id="projectIcon" value="${defaultEmoji}">
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-picker" id="colorPicker">${colorOptions}</div>
      <input type="hidden" id="projectColor" value="${defaultColor}">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Create', class: 'btn-primary', action: () => saveProject(null) }
    ]
  );
  
  setTimeout(() => document.getElementById('projectName')?.focus(), 100);
}

// ============================================================
// EDIT PROJECT
// ============================================================
export function editProject(projectId) {
  if (!state.isAdmin) return;
  
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  const emojiOptions = PROJECT_EMOJIS.map(e => 
    `<button type="button" onclick="window.selectProjectEmoji('${e}')" class="${e === project.icon ? 'selected' : ''}">${e}</button>`
  ).join('');
  
  const colorOptions = PROJECT_COLORS.map(c => 
    `<button type="button" style="background:${c.value}" onclick="window.selectProjectColor('${c.value}')" class="${c.value === project.color ? 'selected' : ''}" title="${c.name}"></button>`
  ).join('');
  
  showModal(
    'Edit Project',
    `<div class="form-group">
      <label class="form-label">Project Name</label>
      <input type="text" class="form-input" id="projectName" value="${escapeHtml(project.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="projectDesc">${escapeHtml(project.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Icon</label>
      <div class="emoji-picker" id="emojiPicker">${emojiOptions}</div>
      <input type="hidden" id="projectIcon" value="${project.icon || '📁'}">
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-picker" id="colorPicker">${colorOptions}</div>
      <input type="hidden" id="projectColor" value="${project.color || '#3498db'}">
    </div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Save', class: 'btn-primary', action: () => saveProject(projectId) }
    ]
  );
}

// ============================================================
// SAVE PROJECT
// ============================================================
async function saveProject(projectId) {
  const name = document.getElementById('projectName').value.trim();
  const description = document.getElementById('projectDesc').value.trim();
  const icon = document.getElementById('projectIcon').value;
  const color = document.getElementById('projectColor').value;
  
  if (!name) {
    showToast('Project name is required', 'error');
    return;
  }
  
  try {
    if (projectId) {
      // Update
      const { error } = await db.from('logi_projects').update({
        name,
        description,
        icon,
        color,
        updated_at: new Date().toISOString()
      }).eq('id', projectId);
      
      if (error) throw error;
      showToast('Project updated', 'success');
    } else {
      // Create
      const { error } = await db.from('logi_projects').insert({
        name,
        description,
        icon,
        color,
        is_visible: true
      });
      
      if (error) throw error;
      showToast('Project created', 'success');
    }
    
    hideModal();
    await loadProjects();
  } catch (e) {
    console.error('Error saving project:', e);
    showToast('Failed to save project: ' + e.message, 'error');
  }
}

// ============================================================
// TOGGLE VISIBILITY
// ============================================================
export async function toggleProjectVisibility(projectId, isVisible) {
  if (!state.isAdmin) return;
  
  try {
    const { error } = await db.from('logi_projects').update({
      is_visible: isVisible,
      updated_at: new Date().toISOString()
    }).eq('id', projectId);
    
    if (error) throw error;
    
    const project = state.projects.find(p => p.id === projectId);
    if (project) project.is_visible = isVisible;
    
    showToast(`Project ${isVisible ? 'visible' : 'hidden'}`, 'success');
    renderProjects();
  } catch (e) {
    console.error('Error updating visibility:', e);
    showToast('Failed to update visibility', 'error');
    const checkbox = document.getElementById(`vis_${projectId}`);
    if (checkbox) checkbox.checked = !isVisible;
  }
}

// ============================================================
// DELETE PROJECT
// ============================================================
export function confirmDeleteProject(projectId) {
  if (!state.isAdmin) return;
  
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  showModal(
    'Delete Project',
    `<p>Are you sure you want to delete "<strong>${escapeHtml(project.name)}</strong>"?</p>
     <p style="color:#e74c3c;margin-top:10px;font-size:13px;">⚠️ This will also delete all assemblies and nodes in this project!</p>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Delete', class: 'btn-danger', action: () => deleteProject(projectId) }
    ]
  );
}

async function deleteProject(projectId) {
  try {
    // Get all assemblies in this project
    const { data: assemblies } = await db.from('logi_assemblies').select('id').eq('project_id', projectId);
    
    if (assemblies && assemblies.length > 0) {
      const assemblyIds = assemblies.map(a => a.id);
      
      // Delete all links in these assemblies
      await db.from('logi_links').delete().in('assembly_id', assemblyIds);
      
      // Delete all nodes in these assemblies
      await db.from('logi_nodes').delete().in('assembly_id', assemblyIds);
      
      // Delete assemblies
      await db.from('logi_assemblies').delete().eq('project_id', projectId);
    }
    
    // Delete project
    const { error } = await db.from('logi_projects').delete().eq('id', projectId);
    if (error) throw error;
    
    hideModal();
    showToast('Project deleted', 'success');
    await loadProjects();
  } catch (e) {
    console.error('Error deleting project:', e);
    showToast('Failed to delete project: ' + e.message, 'error');
  }
}

// ============================================================
// EMOJI & COLOR SELECTION
// ============================================================
export function selectProjectEmoji(emoji) {
  document.getElementById('projectIcon').value = emoji;
  document.querySelectorAll('.emoji-picker button').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === emoji);
  });
}

export function selectProjectColor(color) {
  document.getElementById('projectColor').value = color;
  document.querySelectorAll('.color-picker button').forEach(btn => {
    btn.classList.toggle('selected', rgbToHex(btn.style.background) === color.toLowerCase());
  });
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb.toLowerCase();
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return rgb;
  return '#' + match.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}

// ============================================================
// EXPORT FUNCTIONS TO WINDOW (for onclick handlers)
// ============================================================
window.openProject = openProject;
window.createNewProject = createNewProject;
window.editProject = editProject;
window.toggleProjectVisibility = toggleProjectVisibility;
window.confirmDeleteProject = confirmDeleteProject;
window.selectProjectEmoji = selectProjectEmoji;
window.selectProjectColor = selectProjectColor;
