// ============================================================
// Logi Assembly v27 - Export Module
// ============================================================

import {
  LEVEL_COLORS, LEVEL_SHAPES, LEVEL_FONT_SIZES, LEVEL_FONT_WEIGHTS,
  FASTENER_COLORS
} from './config.js';
import { db } from './database.js';
import * as state from './state.js';
import { showToast, closeAllDropdowns, showModal, hideModal } from './ui.js';

// ============================================================
// EXPORT OPTIONS MODAL
// ============================================================
export function showExportOptions(format = 'png') {
  closeAllDropdowns();
  
  const modalContent = `
    <div class="form-group">
      <label class="form-label">Scale</label>
      <select class="form-input" id="exportScale">
        <option value="1">1x (Standard)</option>
        <option value="1.5">1.5x (Medium)</option>
        <option value="2" selected>2x (High Quality)</option>
        <option value="3">3x (Print Quality)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Padding (px)</label>
      <input type="number" class="form-input" id="exportPadding" value="40" min="0" max="200">
    </div>
    <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
      <input type="checkbox" id="exportAutoFit" checked>
      <label for="exportAutoFit">Auto-fit to content</label>
    </div>
  `;
  
  showModal(
    `Export as ${format.toUpperCase()}`,
    modalContent,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { 
        label: 'Export', 
        class: 'btn-primary', 
        action: () => {
          const scale = parseFloat(document.getElementById('exportScale').value);
          const padding = parseInt(document.getElementById('exportPadding').value) || 40;
          const autoFit = document.getElementById('exportAutoFit').checked;
          hideModal();
          
          if (format === 'png') {
            downloadPNG(scale, padding, autoFit);
          } else {
            downloadSVG(scale, padding, autoFit);
          }
        }
      }
    ]
  );
}

// ============================================================
// CALCULATE CONTENT BOUNDS
// ============================================================
function calculateContentBounds() {
  const isTreeMode = state.currentLayoutMode === 'tree';
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  // Only calculate bounds for visible nodes
  const visibleNodes = state.nodes.filter(node => {
    if (node.deleted) return false;
    if (state.currentLevelFilter !== 'all' && node.level > parseInt(state.currentLevelFilter)) {
      return false;
    }
    return true;
  });
  
  // Calculate bounds from visible nodes
  visibleNodes.forEach(node => {
    const x = isTreeMode ? (node.treeX || node.x || 0) : (node.x || 0);
    const y = isTreeMode ? (node.treeY || node.tree_y || node.y || 0) : (node.y || 0);
    const w = isTreeMode ? (node.treeWidth || 120) : (node.width || 160);
    const h = isTreeMode ? (node.treeHeight || 35) : (node.height || 50);
    
    // Add extra horizontal margin for link labels between nodes
    const labelMargin = isTreeMode ? 60 : 40;
    
    minX = Math.min(minX, x - w/2 - labelMargin);
    minY = Math.min(minY, y - h/2 - 20);
    maxX = Math.max(maxX, x + w/2 + labelMargin);
    maxY = Math.max(maxY, y + h/2 + 20);
  });
  
  // Include level headers if visible
  if (isTreeMode && state.showLevelHeaders) {
    minY = Math.min(minY, 60); // Top padding for headers
  }
  
  // Include sequence number badges (positioned outside nodes)
  if (state.showSequenceNumbers) {
    maxX += 30;
  }
  
  // Handle empty state
  if (minX === Infinity) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// ============================================================
// DOWNLOAD PNG
// ============================================================
export async function downloadPNG(scale = 2, padding = 40, autoFit = true) {
  closeAllDropdowns();
  
  const svg = document.getElementById('treeSvg');
  if (!svg) return;
  
  showToast('Generating PNG...', 'info');
  
  try {
    // Clone SVG
    const clone = svg.cloneNode(true);
    
    // Remove collapse indicators and lock icons for clean export
    cleanSvgForExport(clone);
    
    // Calculate content bounds if auto-fit
    let exportWidth, exportHeight, viewBox;
    
    if (autoFit) {
      const bounds = calculateContentBounds();
      exportWidth = bounds.width + padding * 2;
      exportHeight = bounds.height + padding * 2;
      viewBox = `${bounds.x - padding} ${bounds.y - padding} ${exportWidth} ${exportHeight}`;
    } else {
      exportWidth = svg.clientWidth;
      exportHeight = svg.clientHeight;
      viewBox = svg.getAttribute('viewBox') || `0 0 ${exportWidth} ${exportHeight}`;
    }
    
    // Update clone viewBox
    clone.setAttribute('viewBox', viewBox);
    clone.setAttribute('width', exportWidth);
    clone.setAttribute('height', exportHeight);
    
    // Embed styles
    const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleElement.textContent = getEmbeddedStyles();
    clone.insertBefore(styleElement, clone.firstChild);
    
    // Add white background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', autoFit ? (parseFloat(viewBox.split(' ')[0])) : 0);
    bg.setAttribute('y', autoFit ? (parseFloat(viewBox.split(' ')[1])) : 0);
    bg.setAttribute('width', exportWidth);
    bg.setAttribute('height', exportHeight);
    bg.setAttribute('fill', 'white');
    clone.insertBefore(bg, clone.firstChild);
    
    // Serialize
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Create image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth * scale;
      canvas.height = exportHeight * scale;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
      
      // Download
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${state.currentAssemblyName || 'assembly'}_tree.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(`PNG downloaded (${scale}x, ${Math.round(canvas.width)}×${Math.round(canvas.height)}px)`, 'success');
      }, 'image/png');
      
      URL.revokeObjectURL(url);
    };
    
    img.onerror = () => {
      showToast('Failed to generate PNG', 'error');
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  } catch (e) {
    console.error('Error generating PNG:', e);
    showToast('Failed to generate PNG', 'error');
  }
}

// ============================================================
// DOWNLOAD SVG
// ============================================================
export function downloadSVG(scale = 1, padding = 40, autoFit = true) {
  closeAllDropdowns();
  
  const svg = document.getElementById('treeSvg');
  if (!svg) return;
  
  try {
    // Clone SVG
    const clone = svg.cloneNode(true);
    
    // Remove collapse indicators and lock icons for clean export
    cleanSvgForExport(clone);
    
    // Calculate content bounds if auto-fit
    let exportWidth, exportHeight, viewBox;
    
    if (autoFit) {
      const bounds = calculateContentBounds();
      exportWidth = (bounds.width + padding * 2) * scale;
      exportHeight = (bounds.height + padding * 2) * scale;
      viewBox = `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`;
    } else {
      exportWidth = svg.clientWidth * scale;
      exportHeight = svg.clientHeight * scale;
      viewBox = svg.getAttribute('viewBox') || `0 0 ${svg.clientWidth} ${svg.clientHeight}`;
    }
    
    // Update clone viewBox and dimensions
    clone.setAttribute('viewBox', viewBox);
    clone.setAttribute('width', exportWidth);
    clone.setAttribute('height', exportHeight);
    
    // Embed styles
    const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleElement.textContent = getEmbeddedStyles();
    clone.insertBefore(styleElement, clone.firstChild);
    
    // Add white background
    const viewBoxParts = viewBox.split(' ').map(Number);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', viewBoxParts[0]);
    bg.setAttribute('y', viewBoxParts[1]);
    bg.setAttribute('width', viewBoxParts[2]);
    bg.setAttribute('height', viewBoxParts[3]);
    bg.setAttribute('fill', 'white');
    clone.insertBefore(bg, clone.firstChild);
    
    // Serialize and download
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.currentAssemblyName || 'assembly'}_tree.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    
    showToast(`SVG downloaded (${Math.round(exportWidth)}×${Math.round(exportHeight)})`, 'success');
  } catch (e) {
    console.error('Error generating SVG:', e);
    showToast('Failed to generate SVG', 'error');
  }
}

// ============================================================
// CLEAN SVG FOR EXPORT - Remove UI elements
// ============================================================
function cleanSvgForExport(svgClone) {
  // CRITICAL: Remove zoom transform from the zoom-group
  // Without this, the viewBox targets raw node positions but the zoom transform
  // shifts the rendered content, causing massive white space in exports
  const zoomGroup = svgClone.querySelector('g.zoom-group');
  if (zoomGroup) {
    zoomGroup.removeAttribute('transform');
  }
  
  // Remove collapse indicators (circles with +/- signs)
  const collapseIndicators = svgClone.querySelectorAll('.collapse-indicator');
  collapseIndicators.forEach(el => el.remove());
  
  // Remove toggle icons (+/- text)
  const toggleIcons = svgClone.querySelectorAll('.toggle-icon');
  toggleIcons.forEach(el => el.remove());
  
  // Remove lock indicators
  const lockIndicators = svgClone.querySelectorAll('.lock-indicator');
  lockIndicators.forEach(el => el.remove());
  
  // Remove any clickable areas that shouldn't be in export
  const clickables = svgClone.querySelectorAll('.link-clickable');
  clickables.forEach(el => {
    // Keep the element but remove hover/click styling
    el.style.cursor = 'default';
  });
}

// ============================================================
// EMBEDDED STYLES FOR EXPORT
// ============================================================
function getEmbeddedStyles() {
  // Build font size CSS for each level
  const fontSizeStyles = LEVEL_FONT_SIZES.map((size, i) => 
    `.node[data-level="${i+1}"] .node-label { font-size: ${size}px; font-weight: ${LEVEL_FONT_WEIGHTS[i]}; }`
  ).join('\n');
  
  return `
    text {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .node-label {
      font-weight: 500;
      fill: #333;
    }
    .node-pn {
      fill: #666;
      font-style: italic;
      font-size: 7px;
    }
    .link {
      fill: none;
      stroke-linecap: round;
    }
    .link-label {
      font-size: 9px;
      font-weight: 600;
    }
    .link-label-bg {
      fill: white;
      opacity: 0.95;
    }
    .sequence-number {
      font-size: 16px;
      font-weight: 700;
      fill: #000000;
    }
    .sequence-badge-bg {
      fill: #e74c3c;
      stroke: #c0392b;
      stroke-width: 1.5px;
    }
    .sequence-badge-text {
      font-size: 12px;
      font-weight: 700;
      fill: #ffffff;
    }
    .sequence-badge {
      font-size: 11px;
      font-weight: bold;
      fill: #e74c3c;
    }
    .toggle-icon {
      font-size: 10px;
      font-weight: bold;
      fill: #333;
    }
    .lock-indicator {
      font-size: 10px;
    }
    .collapse-indicator {
      fill: #ffffff;
      stroke: #333;
      stroke-width: 1.5px;
    }
    .level-header-bg {
      fill: #3498db;
      opacity: 0.9;
    }
    .level-header-text {
      fill: white;
      font-size: 14px;
      font-weight: 600;
    }
    .group-separator {
      stroke: #bdc3c7;
      stroke-width: 1;
      stroke-dasharray: 8,4;
      opacity: 0.7;
    }
    ${fontSizeStyles}
  `;
}

// ============================================================
// EXPORTS TO WINDOW
// ============================================================
window.downloadPNG = downloadPNG;
window.downloadSVG = downloadSVG;
window.downloadCSV = downloadCSV;

// ============================================================
// DOWNLOAD CSV
// ============================================================
export function downloadCSV() {
  closeAllDropdowns();
  
  if (state.nodes.length === 0) {
    showToast('No nodes to export', 'warning');
    return;
  }
  
  try {
    // Build node lookup map
    const nodeMap = new Map();
    state.nodes.forEach(n => {
      if (!n.deleted) {
        nodeMap.set(n.id, n);
      }
    });
    
    // Build parent lookup from links
    const parentMap = new Map(); // child_id -> parent node
    const linkInfoMap = new Map(); // child_id -> link info
    
    state.links.forEach(link => {
      if (link.deleted) return;
      const parent = nodeMap.get(link.parent_id);
      if (parent) {
        parentMap.set(link.child_id, parent);
        linkInfoMap.set(link.child_id, link);
      }
    });
    
    // CSV header
    const headers = ['child', 'parent', 'child_pn', 'fastener', 'qty', 'loctite', 'torque'];
    const rows = [headers.join(',')];
    
    // Add each node as a row
    state.nodes.forEach(node => {
      if (node.deleted) return;
      
      const parent = parentMap.get(node.id);
      const linkInfo = linkInfoMap.get(node.id);
      
      const row = [
        escapeCSV(node.name),
        escapeCSV(parent?.name || ''),
        escapeCSV(node.part_number || ''),
        escapeCSV(linkInfo?.fastener || ''),
        linkInfo?.qty || '',
        escapeCSV(linkInfo?.loctite || ''),
        linkInfo?.torque_value || ''
      ];
      
      rows.push(row.join(','));
    });
    
    // Create and download CSV
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.currentAssemblyName || 'assembly'}_tree.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    
    showToast(`Exported ${state.nodes.filter(n => !n.deleted).length} nodes to CSV`, 'success');
  } catch (e) {
    console.error('Error generating CSV:', e);
    showToast('Failed to generate CSV', 'error');
  }
}

// ============================================================
// ESCAPE CSV VALUE
// ============================================================
function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================================
// BOM LIST VIEW — Full inline editing
// ============================================================
let _bomCollapsed = new Set();

function buildBOMTree() {
  const nodeMap = new Map();
  state.nodes.filter(n => !n.deleted).forEach(n => nodeMap.set(n.id, n));
  
  const parentToChildren = {};
  const childToLinks = {};
  
  state.links.forEach(link => {
    if (link.deleted) return;
    if (!parentToChildren[link.parent_id]) parentToChildren[link.parent_id] = [];
    parentToChildren[link.parent_id].push(link.child_id);
    childToLinks[link.child_id] = link;
  });
  
  const childIds = new Set(state.links.filter(l => !l.deleted).map(l => l.child_id));
  const roots = state.nodes.filter(n => !n.deleted && !childIds.has(n.id));
  
  const rows = [];
  let rowNum = 0;
  
  function walk(nodeId, depth) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    
    const link = childToLinks[nodeId] || null;
    const children = parentToChildren[nodeId] || [];
    const hasChildren = children.length > 0;
    const isCollapsed = _bomCollapsed.has(nodeId);
    rowNum++;
    
    rows.push({
      rowNum,
      id: node.id,
      linkId: link?.id || null,
      depth,
      name: node.name,
      partNumber: node.part_number || '',
      qty: node.qty || 1,
      status: node.status || 'NOT_STARTED',
      level: node.level || 1,
      fastener: link?.fastener || '',
      fastenerQty: link?.qty || 1,
      loctite: link?.loctite || '',
      torque: link?.torque_value || '',
      torqueUnit: link?.torque_unit || 'Nm',
      hasChildren,
      isCollapsed,
      notes: node.notes || ''
    });
    
    if (!isCollapsed) {
      const sorted = children
        .map(cid => nodeMap.get(cid))
        .filter(Boolean)
        .sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));
      sorted.forEach(child => walk(child.id, depth + 1));
    }
  }
  
  roots.sort((a, b) => (a.sequence_num || 0) - (b.sequence_num || 0));
  roots.forEach(r => walk(r.id, 0));
  
  return rows;
}

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: '⚪ Not Started' },
  { value: 'IN_PROGRESS', label: '🟡 In Progress' },
  { value: 'DONE', label: '🟢 Done' },
  { value: 'BLOCKED', label: '🔴 Blocked' },
  { value: 'ON_HOLD', label: '🟣 On Hold' },
  { value: 'REVIEW', label: '🔵 Review' }
];

const STATUS_ICONS = {
  'NOT_STARTED': '⚪', 'IN_PROGRESS': '🟡', 'DONE': '🟢',
  'BLOCKED': '🔴', 'ON_HOLD': '🟣', 'REVIEW': '🔵'
};

function renderBOMTable() {
  const rows = buildBOMTree();
  const wrap = document.getElementById('bomTableWrap');
  const isAdmin = state.isAdmin;
  
  const statusOpts = STATUS_OPTIONS.map(s => 
    `<option value="${s.value}">${s.label}</option>`
  ).join('');
  
  let html = `
    <table class="bom-table" id="bomTable">
      <thead>
        <tr>
          <th class="bom-col-num">#</th>
          <th class="bom-col-tree">Component</th>
          <th class="bom-col-pn">Part Number</th>
          <th class="bom-col-qty">Qty</th>
          <th class="bom-col-status">Status</th>
          <th class="bom-col-fastener">Fastener</th>
          <th class="bom-col-fqty">F.Qty</th>
          <th class="bom-col-lt">Loctite</th>
          <th class="bom-col-torque">Torque</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  rows.forEach(row => {
    const indent = row.depth * 20;
    const toggle = row.hasChildren 
      ? `<span class="bom-toggle" onclick="window.bomToggle('${row.id}')">${row.isCollapsed ? '▶' : '▼'}</span>` 
      : `<span class="bom-toggle-spacer"></span>`;
    const levelBadge = `<span class="bom-level-badge bom-level-${row.level}">L${row.level}</span>`;
    const qtyHighlight = row.qty > 1 ? 'bom-qty-highlight' : '';
    
    if (isAdmin) {
      html += `
        <tr class="bom-row bom-depth-${Math.min(row.depth, 5)}" data-id="${row.id}" data-link-id="${row.linkId || ''}">
          <td class="bom-col-num">${row.rowNum}</td>
          <td class="bom-col-tree">
            <span style="display:inline-block;width:${indent}px;"></span>
            ${toggle}
            ${levelBadge}
            <input type="text" class="bom-edit-input bom-edit-name" value="${escapeAttr(row.name)}" 
              data-field="name" data-id="${row.id}" onchange="window.bomSaveNode('${row.id}',this)">
          </td>
          <td class="bom-col-pn">
            <input type="text" class="bom-edit-input bom-edit-pn" value="${escapeAttr(row.partNumber)}" 
              placeholder="—" data-field="part_number" data-id="${row.id}" onchange="window.bomSaveNode('${row.id}',this)">
          </td>
          <td class="bom-col-qty ${qtyHighlight}">
            <input type="number" class="bom-qty-input" value="${row.qty}" min="1" 
              data-field="qty" data-id="${row.id}" onchange="window.bomSaveNode('${row.id}',this)">
          </td>
          <td class="bom-col-status">
            <select class="bom-edit-select" data-field="status" data-id="${row.id}" onchange="window.bomSaveNode('${row.id}',this)">
              ${STATUS_OPTIONS.map(s => `<option value="${s.value}" ${row.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </td>
          <td class="bom-col-fastener">
            <input type="text" class="bom-edit-input bom-edit-fastener" value="${escapeAttr(row.fastener)}" 
              placeholder="—" data-field="fastener" data-link-id="${row.linkId || ''}" onchange="window.bomSaveLink('${row.linkId}',this)">
          </td>
          <td class="bom-col-fqty">
            <input type="number" class="bom-edit-input bom-edit-fqty" value="${row.fastener ? row.fastenerQty : ''}" min="1"
              placeholder="—" data-field="qty" data-link-id="${row.linkId || ''}" onchange="window.bomSaveLink('${row.linkId}',this)"
              ${!row.linkId ? 'disabled' : ''}>
          </td>
          <td class="bom-col-lt">
            <input type="text" class="bom-edit-input bom-edit-lt" value="${escapeAttr(row.loctite)}" 
              placeholder="—" data-field="loctite" data-link-id="${row.linkId || ''}" onchange="window.bomSaveLink('${row.linkId}',this)"
              ${!row.linkId ? 'disabled' : ''}>
          </td>
          <td class="bom-col-torque">
            <input type="text" class="bom-edit-input bom-edit-torque" value="${row.torque ? row.torque + row.torqueUnit : ''}" 
              placeholder="—" data-field="torque_value" data-link-id="${row.linkId || ''}" onchange="window.bomSaveTorque('${row.linkId}',this)"
              ${!row.linkId ? 'disabled' : ''}>
          </td>
        </tr>
      `;
    } else {
      // Read-only for guests
      html += `
        <tr class="bom-row bom-depth-${Math.min(row.depth, 5)}" data-id="${row.id}">
          <td class="bom-col-num">${row.rowNum}</td>
          <td class="bom-col-tree">
            <span style="display:inline-block;width:${indent}px;"></span>
            ${toggle}
            ${levelBadge}
            <span class="bom-name">${escapeHtml(row.name)}</span>
          </td>
          <td class="bom-col-pn">${escapeHtml(row.partNumber)}</td>
          <td class="bom-col-qty">${row.qty}</td>
          <td class="bom-col-status">${STATUS_ICONS[row.status] || '⚪'}</td>
          <td class="bom-col-fastener">${escapeHtml(row.fastener)}</td>
          <td class="bom-col-fqty">${row.fastener ? row.fastenerQty : ''}</td>
          <td class="bom-col-lt">${row.loctite ? 'LT-' + escapeHtml(row.loctite) : ''}</td>
          <td class="bom-col-torque">${row.torque ? row.torque + row.torqueUnit : ''}</td>
        </tr>
      `;
    }
  });
  
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// BOM INLINE SAVE — Node fields
// ============================================================
let _bomSaveDebounce = {};

async function bomSaveNode(nodeId, el) {
  const field = el.dataset.field;
  let value = el.value;
  
  if (field === 'qty') value = parseInt(value) || 1;
  if (field === 'name' && !value.trim()) {
    showToast('Name cannot be empty', 'error');
    return;
  }
  
  const updates = { [field]: value || null, updated_at: new Date().toISOString() };
  
  try {
    await db.from('logi_nodes').update(updates).eq('id', nodeId);
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) node[field] = value;
    el.classList.add('bom-saved');
    setTimeout(() => el.classList.remove('bom-saved'), 600);
  } catch (e) {
    console.error('BOM save node error:', e);
    showToast('Save failed', 'error');
  }
}

// ============================================================
// BOM INLINE SAVE — Link fields (fastener, qty, loctite)
// ============================================================
async function bomSaveLink(linkId, el) {
  if (!linkId || linkId === 'null') return;
  
  const field = el.dataset.field;
  let value = el.value;
  if (field === 'qty') value = parseInt(value) || 1;
  
  const updates = { [field]: value || null };
  
  try {
    await db.from('logi_links').update(updates).eq('id', linkId);
    const link = state.links.find(l => l.id === linkId);
    if (link) link[field] = value;
    el.classList.add('bom-saved');
    setTimeout(() => el.classList.remove('bom-saved'), 600);
  } catch (e) {
    console.error('BOM save link error:', e);
    showToast('Save failed', 'error');
  }
}

// Special handler for torque (parses "22Nm" into value + unit)
async function bomSaveTorque(linkId, el) {
  if (!linkId || linkId === 'null') return;
  
  const raw = el.value.trim();
  let torqueValue = null;
  let torqueUnit = 'Nm';
  
  if (raw) {
    const match = raw.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      torqueValue = parseFloat(match[1]) || null;
      torqueUnit = match[2].trim() || 'Nm';
    }
  }
  
  try {
    await db.from('logi_links').update({ torque_value: torqueValue, torque_unit: torqueUnit }).eq('id', linkId);
    const link = state.links.find(l => l.id === linkId);
    if (link) { link.torque_value = torqueValue; link.torque_unit = torqueUnit; }
    el.classList.add('bom-saved');
    setTimeout(() => el.classList.remove('bom-saved'), 600);
  } catch (e) {
    console.error('BOM save torque error:', e);
    showToast('Save failed', 'error');
  }
}

// ============================================================
// BOM OPEN / CLOSE / TOGGLE
// ============================================================
export function openBOMList() {
  if (state.nodes.length === 0) {
    showToast('No nodes to show', 'warning');
    return;
  }
  document.getElementById('bomAssemblyName').textContent = state.currentAssemblyName || 'Assembly';
  document.getElementById('bomOverlay').classList.add('show');
  _bomCollapsed.clear();
  renderBOMTable();
}

function closeBOMList() {
  document.getElementById('bomOverlay').classList.remove('show');
  // Refresh tree to reflect any edits made in BOM
  import('./graph.js').then(m => m.loadAssemblyData(state.currentAssemblyId));
}

function bomToggle(nodeId) {
  if (_bomCollapsed.has(nodeId)) _bomCollapsed.delete(nodeId);
  else _bomCollapsed.add(nodeId);
  renderBOMTable();
}

function bomExpandAll() {
  _bomCollapsed.clear();
  renderBOMTable();
}

function bomCollapseAll() {
  state.nodes.forEach(n => {
    const children = state.links.filter(l => l.parent_id === n.id && !l.deleted);
    if (children.length > 0) _bomCollapsed.add(n.id);
  });
  renderBOMTable();
}

// Legacy single-field update (kept for compat)
async function bomUpdateQty(nodeId, value) {
  const el = { dataset: { field: 'qty' }, value, classList: { add(){}, remove(){} } };
  await bomSaveNode(nodeId, el);
}

// ============================================================
// BOM CSV IMPORT (update existing nodes)
// ============================================================
async function bomHandleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  
  const text = await file.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) { showToast('CSV needs header + data rows', 'error'); return; }
  
  const hdr = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  
  // Find column indices
  const ci = (names) => hdr.findIndex(h => names.includes(h));
  const nameIdx = ci(['component', 'child', 'child_name', 'name']);
  const pnIdx = ci(['part_number', 'child_pn', 'pn', 'part number']);
  const qtyIdx = ci(['qty', 'quantity']);
  const statusIdx = ci(['status']);
  const fastenerIdx = ci(['fastener']);
  const fqtyIdx = ci(['f.qty', 'fqty', 'fastener_qty', 'f_qty']);
  const loctiteIdx = ci(['loctite', 'lt']);
  const torqueIdx = ci(['torque', 'torque_value']);
  
  if (nameIdx === -1) { showToast('CSV must have a "component" or "child" column', 'error'); return; }
  
  // Build lookup maps
  const nodeByName = new Map();
  state.nodes.forEach(n => nodeByName.set(n.name.toLowerCase(), n));
  
  const linkByChildId = new Map();
  state.links.forEach(l => { if (!l.deleted) linkByChildId.set(l.child_id, l); });
  
  let updated = 0;
  let skipped = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const name = vals[nameIdx]?.trim();
    if (!name) continue;
    
    const node = nodeByName.get(name.toLowerCase());
    if (!node) { skipped++; continue; }
    
    // Update node fields
    const nodeUpdates = {};
    if (pnIdx !== -1 && vals[pnIdx]) { nodeUpdates.part_number = vals[pnIdx]; node.part_number = vals[pnIdx]; }
    if (qtyIdx !== -1 && vals[qtyIdx]) { nodeUpdates.qty = parseInt(vals[qtyIdx]) || 1; node.qty = nodeUpdates.qty; }
    if (statusIdx !== -1 && vals[statusIdx]) { nodeUpdates.status = vals[statusIdx].toUpperCase(); node.status = nodeUpdates.status; }
    
    if (Object.keys(nodeUpdates).length > 0) {
      nodeUpdates.updated_at = new Date().toISOString();
      await db.from('logi_nodes').update(nodeUpdates).eq('id', node.id);
    }
    
    // Update link fields
    const link = linkByChildId.get(node.id);
    if (link) {
      const linkUpdates = {};
      if (fastenerIdx !== -1 && vals[fastenerIdx]) { linkUpdates.fastener = vals[fastenerIdx]; link.fastener = vals[fastenerIdx]; }
      if (fqtyIdx !== -1 && vals[fqtyIdx]) { linkUpdates.qty = parseInt(vals[fqtyIdx]) || 1; link.qty = linkUpdates.qty; }
      if (loctiteIdx !== -1 && vals[loctiteIdx]) {
        const lt = vals[loctiteIdx].replace(/^LT-/i, '');
        linkUpdates.loctite = lt; link.loctite = lt;
      }
      if (torqueIdx !== -1 && vals[torqueIdx]) {
        const tm = vals[torqueIdx].match(/^([\d.]+)\s*(.*)$/);
        if (tm) { linkUpdates.torque_value = parseFloat(tm[1]); linkUpdates.torque_unit = tm[2] || 'Nm'; link.torque_value = linkUpdates.torque_value; link.torque_unit = linkUpdates.torque_unit; }
      }
      
      if (Object.keys(linkUpdates).length > 0) {
        await db.from('logi_links').update(linkUpdates).eq('id', link.id);
      }
    }
    
    updated++;
  }
  
  showToast(`Updated ${updated} rows${skipped > 0 ? `, ${skipped} not found` : ''}`, 'success');
  renderBOMTable();
}

// ============================================================
// BOM EXPORT CSV
// ============================================================
function bomExportCSV() {
  const rows = buildBOMTree();
  const headers = ['#', 'Level', 'Component', 'Part Number', 'Qty', 'Status', 'Fastener', 'F.Qty', 'Loctite', 'Torque'];
  const csvRows = [headers.join(',')];
  
  rows.forEach(row => {
    const indent = '  '.repeat(row.depth);
    csvRows.push([
      row.rowNum,
      `L${row.level}`,
      escapeCSV(indent + row.name),
      escapeCSV(row.partNumber),
      row.qty,
      row.status,
      escapeCSV(row.fastener),
      row.fastener ? row.fastenerQty : '',
      row.loctite ? 'LT-' + row.loctite : '',
      row.torque ? row.torque + row.torqueUnit : ''
    ].join(','));
  });
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.currentAssemblyName || 'assembly'}_BOM.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('BOM exported', 'success');
}

// ============================================================
// BOM PRINT VIEW
// ============================================================
function bomPrint() {
  const rows = buildBOMTree();
  const title = state.currentAssemblyName || 'Assembly';
  const date = new Date().toLocaleDateString();
  const totalParts = rows.length;
  
  let tableRows = '';
  rows.forEach(row => {
    const indent = '&nbsp;&nbsp;'.repeat(row.depth);
    const bg = row.depth === 0 ? '#e8f5e9' : (row.depth % 2 === 0 ? '#fafafa' : '#fff');
    const fw = row.level <= 2 ? 'bold' : 'normal';
    
    tableRows += `<tr style="background:${bg}">
      <td style="padding:4px 8px;border:1px solid #ccc;text-align:center;color:#888;font-size:11px;">${row.rowNum}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;font-weight:${fw};">
        ${indent}<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;background:${row.level===1?'#a5d6a7':row.level===2?'#e1bee7':'#b3e5fc'};margin-right:4px;">L${row.level}</span>${escapeHtml(row.name)}
      </td>
      <td style="padding:4px 8px;border:1px solid #ccc;font-size:11px;color:#555;">${escapeHtml(row.partNumber)}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;text-align:center;font-weight:${row.qty > 1 ? 'bold;color:#e74c3c' : 'normal'};">${row.qty}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${STATUS_ICONS[row.status] || '⚪'}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;color:#3498db;font-size:11px;">${escapeHtml(row.fastener)}${row.fastener && row.fastenerQty > 1 ? ' ×' + row.fastenerQty : ''}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;color:#9b59b6;font-size:11px;">${row.loctite ? 'LT-' + escapeHtml(row.loctite) : ''}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;color:#e67e22;font-size:11px;">${row.torque ? row.torque + row.torqueUnit : ''}</td>
    </tr>`;
  });
  
  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BOM - ${escapeHtml(title)}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 20px; color: #333; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
  @media print { body { margin: 10px; } h1 { font-size: 16px; } }
</style></head><body>
<h1>📋 BOM — ${escapeHtml(title)}</h1>
<div class="meta">📅 ${date} &nbsp; | &nbsp; ${totalParts} items</div>
<table>
  <thead><tr>
    <th style="width:30px;">#</th><th>Component</th><th>Part Number</th>
    <th style="width:40px;">Qty</th><th style="width:40px;">Status</th>
    <th>Fastener</th><th>Loctite</th><th>Torque</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<script>window.print();<\/script>
</body></html>`;
  
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(printHTML);
  win.document.close();
}

// Window exports
window.openBOMList = openBOMList;
window.closeBOMList = closeBOMList;
window.bomToggle = bomToggle;
window.bomExpandAll = bomExpandAll;
window.bomCollapseAll = bomCollapseAll;
window.bomUpdateQty = bomUpdateQty;
window.bomExportCSV = bomExportCSV;
window.bomSaveNode = bomSaveNode;
window.bomSaveLink = bomSaveLink;
window.bomSaveTorque = bomSaveTorque;
window.bomHandleCSVImport = bomHandleCSVImport;
window.bomPrint = bomPrint;
