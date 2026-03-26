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
// BOM LIST VIEW
// ============================================================
let _bomCollapsed = new Set();

function buildBOMTree() {
  const nodeMap = new Map();
  state.nodes.filter(n => !n.deleted).forEach(n => nodeMap.set(n.id, n));
  
  // Build parent → children map
  const parentToChildren = {};
  const childToLinks = {}; // childId → link (for fastener info)
  
  state.links.forEach(link => {
    if (link.deleted) return;
    if (!parentToChildren[link.parent_id]) parentToChildren[link.parent_id] = [];
    parentToChildren[link.parent_id].push(link.child_id);
    childToLinks[link.child_id] = link;
  });
  
  // Find roots
  const childIds = new Set(state.links.filter(l => !l.deleted).map(l => l.child_id));
  const roots = state.nodes.filter(n => !n.deleted && !childIds.has(n.id));
  
  // Flatten tree in DFS order
  const rows = [];
  
  function walk(nodeId, depth) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    
    const link = childToLinks[nodeId] || null;
    const children = parentToChildren[nodeId] || [];
    const hasChildren = children.length > 0;
    const isCollapsed = _bomCollapsed.has(nodeId);
    
    rows.push({
      id: node.id,
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
      // Sort children by sequence
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

function renderBOMTable() {
  const rows = buildBOMTree();
  const wrap = document.getElementById('bomTableWrap');
  
  const statusLabels = {
    'NOT_STARTED': '⚪',
    'IN_PROGRESS': '🟡',
    'DONE': '🟢',
    'BLOCKED': '🔴',
    'ON_HOLD': '🟣',
    'REVIEW': '🔵'
  };
  
  let html = `
    <table class="bom-table">
      <thead>
        <tr>
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
    const qtyClass = row.qty > 1 ? 'bom-qty-highlight' : '';
    
    html += `
      <tr class="bom-row bom-depth-${Math.min(row.depth, 5)}" data-id="${row.id}">
        <td class="bom-col-tree">
          <span style="display:inline-block;width:${indent}px;"></span>
          ${toggle}
          ${levelBadge}
          <span class="bom-name">${escapeHtml(row.name)}</span>
        </td>
        <td class="bom-col-pn">${escapeHtml(row.partNumber)}</td>
        <td class="bom-col-qty ${qtyClass}">
          <input type="number" class="bom-qty-input" value="${row.qty}" min="1" 
            data-id="${row.id}" onchange="window.bomUpdateQty('${row.id}', this.value)">
        </td>
        <td class="bom-col-status">${statusLabels[row.status] || '⚪'}</td>
        <td class="bom-col-fastener">${escapeHtml(row.fastener)}</td>
        <td class="bom-col-fqty">${row.fastener ? row.fastenerQty : ''}</td>
        <td class="bom-col-lt">${row.loctite ? 'LT-' + escapeHtml(row.loctite) : ''}</td>
        <td class="bom-col-torque">${row.torque ? row.torque + row.torqueUnit : ''}</td>
      </tr>
    `;
  });
  
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
}

function bomToggle(nodeId) {
  if (_bomCollapsed.has(nodeId)) {
    _bomCollapsed.delete(nodeId);
  } else {
    _bomCollapsed.add(nodeId);
  }
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

async function bomUpdateQty(nodeId, value) {
  const qty = parseInt(value) || 1;
  try {
    await db.from('logi_nodes').update({ qty, updated_at: new Date().toISOString() }).eq('id', nodeId);
    
    // Update local state
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) node.qty = qty;
    
    showToast(`Qty updated to ${qty}`, 'success');
  } catch (e) {
    console.error('Failed to update qty:', e);
    showToast('Failed to save qty', 'error');
  }
}

function bomExportCSV() {
  const rows = buildBOMTree();
  const headers = ['Level', 'Component', 'Part Number', 'Qty', 'Status', 'Fastener', 'F.Qty', 'Loctite', 'Torque'];
  const csvRows = [headers.join(',')];
  
  rows.forEach(row => {
    const indent = '  '.repeat(row.depth);
    csvRows.push([
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

// Window exports
window.openBOMList = openBOMList;
window.closeBOMList = closeBOMList;
window.bomToggle = bomToggle;
window.bomExpandAll = bomExpandAll;
window.bomCollapseAll = bomCollapseAll;
window.bomUpdateQty = bomUpdateQty;
window.bomExportCSV = bomExportCSV;
