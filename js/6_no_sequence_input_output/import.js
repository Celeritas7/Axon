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
// HANDLE CSV FILE(S) — supports multiple selection
// ============================================================
export function handleCSVFile(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  const parsedFiles = [];
  let loaded = 0;
  
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const parsed = parseCSV(csvText);
      
      if (parsed.error) {
        showToast(`${file.name}: ${parsed.error}`, 'error');
      } else {
        parsed.fileName = file.name;
        parsedFiles.push(parsed);
      }
      
      loaded++;
      if (loaded === files.length) {
        if (parsedFiles.length > 0) {
          showMultiImportPreview(parsedFiles);
        }
      }
    };
    reader.readAsText(file);
  });
  
  // Reset input so same files can be selected again
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
  const childIdx = header.findIndex(h => h === 'child' || h === 'child_name' || h === 'component' || h === 'name');
  const parentIdx = header.findIndex(h => h === 'parent' || h === 'parent_name');
  const levelIdx = header.findIndex(h => h === 'level');
  
  if (childIdx === -1) {
    return { error: 'CSV must have "child" column' };
  }
  
  // Optional columns
  const pnIdx = header.findIndex(h => h === 'child_pn' || h === 'part_number' || h === 'part number' || h === 'pn');
  const fastenerIdx = header.findIndex(h => h === 'fastener');
  const qtyIdx = header.findIndex(h => h === 'qty' || h === 'quantity');
  const loctiteIdx = header.findIndex(h => h === 'loctite' || h === 'lt');
  const torqueIdx = header.findIndex(h => h === 'torque' || h === 'torque_value');
  
  // Parse rows
  const rows = [];
  const nodeMap = new Map(); // name -> { name, part_number }
  const links = [];
  
  // First pass: collect all rows with levels
  const parsedRows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;
    
    const child = values[childIdx]?.trim();
    if (!child) continue;
    
    let parent = parentIdx !== -1 ? values[parentIdx]?.trim() : '';
    let level = 0;
    if (levelIdx !== -1 && values[levelIdx]) {
      level = parseInt(values[levelIdx].replace(/^L/i, '')) || 0;
    }
    
    const partNumber = pnIdx !== -1 ? values[pnIdx]?.trim() : '';
    const fastener = fastenerIdx !== -1 ? values[fastenerIdx]?.trim() : '';
    const qty = qtyIdx !== -1 ? parseInt(values[qtyIdx]) || 1 : 1;
    const loctite = loctiteIdx !== -1 ? values[loctiteIdx]?.trim().replace(/^LT-/i, '') : '';
    const torque = torqueIdx !== -1 ? parseFloat(values[torqueIdx]) || null : null;
    
    parsedRows.push({ child, parent, level, partNumber, fastener, qty, loctite, torque });
  }
  
  // If we have levels but no parent column, infer parents from hierarchy
  const hasLevels = levelIdx !== -1 && parsedRows.some(r => r.level > 0);
  const hasParents = parentIdx !== -1 && parsedRows.some(r => r.parent);
  
  if (hasLevels && !hasParents) {
    const levelStack = {};
    parsedRows.forEach(row => {
      if (row.level > 1) {
        row.parent = levelStack[row.level - 1] || '';
      }
      levelStack[row.level] = row.child;
    });
  }
  
  // Build nodes and links from parsed rows
  for (const row of parsedRows) {
    const { child, parent, partNumber, fastener, qty, loctite, torque } = row;
    
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
    
    rows.push(row);
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
// ============================================================
// SHOW MULTI-FILE IMPORT PREVIEW
// ============================================================
function showMultiImportPreview(parsedFiles) {
  // Aggregate totals
  const totalNodes = parsedFiles.reduce((sum, p) => sum + p.nodes.length, 0);
  const totalLinks = parsedFiles.reduce((sum, p) => sum + p.links.length, 0);
  const allRoots = parsedFiles.flatMap(p => p.rootNodes);
  
  // Build existing nodes dropdown for parent attachment
  const existingNodes = state.nodes
    .filter(n => !n.deleted)
    .sort((a, b) => (a.level || 1) - (b.level || 1));
  
  const parentOptions = existingNodes.length > 0
    ? existingNodes.map(n => 
        `<option value="${n.id}">L${n.level} - ${escapeHtml(n.name)}</option>`
      ).join('')
    : '';
  
  const attachSection = existingNodes.length > 0 ? `
    <div style="margin-bottom: 15px; padding: 12px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffc107;">
      <strong>🔗 Attach to existing node</strong>
      <p style="font-size: 12px; color: #666; margin: 6px 0;">
        All root nodes from the imported file(s) will become children of the selected parent.
      </p>
      <select id="importAttachParent" class="form-select" style="width: 100%; margin-top: 8px; font-size: 14px; padding: 8px;">
        <option value="">— Don't attach (import as standalone) —</option>
        ${parentOptions}
      </select>
      <div style="margin-top: 8px;">
        <label style="font-size: 12px; color: #666;">Fastener for attachment links (optional)</label>
        <input type="text" id="importAttachFastener" class="form-input" placeholder="e.g. M6x20, CBE8-35" style="width: 100%; margin-top: 4px; font-size: 14px; padding: 8px;">
      </div>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0c56b;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
          <input type="checkbox" id="importMergeNodes">
          <span><strong>Merge</strong> nodes with same name as existing ones</span>
        </label>
        <p style="font-size: 11px; color: #888; margin: 4px 0 0 26px;">
          OFF = each CSV imports as a standalone sub-tree (recommended). ON = reuses existing nodes with the same name.
        </p>
      </div>
    </div>
  ` : '';
  
  // Per-file breakdown
  const fileBreakdown = parsedFiles.map((p, i) => `
    <div style="padding: 8px 10px; background: ${i % 2 === 0 ? '#f8f9fa' : 'white'}; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong style="font-size: 12px;">📄 ${escapeHtml(p.fileName)}</strong>
        <span style="font-size: 11px; color: #666; margin-left: 8px;">
          ${p.nodes.length} nodes, ${p.links.length} links
        </span>
      </div>
      <div style="font-size: 11px; color: #888;">
        Root: <strong>${p.rootNodes.map(n => n.name).join(', ')}</strong>
      </div>
    </div>
  `).join('');
  
  const content = `
    <div style="max-height: 450px; overflow-y: auto;">
      ${attachSection}
      
      <div style="margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-radius: 6px;">
        <strong>📊 Import Summary — ${parsedFiles.length} file${parsedFiles.length > 1 ? 's' : ''}</strong>
        <ul style="margin: 10px 0 0 20px; padding: 0;">
          <li><strong>${totalNodes}</strong> total nodes</li>
          <li><strong>${totalLinks}</strong> total links</li>
          <li><strong>${allRoots.length}</strong> root node(s): ${allRoots.map(n => n.name).join(', ')}</li>
        </ul>
      </div>
      
      <div style="margin-bottom: 15px;">
        <strong>Files:</strong>
        <div style="margin-top: 8px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
          ${fileBreakdown}
        </div>
      </div>
      
      <div style="margin-bottom: 10px;">
        <strong>Nodes Preview (first file):</strong>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Name</th>
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Part Number</th>
              <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">File</th>
            </tr>
          </thead>
          <tbody>
            ${parsedFiles.flatMap(p => p.nodes.slice(0, 5).map(n => `
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(n.name)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">${n.part_number || '-'}</td>
                <td style="padding: 6px; border: 1px solid #ddd; font-size: 10px; color: #888;">${escapeHtml(p.fileName)}</td>
              </tr>
            `)).slice(0, 15).join('')}
            ${totalNodes > 15 ? `<tr><td colspan="3" style="padding: 6px; border: 1px solid #ddd; color: #666;">... and ${totalNodes - 15} more</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  showModal(
    `Import ${parsedFiles.length} CSV File${parsedFiles.length > 1 ? 's' : ''}`,
    content,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: `Import All (${parsedFiles.length})`, class: 'btn-primary', action: () => performMultiImport(parsedFiles) }
    ]
  );
}

// Keep single-file preview as alias for backward compat
function showImportPreview(parsed) {
  parsed.fileName = parsed.fileName || 'import.csv';
  showMultiImportPreview([parsed]);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// PERFORM MULTI-FILE IMPORT
// ============================================================
async function performMultiImport(parsedFiles) {
  // Read input values BEFORE hiding modal
  const attachParentEl = document.getElementById('importAttachParent');
  const attachFastenerEl = document.getElementById('importAttachFastener');
  const mergeEl = document.getElementById('importMergeNodes');
  const attachParentId = attachParentEl ? attachParentEl.value : '';
  const attachFastener = attachFastenerEl ? attachFastenerEl.value.trim() : '';
  const mergeEnabled = mergeEl ? mergeEl.checked : false;
  
  hideModal();
  showLoading(true);
  
  const assemblyId = state.currentAssemblyId;
  let totalNodesInserted = 0;
  let totalLinksInserted = 0;
  
  try {
    // Build cross-file dedup map only if merge is enabled
    // This tracks nodes created by PREVIOUS files in this batch
    const batchNameMap = new Map();
    
    // Process each file sequentially
    for (const parsed of parsedFiles) {
      const { nodes, links, rootNodes } = parsed;
      
      const nodeIdMap = new Map();
      const nodesToInsert = [];
      
      // Build dedup map based on merge setting
      const existingNameMap = new Map();
      
      if (mergeEnabled) {
        // Merge ON: match against ALL existing assembly nodes + previous files in batch
        state.nodes.forEach(n => {
          existingNameMap.set(n.name.toLowerCase(), n.id);
        });
        batchNameMap.forEach((id, name) => {
          existingNameMap.set(name, id);
        });
      }
      // Merge OFF: no dedup at all — each CSV imports as a fully standalone sub-tree
      
      // Calculate auto-layout positions
      const positions = calculateTreeLayout(nodes, links);
      
      nodes.forEach((node, index) => {
        const existingId = existingNameMap.get(node.name.toLowerCase());
        if (existingId) {
          nodeIdMap.set(node.name, existingId);
          return;
        }
        
        const id = crypto.randomUUID();
        nodeIdMap.set(node.name, id);
        
        // Track in batch map for subsequent files (only relevant with merge ON)
        if (mergeEnabled) {
          batchNameMap.set(node.name.toLowerCase(), id);
        }
        
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
      
      // Insert new nodes
      if (nodesToInsert.length > 0) {
        const { error: nodesError } = await db.from('logi_nodes').insert(nodesToInsert);
        if (nodesError) throw new Error(`${parsed.fileName}: ${nodesError.message}`);
      }
      
      // Generate internal links from CSV
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
      
      // Add attachment links: CSV root nodes → selected parent
      if (attachParentId) {
        rootNodes.forEach(rootNode => {
          const rootId = nodeIdMap.get(rootNode.name);
          if (rootId) {
            linksToInsert.push({
              id: crypto.randomUUID(),
              assembly_id: assemblyId,
              parent_id: attachParentId,
              child_id: rootId,
              fastener: attachFastener || null,
              qty: 1,
              loctite: null,
              torque_value: null,
              torque_unit: null,
              deleted: false
            });
          }
        });
      }
      
      // Insert all links
      if (linksToInsert.length > 0) {
        const { error: linksError } = await db.from('logi_links').insert(linksToInsert);
        if (linksError) throw new Error(`${parsed.fileName}: ${linksError.message}`);
      }
      
      totalNodesInserted += nodesToInsert.length;
      totalLinksInserted += linksToInsert.length;
    }
    
    const fileCount = parsedFiles.length;
    const attachMsg = attachParentId ? ' (attached to parent)' : '';
    showToast(`Imported ${totalNodesInserted} nodes, ${totalLinksInserted} links from ${fileCount} file${fileCount > 1 ? 's' : ''}${attachMsg}`, 'success');
    
    // Reload the assembly
    await loadAssemblyData(assemblyId);
    
  } catch (error) {
    console.error('Import error:', error);
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Keep single-file performImport as alias
async function performImport(parsed) {
  parsed.fileName = parsed.fileName || 'import.csv';
  await performMultiImport([parsed]);
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
