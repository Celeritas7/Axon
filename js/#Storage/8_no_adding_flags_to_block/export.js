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
  
  function walk(nodeId, depth, parentName) {
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
      parentName: parentName || '',
      partNumber: node.part_number || '',
      qty: node.qty || 1,
      seq: node.sequence_num || 0,
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
      sorted.forEach(child => walk(child.id, depth + 1, node.name));
    }
  }
  
  roots.sort((a, b) => (a.sequence_num || 0) - (b.sequence_num || 0));
  roots.forEach(r => walk(r.id, 0, ''));
  
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
          ${isAdmin ? '<th class="bom-col-sel"><input type="checkbox" id="bomSelectAll" onchange="window.bomSelectAll(this.checked)" title="Select All"></th>' : ''}
          <th class="bom-col-num">#</th>
          <th class="bom-col-seq">Seq</th>
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
          <td class="bom-col-sel"><input type="checkbox" class="bom-sel-cb" data-id="${row.id}" onchange="window.bomUpdateSelection()"></td>
          <td class="bom-col-num">${row.rowNum}</td>
          <td class="bom-col-seq">
            <input type="number" class="bom-edit-input bom-edit-seq" value="${row.seq || ''}" min="0"
              placeholder="—" data-field="sequence_num" data-id="${row.id}" onchange="window.bomSaveSeq('${row.id}',this)">
          </td>
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
          <td class="bom-col-seq">${row.seq || ''}</td>
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
  const parentIdx = ci(['parent', 'parent_name']);
  const levelIdx = ci(['level']);
  const pnIdx = ci(['part_number', 'child_pn', 'pn', 'part number']);
  const qtyIdx = ci(['qty', 'quantity']);
  const statusIdx = ci(['status']);
  const fastenerIdx = ci(['fastener']);
  const fqtyIdx = ci(['f.qty', 'fqty', 'fastener_qty', 'f_qty']);
  const loctiteIdx = ci(['loctite', 'lt']);
  const torqueIdx = ci(['torque', 'torque_value']);
  const seqIdx = ci(['seq', 'sequence', 'seq_num', '#']);
  
  if (nameIdx === -1) { showToast('CSV must have a "component" or "child" column', 'error'); return; }
  
  const assemblyId = state.currentAssemblyId;
  
  // Parse all rows
  const rawRows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const rawName = vals[nameIdx];
    if (!rawName) continue;
    
    // Strip leading whitespace/indentation from component name
    const name = rawName.trim();
    if (!name) continue;
    
    // Parse level: from "L2" or "L3" column, or from indentation
    let level = 0;
    if (levelIdx !== -1 && vals[levelIdx]) {
      level = parseInt(vals[levelIdx].replace(/^L/i, '')) || 0;
    }
    
    rawRows.push({
      name,
      level,
      parent: parentIdx !== -1 ? vals[parentIdx]?.trim() : '',
      partNumber: pnIdx !== -1 ? vals[pnIdx]?.trim() : '',
      qty: qtyIdx !== -1 ? (parseInt(vals[qtyIdx]) || 1) : 1,
      status: statusIdx !== -1 ? vals[statusIdx]?.trim().toUpperCase() : '',
      fastener: fastenerIdx !== -1 ? vals[fastenerIdx]?.trim() : '',
      fqty: fqtyIdx !== -1 ? (parseInt(vals[fqtyIdx]) || 1) : 1,
      loctite: loctiteIdx !== -1 ? vals[loctiteIdx]?.trim().replace(/^LT-/i, '') : '',
      torque: torqueIdx !== -1 ? vals[torqueIdx]?.trim() : '',
      seq: seqIdx !== -1 ? (parseInt(vals[seqIdx]) || 0) : 0
    });
  }
  
  // If we have levels but no parent column, infer parents from level hierarchy
  const hasLevels = levelIdx !== -1 && rawRows.some(r => r.level > 0);
  const hasParents = parentIdx !== -1 && rawRows.some(r => r.parent);
  
  if (hasLevels && !hasParents) {
    // Stack tracks the most recent node at each level
    // Parent of an Ln node = most recent node at L(n-1)
    const levelStack = {}; // level → name
    
    rawRows.forEach(row => {
      if (row.level > 1) {
        row.parent = levelStack[row.level - 1] || '';
      }
      levelStack[row.level] = row.name;
    });
  }
  
  // Build lookup maps — only match against nodes already in DB (not created during this import)
  const existingByName = new Map();
  state.nodes.forEach(n => existingByName.set(n.name.toLowerCase(), n));
  
  const linkByChildId = new Map();
  state.links.forEach(l => { if (!l.deleted) linkByChildId.set(l.child_id, l); });
  
  let updated = 0;
  let created = 0;
  
  // For level-based import: track node IDs by row position, not name
  // This handles duplicate names (e.g. "CE BLDC Panel" appearing twice under different parents)
  const levelNodeStack = {}; // level → most recent node ID at that level
  
  // For parent-column import: track by name (original behavior)
  const createdByName = new Map();
  
  for (const row of rawRows) {
    // Determine parent node ID
    let parentNodeId = null;
    if (row.parent) {
      // Check level stack first (for level-based), then created map, then existing DB nodes
      const parentFromCreated = createdByName.get(row.parent.toLowerCase());
      const parentFromDB = existingByName.get(row.parent.toLowerCase());
      parentNodeId = parentFromCreated || parentFromDB?.id || null;
    }
    
    // For level-based imports, use the level stack for parent resolution
    if (hasLevels && !hasParents && row.level > 1) {
      parentNodeId = levelNodeStack[row.level - 1] || null;
    }
    
    // Check if this EXACT node already exists in DB (first occurrence only, skip if level-based with dupes)
    let existingNode = existingByName.get(row.name.toLowerCase());
    
    // If level-based: only match existing DB node for the FIRST occurrence
    // For subsequent rows with same name, always create new node
    if (hasLevels && existingNode && existingNode._bomImportUsed) {
      existingNode = null; // force create
    }
    
    if (existingNode && !existingNode._bomImportUsed) {
      // ---- UPDATE existing node ----
      existingNode._bomImportUsed = true; // mark so second occurrence creates new
      
      const nodeUpdates = {};
      if (row.partNumber) { nodeUpdates.part_number = row.partNumber; existingNode.part_number = row.partNumber; }
      if (row.qty > 1 || (qtyIdx !== -1)) { nodeUpdates.qty = row.qty; existingNode.qty = row.qty; }
      if (row.status) { nodeUpdates.status = row.status; existingNode.status = row.status; }
      
      if (Object.keys(nodeUpdates).length > 0) {
        nodeUpdates.updated_at = new Date().toISOString();
        await db.from('logi_nodes').update(nodeUpdates).eq('id', existingNode.id);
      }
      
      // Update link fields if link exists
      const link = linkByChildId.get(existingNode.id);
      if (link) {
        const linkUpdates = {};
        if (row.fastener) { linkUpdates.fastener = row.fastener; link.fastener = row.fastener; }
        if (row.fqty > 1 || row.fastener) { linkUpdates.qty = row.fqty; link.qty = row.fqty; }
        if (row.loctite) { linkUpdates.loctite = row.loctite; link.loctite = row.loctite; }
        if (row.torque) {
          const tm = row.torque.match(/^([\d.]+)\s*(.*)$/);
          if (tm) { linkUpdates.torque_value = parseFloat(tm[1]); linkUpdates.torque_unit = tm[2] || 'Nm'; }
        }
        if (Object.keys(linkUpdates).length > 0) {
          await db.from('logi_links').update(linkUpdates).eq('id', link.id);
        }
      }
      
      // Track in level stack
      if (hasLevels) levelNodeStack[row.level] = existingNode.id;
      createdByName.set(row.name.toLowerCase(), existingNode.id);
      
      updated++;
    } else {
      // ---- CREATE new node ----
      const newId = crypto.randomUUID();
      
      const { error: nodeErr } = await db.from('logi_nodes').insert({
        id: newId,
        assembly_id: assemblyId,
        name: row.name,
        part_number: row.partNumber || null,
        qty: row.qty,
        sequence_num: row.seq || 0,
        sequence_tag: row.seq > 0 ? String(row.seq) : null,
        status: row.status || 'NOT_STARTED',
        x: 400,
        y: 300,
        deleted: false
      });
      
      if (nodeErr) { console.error('BOM create node error:', nodeErr); continue; }
      
      // Track in level stack and name map
      if (hasLevels) levelNodeStack[row.level] = newId;
      createdByName.set(row.name.toLowerCase(), newId);
      
      // Create link to parent
      if (parentNodeId) {
        const linkData = {
          id: crypto.randomUUID(),
          assembly_id: assemblyId,
          parent_id: parentNodeId,
          child_id: newId,
          fastener: row.fastener || null,
          qty: row.fqty || 1,
          loctite: row.loctite || null,
          torque_value: null,
          torque_unit: null,
          deleted: false
        };
        
        if (row.torque) {
          const tm = row.torque.match(/^([\d.]+)\s*(.*)$/);
          if (tm) { linkData.torque_value = parseFloat(tm[1]); linkData.torque_unit = tm[2] || 'Nm'; }
        }
        
        const { error: linkErr } = await db.from('logi_links').insert(linkData);
        if (linkErr) console.warn('Link create warning:', linkErr.message);
      }
      
      created++;
    }
  }
  
  // Reload full assembly data so tree + BOM reflect new nodes
  if (created > 0) {
    const { loadAssemblyData } = await import('./graph.js');
    await loadAssemblyData(assemblyId);
  }
  
  const msg = [];
  if (updated > 0) msg.push(`${updated} updated`);
  if (created > 0) msg.push(`${created} created`);
  showToast(msg.join(', ') || 'No changes', 'success');
  renderBOMTable();
}

// ============================================================
// BOM EXPORT CSV
// ============================================================
function bomExportCSV() {
  const rows = buildBOMTree();
  const headers = ['seq', 'level', 'component', 'parent', 'part_number', 'qty', 'status', 'fastener', 'f.qty', 'loctite', 'torque'];
  const csvRows = [headers.join(',')];
  
  rows.forEach(row => {
    csvRows.push([
      row.seq || '',
      `L${row.level}`,
      escapeCSV(row.name),
      escapeCSV(row.parentName),
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

// Save sequence — updates both sequence_num and sequence_tag, then re-renders (order may change)
async function bomSaveSeq(nodeId, el) {
  const seq = parseInt(el.value) || 0;
  try {
    await db.from('logi_nodes').update({
      sequence_num: seq,
      sequence_tag: seq > 0 ? String(seq) : null,
      updated_at: new Date().toISOString()
    }).eq('id', nodeId);
    
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) {
      node.sequence_num = seq;
      node.sequence_tag = seq > 0 ? String(seq) : null;
    }
    
    el.classList.add('bom-saved');
    setTimeout(() => { el.classList.remove('bom-saved'); renderBOMTable(); }, 400);
  } catch (e) {
    console.error('BOM save seq error:', e);
    showToast('Save failed', 'error');
  }
}

window.bomSaveSeq = bomSaveSeq;
window.bomHandleCSVImport = bomHandleCSVImport;
window.bomPrint = bomPrint;

// ============================================================
// BOM BULK SELECT & DELETE
// ============================================================
function bomUpdateSelection() {
  const checked = document.querySelectorAll('.bom-sel-cb:checked');
  const btn = document.getElementById('bomDeleteBtn');
  const count = document.getElementById('bomDeleteCount');
  
  if (checked.length > 0) {
    btn.style.display = '';
    count.textContent = `(${checked.length})`;
  } else {
    btn.style.display = 'none';
  }
  
  // Update select-all checkbox state
  const all = document.querySelectorAll('.bom-sel-cb');
  const selectAllCb = document.getElementById('bomSelectAll');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && checked.length === all.length;
    selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
  }
  
  // Highlight selected rows
  document.querySelectorAll('.bom-row').forEach(tr => {
    const cb = tr.querySelector('.bom-sel-cb');
    tr.classList.toggle('bom-row-selected', cb?.checked || false);
  });
}

function bomSelectAll(checked) {
  document.querySelectorAll('.bom-sel-cb').forEach(cb => { cb.checked = checked; });
  bomUpdateSelection();
}

async function bomDeleteSelected() {
  const checked = document.querySelectorAll('.bom-sel-cb:checked');
  const nodeIds = Array.from(checked).map(cb => cb.dataset.id);
  
  if (nodeIds.length === 0) return;
  
  const confirmMsg = `Delete ${nodeIds.length} node${nodeIds.length > 1 ? 's' : ''} and all their links?\n\nThis cannot be undone.`;
  if (!confirm(confirmMsg)) return;
  
  try {
    // Collect all descendants of selected nodes too
    const allIdsToDelete = new Set(nodeIds);
    const parentToChildren = {};
    state.links.forEach(l => {
      if (l.deleted) return;
      if (!parentToChildren[l.parent_id]) parentToChildren[l.parent_id] = [];
      parentToChildren[l.parent_id].push(l.child_id);
    });
    
    // BFS to find all descendants
    const queue = [...nodeIds];
    while (queue.length > 0) {
      const id = queue.shift();
      const children = parentToChildren[id] || [];
      children.forEach(cid => {
        if (!allIdsToDelete.has(cid)) {
          allIdsToDelete.add(cid);
          queue.push(cid);
        }
      });
    }
    
    // Hard delete related links first
    for (const id of allIdsToDelete) {
      await db.from('logi_links').delete().or(`child_id.eq.${id},parent_id.eq.${id}`);
    }
    
    // Hard delete nodes
    for (const id of allIdsToDelete) {
      await db.from('logi_nodes').delete().eq('id', id);
    }
    
    showToast(`Deleted ${allIdsToDelete.size} node${allIdsToDelete.size > 1 ? 's' : ''}`, 'success');
    
    // Reload assembly
    const { loadAssemblyData } = await import('./graph.js');
    await loadAssemblyData(state.currentAssemblyId);
    renderBOMTable();
    
    // Hide delete button
    document.getElementById('bomDeleteBtn').style.display = 'none';
  } catch (e) {
    console.error('Bulk delete error:', e);
    showToast('Delete failed: ' + e.message, 'error');
  }
}

window.bomUpdateSelection = bomUpdateSelection;
window.bomSelectAll = bomSelectAll;
window.bomDeleteSelected = bomDeleteSelected;


// ============================================================
// PICKUP MODE — Chip-based L2 selector, grouped parts
// ============================================================
let _pickupUnits = 1;
let _pickupState = {};   // { uniqueRowKey: 'picked' | 'missing' }
let _pickupFilter = 'all';
let _pickupScope = '';   // nodeId of selected L2 chip
let _pickupGroups = [];  // grouped parts for current scope

function getPickupStorageKey() {
  return `axon_pickup_${state.currentAssemblyId}_${_pickupScope || 'all'}`;
}

function loadPickupState() {
  try {
    const saved = localStorage.getItem(getPickupStorageKey());
    if (saved) {
      const data = JSON.parse(saved);
      _pickupState = data.checks || {};
      _pickupUnits = data.units || 1;
    } else {
      _pickupState = {};
      _pickupUnits = 1;
    }
  } catch (e) { _pickupState = {}; _pickupUnits = 1; }
}

function savePickupState() {
  try {
    localStorage.setItem(getPickupStorageKey(), JSON.stringify({
      checks: _pickupState,
      units: _pickupUnits
    }));
    localStorage.setItem(`axon_pickup_lastscope_${state.currentAssemblyId}`, _pickupScope);
  } catch (e) {}
}

// Build grouped pickup: parts stay under their parent assembly headers, never merged
function buildGroupedPickup() {
  const nodeMap = new Map();
  state.nodes.filter(n => !n.deleted).forEach(n => nodeMap.set(n.id, n));

  const parentToChildren = {};
  const childToLink = {};
  state.links.forEach(link => {
    if (link.deleted) return;
    if (!parentToChildren[link.parent_id]) parentToChildren[link.parent_id] = [];
    parentToChildren[link.parent_id].push(link.child_id);
    childToLink[link.child_id] = link;
  });

  const groups = [];
  let rowCounter = 0;

  function walkAssembly(nodeId, qtyMultiplier) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const children = parentToChildren[nodeId] || [];
    if (children.length === 0) return;

    const nodeQty = node.qty || 1;
    const effQty = qtyMultiplier * nodeQty;
    const parts = [];
    const fasteners = [];

    // Sort children by sequence
    const sortedChildren = children
      .map(cid => nodeMap.get(cid))
      .filter(Boolean)
      .sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));

    sortedChildren.forEach(child => {
      const link = childToLink[child.id];
      const grandChildren = parentToChildren[child.id] || [];

      // Add fastener from the link
      if (link && link.fastener) {
        rowCounter++;
        fasteners.push({
          key: `f_${link.id}`,
          rowNum: rowCounter,
          name: link.fastener,
          partNumber: '',
          qty: (link.qty || 1) * effQty,
          isFastener: true,
          loctite: link.loctite || '',
          torque: link.torque_value ? `${link.torque_value}${link.torque_unit || 'Nm'}` : '',
          usedWith: child.name
        });
      }

      if (grandChildren.length === 0) {
        // Leaf = part to pick
        rowCounter++;
        parts.push({
          key: `p_${child.id}`,
          rowNum: rowCounter,
          name: child.name,
          partNumber: child.part_number || '',
          qty: (child.qty || 1) * effQty,
          isFastener: false,
          loctite: '',
          torque: '',
          usedWith: ''
        });
      } else {
        // Sub-assembly — recurse
        walkAssembly(child.id, effQty);
      }
    });

    if (parts.length > 0 || fasteners.length > 0) {
      groups.push({
        assemblyName: node.name,
        assemblyLevel: node.level || 1,
        assemblyId: node.id,
        parts,
        fasteners
      });
    }
  }

  rowCounter = 0;
  if (_pickupScope && nodeMap.has(_pickupScope)) {
    walkAssembly(_pickupScope, 1);
  } else {
    const childIds = new Set(state.links.filter(l => !l.deleted).map(l => l.child_id));
    const roots = state.nodes.filter(n => !n.deleted && !childIds.has(n.id));
    roots.forEach(r => walkAssembly(r.id, 1));
  }

  return groups;
}

function getAllPickupItems() {
  return _pickupGroups.flatMap(g => [...g.parts, ...g.fasteners]);
}

// ---- Render ----
function renderPickupTable() {
  _pickupGroups = buildGroupedPickup();
  const wrap = document.getElementById('pickupTableWrap');
  const units = _pickupUnits;

  // Filter function
  let filterFn = () => true;
  if (_pickupFilter === 'pending') filterFn = (item) => !_pickupState[item.key];
  else if (_pickupFilter === 'picked') filterFn = (item) => _pickupState[item.key] === 'picked';
  else if (_pickupFilter === 'missing') filterFn = (item) => _pickupState[item.key] === 'missing';

  let html = '';
  let globalIdx = 0;
  const groupColors = ['#e3f2fd', '#fce4ec', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e0f7fa', '#fff8e1'];

  _pickupGroups.forEach((group, gi) => {
    const allGroupItems = [...group.parts, ...group.fasteners];
    const filteredParts = group.parts.filter(filterFn);
    const filteredFasteners = group.fasteners.filter(filterFn);
    if (filteredParts.length === 0 && filteredFasteners.length === 0 && _pickupFilter !== 'all') return;

    const displayParts = _pickupFilter === 'all' ? group.parts : filteredParts;
    const displayFasteners = _pickupFilter === 'all' ? group.fasteners : filteredFasteners;

    // Group progress
    const groupPicked = allGroupItems.filter(it => _pickupState[it.key] === 'picked').length;
    const groupTotal = allGroupItems.length;
    const groupPct = groupTotal > 0 ? Math.round((groupPicked / groupTotal) * 100) : 0;
    const pctColor = groupPct === 100 ? '#27ae60' : groupPicked > 0 ? '#e67e22' : '#3498db';
    const headerBg = groupColors[gi % groupColors.length];

    html += `<div class="pickup-group">
      <div class="pickup-group-header" style="background:${headerBg};">
        <div class="pickup-group-left">
          <span class="pickup-group-level">L${group.assemblyLevel}</span>
          <span class="pickup-group-name">${escapeHtml(group.assemblyName)}</span>
        </div>
        <div class="pickup-group-right">
          <span class="pickup-group-count" style="color:${pctColor};">${groupPicked}/${groupTotal}</span>
          <div class="pickup-mini-bar"><div class="pickup-mini-fill" style="width:${groupPct}%;background:${pctColor};"></div></div>
        </div>
      </div>`;

    // Parts sub-section
    if (displayParts.length > 0) {
      html += `<div class="pickup-sub-header">📦 Parts</div>`;
      displayParts.forEach((item, idx) => {
        globalIdx++;
        html += renderPickupRow(item, idx, globalIdx, units);
      });
    }

    // Fasteners sub-section
    if (displayFasteners.length > 0) {
      html += `<div class="pickup-sub-header">🔩 Fasteners</div>`;
      displayFasteners.forEach((item, idx) => {
        globalIdx++;
        html += renderPickupRow(item, idx, globalIdx, units);
      });
    }

    html += `</div>`; // close pickup-group
  });

  if (html === '') {
    html = `<div style="padding:40px;text-align:center;color:#999;font-size:14px;">No items match the current filter</div>`;
  }

  wrap.innerHTML = html;
  updatePickupProgress();
}

function renderPickupRow(item, idx, globalIdx, units) {
  const totalQty = item.qty * units;
  const cs = _pickupState[item.key] || '';
  const rowState = cs === 'picked' ? 'pickup-picked' : cs === 'missing' ? 'pickup-missing' : '';
  const stripe = idx % 2 === 0 ? 'pickup-even' : 'pickup-odd';

  return `<div class="pickup-row ${rowState} ${stripe}">
    <div class="pickup-row-num">${globalIdx}</div>
    <div class="pickup-row-checks">
      <button class="pk-ck ${cs === 'picked' ? 'pk-ck-on' : ''}" onclick="window.pickupMark('${item.key}','picked')">✓</button>
      <button class="pk-ms ${cs === 'missing' ? 'pk-ms-on' : ''}" onclick="window.pickupMark('${item.key}','missing')">✗</button>
    </div>
    <div class="pickup-row-body">
      <div class="pickup-row-name ${cs === 'picked' ? 'pk-done' : ''}">
        ${item.isFastener ? '<span class="pk-tag">FASTENER</span>' : ''}${escapeHtml(item.name)}
      </div>
      ${item.partNumber ? `<div class="pickup-row-pn">${escapeHtml(item.partNumber)}</div>` : ''}
      ${item.usedWith ? `<div class="pickup-row-used">→ ${escapeHtml(item.usedWith)}</div>` : ''}
    </div>
    <div class="pickup-row-qty">${totalQty}</div>
    <div class="pickup-row-info">
      ${item.loctite ? `<span class="pk-lt">LT-${escapeHtml(item.loctite)}</span>` : ''}
      ${item.torque ? `<span class="pk-tq">${escapeHtml(item.torque)}</span>` : ''}
    </div>
  </div>`;
}

function updatePickupProgress() {
  const allItems = getAllPickupItems();
  const total = allItems.length;
  const picked = allItems.filter(p => _pickupState[p.key] === 'picked').length;
  const missing = allItems.filter(p => _pickupState[p.key] === 'missing').length;
  const pct = total > 0 ? Math.round((picked / total) * 100) : 0;

  const fill = document.getElementById('pickupProgressFill');
  const text = document.getElementById('pickupProgressText');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct === 100 ? '#27ae60' : missing > 0 ? '#e67e22' : '#3498db';
  }
  if (text) {
    text.textContent = `${picked}/${total} picked${missing > 0 ? ` · ${missing} missing` : ''} — ${pct}%`;
  }
}

// ---- Open / Close / Chips ----
function openPickup() {
  if (state.nodes.length === 0) { showToast('No nodes to show', 'warning'); return; }

  // Restore last scope
  _pickupScope = localStorage.getItem(`axon_pickup_lastscope_${state.currentAssemblyId}`) || '';
  loadPickupState();

  // Build L2 chips
  const l2Nodes = state.nodes
    .filter(n => !n.deleted && n.level === 2)
    .sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));

  const chipsEl = document.getElementById('pickupScopeChips');
  let chipsHtml = `<button class="pickup-chip ${!_pickupScope ? 'chip-active' : ''}" onclick="window.pickupSetScope('')">🔧 All</button>`;
  l2Nodes.forEach(n => {
    const active = _pickupScope === n.id ? 'chip-active' : '';
    chipsHtml += `<button class="pickup-chip ${active}" onclick="window.pickupSetScope('${n.id}')">${escapeHtml(n.name)}</button>`;
  });
  chipsEl.innerHTML = chipsHtml;

  _pickupFilter = 'all';
  document.getElementById('pickupUnits').value = _pickupUnits;
  document.getElementById('pickupOverlay').classList.add('show');
  document.querySelectorAll('.pickup-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  renderPickupTable();
}

function closePickup() {
  document.getElementById('pickupOverlay').classList.remove('show');
}

function pickupSetScope(nodeId) {
  savePickupState();
  _pickupScope = nodeId;
  loadPickupState();
  savePickupState();
  document.getElementById('pickupUnits').value = _pickupUnits;
  _pickupFilter = 'all';
  document.querySelectorAll('.pickup-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  // Update chip active state
  document.querySelectorAll('.pickup-chip').forEach(btn => {
    const chipScope = btn.getAttribute('onclick')?.match(/'([^']*)'/)?.[1] ?? '';
    btn.classList.toggle('chip-active', chipScope === nodeId);
  });
  renderPickupTable();
}

function pickupSetUnits(val) {
  _pickupUnits = Math.max(1, parseInt(val) || 1);
  savePickupState();
  renderPickupTable();
}

function pickupMark(key, markType) {
  if (_pickupState[key] === markType) delete _pickupState[key];
  else _pickupState[key] = markType;
  savePickupState();
  renderPickupTable();
}

function pickupFilter(filter) {
  _pickupFilter = filter;
  document.querySelectorAll('.pickup-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderPickupTable();
}

function pickupReset() {
  if (!confirm('Reset all pickup checkmarks for this scope?')) return;
  _pickupState = {};
  savePickupState();
  renderPickupTable();
  showToast('Pickup list reset', 'info');
}

// ---- Print ----
function pickupPrint() {
  const groups = buildGroupedPickup();
  const units = _pickupUnits;
  const scopeNode = _pickupScope ? state.nodes.find(n => n.id === _pickupScope) : null;
  const title = scopeNode ? scopeNode.name : (state.currentAssemblyName || 'Assembly');
  const date = new Date().toLocaleDateString();
  const allItems = groups.flatMap(g => [...g.parts, ...g.fasteners]);
  const picked = allItems.filter(p => _pickupState[p.key] === 'picked').length;
  const missing = allItems.filter(p => _pickupState[p.key] === 'missing').length;

  let tbody = '';
  groups.forEach(group => {
    const all = [...group.parts, ...group.fasteners];
    const gPicked = all.filter(it => _pickupState[it.key] === 'picked').length;
    tbody += `<tr style="background:#fff3e0;"><td colspan="6" style="padding:8px 10px;font-weight:700;border:1px solid #ddd;font-size:13px;">
      <span style="background:#e67e22;color:white;padding:1px 6px;border-radius:3px;font-size:10px;margin-right:6px;">L${group.assemblyLevel}</span>
      ${escapeHtml(group.assemblyName)} <span style="float:right;color:#888;font-size:11px;">${gPicked}/${all.length}</span></td></tr>`;

    function printItems(items, label) {
      if (items.length === 0) return;
      tbody += `<tr><td colspan="6" style="padding:4px 10px 4px 24px;background:#f5f5f5;font-size:11px;font-weight:600;color:#666;border:1px solid #ddd;">${label}</td></tr>`;
      items.forEach((item, i) => {
        const totalQty = item.qty * units;
        const cs = _pickupState[item.key] || '';
        const bg = cs === 'picked' ? '#d5f5d5' : cs === 'missing' ? '#fdd' : (i % 2 === 0 ? '#fff' : '#f9f9f9');
        const mark = cs === 'picked' ? '✅' : cs === 'missing' ? '❌' : '⬜';
        tbody += `<tr style="background:${bg};">
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:14px;">${mark}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;${cs === 'picked' ? 'text-decoration:line-through;color:#999;' : ''}">
            ${item.isFastener ? '<span style="background:#e67e22;color:white;font-size:8px;padding:1px 4px;border-radius:2px;margin-right:4px;">F</span>' : ''}
            ${escapeHtml(item.name)}${item.usedWith ? ' <span style="color:#aaa;font-size:10px;">→ ' + escapeHtml(item.usedWith) + '</span>' : ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;color:#555;">${escapeHtml(item.partNumber)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;">${totalQty}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;">${item.loctite ? 'LT-' + item.loctite : ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;">${item.torque || ''}</td>
        </tr>`;
      });
    }
    printItems(group.parts, '📦 Parts');
    printItems(group.fasteners, '🔩 Fasteners');
  });

  const printHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pickup - ${escapeHtml(title)}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:20px;color:#333;}h1{font-size:18px;margin-bottom:4px;}
.meta{font-size:12px;color:#666;margin-bottom:16px;}table{width:100%;border-collapse:collapse;font-size:12px;}
th{background:#d35400;color:white;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;}
@media print{body{margin:10px;}}</style></head><body>
<h1>🧺 Pickup — ${escapeHtml(title)}</h1>
<div class="meta">📅 ${date} &nbsp;|&nbsp; ×${units} unit(s) &nbsp;|&nbsp; ${allItems.length} items &nbsp;|&nbsp; ${picked} picked &nbsp;|&nbsp; ${missing} missing</div>
<table><thead><tr><th style="width:30px;">✓</th><th>Item</th><th>Part Number</th><th style="width:50px;">Qty</th><th>Loctite</th><th>Torque</th></tr></thead>
<tbody>${tbody}</tbody></table>
<script>window.print();<\/script></body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(printHTML);
  win.document.close();
}

// Window exports — Pickup
window.openPickup = openPickup;
window.closePickup = closePickup;
window.pickupSetUnits = pickupSetUnits;
window.pickupSetScope = pickupSetScope;
window.pickupMark = pickupMark;
window.pickupFilter = pickupFilter;
window.pickupReset = pickupReset;
window.pickupPrint = pickupPrint;
