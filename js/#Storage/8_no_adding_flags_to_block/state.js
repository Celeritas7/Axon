// ============================================================
// Logi Assembly v27 - Shared State
// ============================================================

// Authentication state
export let isAdmin = false;
export let googleUser = null;

export function setIsAdmin(value) {
  isAdmin = value;
}

export function setGoogleUser(user) {
  googleUser = user;
}

// Navigation state
export let currentPage = 'home'; // 'home' | 'assemblies' | 'tree'
export let currentProject = null;
export let currentAssemblyId = null;
export let currentAssemblyName = '';

export function setCurrentPage(page) {
  currentPage = page;
}

export function setCurrentProject(project) {
  currentProject = project;
}

export function setCurrentAssembly(id, name) {
  currentAssemblyId = id;
  currentAssemblyName = name || '';
}

// Data arrays
export let projects = [];
export let assemblies = [];
export let nodes = [];
export let links = [];

export function setProjects(data) {
  projects = data;
}

export function setAssemblies(data) {
  assemblies = data;
}

export function setNodes(data) {
  nodes = data;
}

export function setLinks(data) {
  links = data;
}

// Tree state
export let simulation = null;
export let collapsedNodes = new Set();
export let lockedNodes = new Set();
export let positionHistory = [];
export let shiftKeyPressed = false;
export let isDragging = false;

export function setSimulation(sim) {
  simulation = sim;
}

export function clearCollapsedNodes() {
  collapsedNodes.clear();
  saveCollapsedState();
}

export function toggleCollapsedNode(id) {
  if (collapsedNodes.has(id)) {
    collapsedNodes.delete(id);
  } else {
    collapsedNodes.add(id);
  }
  saveCollapsedState();
}

// Persist collapsed state per assembly
function saveCollapsedState() {
  if (!currentAssemblyId) return;
  try {
    const arr = Array.from(collapsedNodes);
    localStorage.setItem(`axon_collapsed_${currentAssemblyId}`, JSON.stringify(arr));
  } catch (e) {}
}

export function loadCollapsedState() {
  collapsedNodes.clear();
  if (!currentAssemblyId) return;
  try {
    const saved = localStorage.getItem(`axon_collapsed_${currentAssemblyId}`);
    if (saved) {
      JSON.parse(saved).forEach(id => collapsedNodes.add(id));
    }
  } catch (e) {}
}

export function clearLockedNodes() {
  lockedNodes.clear();
}

export function addLockedNode(id) {
  lockedNodes.add(id);
}

export function removeLockedNode(id) {
  lockedNodes.delete(id);
}

export function setShiftKeyPressed(value) {
  shiftKeyPressed = value;
}

export function pushPositionHistory(entry) {
  positionHistory.push(entry);
  // Keep only last 20 entries
  if (positionHistory.length > 20) {
    positionHistory.shift();
  }
}

export function popPositionHistory() {
  return positionHistory.pop();
}

export function clearPositionHistory() {
  positionHistory = [];
}

// View settings
export let currentLevelFilter = 'all';
export let currentColorMode = 'level';
export let currentLayoutMode = 'tree';
export let showSequenceNumbers = true;
export let showLevelHeaders = true;

export function setLevelFilter(filter) {
  currentLevelFilter = filter;
}

export function setColorMode(mode) {
  currentColorMode = mode;
}

export function setLayoutMode(mode) {
  currentLayoutMode = mode;
}

export function setShowSequenceNumbers(value) {
  showSequenceNumbers = value;
}

export function setShowLevelHeaders(value) {
  showLevelHeaders = value;
}

// Separator lines between groups
export let showSeparatorLines = false;

export function setShowSeparatorLines(value) {
  showSeparatorLines = value;
}

// Per-level horizontal gaps (runtime, initialized from config defaults)
export let levelGaps = null;  // null = use config defaults

export function setLevelGaps(gaps) {
  levelGaps = gaps;
}

export function resetLevelGaps() {
  levelGaps = null;
}
