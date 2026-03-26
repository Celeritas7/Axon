// ============================================================
// Logi Assembly - CSV Import Module
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast, showModal, hideModal, showLoading } from './ui.js';
import { renderGraph, loadAssemblyData } from './graph.js';

// ============================================================
// OPEN FILE DIALOG
// ============================================================
export function openImportCSV() {
  if (!state.currentAssemblyId) {
    showToast('Please select an assembly first', 'warning');
    return;
  }
  document.getElementById('csvFileInput').click();
}

// ============================================================
// HANDLE CSV FILE
// ============================================================
export function handleCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const csvText = e.target.result;
    const parsed = parseCSV(csvText);
    
    if (parsed.error) {
      showToast(parsed.error, 'error');
      return;
    }
    
    showImportPreview(parsed);
  };
  reader.readAsText(file);
  
  // Reset input so same file can be selected again
  event.target.value = '';
}

// ============================================================
// PARSE CSV
// ============================================================
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return { error: 'CSV must have header row and at least one data row' };
  }
  
  // Parse header
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  
  // Required columns
  const childIdx = header.findIndex(h => h === 'child' || h === 'child_name');
  const parentIdx = header.findIndex(h => h === 'parent' || h === 'parent_name');
  
  if (childIdx === -1) {
    return { error: 'CSV must have "child" column' };
  }
  
  // Optional columns
  const pnIdx = header.findIndex(h => h === 'child_pn' || h === 'part_number' || h === 'pn');
  const fastenerIdx = header.findIndex(h => h === 'fastener');
  const qtyIdx = header.findIndex(h => h === 'qty' || h === 'quantity');
  const loctiteIdx = header.findIndex(h => h === 'loctite' || h === 'lt');
  const torqueIdx = header.findIndex(h => h === 'torque' || h === 'torque_value');
  
  // Parse rows
  const rows = [];
  const nodeMap = new Map(); // name -> { name, part_number }
  const links = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;
    
    const child = values[childIdx]?.trim();
    const parent = parentIdx !== -1 ? values[parentIdx]?.trim() : '';
    const partNumber = pnIdx !== -1 ? values[pnIdx]?.trim() : '';
    const fastener = fastenerIdx !== -1 ? values[fastenerIdx]?.trim() : '';
    const qty = qtyIdx !== -1 ? parseInt(values[qtyIdx]) || 1 : 1;
    const loctite = loctiteIdx !== -1 ? values[loctiteIdx]?.trim() : '';
    const torque = torqueIdx !== -1 ? parseFloat(values[torqueIdx]) || null : null;
    
    if (!child) continue;
    
    // Add child to nodes
    if (!nodeMap.has(child)) {
      nodeMap.set(child, { name: child, part_number: partNumber || null });
    } else if (partNumber && !nodeMap.get(child).part_number) {
      nodeMap.get(child).part_number = partNumber;
    }
    
    // Add parent to nodes if exists
    if (parent && !nodeMap.has(parent)) {
      nodeMap.set(parent, { name: parent, part_number: null });
    }
    
    // Add link if parent exists
    if (parent) {
      links.push({
        parent_name: parent,
        child_name: child,
        fastener: fastener || null,
        qty: qty,
        loctite: loctite || null,
        torque_value: torque,
        torque_unit: torque ? 'Nm' : null
      });
    }
    
    rows.push({ child, parent, partNumber, fastener, qty, loctite, torque });
  }
  
  const nodes = Array.from(nodeMap.values());
  
  // Find root nodes (nodes that are parents but never children)
  const childNames = new Set(links.map(l => l.child_name));
  const rootNodes = nodes.filter(n => !childNames.has(n.name));
  
  return {
    nodes,
    links,
    rootNodes,
    rows
  };
}

// ============================================================
// PARSE CSV LINE (handles quotes)
// ============================================================
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result.map(v => v.trim().replace(/^"|"$/g, ''));
}

// ============================================================
// SHOW IMPORT PREVIEW
// ============================================================
function showImportPreview(parsed) {
  const { nodes, links, rootNodes } = parsed;
  
  const content = `
    <div style="max-height: 400px; overflow-y: auto;">
      <div style="margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-radius: 6px;">
        <strong>📊 Import Summary</strong>
        <ul style="margin: 10px 0 0 20px; padding: 0;">
          <li><strong>${nodes.length}</strong> nodes</li>
          <li><strong>${links.length}</strong> links</li>
          <li><strong>${rootNodes.length}</strong> root node(s): ${rootNodes.map(n => n.name).join(', ')}</li>
        </ul>
      </div>
      
      <div style="margin-bottom: 15px;">
        <strong>Nodes Preview:</strong>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Name</th>
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Part Number</th>
            </tr>
          </thead>
          <tbody>
            ${nodes.slice(0, 10).map(n => `
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(n.name)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">${n.part_number || '-'}</td>
              </tr>
            `).join('')}
            ${nodes.length > 10 ? `<tr><td colspan="2" style="padding: 6px; border: 1px solid #ddd; color: #666;">... and ${nodes.length - 10} more</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      
      <div>
        <strong>Links Preview:</strong>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Child</th>
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Parent</th>
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Fastener</th>
            </tr>
          </thead>
          <tbody>
            ${links.slice(0, 10).map(l => `
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(l.child_name)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(l.parent_name)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">${l.fastener ? `${l.fastener} ×${l.qty}` : '-'}</td>
              </tr>
            `).join('')}
            ${links.length > 10 ? `<tr><td colspan="3" style="padding: 6px; border: 1px solid #ddd; color: #666;">... and ${links.length - 10} more</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  showModal('Import CSV Preview', content, [
    { label: 'Cancel', class: 'btn-secondary', action: hideModal },
    { label: 'Import', class: 'btn-primary', action: () => performImport(parsed) }
  ]);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// PERFORM IMPORT
// ============================================================
async function performImport(parsed) {
  hideModal();
  showLoading(true);
  
  const { nodes, links } = parsed;
  const assemblyId = state.currentAssemblyId;
  
  try {
    // Generate UUIDs for nodes
    const nodeIdMap = new Map(); // name -> uuid
    const nodesToInsert = [];
    
    // Calculate auto-layout positions (tree layout)
    const positions = calculateTreeLayout(nodes, links);
    
    nodes.forEach((node, index) => {
      const id = crypto.randomUUID();
      nodeIdMap.set(node.name, id);
      
      const pos = positions.get(node.name) || { x: 200 + (index % 5) * 180, y: 100 + Math.floor(index / 5) * 140 };
      
      nodesToInsert.push({
        id,
        assembly_id: assemblyId,
        name: node.name,
        part_number: node.part_number,
        x: pos.x,
        y: pos.y,
        status: 'NOT_STARTED',
        deleted: false
      });
    });
    
    // Insert nodes
    const { error: nodesError } = await db
      .from('logi_nodes')
      .insert(nodesToInsert);
    
    if (nodesError) {
      throw new Error(`Failed to insert nodes: ${nodesError.message}`);
    }
    
    // Generate links with UUIDs
    const linksToInsert = links.map(link => ({
      id: crypto.randomUUID(),
      assembly_id: assemblyId,
      parent_id: nodeIdMap.get(link.parent_name),
      child_id: nodeIdMap.get(link.child_name),
      fastener: link.fastener,
      qty: link.qty,
      loctite: link.loctite,
      torque_value: link.torque_value,
      torque_unit: link.torque_unit,
      deleted: false
    })).filter(l => l.parent_id && l.child_id);
    
    // Insert links
    if (linksToInsert.length > 0) {
      const { error: linksError } = await db
        .from('logi_links')
        .insert(linksToInsert);
      
      if (linksError) {
        throw new Error(`Failed to insert links: ${linksError.message}`);
      }
    }
    
    showToast(`Imported ${nodesToInsert.length} nodes and ${linksToInsert.length} links!`, 'success');
    
    // Reload the assembly
    await loadAssemblyData(assemblyId);
    
  } catch (error) {
    console.error('Import error:', error);
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ============================================================
// CALCULATE TREE LAYOUT
// ============================================================
function calculateTreeLayout(nodes, links) {
  const positions = new Map();
  
  // Build adjacency map
  const children = new Map(); // parent -> [children]
  const parents = new Map();  // child -> parent
  
  links.forEach(link => {
    if (!children.has(link.parent_name)) {
      children.set(link.parent_name, []);
    }
    children.get(link.parent_name).push(link.child_name);
    parents.set(link.child_name, link.parent_name);
  });
  
  // Find root nodes
  const rootNodes = nodes.filter(n => !parents.has(n.name)).map(n => n.name);
  
  // BFS to assign levels
  const levels = new Map();
  const queue = [...rootNodes];
  rootNodes.forEach(r => levels.set(r, 0));
  
  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current);
    
    const nodeChildren = children.get(current) || [];
    nodeChildren.forEach(child => {
      if (!levels.has(child)) {
        levels.set(child, currentLevel + 1);
        queue.push(child);
      }
    });
  }
  
  // Group nodes by level
  const levelNodes = new Map();
  nodes.forEach(n => {
    const level = levels.get(n.name) ?? 0;
    if (!levelNodes.has(level)) {
      levelNodes.set(level, []);
    }
    levelNodes.get(level).push(n.name);
  });
  
  // Assign positions
  const levelHeight = 140;
  const nodeSpacing = 180;
  const startX = 100;
  const startY = 80;
  
  levelNodes.forEach((nodesAtLevel, level) => {
    const totalWidth = (nodesAtLevel.length - 1) * nodeSpacing;
    const offsetX = startX + (level === 0 ? totalWidth / 2 : 0);
    
    nodesAtLevel.forEach((nodeName, index) => {
      positions.set(nodeName, {
        x: offsetX + index * nodeSpacing,
        y: startY + level * levelHeight
      });
    });
  });
  
  return positions;
}

// Make functions globally available
window.openImportCSV = openImportCSV;
window.handleCSVFile = handleCSVFile;
