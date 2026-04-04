// ============================================================
// Logi Assembly v29 - Graph Visualization Module
// ============================================================

import { db } from './database.js';
import {
  LEVEL_COLORS, LEVEL_SHAPES, LEVEL_FONT_SIZES, LEVEL_FONT_WEIGHTS,
  GROUP_COLORS, STATUS_COLORS, FASTENER_COLORS, SEQUENCE_BADGES,
  NODE_WIDTH_BASE, NODE_WIDTH_MAX, LEVEL_HORIZONTAL_GAPS,
  getLevelColor, getLevelShape, getLevelFontSize, getLevelFontWeight,
  getGroupColor, getStatusColor, getFastenerColor, getSequenceBadge,
  getLevelGap
} from './config.js';
import * as state from './state.js';
import {
  showToast, showLoading, setStatus, showModal, hideModal,
  showContextMenu, hideContextMenu, openSidePanel, closeSidePanel,
  setSidePanelContent, updateUndoButton, escapeHtml
} from './ui.js';

// Helper: escape string for HTML attribute values
function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// ZOOM STATE & CONTROLS
// ============================================================
let zoomBehavior = null;
let currentTransform = d3.zoomIdentity;
let _fitAfterRender = false;  // Flag: fit to screen after next render
let _lastLoadedAssemblyId = null;  // Track which assembly is loaded to avoid re-fitting on save

export function initZoom() {
  const svg = d3.select('#treeSvg');
  const g = svg.select('g.zoom-group');
  
  zoomBehavior = d3.zoom()
    .scaleExtent([0.1, 3])
    .on('zoom', (event) => {
      currentTransform = event.transform;
      g.attr('transform', event.transform);
    });
  
  svg.call(zoomBehavior);
}

export function zoomIn() {
  const svg = d3.select('#treeSvg');
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
}

export function zoomOut() {
  const svg = d3.select('#treeSvg');
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
}

export function fitToScreen(instant = false) {
  if (state.nodes.length === 0) return;
  
  const container = document.getElementById('treeContainer');
  const svg = d3.select('#treeSvg');
  const isTreeMode = state.currentLayoutMode === 'tree';
  
  // Calculate bounds of all visible nodes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  state.nodes.forEach(n => {
    if (n.deleted) return;
    const nx = isTreeMode ? (n.treeX ?? n.x ?? 400) : (n.x ?? 400);
    const ny = isTreeMode ? (n.treeY ?? n.y ?? 300) : (n.y ?? 300);
    minX = Math.min(minX, nx - 80);
    maxX = Math.max(maxX, nx + 80);
    minY = Math.min(minY, ny - 40);
    maxY = Math.max(maxY, ny + 40);
  });
  
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const containerWidth = container.clientWidth - 40;
  const containerHeight = container.clientHeight - 40;
  
  const scale = Math.min(
    containerWidth / contentWidth,
    containerHeight / contentHeight,
    1.5
  ) * 0.9;
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  const translateX = containerWidth / 2 - centerX * scale;
  const translateY = containerHeight / 2 - centerY * scale;
  
  const transform = d3.zoomIdentity
    .translate(translateX, translateY)
    .scale(scale);
  
  if (instant) {
    svg.call(zoomBehavior.transform, transform);
  } else {
    svg.transition().duration(500).call(zoomBehavior.transform, transform);
  }
}

export function resetView() {
  const svg = d3.select('#treeSvg');
  svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
}

// Make functions globally available
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.fitToScreen = fitToScreen;
window.resetView = resetView;

// ============================================================
// LOAD ASSEMBLY DATA
// ============================================================
export async function loadAssemblyData(assemblyId) {
  showLoading(true);
  setStatus('Loading...', 'loading');
  
  // Load nodes
  const { data: nodesData, error: nodesError } = await db
    .from('logi_nodes')
    .select('*')
    .eq('assembly_id', assemblyId)
    .eq('deleted', false);
  
  if (nodesError) {
    showToast('Failed to load nodes', 'error');
    console.error(nodesError);
    showLoading(false);
    return;
  }
  
  // Load links
  const { data: linksData, error: linksError } = await db
    .from('logi_links')
    .select('*')
    .eq('assembly_id', assemblyId);
  
  if (linksError) {
    showToast('Failed to load links', 'error');
    console.error(linksError);
    showLoading(false);
    return;
  }
  
  // Filter deleted links client-side
  const activeLinks = (linksData || []).filter(l => l.deleted !== true);
  
  console.log('Loaded nodes:', nodesData?.length, 'links:', activeLinks.length);
  
  // Process nodes
  const processedNodes = nodesData.map(n => {
    return {
      ...n,
      goesInto: [],
      receivesFrom: [],
      level: -1,
      width: calculateNodeWidth(n.name, n.part_number),
      height: calculateNodeHeight(n.name, n.part_number)
    };
  });
  
  state.setNodes(processedNodes);
  state.setLinks(activeLinks);
  
  // Build relationships
  const nodeMap = new Map(state.nodes.map(n => [n.id, n]));
  
  state.links.forEach(link => {
    const child = nodeMap.get(link.child_id);
    const parent = nodeMap.get(link.parent_id);
    
    if (child && parent) {
      if (!child.goesInto.includes(link.parent_id)) {
        child.goesInto.push(link.parent_id);
      }
      if (!parent.receivesFrom.includes(link.child_id)) {
        parent.receivesFrom.push(link.child_id);
      }
    }
  });
  
  // Debug: Log relationships
  const rootNodes = state.nodes.filter(n => n.goesInto.length === 0);
  if (rootNodes.length > 0) {
    console.log('Root nodes:', rootNodes.map(n => `${n.name} (${n.receivesFrom.length} children)`).join(', '));
  }
  
  // Calculate levels
  calculateLevels();
  
  // Debug: Log level assignments
  console.log('Levels:', state.nodes.map(n => `${n.name}: L${n.level}`).join(', '));
  
  // Load saved spacing for this assembly
  loadSavedSpacing();
  
  // Load saved collapsed state for this assembly
  state.loadCollapsedState();
  
  // Only reset zoom and fit when switching to a DIFFERENT assembly
  const isNewAssembly = _lastLoadedAssemblyId !== assemblyId;
  _lastLoadedAssemblyId = assemblyId;
  
  if (isNewAssembly) {
    currentTransform = d3.zoomIdentity;
    _fitAfterRender = true;
  }
  
  // Render
  renderGraph();
  
  if (isNewAssembly) {
    setTimeout(() => fitToScreen(), 100);
  }
  
  setStatus(`Loaded ${state.nodes.length} nodes`, 'success');
  setTimeout(() => setStatus(''), 2000);
  showLoading(false);
}

// ============================================================
// CALCULATE LEVELS (L1 = Root, increasing downward)
// ============================================================
function calculateLevels() {
  // Reset all levels
  state.nodes.forEach(n => n.level = -1);
  
  // Find root nodes (no parents)
  const rootNodes = state.nodes.filter(n => n.goesInto.length === 0);
  
  if (rootNodes.length === 0) {
    console.log('No root nodes found, assigning level 1 to all');
    state.nodes.forEach(n => n.level = 1);
    return;
  }
  
  console.log('Root nodes:', rootNodes.map(n => n.name).join(', '));
  
  // BFS from root nodes (L1 → L2 → L3 → ...)
  const queue = [];
  const visited = new Set();
  
  rootNodes.forEach(root => {
    root.level = 1;
    queue.push(root.id);
    visited.add(root.id);
    console.log(`Root: ${root.name} = L1`);
  });
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) continue;
    
    // Children get level = parent + 1
    node.receivesFrom.forEach(childId => {
      const child = state.nodes.find(n => n.id === childId);
      if (child) {
        const newLevel = node.level + 1;
        if (child.level === -1 || newLevel > child.level) {
          console.log(`${child.name} → L${newLevel} (child of ${node.name})`);
          child.level = newLevel;
        }
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push(childId);
        }
      }
    });
  }
  
  // Handle orphans
  state.nodes.forEach(n => {
    if (n.level === -1) {
      let minParentLevel = Infinity;
      n.goesInto.forEach(parentId => {
        const parent = state.nodes.find(p => p.id === parentId);
        if (parent && parent.level > 0) {
          minParentLevel = Math.min(minParentLevel, parent.level);
        }
      });
      n.level = minParentLevel < Infinity ? minParentLevel + 1 : 1;
      console.log(`Orphan ${n.name} → L${n.level}`);
    }
  });
}

// ============================================================
// NODE DIMENSIONS
// ============================================================
function calculateNodeWidth(name, partNumber) {
  let width = NODE_WIDTH_BASE;
  if (name && name.length > 12) {
    width = Math.min(NODE_WIDTH_MAX, NODE_WIDTH_BASE + (name.length - 12) * 4);
  }
  if (partNumber && partNumber.length > 10) {
    width = Math.max(width, Math.min(NODE_WIDTH_MAX, 100 + partNumber.length * 4));
  }
  return width;
}

function calculateNodeHeight(name, partNumber) {
  let height = 36;
  if (partNumber) height += 10;
  if (name && name.length > 20) height += 8;
  return height;
}

// ============================================================
// GET NODE COLOR
// ============================================================
function getNodeColor(node) {
  const colorMode = state.currentColorMode;
  
  if (colorMode === 'status') {
    const statusColor = STATUS_COLORS[node.status];
    return statusColor ? statusColor.bg : LEVEL_COLORS[0];
  }
  
  if (colorMode === 'group') {
    return GROUP_COLORS[(node.group_num || 0) % GROUP_COLORS.length];
  }
  
  // Default: level coloring
  return getLevelColor(node.level);
}

// ============================================================
// NODE VISIBILITY - Check all ancestors for collapse
// ============================================================
function isNodeVisible(node) {
  if (state.currentLevelFilter !== 'all' && node.level > parseInt(state.currentLevelFilter)) {
    return false;
  }
  
  // Root nodes always visible
  if (node.goesInto.length === 0) return true;
  
  // Check if ANY ancestor is collapsed (recursive)
  return !hasCollapsedAncestor(node.id, new Set());
}

// Helper: Recursively check if any ancestor is collapsed
function hasCollapsedAncestor(nodeId, visited) {
  if (visited.has(nodeId)) return false;
  visited.add(nodeId);
  
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return false;
  
  // Check each parent
  for (const parentId of node.goesInto) {
    // If direct parent is collapsed, hide this node
    if (state.collapsedNodes.has(parentId)) return true;
    
    // Recursively check if parent has collapsed ancestor
    if (hasCollapsedAncestor(parentId, visited)) return true;
  }
  
  return false;
}

// ============================================================
// CALCULATE SMOOTH LINK PATH (Edge-center Bezier curves)
// ============================================================
function calculateLinkPath(source, target) {
  const sourceW = source.width / 2;
  const sourceH = source.height / 2;
  const targetW = target.width / 2;
  const targetH = target.height / 2;
  
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  let sx, sy, tx, ty;
  
  // Smart edge detection - connect from appropriate edge centers
  if (absDx > absDy * 1.5) {
    // Mostly horizontal - connect from left/right edges
    if (dx > 0) {
      sx = source.x + sourceW;  // Right edge of source
      tx = target.x - targetW;  // Left edge of target
    } else {
      sx = source.x - sourceW;  // Left edge of source
      tx = target.x + targetW;  // Right edge of target
    }
    sy = source.y;  // Center vertically
    ty = target.y;
  } else if (absDy > absDx * 1.5) {
    // Mostly vertical - connect from top/bottom edges
    if (dy > 0) {
      sy = source.y + sourceH;  // Bottom edge of source
      ty = target.y - targetH;  // Top edge of target
    } else {
      sy = source.y - sourceH;  // Top edge of source
      ty = target.y + targetH;  // Bottom edge of target
    }
    sx = source.x;  // Center horizontally
    tx = target.x;
  } else {
    // Diagonal - use corner-ish but from edges
    if (dx > 0) {
      sx = source.x + sourceW;
      tx = target.x - targetW;
    } else {
      sx = source.x - sourceW;
      tx = target.x + targetW;
    }
    // Slight vertical offset based on direction
    sy = source.y + (dy > 0 ? sourceH * 0.3 : -sourceH * 0.3);
    ty = target.y + (dy > 0 ? -targetH * 0.3 : targetH * 0.3);
  }
  
  // Calculate smooth control points at midpoint
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  
  // Gentle curve - control points pull toward midpoint
  let cx1, cy1, cx2, cy2;
  
  if (absDx > absDy) {
    // Horizontal dominant - S-curve
    cx1 = midX;
    cy1 = sy;
    cx2 = midX;
    cy2 = ty;
  } else {
    // Vertical dominant - S-curve
    cx1 = sx;
    cy1 = midY;
    cx2 = tx;
    cy2 = midY;
  }
  
  return `M ${sx},${sy} C ${cx1},${cy1} ${cx2},${cy2} ${tx},${ty}`;
}

// ============================================================
// DARKEN COLOR - Create darker border from fill color
// ============================================================
function darkenColor(hex, percent = 30) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  // Darken
  r = Math.max(0, Math.floor(r * (100 - percent) / 100));
  g = Math.max(0, Math.floor(g * (100 - percent) / 100));
  b = Math.max(0, Math.floor(b * (100 - percent) / 100));
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ============================================================
// DRAW SHAPE - v28 with matching border colors
// ============================================================
function drawShape(selection, shapeType, width, height, fill, stroke, isMultiParent, isOrphan) {
  const halfW = width / 2, halfH = height / 2;
  const strokeWidth = (isMultiParent || isOrphan) ? 2 : 1.5;
  const dashArray = isOrphan ? '5,3' : 'none';
  
  // v28: Border color matches fill (darker variant) instead of uniform gray
  let finalStroke;
  if (isOrphan) {
    finalStroke = '#9b59b6';
  } else {
    finalStroke = darkenColor(fill, 35);  // 35% darker than fill
  }

  selection.selectAll('.node-shape, .multi-parent-indicator').remove();

  const shapes = {
    rectangle: () => {
      selection.insert('rect', ':first-child').attr('class', 'node-shape')
        .attr('x', -halfW).attr('y', -halfH).attr('width', width).attr('height', height)
        .attr('fill', fill).attr('stroke', finalStroke).attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dashArray).attr('rx', 0);
    },
    rounded_rectangle: () => {
      selection.insert('rect', ':first-child').attr('class', 'node-shape')
        .attr('x', -halfW).attr('y', -halfH).attr('width', width).attr('height', height)
        .attr('fill', fill).attr('stroke', finalStroke).attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dashArray).attr('rx', 6);
    },
    stadium: () => {
      selection.insert('rect', ':first-child').attr('class', 'node-shape')
        .attr('x', -halfW).attr('y', -halfH).attr('width', width).attr('height', height)
        .attr('fill', fill).attr('stroke', finalStroke).attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dashArray).attr('rx', halfH).attr('ry', halfH);
    },
    parallelogram: () => {
      const sk = 10;
      const pts = `${-halfW+sk},${-halfH} ${halfW+sk},${-halfH} ${halfW-sk},${halfH} ${-halfW-sk},${halfH}`;
      selection.insert('polygon', ':first-child').attr('class', 'node-shape')
        .attr('points', pts).attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    },
    pentagon: () => {
      const a = (2*Math.PI)/5, sa = -Math.PI/2, rx = halfW*0.85, ry = halfH*0.9;
      const pts = Array.from({length:5}, (_,i) => `${rx*Math.cos(sa+i*a)},${ry*Math.sin(sa+i*a)}`).join(' ');
      selection.insert('polygon', ':first-child').attr('class', 'node-shape')
        .attr('points', pts).attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    },
    hexagon: () => {
      const pts = `${-halfW+10},${-halfH} ${halfW-10},${-halfH} ${halfW},0 ${halfW-10},${halfH} ${-halfW+10},${halfH} ${-halfW},0`;
      selection.insert('polygon', ':first-child').attr('class', 'node-shape')
        .attr('points', pts).attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    },
    diamond: () => {
      const pts = `0,${-halfH} ${halfW},0 0,${halfH} ${-halfW},0`;
      selection.insert('polygon', ':first-child').attr('class', 'node-shape')
        .attr('points', pts).attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    },
    ellipse: () => {
      selection.insert('ellipse', ':first-child').attr('class', 'node-shape')
        .attr('cx', 0).attr('cy', 0).attr('rx', halfW).attr('ry', halfH)
        .attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    },
    octagon: () => {
      const c = Math.min(halfW, halfH) * 0.35;
      const pts = `${-halfW+c},${-halfH} ${halfW-c},${-halfH} ${halfW},${-halfH+c} ${halfW},${halfH-c} ${halfW-c},${halfH} ${-halfW+c},${halfH} ${-halfW},${halfH-c} ${-halfW},${-halfH+c}`;
      selection.insert('polygon', ':first-child').attr('class', 'node-shape')
        .attr('points', pts).attr('fill', fill).attr('stroke', finalStroke)
        .attr('stroke-width', strokeWidth).attr('stroke-dasharray', dashArray);
    }
  };
  
  (shapes[shapeType] || shapes.rectangle)();
  
  if (isMultiParent) {
    // Multi-parent indicator uses darker version of fill color too
    selection.insert('rect', ':first-child').attr('class', 'multi-parent-indicator')
      .attr('x', -halfW - 3).attr('y', -halfH - 3)
      .attr('width', width + 6).attr('height', height + 6)
      .attr('stroke', darkenColor(fill, 50)).attr('stroke-width', 1.5).attr('rx', 4).attr('fill', 'none');
  }
}

// ============================================================
// TREE LAYOUT CALCULATION - Improved Centering & Groups
// ============================================================
function calculateTreeLayout(nodes, links) {
  // Group nodes by level
  const levelGroups = {};
  let maxLevel = 1;
  
  nodes.forEach(n => {
    const level = n.level || 1;
    if (!levelGroups[level]) levelGroups[level] = [];
    levelGroups[level].push(n);
    maxLevel = Math.max(maxLevel, level);
  });
  
  // Tree layout settings
  const nodeWidth = 150;
  const nodeHeight = 48;
  const verticalGap = 52;
  const groupGap = 20;  // Extra gap between groups
  const headerHeight = 40;
  const leftPadding = 100;
  const topPadding = 60;
  
  // Get levels sorted: highest level on left, L1 on right
  const levels = Object.keys(levelGroups).map(Number).sort((a, b) => b - a);
  
  // Compute per-level column X positions using configurable gaps
  // levels = [highest, ..., 1] e.g. [5, 4, 3, 2, 1]
  // Column 0 (leftmost) = highest level, last column = L1
  const columnXMap = {};  // level -> X position
  let cumulativeX = leftPadding;
  
  levels.forEach((level, colIndex) => {
    columnXMap[level] = cumulativeX;
    
    if (colIndex < levels.length - 1) {
      // Gap to next column: based on the lower of the two adjacent levels
      const nextLevel = levels[colIndex + 1];
      const lowerLevel = Math.min(level, nextLevel);
      const gapIndex = lowerLevel - 1;  // L1→L2 = index 0, L2→L3 = index 1, etc.
      // Use runtime override from state if available, else config default
      const gap = (state.levelGaps && state.levelGaps[gapIndex] != null) 
        ? state.levelGaps[gapIndex] 
        : getLevelGap(gapIndex);
      cumulativeX += gap;
    }
  });
  
  // Helper to get column X for a level
  function getColumnX(level) {
    return columnXMap[level] ?? leftPadding;
  }
  
  // Build connection maps
  const childToParents = {};
  const parentToChildren = {};
  
  links.forEach(link => {
    if (!childToParents[link.child_id]) childToParents[link.child_id] = [];
    if (!parentToChildren[link.parent_id]) parentToChildren[link.parent_id] = [];
    childToParents[link.child_id].push(link.parent_id);
    parentToChildren[link.parent_id].push(link.child_id);
  });
  
  // Initialize positions
  const treePositions = {};
  
  // Detect groups based on L2 nodes (main branches)
  const groups = detectGroups(nodes, links, childToParents, parentToChildren);
  
  // Always run auto-layout, then pin locked nodes afterward
  {
    // Step 1: Assign nodes to groups
    const nodeToGroup = {};
    groups.forEach((group, groupIdx) => {
      group.nodeIds.forEach(nid => {
        nodeToGroup[nid] = groupIdx;
      });
    });
    
    // Step 2: Initial column X positions
    levels.forEach((level, colIndex) => {
      const nodesInLevel = levelGroups[level];
      const columnX = getColumnX(level);
      
      nodesInLevel.forEach(node => {
        treePositions[node.id] = {
          x: columnX,
          y: 0, // Will be set later
          treeWidth: nodeWidth - 20,
          treeHeight: nodeHeight - 10,
          group: nodeToGroup[node.id] ?? 0
        };
      });
    });
    
    // Step 3: Position each group separately using recursive centering
    let groupStartY = topPadding + headerHeight;
    
    groups.forEach((group, groupIdx) => {
      // Get all nodes in this group, organized by level
      const groupNodesByLevel = {};
      levels.forEach(level => {
        groupNodesByLevel[level] = levelGroups[level].filter(n => 
          group.nodeIds.has(n.id)
        );
      });
      
      // Position from leftmost level (highest) to rightmost (L1)
      // But calculate sizes from right to left first
      const levelHeights = {};
      
      // Calculate required height for each level in this group
      [...levels].reverse().forEach(level => {
        const nodesInLevel = groupNodesByLevel[level] || [];
        if (nodesInLevel.length === 0) {
          levelHeights[level] = 0;
          return;
        }
        
        // Sort by sequence number within group
        nodesInLevel.sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));
        
        // Check if these nodes have children (to the left)
        let totalHeight = 0;
        nodesInLevel.forEach(node => {
          const children = parentToChildren[node.id] || [];
          const childrenInGroup = children.filter(cid => group.nodeIds.has(cid));
          
          if (childrenInGroup.length > 0) {
            // This node needs space for its children
            const childYs = childrenInGroup.map(cid => treePositions[cid]?.y || 0);
            const childMin = Math.min(...childYs);
            const childMax = Math.max(...childYs);
            const childSpan = childMax - childMin + verticalGap;
            totalHeight = Math.max(totalHeight, childSpan);
          } else {
            totalHeight += verticalGap;
          }
        });
        
        levelHeights[level] = Math.max(nodesInLevel.length * verticalGap, totalHeight);
      });
      
      // Now position nodes from highest level to L1
      levels.forEach(level => {
        const nodesInLevel = groupNodesByLevel[level] || [];
        if (nodesInLevel.length === 0) return;
        
        // Sort by sequence number
        nodesInLevel.sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));
        
        nodesInLevel.forEach((node, idx) => {
          const children = parentToChildren[node.id] || [];
          const childrenInGroup = children.filter(cid => group.nodeIds.has(cid));
          
          if (childrenInGroup.length > 0 && childrenInGroup.some(cid => treePositions[cid]?.y > 0)) {
            // Center this node among its children
            const childYs = childrenInGroup.map(cid => treePositions[cid].y);
            const minChildY = Math.min(...childYs);
            const maxChildY = Math.max(...childYs);
            treePositions[node.id].y = (minChildY + maxChildY) / 2;
          } else {
            // Position sequentially
            treePositions[node.id].y = groupStartY + idx * verticalGap;
          }
        });
        
        // Ensure no overlaps within this level for this group
        nodesInLevel.sort((a, b) => treePositions[a.id].y - treePositions[b.id].y);
        let lastY = groupStartY - verticalGap;
        nodesInLevel.forEach(node => {
          if (treePositions[node.id].y < lastY + verticalGap) {
            treePositions[node.id].y = lastY + verticalGap;
          }
          lastY = treePositions[node.id].y;
        });
      });
      
      // Calculate actual group bounds after positioning
      const groupNodes = nodes.filter(n => group.nodeIds.has(n.id));
      const groupYs = groupNodes.map(n => treePositions[n.id].y);
      const groupMaxY = Math.max(...groupYs);
      
      // Store group bounds for separator lines
      group.minY = groupStartY;
      group.maxY = groupMaxY;
      
      // Next group starts after this one plus gap
      groupStartY = groupMaxY + verticalGap + groupGap;
    });
    
    // Step 4: Bidirectional centering — alternate parent-centering and child-pushing
    for (let pass = 0; pass < 8; pass++) {
      // Up pass: center each parent among its children (leaves → root)
      [...levels].reverse().forEach(level => {
        const nodesInLevel = levelGroups[level] || [];
        nodesInLevel.forEach(node => {
          const children = parentToChildren[node.id] || [];
          const childYs = children
            .filter(cid => treePositions[cid])
            .map(cid => treePositions[cid].y);
          
          if (childYs.length > 0) {
            const centerY = (Math.min(...childYs) + Math.max(...childYs)) / 2;
            treePositions[node.id].y = centerY;
          }
        });
        
        // Fix overlaps
        nodesInLevel.sort((a, b) => treePositions[a.id].y - treePositions[b.id].y);
        let lastY = topPadding + headerHeight - verticalGap;
        nodesInLevel.forEach(node => {
          if (treePositions[node.id].y < lastY + verticalGap) {
            treePositions[node.id].y = lastY + verticalGap;
          }
          lastY = treePositions[node.id].y;
        });
      });
      
      // Down pass: push children to stay centered under their parent (root → leaves)
      levels.forEach(level => {
        const nodesInLevel = levelGroups[level] || [];
        nodesInLevel.forEach(node => {
          const children = parentToChildren[node.id] || [];
          const childrenWithPos = children.filter(cid => treePositions[cid]);
          
          if (childrenWithPos.length > 0) {
            const childYs = childrenWithPos.map(cid => treePositions[cid].y);
            const childCenter = (Math.min(...childYs) + Math.max(...childYs)) / 2;
            const parentY = treePositions[node.id].y;
            const offset = parentY - childCenter;
            
            if (Math.abs(offset) > 1) {
              childrenWithPos.forEach(cid => {
                treePositions[cid].y += offset;
              });
            }
          }
        });
        
        // Fix overlaps after pushing
        nodesInLevel.sort((a, b) => treePositions[a.id].y - treePositions[b.id].y);
        let lastY2 = topPadding + headerHeight - verticalGap;
        nodesInLevel.forEach(node => {
          if (treePositions[node.id].y < lastY2 + verticalGap) {
            treePositions[node.id].y = lastY2 + verticalGap;
          }
          lastY2 = treePositions[node.id].y;
        });
      });
    }
    
    // Step 5: Enforce sibling sequence order
    // After centering, siblings may be out of sequence order because centering
    // pulls parents toward their children. Fix by swapping entire subtrees.
    
    // Helper: collect all descendants of a node
    function getDescendants(nodeId, collected) {
      const children = parentToChildren[nodeId] || [];
      children.forEach(cid => {
        if (treePositions[cid] && !collected.has(cid)) {
          collected.add(cid);
          getDescendants(cid, collected);
        }
      });
      return collected;
    }
    
    const allParentIds = new Set(Object.keys(parentToChildren));
    
    for (let fix = 0; fix < 5; fix++) {
      let anyFixed = false;
      
      allParentIds.forEach(parentId => {
        const children = (parentToChildren[parentId] || [])
          .filter(cid => treePositions[cid])
          .map(cid => nodes.find(n => n.id === cid))
          .filter(Boolean);
        
        if (children.length < 2) return;
        
        // Desired order by sequence_num
        const seqSorted = [...children].sort((a, b) => 
          (a.sequence_num || 9999) - (b.sequence_num || 9999) || a.name.localeCompare(b.name)
        );
        
        // Current order by Y position
        const ySorted = [...children].sort((a, b) => 
          treePositions[a.id].y - treePositions[b.id].y
        );
        
        // Check if order matches
        const isCorrect = seqSorted.every((n, i) => n.id === ySorted[i]?.id);
        if (isCorrect) return;
        
        anyFixed = true;
        
        // Calculate the center Y and span of each child's subtree
        const subtreeInfo = {};
        seqSorted.forEach(node => {
          const descendants = getDescendants(node.id, new Set());
          const allIds = [node.id, ...descendants];
          const ys = allIds.map(id => treePositions[id]?.y).filter(y => y != null);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          subtreeInfo[node.id] = { descendants, minY, maxY, height: maxY - minY, centerY: treePositions[node.id].y };
        });
        
        // Reposition subtrees in sequence order, stacking them top to bottom
        // Use the first node's current position as the starting point
        const currentMinY = Math.min(...seqSorted.map(n => subtreeInfo[n.id].minY));
        let nextY = currentMinY;
        
        seqSorted.forEach(node => {
          const info = subtreeInfo[node.id];
          const currentSubtreeMin = info.minY;
          const delta = nextY - currentSubtreeMin;
          
          // Move the node and all its descendants
          treePositions[node.id].y += delta;
          info.descendants.forEach(did => {
            if (treePositions[did]) treePositions[did].y += delta;
          });
          
          // Next subtree starts after this one
          nextY = nextY + info.height + verticalGap;
        });
      });
      
      if (!anyFixed) break;
      
      // Re-center parents after subtree moves
      [...levels].reverse().forEach(level => {
        const nodesInLevel = levelGroups[level] || [];
        nodesInLevel.forEach(node => {
          const children = parentToChildren[node.id] || [];
          const childYs = children
            .filter(cid => treePositions[cid])
            .map(cid => treePositions[cid].y);
          if (childYs.length > 0) {
            treePositions[node.id].y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
          }
        });
      });
    }
  }
  
  // Calculate separator line positions between groups
  const separatorLines = [];
  for (let i = 0; i < groups.length - 1; i++) {
    const group1Nodes = nodes.filter(n => groups[i].nodeIds.has(n.id));
    const group2Nodes = nodes.filter(n => groups[i + 1].nodeIds.has(n.id));
    
    if (group1Nodes.length > 0 && group2Nodes.length > 0) {
      const group1MaxY = Math.max(...group1Nodes.map(n => treePositions[n.id]?.y || 0));
      const group2MinY = Math.min(...group2Nodes.map(n => treePositions[n.id]?.y || 0));
      const separatorY = (group1MaxY + group2MinY) / 2;
      separatorLines.push(separatorY);
    }
  }
  
  // Calculate total dimensions
  const maxColumnX = Math.max(...Object.values(columnXMap));
  const totalWidth = maxColumnX + leftPadding + nodeWidth;
  const allYValues = Object.values(treePositions).map(p => p.y);
  const maxY = Math.max(...allYValues, topPadding + headerHeight) + 100;
  const totalHeight = Math.max(maxY, topPadding + headerHeight + 200);
  
  return {
    positions: treePositions,
    levels: levels,
    levelGroups: levelGroups,
    dimensions: { width: totalWidth, height: totalHeight },
    settings: { columnXMap, leftPadding, topPadding, headerHeight, nodeWidth },
    separatorLines: separatorLines,
    groups: groups
  };
}

// Detect groups based on branches from L2 nodes
function detectGroups(nodes, links, childToParents, parentToChildren) {
  const groups = [];
  const visited = new Set();
  
  // Find L2 nodes (or L3 if no L2) - these are our group roots
  const l2Nodes = nodes.filter(n => n.level === 2);
  const groupRoots = l2Nodes.length > 0 ? l2Nodes : nodes.filter(n => n.level === 3);
  
  // If no clear group roots, treat everything as one group
  if (groupRoots.length === 0) {
    groups.push({
      rootId: null,
      nodeIds: new Set(nodes.map(n => n.id))
    });
    return groups;
  }
  
  // Sort group roots by sequence number
  groupRoots.sort((a, b) => (a.sequence_num || 9999) - (b.sequence_num || 9999));
  
  // For each group root, find all its descendants (children)
  groupRoots.forEach(root => {
    if (visited.has(root.id)) return;
    
    const group = {
      rootId: root.id,
      nodeIds: new Set()
    };
    
    // BFS to find all descendants
    const queue = [root.id];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (group.nodeIds.has(nodeId)) continue;
      
      group.nodeIds.add(nodeId);
      visited.add(nodeId);
      
      // Add children (nodes that feed into this one)
      const children = parentToChildren[nodeId] || [];
      children.forEach(cid => {
        if (!group.nodeIds.has(cid)) {
          queue.push(cid);
        }
      });
    }
    
    // Also include the parents of the root (L1 node)
    const parents = childToParents[root.id] || [];
    parents.forEach(pid => {
      group.nodeIds.add(pid);
      visited.add(pid);
    });
    
    if (group.nodeIds.size > 0) {
      groups.push(group);
    }
  });
  
  // Add any unvisited nodes to the last group or create new one
  const unvisited = nodes.filter(n => !visited.has(n.id));
  if (unvisited.length > 0) {
    if (groups.length > 0) {
      unvisited.forEach(n => groups[groups.length - 1].nodeIds.add(n.id));
    } else {
      groups.push({
        rootId: null,
        nodeIds: new Set(unvisited.map(n => n.id))
      });
    }
  }
  
  return groups;
}

// Helper: Spread nodes in a level to avoid overlaps (legacy, kept for compatibility)
function spreadNodesInLevel(nodesInLevel, treePositions, startY, gap) {
  let currentY = startY;
  
  nodesInLevel.forEach((node, idx) => {
    const pos = treePositions[node.id];
    const targetY = pos.targetY ?? pos.barycenter ?? currentY;
    const newY = Math.max(targetY, currentY);
    pos.y = newY;
    currentY = newY + gap;
  });
}

// ============================================================
// RENDER GRAPH
// ============================================================
export function renderGraph() {
  const container = document.getElementById('treeContainer');
  container.querySelector('svg').innerHTML = '';
  
  if (state.nodes.length === 0) {
    const svg = d3.select('#treeSvg')
      .attr('width', container.clientWidth)
      .attr('height', container.clientHeight);
    
    svg.append('text')
      .attr('x', container.clientWidth / 2)
      .attr('y', container.clientHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#999')
      .attr('font-size', '16px')
      .text(state.isAdmin ? 'Tap the + button to add a root node' : 'No nodes in this assembly');
    
    return;
  }
  
  // Always use tree layout
  const isTreeMode = true;
  const visibleNodes = state.nodes.filter(isNodeVisible);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleLinks = state.links.filter(l => 
    visibleNodeIds.has(l.parent_id) && visibleNodeIds.has(l.child_id)
  );
  
  let treeLayout = calculateTreeLayout(visibleNodes, visibleLinks);
  
  // Apply tree positions if in tree mode
  if (isTreeMode && treeLayout) {
    visibleNodes.forEach(n => {
      const pos = treeLayout.positions[n.id];
      if (pos) {
        n.treeX = pos.x;
        n.treeY = pos.y;
        n.treeWidth = pos.treeWidth;
        n.treeHeight = pos.treeHeight;
      }
    });
  }
  
  // Calculate bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  if (isTreeMode && treeLayout) {
    // Use tree layout dimensions
    const dim = treeLayout.dimensions;
    minX = 0;
    maxX = dim.width;
    minY = 0;
    maxY = dim.height;
  } else {
    visibleNodes.forEach(n => {
      minX = Math.min(minX, (n.x || 400) - 100);
      maxX = Math.max(maxX, (n.x || 400) + 100);
      minY = Math.min(minY, (n.y || 300) - 50);
      maxY = Math.max(maxY, (n.y || 300) + 50);
    });
  }
  
  const padding = isTreeMode ? 50 : 200;
  const width = Math.max(container.clientWidth, maxX - minX + padding * 2);
  const height = Math.max(container.clientHeight, maxY - minY + padding * 2);
  
  const svg = d3.select('#treeSvg')
    .attr('width', width)
    .attr('height', height);
  
  // Arrow markers - v28: smaller, better positioned
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('orient', 'auto')
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .append('path')
    .attr('d', 'M 0,1 L 8,5 L 0,9 z')
    .attr('fill', '#666');
  
  // Main group
  const g = svg.append('g')
    .attr('class', 'zoom-group');
  
  // Initialize zoom behavior - save and restore current transform
  const savedTransform = currentTransform;
  initZoom();
  
  // Either fit-to-screen (after spacing change) or restore previous zoom
  if (_fitAfterRender) {
    _fitAfterRender = false;
    fitToScreen(true);  // Instant - no animation, no disappearing
  } else if (savedTransform && savedTransform !== d3.zoomIdentity) {
    const svgEl = d3.select('#treeSvg');
    svgEl.call(zoomBehavior.transform, savedTransform);
  }
  
  // Render level headers if in tree mode and enabled
  if (isTreeMode && treeLayout && state.showLevelHeaders) {
    const { levels, settings } = treeLayout;
    const { columnXMap, leftPadding, topPadding } = settings;
    
    levels.forEach((level, colIndex) => {
      const headerX = columnXMap[level];
      
      // Create a group for the header (draggable horizontally)
      const headerGroup = g.append('g')
        .attr('class', 'level-header-group')
        .attr('data-level', level)
        .style('cursor', state.isAdmin ? 'ew-resize' : 'default');
      
      // Header background - larger hit area
      headerGroup.append('rect')
        .attr('class', 'level-header-bg')
        .attr('x', headerX - 55)
        .attr('y', topPadding - 5)
        .attr('width', 110)
        .attr('height', 35)
        .attr('rx', 6)
        .attr('fill', '#3498db')
        .attr('opacity', 0.9);
      
      // Header text
      headerGroup.append('text')
        .attr('class', 'level-header-text')
        .attr('x', headerX)
        .attr('y', topPadding + 18)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .text(`L${level}`)
        .style('pointer-events', 'none');  // Let clicks pass to bg rect
      
      // CRITICAL: Stop zoom from stealing drag events on the header
      headerGroup
        .on('mousedown', (event) => event.stopPropagation())
        .on('touchstart', (event) => event.stopPropagation());
      
      // Add HORIZONTAL drag behavior - moves this level and all children (higher level numbers)
      if (state.isAdmin) {
        const thisLevel = level;
        
        const levelDrag = d3.drag()
          .on('start', function(event) {
            // Get nodes in THIS level AND all higher levels (children = L4, L5, etc. when dragging L3)
            const nodesToMove = state.nodes.filter(n => n.level >= thisLevel);
            
            d3.select(this).attr('data-drag-start-x', event.x);
            
            // Store initial X positions
            const initialPositions = {};
            nodesToMove.forEach(node => {
              initialPositions[node.id] = node.treeX || node.x || 0;
            });
            d3.select(this).attr('data-initial-positions', JSON.stringify(initialPositions));
            d3.select(this).attr('data-node-ids', JSON.stringify(nodesToMove.map(n => n.id)));
            d3.select(this).attr('data-levels-to-move', JSON.stringify(
              [...new Set(nodesToMove.map(n => n.level))].sort((a, b) => b - a)
            ));
            
            // Store initial header X positions for levels being moved
            const headerPositions = {};
            levels.forEach((lvl, idx) => {
              if (lvl >= thisLevel) {
                headerPositions[lvl] = columnXMap[lvl];
              }
            });
            d3.select(this).attr('data-header-positions', JSON.stringify(headerPositions));
            
            // Save for undo
            state.pushPositionHistory({
              nodes: nodesToMove.map(n => ({ 
                id: n.id, 
                treeX: n.treeX || n.x
              }))
            });
            updateUndoButton();
          })
          .on('drag', function(event) {
            const startX = parseFloat(d3.select(this).attr('data-drag-start-x'));
            const initialPositions = JSON.parse(d3.select(this).attr('data-initial-positions') || '{}');
            const nodeIds = JSON.parse(d3.select(this).attr('data-node-ids') || '[]');
            const levelsToMove = JSON.parse(d3.select(this).attr('data-levels-to-move') || '[]');
            const headerPositions = JSON.parse(d3.select(this).attr('data-header-positions') || '{}');
            
            // Dampening factor for smooth control
            const DRAG_SENSITIVITY = 0.6;
            const rawDeltaX = event.x - startX;
            const deltaX = rawDeltaX * DRAG_SENSITIVITY;
            
            // Move all nodes in affected levels
            nodeIds.forEach(nodeId => {
              const node = state.nodes.find(n => n.id === nodeId);
              if (node) {
                const initialX = initialPositions[nodeId] || 0;
                const newX = initialX + deltaX;
                
                node.treeX = newX;
                
                // Update node visual position
                d3.selectAll('.node')
                  .filter(n => n.id === nodeId)
                  .attr('transform', `translate(${newX}, ${node.treeY || node.y})`);
              }
            });
            
            // Move the level headers too
            levelsToMove.forEach(lvl => {
              const initialHeaderX = headerPositions[lvl];
              if (initialHeaderX != null) {
                const newHeaderX = initialHeaderX + deltaX;
                
                d3.selectAll('.level-header-group')
                  .filter(function() {
                    return parseInt(d3.select(this).attr('data-level')) === lvl;
                  })
                  .each(function() {
                    d3.select(this).select('.level-header-bg')
                      .attr('x', newHeaderX - 55);
                    d3.select(this).select('.level-header-text')
                      .attr('x', newHeaderX);
                  });
              }
            });
            
            // Update all links
            updateAllTreeLinks();
          })
          .on('end', function() {
            // Clean up
            d3.select(this).attr('data-drag-start-x', null);
            d3.select(this).attr('data-initial-positions', null);
            d3.select(this).attr('data-node-ids', null);
            d3.select(this).attr('data-levels-to-move', null);
            d3.select(this).attr('data-header-positions', null);
            
            // Mark as needing save
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
              saveBtn.style.background = '#e74c3c';
              saveBtn.textContent = '💾 Save*';
            }
          });
        
        headerGroup.call(levelDrag);
      }
    });
  }
  
  // Render separator lines between groups if in tree mode and enabled
  if (isTreeMode && treeLayout && state.showSeparatorLines && treeLayout.separatorLines) {
    const { dimensions, settings } = treeLayout;
    const totalWidth = dimensions.width;
    
    treeLayout.separatorLines.forEach(separatorY => {
      g.append('line')
        .attr('class', 'group-separator')
        .attr('x1', 20)
        .attr('y1', separatorY)
        .attr('x2', totalWidth - 20)
        .attr('y2', separatorY)
        .attr('stroke', '#bdc3c7')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '8,4')
        .attr('opacity', 0.7);
    });
  }
  
  // Render links with curved paths
  const linkGroups = g.selectAll('.link-group')
    .data(visibleLinks, d => `${d.child_id}-${d.parent_id}`)
    .enter()
    .append('g')
    .attr('class', 'link-group');
  
  linkGroups.each(function(linkData) {
    const group = d3.select(this);
    const source = visibleNodes.find(n => n.id === linkData.child_id);
    const target = visibleNodes.find(n => n.id === linkData.parent_id);
    
    if (!source || !target) return;
    
    // Get positions based on mode
    const sourceX = isTreeMode ? (source.treeX || source.x) : source.x;
    const sourceY = isTreeMode ? (source.treeY || source.y) : source.y;
    const targetX = isTreeMode ? (target.treeX || target.x) : target.x;
    const targetY = isTreeMode ? (target.treeY || target.y) : target.y;
    const sourceW = isTreeMode ? (source.treeWidth || source.width) : source.width;
    const sourceH = isTreeMode ? (source.treeHeight || source.height) : source.height;
    const targetW = isTreeMode ? (target.treeWidth || target.width) : target.width;
    const targetH = isTreeMode ? (target.treeHeight || target.height) : target.height;
    
    // Get color
    const fastenerColor = getFastenerColor(linkData.fastener);
    
    // Draw link path
    let pathD;
    if (isTreeMode) {
      // Horizontal tree: straight lines with right-angle bends
      // Source is on LEFT (higher level), target is on RIGHT (lower level)
      // Connection: source right edge → target left edge
      const sx = sourceX + sourceW / 2;  // Right edge of source
      const sy = sourceY;
      const tx = targetX - targetW / 2;  // Left edge of target
      const ty = targetY;
      const midX = (sx + tx) / 2;
      pathD = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    } else {
      pathD = calculateLinkPath(source, target);
    }
    
    const pathEl = group.append('path')
      .attr('class', 'link')
      .attr('d', pathD)
      .attr('stroke', fastenerColor)
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrowhead)')
      .on('contextmenu', (e) => {
        if (!state.isAdmin) return;
        e.preventDefault();
        showLinkContextMenu(e.clientX, e.clientY, linkData);
      });
    
    // Link label positioned along the ACTUAL curve path using label_position (0.0 to 1.0)
    const t = linkData.label_position ?? 0.5;
    const pathNode = pathEl.node();
    const totalLen = pathNode.getTotalLength();
    const pt = pathNode.getPointAtLength(t * totalLen);
    const labelX = pt.x;
    const labelY = pt.y;
    
    const hasLabel = linkData.fastener || linkData.loctite || linkData.torque_value;
    
    // Build label lines
    const lines = [];
    
    if (linkData.fastener) {
      const fastenerText = linkData.fastener + (linkData.qty > 1 ? ` ×${linkData.qty}` : '');
      lines.push({ text: fastenerText, color: fastenerColor, bold: true });
    }
    
    if (linkData.loctite) {
      lines.push({ text: `LT-${linkData.loctite}`, color: '#9b59b6', bold: false });
    }
    
    if (linkData.torque_value) {
      const torqueText = `${linkData.torque_value}${linkData.torque_unit || 'Nm'}`;
      lines.push({ text: torqueText, color: '#e67e22', bold: false });
    }
    
    // Calculate label dimensions
    const lineHeight = 12;
    const labelHeight = hasLabel ? (lines.length * lineHeight + 8) : 20;
    const labelWidth = hasLabel ? Math.max(55, ...lines.map(l => l.text.length * 6 + 12)) : 30;
    
    // Background rect - only visible if has label, but always clickable for admin
    const labelGroup = group.append('g')
      .attr('class', 'link-label-group')
      .attr('data-link-id', linkData.id);
    
    labelGroup.append('rect')
      .attr('class', 'link-label-bg link-clickable')
      .attr('x', labelX - labelWidth / 2)
      .attr('y', labelY - labelHeight / 2)
      .attr('width', labelWidth)
      .attr('height', labelHeight)
      .attr('rx', 3)
      .attr('data-has-label', hasLabel ? 'true' : 'false')
      .style('cursor', state.isAdmin ? (hasLabel ? 'grab' : 'pointer') : 'default')
      .style('fill', hasLabel ? 'white' : 'transparent')
      .style('opacity', hasLabel ? 0.95 : 0)
      .on('click', (e) => {
        if (!state.isAdmin) return;
        // Only open editor if not dragging
        if (labelGroup.attr('data-dragged') === 'true') {
          labelGroup.attr('data-dragged', null);
          return;
        }
        e.stopPropagation();
        window.editLinkFastener(linkData.id);
      })
      .on('contextmenu', (e) => {
        if (!state.isAdmin) return;
        e.preventDefault();
        showLinkContextMenu(e.clientX, e.clientY, linkData);
      })
      .on('mouseover', function() {
        if (state.isAdmin && hasLabel) {
          d3.select(this).style('opacity', 1).attr('stroke', '#3498db').attr('stroke-width', 1);
        }
      })
      .on('mouseout', function() {
        d3.select(this).style('opacity', hasLabel ? 0.95 : 0).attr('stroke', 'none');
      });
    
    // Render label text lines
    if (hasLabel) {
      lines.forEach((line, i) => {
        const totalLabelHeight = lines.length * lineHeight;
        const lineOffsetFromCenter = -totalLabelHeight / 2 + 6 + (i * lineHeight);
        
        labelGroup.append('text')
          .attr('class', 'link-label')
          .attr('x', labelX)
          .attr('y', labelY + lineOffsetFromCenter)
          .attr('data-dy', lineOffsetFromCenter)
          .attr('text-anchor', 'middle')
          .attr('fill', line.color)
          .attr('font-weight', line.bold ? '600' : '400')
          .attr('font-size', '9px')
          .style('pointer-events', 'none')
          .text(line.text);
      });
    }
    
    // Make label draggable along the ACTUAL curve path (admin only)
    if (state.isAdmin && hasLabel) {
      const thisPathNode = pathNode;
      const thisLinkData = linkData;
      const thisLabelWidth = labelWidth;
      const thisLabelHeight = labelHeight;
      
      const labelDrag = d3.drag()
        .on('start', function(event) {
          event.sourceEvent.stopPropagation();
          d3.select(this).select('.link-label-bg').style('cursor', 'grabbing');
        })
        .on('drag', function(event) {
          labelGroup.attr('data-dragged', 'true');
          
          // Get mouse position in SVG coordinates
          const transform = currentTransform;
          const mouseX = (event.sourceEvent.offsetX - transform.x) / transform.k;
          const mouseY = (event.sourceEvent.offsetY - transform.y) / transform.k;
          
          // Find closest point on the actual path by sampling
          const pathLen = thisPathNode.getTotalLength();
          const SAMPLES = 50;
          let bestDist = Infinity;
          let bestT = 0.5;
          
          for (let s = 0; s <= SAMPLES; s++) {
            const fraction = s / SAMPLES;
            const p = thisPathNode.getPointAtLength(fraction * pathLen);
            const dist = (p.x - mouseX) ** 2 + (p.y - mouseY) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestT = fraction;
            }
          }
          
          // Refine with finer sampling around bestT
          const refineLow = Math.max(0, bestT - 1 / SAMPLES);
          const refineHigh = Math.min(1, bestT + 1 / SAMPLES);
          for (let s = 0; s <= 20; s++) {
            const fraction = refineLow + (refineHigh - refineLow) * s / 20;
            const p = thisPathNode.getPointAtLength(fraction * pathLen);
            const dist = (p.x - mouseX) ** 2 + (p.y - mouseY) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestT = fraction;
            }
          }
          
          bestT = Math.max(0.05, Math.min(0.95, bestT));
          
          // Get point on actual curve
          const newPt = thisPathNode.getPointAtLength(bestT * pathLen);
          
          // Move the label group
          d3.select(this).select('.link-label-bg')
            .attr('x', newPt.x - thisLabelWidth / 2)
            .attr('y', newPt.y - thisLabelHeight / 2);
          
          d3.select(this).selectAll('.link-label').each(function() {
            const offsetY = parseFloat(d3.select(this).attr('data-dy')) || 0;
            d3.select(this).attr('x', newPt.x).attr('y', newPt.y + offsetY);
          });
          
          d3.select(this).attr('data-current-t', bestT);
        })
        .on('end', async function() {
          d3.select(this).select('.link-label-bg').style('cursor', 'grab');
          const newT = parseFloat(d3.select(this).attr('data-current-t'));
          if (newT && !isNaN(newT)) {
            try {
              await db.from('logi_links').update({ label_position: newT }).eq('id', thisLinkData.id);
              const link = state.links.find(l => l.id === thisLinkData.id);
              if (link) link.label_position = newT;
            } catch (e) {
              console.error('Failed to save label position:', e);
            }
          }
        });
      
      labelGroup
        .on('mousedown', (event) => event.stopPropagation())
        .on('touchstart', (event) => event.stopPropagation())
        .call(labelDrag);
    }
  });
  
  // Render nodes
  const nodeElements = g.selectAll('.node')
    .data(visibleNodes, d => d.id)
    .enter()
    .append('g')
    .attr('class', d => `node ${isTreeMode ? 'tree-mode' : ''}`)
    .attr('transform', d => {
      const x = isTreeMode ? (d.treeX || d.x || 400) : (d.x || 400);
      const y = isTreeMode ? (d.treeY || d.y || 300) : (d.y || 300);
      return `translate(${x}, ${y})`;
    });
  
  nodeElements.each(function(d) {
    const group = d3.select(this);
    const color = getNodeColor(d);
    const shape = getLevelShape(d.level);
    const isMultiParent = d.goesInto.length > 1;
    const isOrphan = d.goesInto.length === 0 && d.receivesFrom.length === 0 && state.nodes.length > 1;
    
    // Get dimensions based on mode
    const nodeW = isTreeMode ? (d.treeWidth || d.width) : d.width;
    const nodeH = isTreeMode ? (d.treeHeight || d.height) : d.height;
    
    // Draw shape
    drawShape(group, shape, nodeW, nodeH, color, '#555', isMultiParent, isOrphan);
    
    // v28: Status indicator dot (top-left, visible to all)
    const statusColors = {
      'DONE': '#27ae60',
      'IN_PROGRESS': '#f39c12',
      'BLOCKED': '#e74c3c',
      'NOT_STARTED': '#95a5a6',
      'ON_HOLD': '#9b59b6',
      'REVIEW': '#3498db'
    };
    const statusColor = statusColors[d.status] || '#95a5a6';
    
    group.append('circle')
      .attr('class', 'status-indicator')
      .attr('cx', -nodeW/2 + 10)
      .attr('cy', -nodeH/2 + 10)
      .attr('r', isTreeMode ? 4 : 5)
      .attr('fill', statusColor)
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5);
    
    // Get font styling - smaller in tree mode
    const fontSize = isTreeMode ? Math.min(getLevelFontSize(d.level), 12) : getLevelFontSize(d.level);
    const fontWeight = getLevelFontWeight(d.level);
    
    // Node label
    group.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('y', d.part_number ? -3 : 4)
      .attr('font-size', fontSize + 'px')
      .attr('font-weight', fontWeight)
      .text(d.name);
    
    // Part number
    if (d.part_number) {
      group.append('text')
        .attr('class', 'node-pn')
        .attr('text-anchor', 'middle')
        .attr('y', 12)
        .attr('font-size', '7px')
        .text(d.part_number);
    }
    
    // Sequence badge - show sequence_tag (e.g. "1a") or fallback to sequence_num
    const seqDisplay = d.sequence_tag || (d.sequence_num > 0 ? String(d.sequence_num) : null);
    if (seqDisplay && state.showSequenceNumbers) {
      group.append('text')
        .attr('class', 'sequence-number')
        .attr('x', nodeW/2 + 8)
        .attr('y', -nodeH/2 + 4)
        .attr('text-anchor', 'start')
        .attr('font-size', isTreeMode ? '14px' : '16px')
        .text(seqDisplay);
    }
    
    // Qty badge — show ×N when qty > 1
    if (d.qty && d.qty > 1) {
      const qtyBadgeX = -nodeW/2 + 10;
      const qtyBadgeY = nodeH/2 - 2;
      
      group.append('rect')
        .attr('class', 'qty-badge-bg')
        .attr('x', qtyBadgeX - 12)
        .attr('y', qtyBadgeY - 10)
        .attr('width', 24)
        .attr('height', 14)
        .attr('rx', 7)
        .attr('fill', '#e74c3c')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);
      
      group.append('text')
        .attr('class', 'qty-badge-text')
        .attr('x', qtyBadgeX)
        .attr('y', qtyBadgeY)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .text(`×${d.qty}`);
    }
  });
  
  // Collapse indicators
  nodeElements.filter(d => d.receivesFrom.length > 0).each(function(d) {
    const group = d3.select(this);
    const isCollapsed = state.collapsedNodes.has(d.id);
    const nodeW = d.treeWidth || d.width;
    
    // Circle on right edge — larger for easy tapping
    group.append('circle')
      .attr('class', 'collapse-indicator')
      .attr('cx', nodeW/2 + 14)
      .attr('cy', 0)
      .attr('r', 10)
      .on('click', (e) => {
        e.stopPropagation();
        toggleCollapse(d.id);
      });
    
    // +/- text
    group.append('text')
      .attr('class', 'toggle-icon')
      .attr('x', nodeW/2 + 14)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .attr('fill', '#e67e22')
      .text(isCollapsed ? '+' : '−')
      .style('cursor', 'pointer')
      .on('click', (e) => {
        e.stopPropagation();
        toggleCollapse(d.id);
      });
  });
  
  // Setup interactions (tree mode always)
  setupNodeInteractions(nodeElements, true);
}

// ============================================================
// NODE INTERACTIONS
// ============================================================
function setupNodeInteractions(nodeElements, isTreeMode = true) {
  // Tree mode drag (vertical only with children)
  if (state.isAdmin) {
    const treeDrag = d3.drag()
      .subject(function(event, d) {
        return {
          x: d.treeX || d.x || 0,
          y: d.treeY || d.tree_y || d.y || 0
        };
      })
      .on('start', treeDragStarted)
      .on('drag', treeDragged)
      .on('end', treeDragEnded);
    
    nodeElements.call(treeDrag);
  }
  
  // Tap to show action bar (instead of immediately opening edit panel)
  nodeElements.on('click', (e, d) => {
    e.stopPropagation();
    if (state.isDragging) return;
    showNodeActionBar(d, e);
  });
  
  // Right-click context menu (still works for desktop)
  nodeElements.on('contextmenu', (e, d) => {
    if (!state.isAdmin) return;
    e.preventDefault();
    showNodeContextMenu(e.clientX, e.clientY, d);
  });
  
  // Long press for mobile context menu
  let longPressTimer = null;
  nodeElements.on('touchstart', function(e, d) {
    longPressTimer = setTimeout(() => {
      if (!state.isAdmin) return;
      e.preventDefault();
      const touch = e.touches[0];
      showNodeContextMenu(touch.clientX, touch.clientY, d);
    }, 600);
  }).on('touchend touchmove', () => {
    clearTimeout(longPressTimer);
  });
}

// ============================================================
// NODE ACTION BAR (Inline toolbar on tap)
// ============================================================
let _activeActionNodeId = null;

function showNodeActionBar(node, event) {
  const bar = document.getElementById('nodeActionBar');
  if (!bar) return;
  
  // If tapping the same node, toggle off
  if (_activeActionNodeId === node.id && bar.classList.contains('show')) {
    hideNodeActionBar();
    return;
  }
  
  _activeActionNodeId = node.id;
  
  // Position the bar above the node
  const container = document.getElementById('treeContainer');
  const containerRect = container.getBoundingClientRect();
  
  // Get the node's screen position
  const nodeScreenX = event.clientX;
  const nodeScreenY = event.clientY;
  
  // Position above the click point
  const barWidth = state.isAdmin ? 160 : 40;
  let left = nodeScreenX - containerRect.left - barWidth / 2;
  let top = nodeScreenY - containerRect.top - 50;
  
  // Clamp within container
  left = Math.max(5, Math.min(left, containerRect.width - barWidth - 5));
  top = Math.max(5, top);
  
  bar.style.left = left + 'px';
  bar.style.top = top + 'px';
  bar.classList.add('show');
  
  // Show/hide admin buttons
  const adminBtns = bar.querySelectorAll('.nab-add, .nab-delete, .nab-link');
  adminBtns.forEach(btn => {
    btn.style.display = state.isAdmin ? '' : 'none';
  });
  
  // Wire up buttons
  const nabAdd = document.getElementById('nabAdd');
  const nabEdit = document.getElementById('nabEdit');
  const nabLink = document.getElementById('nabLink');
  const nabDelete = document.getElementById('nabDelete');
  
  // Remove old listeners by cloning
  replaceNabButton('nabAdd', () => {
    hideNodeActionBar();
    window.addChildNode(node.id);
  });
  replaceNabButton('nabEdit', () => {
    hideNodeActionBar();
    window.openNodeEditPanel(node.id);
  });
  replaceNabButton('nabLink', () => {
    hideNodeActionBar();
    const hasAnyLinks = state.links.some(l => !l.deleted && (l.child_id === node.id || l.parent_id === node.id));
    if (hasAnyLinks) {
      window.showNodeLinksPanel(node.id);
    } else {
      window.showConnectNodeMenu(node.id);
    }
  });
  replaceNabButton('nabDelete', () => {
    hideNodeActionBar();
    window.confirmDeleteNode(node.id);
  });
}

function replaceNabButton(id, handler) {
  const old = document.getElementById(id);
  if (!old) return;
  const clone = old.cloneNode(true);
  clone.addEventListener('click', (e) => {
    e.stopPropagation();
    handler();
  });
  old.parentNode.replaceChild(clone, old);
}

function hideNodeActionBar() {
  const bar = document.getElementById('nodeActionBar');
  if (bar) bar.classList.remove('show');
  _activeActionNodeId = null;
}

// Hide action bar on background click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.node-action-bar') && !e.target.closest('.node')) {
    hideNodeActionBar();
  }
});

// ============================================================
// TREE MODE DRAG HANDLERS (Vertical Only + Move Children)
// ============================================================
function treeDragStarted(event, d) {
  if (!state.isAdmin) return;
  
  // Store the initial position from subject (which is the node's current position)
  d._dragStartTreeX = event.subject.x;
  d._dragStartTreeY = event.subject.y;
  
  // Get all children (descendants) that should move with this node
  d._childrenToMove = getTreeDescendants(d.id);
  
  // Store initial Y positions of all nodes to move
  d._initialPositions = {};
  d._initialPositions[d.id] = d._dragStartTreeY;
  
  d._childrenToMove.forEach(childId => {
    const childNode = state.nodes.find(n => n.id === childId);
    if (childNode) {
      d._initialPositions[childId] = childNode.treeY || childNode.tree_y || childNode.y || 0;
    }
  });
  
  // Save positions for undo
  const allNodeIds = [d.id, ...d._childrenToMove];
  state.pushPositionHistory({
    nodes: allNodeIds.map(nid => {
      const node = state.nodes.find(n => n.id === nid);
      return { id: nid, tree_y: d._initialPositions[nid] };
    })
  });
  updateUndoButton();
  
  state.isDragging = true;
}

function treeDragged(event, d) {
  if (!state.isAdmin) return;
  
  // Dampening factor to reduce sensitivity (lower = slower movement)
  // 0.25 = 25% of mouse movement speed
  const DRAG_SENSITIVITY = 0.25;
  
  const rawDeltaY = event.y - d._dragStartTreeY;
  const dampenedDeltaY = rawDeltaY * DRAG_SENSITIVITY;
  const newY = d._dragStartTreeY + dampenedDeltaY;
  
  // Keep X fixed (level column)
  const fixedX = d._dragStartTreeX;
  
  // Update main node data
  d.treeY = newY;
  d.tree_y = newY;
  
  // Update main node position visually
  d3.select(this).attr('transform', `translate(${fixedX}, ${newY})`);
  
  // Move all children by the same delta
  if (d._childrenToMove && d._childrenToMove.length > 0) {
    d._childrenToMove.forEach(childId => {
      const childNode = state.nodes.find(n => n.id === childId);
      if (childNode) {
        const initialY = d._initialPositions[childId];
        const childNewY = initialY + dampenedDeltaY;
        
        childNode.treeY = childNewY;
        childNode.tree_y = childNewY;
        
        // Update child visual position
        d3.selectAll('.node')
          .filter(n => n.id === childId)
          .attr('transform', `translate(${childNode.treeX || childNode.x}, ${childNewY})`);
      }
    });
  }
  
  // Update all connected links
  updateAllTreeLinks();
}

function treeDragEnded(event, d) {
  if (!state.isAdmin) return;
  state.isDragging = false;
  
  // Clean up temporary drag properties
  delete d._dragStartMouseY;
  delete d._dragStartTreeX;
  delete d._dragStartTreeY;
  delete d._childrenToMove;
  delete d._initialPositions;
  
  // Mark as needing save
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.style.background = '#e74c3c';
    saveBtn.textContent = '💾 Save*';
  }
}

// Get all descendants (children, grandchildren, etc.) of a node in tree
function getTreeDescendants(nodeId) {
  const descendants = [];
  const visited = new Set();
  
  // Build parent->children map
  const parentToChildren = {};
  state.links.forEach(link => {
    if (!parentToChildren[link.parent_id]) parentToChildren[link.parent_id] = [];
    parentToChildren[link.parent_id].push(link.child_id);
  });
  
  // BFS to find all descendants
  const queue = [...(parentToChildren[nodeId] || [])];
  
  while (queue.length > 0) {
    const childId = queue.shift();
    if (visited.has(childId)) continue;
    visited.add(childId);
    descendants.push(childId);
    
    // Add this child's children to queue
    const grandchildren = parentToChildren[childId] || [];
    grandchildren.forEach(gc => {
      if (!visited.has(gc)) queue.push(gc);
    });
  }
  
  return descendants;
}

// Update all links in tree mode
function updateAllTreeLinks() {
  d3.selectAll('.link-group').each(function() {
    const group = d3.select(this);
    const path = group.select('path.link');
    const linkData = path.datum();
    
    if (!linkData) return;
    
    const source = state.nodes.find(n => n.id === linkData.child_id);
    const target = state.nodes.find(n => n.id === linkData.parent_id);
    
    if (!source || !target) return;
    
    const sourceX = source.treeX || source.x;
    const sourceY = source.treeY || source.tree_y || source.y;
    const targetX = target.treeX || target.x;
    const targetY = target.treeY || target.tree_y || target.y;
    const sourceW = source.treeWidth || 60;
    const targetW = target.treeWidth || 60;
    
    const sx = sourceX + sourceW / 2;
    const sy = sourceY;
    const tx = targetX - targetW / 2;
    const ty = targetY;
    const midXPath = (sx + tx) / 2;
    
    // Update path
    path.attr('d', `M ${sx} ${sy} C ${midXPath} ${sy}, ${midXPath} ${ty}, ${tx} ${ty}`);
    
    // Get point on actual updated path curve
    const pathNode = path.node();
    const t = linkData.label_position ?? 0.5;
    const totalLen = pathNode.getTotalLength();
    const pt = pathNode.getPointAtLength(t * totalLen);
    
    // Move label group to point on curve
    const labelGroup = group.select('.link-label-group');
    if (labelGroup.size()) {
      const labelBg = labelGroup.select('.link-label-bg');
      if (labelBg.size()) {
        const width = parseFloat(labelBg.attr('width')) || 30;
        const height = parseFloat(labelBg.attr('height')) || 20;
        labelBg.attr('x', pt.x - width / 2).attr('y', pt.y - height / 2);
      }
      
      labelGroup.selectAll('.link-label').each(function() {
        const label = d3.select(this);
        const dy = parseFloat(label.attr('data-dy')) || 0;
        label.attr('x', pt.x).attr('y', pt.y + dy);
      });
    }
  });
}

function updateLinksForNode(movedNode, nodeX, nodeY) {
  // This function is now replaced by updateAllTreeLinks
  updateAllTreeLinks();
}

// ============================================================
// DRAG HANDLERS
// ============================================================
function dragStarted(event, d) {
  if (!state.isAdmin) return;
  
  // Locked nodes can only be moved with Shift key
  if (state.lockedNodes.has(d.id) && !state.shiftKeyPressed) {
    showToast('Node is locked. Use Shift+Drag to move.', 'warning');
    return;
  }
  
  // Save position for undo
  const nodesToSave = state.shiftKeyPressed ? getNodeWithChildren(d.id) : [d];
  state.pushPositionHistory({
    nodes: nodesToSave.map(n => ({ id: n.id, x: n.x, y: n.y }))
  });
  updateUndoButton();
  
  if (state.simulation) {
    state.simulation.alphaTarget(0.3).restart();
  }
  
  d.fx = d.x;
  d.fy = d.y;
  
  // Mark as dragging
  state.isDragging = true;
}

function dragged(event, d) {
  if (!state.isAdmin) return;
  
  // Locked nodes can only be moved with Shift key
  if (state.lockedNodes.has(d.id) && !state.shiftKeyPressed) return;
  
  const dx = event.x - d.fx;
  const dy = event.y - d.fy;
  
  if (state.shiftKeyPressed) {
    // Move with children (including locked ones when Shift is held)
    const nodesToMove = getNodeWithChildren(d.id);
    nodesToMove.forEach(n => {
      n.x += dx;
      n.y += dy;
      n.fx = n.x;
      n.fy = n.y;
    });
  } else {
    d.x = event.x;
    d.y = event.y;
    d.fx = event.x;
    d.fy = event.y;
  }
  
  // Update positions smoothly WITHOUT re-rendering entire graph
  updatePositions();
}

function dragEnded(event, d) {
  if (!state.isAdmin) return;
  
  // Locked nodes can only be moved with Shift key
  if (state.lockedNodes.has(d.id) && !state.shiftKeyPressed) return;
  
  if (state.simulation) {
    state.simulation.alphaTarget(0);
  }
  
  // Keep locked nodes fixed
  if (!state.lockedNodes.has(d.id)) {
    d.fx = null;
    d.fy = null;
  }
  
  // Mark as not dragging
  state.isDragging = false;
  
  // Do a full render on drag end to update bounds if needed
  renderGraph();
}

// ============================================================
// UPDATE POSITIONS (smooth, no re-render)
// ============================================================
function updatePositions() {
  const svg = d3.select('#treeSvg');
  const g = svg.select('g.zoom-group');
  
  // Update node positions
  g.selectAll('.node')
    .attr('transform', d => {
      const node = state.nodes.find(n => n.id === d.id);
      if (node) {
        return `translate(${node.x}, ${node.y})`;
      }
      return `translate(${d.x}, ${d.y})`;
    });
  
  // Update link paths
  g.selectAll('.link-group').each(function(linkData) {
    const group = d3.select(this);
    const source = state.nodes.find(n => n.id === linkData.child_id);
    const target = state.nodes.find(n => n.id === linkData.parent_id);
    
    if (source && target) {
      // Update the path
      group.select('path.link')
        .attr('d', calculateLinkPath(source, target));
      
      // Update the label position
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2 - 15;
      group.select('.link-label-group')
        .attr('transform', `translate(${midX}, ${midY})`);
    }
  });
}

function getNodeWithChildren(nodeId) {
  const result = [];
  const visited = new Set();
  
  function traverse(id) {
    if (visited.has(id)) return;
    visited.add(id);
    
    const node = state.nodes.find(n => n.id === id);
    if (node) {
      result.push(node);
      node.receivesFrom.forEach(childId => traverse(childId));
    }
  }
  
  traverse(nodeId);
  return result;
}

// ============================================================
// FORCE SIMULATION
// ============================================================
function setupForceSimulation(visibleNodes, visibleLinks) {
  // Transform links to D3 format (source/target instead of child_id/parent_id)
  const d3Links = visibleLinks.map(link => ({
    source: link.child_id,
    target: link.parent_id,
    ...link
  }));
  
  const sim = d3.forceSimulation(visibleNodes)
    .force('link', d3.forceLink(d3Links)
      .id(d => d.id)
      .distance(150)
      .strength(0.3))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('collide', d3.forceCollide().radius(d => Math.max(d.width, d.height) / 2 + 20))
    .alphaDecay(0.02)
    .on('tick', () => {
      d3.selectAll('.node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
      
      // Update links with curved paths
      d3.selectAll('.link-group').each(function(linkData) {
        const source = visibleNodes.find(n => n.id === linkData.child_id);
        const target = visibleNodes.find(n => n.id === linkData.parent_id);
        if (!source || !target) return;
        
        // Use curved Bezier path
        const pathSel = d3.select(this).select('.link');
        pathSel.attr('d', calculateLinkPath(source, target));
        
        // Get point on actual curve for label position
        const pathNode = pathSel.node();
        const t = linkData.label_position ?? 0.5;
        const pathLen = pathNode.getTotalLength();
        const pt = pathNode.getPointAtLength(t * pathLen);
        
        // Get label group and adjust position
        const labelGroup = d3.select(this).select('.link-label-group');
        if (!labelGroup.empty()) {
          const labelBg = labelGroup.select('.link-label-bg');
          if (!labelBg.empty()) {
            const bgWidth = parseFloat(labelBg.attr('width')) || 50;
            const bgHeight = parseFloat(labelBg.attr('height')) || 16;
            labelBg
              .attr('x', pt.x - bgWidth / 2)
              .attr('y', pt.y - bgHeight / 2);
          }
          
          const labels = labelGroup.selectAll('.link-label');
          const labelCount = labels.size();
          const lineHeight = 11;
          const totalHeight = labelCount * lineHeight + 6;
          
          labels.each(function(d, i) {
            d3.select(this)
              .attr('x', pt.x)
              .attr('y', pt.y - totalHeight / 2 + 10 + (i * lineHeight));
          });
        }
      });
    });
  
  state.setSimulation(sim);
}

// ============================================================
// COLLAPSE/EXPAND
// ============================================================
function toggleCollapse(nodeId) {
  state.toggleCollapsedNode(nodeId);
  renderGraph();
  setTimeout(() => fitToScreen(), 150);
}

export function expandAll() {
  state.clearCollapsedNodes();
  renderGraph();
  setTimeout(() => fitToScreen(), 150);
}

export function collapseAll() {
  state.nodes.forEach(n => {
    if (n.receivesFrom.length > 0) {
      state.collapsedNodes.add(n.id);
    }
  });
  // Persist
  if (state.currentAssemblyId) {
    try {
      localStorage.setItem(`axon_collapsed_${state.currentAssemblyId}`, JSON.stringify(Array.from(state.collapsedNodes)));
    } catch(e) {}
  }
  renderGraph();
  setTimeout(() => fitToScreen(), 150);
}

// ============================================================
// CONTEXT MENUS
// ============================================================
function showNodeContextMenu(x, y, node) {
  const menu = document.getElementById('contextMenu');
  
  // Check if node is an orphan or can be connected to more parents
  const canConnect = state.nodes.some(n => 
    n.id !== node.id && !node.goesInto.includes(n.id)
  );
  
  // Get outgoing links (this node as child → parents)
  const outgoingLinks = state.links.filter(l => l.child_id === node.id);
  const hasOutgoingLinks = outgoingLinks.length > 0;
  
  menu.innerHTML = `
    <div class="context-menu-item" onclick="window.openNodeEditPanel('${node.id}')">
      <span class="context-menu-icon">✏️</span> Edit Node
    </div>
    <div class="context-menu-item" onclick="window.addChildNode('${node.id}')">
      <span class="context-menu-icon">➕</span> Add Child
    </div>
    ${canConnect ? `
    <div class="context-menu-item" onclick="window.showConnectNodeMenu('${node.id}')">
      <span class="context-menu-icon">🔗</span> Connect to Parent
    </div>
    ` : ''}
    ${hasOutgoingLinks ? `
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" onclick="window.showNodeLinksPanel('${node.id}')">
      <span class="context-menu-icon">🔩</span> Edit Links (${outgoingLinks.length})
    </div>
    ` : ''}
    <div class="context-menu-divider"></div>
    <div class="context-menu-item ctx-seq-row" onclick="event.stopPropagation();">
      <span class="context-menu-icon">🔢</span> Seq:
      <input type="number" class="ctx-seq-input" id="ctxSeqInput" value="${node.sequence_num || ''}" min="0" placeholder="#"
        onkeydown="if(event.key==='Enter'){window.quickSetSeq('${node.id}',this.value);}"
        onclick="event.stopPropagation();">
      <button class="ctx-seq-btn" onclick="event.stopPropagation();window.quickSetSeq('${node.id}',document.getElementById('ctxSeqInput').value);">✓</button>
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="window.confirmDeleteNode('${node.id}')">
      <span class="context-menu-icon">🗑️</span> Delete Node
    </div>
  `;
  
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');
}

// Show all outgoing links for a node in side panel
function showNodeLinksPanel(nodeId) {
  hideContextMenu();
  
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  // Links where this node is the child (→ parent)
  const parentLinks = state.links.filter(l => !l.deleted && l.child_id === nodeId);
  // Links where this node is the parent (children → this)
  const childLinks = state.links.filter(l => !l.deleted && l.parent_id === nodeId);
  
  if (parentLinks.length === 0 && childLinks.length === 0) {
    showToast('No links found', 'info');
    return;
  }
  
  function linkRow(link, labelNode, direction) {
    const arrow = direction === 'parent' ? '↑' : '↓';
    const labelName = labelNode ? escapeHtml(labelNode.name) : 'Unknown';
    return `
      <div style="padding:12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;background:#fafafa;">
        <div style="font-weight:600;margin-bottom:8px;font-size:13px;color:#555;">
          ${arrow} ${labelName}
        </div>
        <div style="display:grid;grid-template-columns:1fr 60px;gap:6px;margin-bottom:6px;">
          <div>
            <label style="font-size:10px;color:#999;text-transform:uppercase;">Fastener</label>
            <input type="text" class="form-input link-edit-field" data-link-id="${link.id}" data-field="fastener"
              value="${escapeAttr(link.fastener || '')}" placeholder="e.g. M6x20"
              style="font-size:14px;padding:8px;">
          </div>
          <div>
            <label style="font-size:10px;color:#999;text-transform:uppercase;">Qty</label>
            <input type="number" class="form-input link-edit-field" data-link-id="${link.id}" data-field="qty"
              value="${link.qty || 1}" min="1"
              style="font-size:14px;padding:8px;text-align:center;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div>
            <label style="font-size:10px;color:#999;text-transform:uppercase;">Loctite</label>
            <input type="text" class="form-input link-edit-field" data-link-id="${link.id}" data-field="loctite"
              value="${escapeAttr(link.loctite || '')}" placeholder="e.g. 243"
              style="font-size:14px;padding:8px;">
          </div>
          <div>
            <label style="font-size:10px;color:#999;text-transform:uppercase;">Torque</label>
            <input type="text" class="form-input link-edit-field" data-link-id="${link.id}" data-field="torque"
              value="${link.torque_value ? link.torque_value + (link.torque_unit || 'Nm') : ''}" placeholder="e.g. 5Nm"
              style="font-size:14px;padding:8px;">
          </div>
        </div>
      </div>
    `;
  }
  
  let html = '';
  
  if (parentLinks.length > 0) {
    html += `<div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:6px;font-weight:700;">Attached to parent</div>`;
    parentLinks.forEach(link => {
      const parent = state.nodes.find(n => n.id === link.parent_id);
      html += linkRow(link, parent, 'parent');
    });
  }
  
  if (childLinks.length > 0) {
    html += `<div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:6px;margin-top:10px;font-weight:700;">Children fasteners</div>`;
    childLinks.forEach(link => {
      const child = state.nodes.find(n => n.id === link.child_id);
      html += linkRow(link, child, 'child');
    });
  }
  
  showModal(
    `🔩 Links — ${escapeHtml(node.name)}`,
    `<div style="max-height:60vh;overflow-y:auto;">${html}</div>`,
    [
      { label: 'Cancel', class: 'btn-secondary', action: hideModal },
      { label: 'Save', class: 'btn-primary', action: () => saveAllLinkEdits(nodeId) }
    ]
  );
}

async function saveAllLinkEdits(nodeId) {
  const fields = document.querySelectorAll('.link-edit-field');
  const updates = {}; // linkId → { field: value }
  
  fields.forEach(el => {
    const linkId = el.dataset.linkId;
    const field = el.dataset.field;
    if (!updates[linkId]) updates[linkId] = {};
    
    if (field === 'qty') {
      updates[linkId][field] = parseInt(el.value) || 1;
    } else if (field === 'torque') {
      const tm = el.value.trim().match(/^([\d.]+)\s*(.*)$/);
      if (tm) {
        updates[linkId].torque_value = parseFloat(tm[1]);
        updates[linkId].torque_unit = tm[2] || 'Nm';
      } else {
        updates[linkId].torque_value = null;
        updates[linkId].torque_unit = null;
      }
    } else {
      updates[linkId][field] = el.value.trim() || null;
    }
  });
  
  try {
    for (const [linkId, data] of Object.entries(updates)) {
      await db.from('logi_links').update(data).eq('id', linkId);
      // Update local state
      const link = state.links.find(l => l.id === linkId);
      if (link) Object.assign(link, data);
    }
    
    hideModal();
    showToast('Links updated', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Link save error:', e);
    showToast('Save failed: ' + e.message, 'error');
  }
}

window.showNodeLinksPanel = showNodeLinksPanel;

async function quickSetSeq(nodeId, val) {
  const seq = parseInt(val) || 0;
  hideContextMenu();
  try {
    await db.from('logi_nodes').update({
      sequence_num: seq,
      sequence_tag: seq > 0 ? String(seq) : null
    }).eq('id', nodeId);
    
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) {
      node.sequence_num = seq;
      node.sequence_tag = seq > 0 ? String(seq) : null;
    }
    
    showToast(`Seq set to ${seq}`, 'success');
    renderGraph();
  } catch (e) {
    showToast('Failed to set seq', 'error');
  }
}
window.quickSetSeq = quickSetSeq;

function showLinkContextMenu(x, y, link) {
  const menu = document.getElementById('contextMenu');
  
  menu.innerHTML = `
    <div class="context-menu-item" onclick="window.editLinkFastener('${link.id}')">
      <span class="context-menu-icon">🔧</span> Edit Fastener
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="window.confirmDeleteLink('${link.id}')">
      <span class="context-menu-icon">🗑️</span> Delete Link
    </div>
  `;
  
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');
}

// ============================================================
// NODE EDIT PANEL
// ============================================================
function openNodeEditPanel(node) {
  if (typeof node === 'string') {
    node = state.nodes.find(n => n.id === node);
  }
  if (!node) return;
  
  const content = `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" class="form-input" id="nodeEditName" value="${escapeHtml(node.name || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Part Number</label>
      <input type="text" class="form-input" id="nodeEditPN" value="${escapeHtml(node.part_number || '')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="nodeEditStatus">
          <option value="NOT_STARTED" ${node.status === 'NOT_STARTED' ? 'selected' : ''}>Not Started</option>
          <option value="IN_PROGRESS" ${node.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
          <option value="DONE" ${node.status === 'DONE' ? 'selected' : ''}>Done</option>
          <option value="BLOCKED" ${node.status === 'BLOCKED' ? 'selected' : ''}>Blocked</option>
          <option value="ON_HOLD" ${node.status === 'ON_HOLD' ? 'selected' : ''}>On Hold</option>
          <option value="REVIEW" ${node.status === 'REVIEW' ? 'selected' : ''}>Review</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Qty</label>
        <input type="number" class="form-input" id="nodeEditQty" value="${node.qty || 1}" min="1">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Group</label>
        <input type="number" class="form-input" id="nodeEditGroup" value="${node.group_num || 0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Sequence Tag</label>
        <input type="text" class="form-input" id="nodeEditSeqTag" value="${escapeHtml(node.sequence_tag || '')}" placeholder="e.g. 1a, 2b">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="nodeEditNotes">${escapeHtml(node.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Level: L${node.level}</label>
    </div>
  `;
  
  setSidePanelContent('Edit Node', content, [
    { label: 'Cancel', class: 'btn-secondary', action: closeSidePanel },
    { label: 'Save', class: 'btn-primary', action: () => saveNodeEdit(node.id) }
  ]);
  
  openSidePanel();
}

async function saveNodeEdit(nodeId) {
  const updates = {
    name: document.getElementById('nodeEditName').value.trim(),
    part_number: document.getElementById('nodeEditPN').value.trim() || null,
    status: document.getElementById('nodeEditStatus').value,
    qty: parseInt(document.getElementById('nodeEditQty').value) || 1,
    group_num: parseInt(document.getElementById('nodeEditGroup').value) || 0,
    sequence_num: parseInt(document.getElementById('nodeEditSeqTag').value) || 0,
    sequence_tag: document.getElementById('nodeEditSeqTag').value.trim() || null,
    notes: document.getElementById('nodeEditNotes').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  
  if (!updates.name) {
    showToast('Name is required', 'error');
    return;
  }
  
  try {
    const { error } = await db.from('logi_nodes').update(updates).eq('id', nodeId);
    if (error) throw error;
    
    closeSidePanel();
    showToast('Node updated', 'success');
    await loadAssemblyData(state.currentAssemblyId);
  } catch (e) {
    console.error('Error saving node:', e);
    showToast('Failed to save node', 'error');
  }
}

// ============================================================
// SPACING SETTINGS PANEL (Floating Right Side)
// ============================================================

// Load saved spacing for current assembly from localStorage
function loadSavedSpacing() {
  if (!state.currentAssemblyId) return;
  try {
    const key = `logi_spacing_${state.currentAssemblyId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      state.setLevelGaps(JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Failed to load spacing:', e);
  }
}

// Save spacing for current assembly to localStorage
function saveSpacingToStorage() {
  if (!state.currentAssemblyId || !state.levelGaps) return;
  try {
    const key = `logi_spacing_${state.currentAssemblyId}`;
    localStorage.setItem(key, JSON.stringify(state.levelGaps));
  } catch (e) {
    console.warn('Failed to save spacing:', e);
  }
}

function openSpacingSettings() {
  if (!state.isAdmin) return;
  
  const panel = document.getElementById('spacingPanel');
  const body = document.getElementById('spacingPanelBody');
  
  // Determine how many levels exist
  const maxLevel = Math.max(1, ...state.nodes.map(n => n.level || 1));
  const numGaps = Math.max(maxLevel - 1, 1);
  window._spacingNumGaps = numGaps;
  
  // Build slider rows
  let html = '';
  for (let i = 0; i < numGaps; i++) {
    const currentGap = (state.levelGaps && state.levelGaps[i] != null)
      ? state.levelGaps[i]
      : (LEVEL_HORIZONTAL_GAPS[i] != null ? LEVEL_HORIZONTAL_GAPS[i] : LEVEL_HORIZONTAL_GAPS[LEVEL_HORIZONTAL_GAPS.length - 1]);
    
    html += `
      <div class="spacing-row">
        <label>L${i + 1} ↔ L${i + 2}</label>
        <input type="range" id="spacingSlider_${i}" 
          min="80" max="500" value="${currentGap}" step="10"
          oninput="document.getElementById('spacingValue_${i}').value=this.value; window._previewSpacing();">
        <input type="number" id="spacingValue_${i}" 
          min="80" max="500" value="${currentGap}" step="10"
          oninput="document.getElementById('spacingSlider_${i}').value=this.value; window._previewSpacing();">
        <span class="spacing-unit">px</span>
      </div>
    `;
  }
  
  body.innerHTML = html;
  panel.classList.add('open');
}

function closeSpacingPanel() {
  document.getElementById('spacingPanel').classList.remove('open');
  // Auto-save on close
  saveSpacingToStorage();
}

// Preview spacing live (debounced)
let _spacingDebounce = null;
function _previewSpacing() {
  clearTimeout(_spacingDebounce);
  _spacingDebounce = setTimeout(() => {
    const numGaps = window._spacingNumGaps || 1;
    const gaps = [];
    
    for (let i = 0; i < numGaps; i++) {
      const slider = document.getElementById(`spacingSlider_${i}`);
      gaps.push(slider ? parseInt(slider.value) : 200);
    }
    
    state.setLevelGaps(gaps);
    saveSpacingToStorage();
    _fitAfterRender = true;  // Fit to screen after re-render so tree stays visible
    renderGraph();
  }, 150);
}

// Reset to config.js defaults
function _resetSpacingDefaults() {
  const numGaps = window._spacingNumGaps || 1;
  
  for (let i = 0; i < numGaps; i++) {
    const defaultVal = LEVEL_HORIZONTAL_GAPS[Math.min(i, LEVEL_HORIZONTAL_GAPS.length - 1)];
    const slider = document.getElementById(`spacingSlider_${i}`);
    const input = document.getElementById(`spacingValue_${i}`);
    if (slider) slider.value = defaultVal;
    if (input) input.value = defaultVal;
  }
  
  _previewSpacing();
}

// Set all gaps equal
function _equalizeSpacing() {
  const numGaps = window._spacingNumGaps || 1;
  let total = 0;
  
  for (let i = 0; i < numGaps; i++) {
    const slider = document.getElementById(`spacingSlider_${i}`);
    total += slider ? parseInt(slider.value) : 200;
  }
  const avg = Math.round(total / numGaps / 10) * 10;
  
  for (let i = 0; i < numGaps; i++) {
    const slider = document.getElementById(`spacingSlider_${i}`);
    const input = document.getElementById(`spacingValue_${i}`);
    if (slider) slider.value = avg;
    if (input) input.value = avg;
  }
  
  _previewSpacing();
}

// Export to window
window.openSpacingSettings = openSpacingSettings;
window.closeSpacingPanel = closeSpacingPanel;
window._previewSpacing = _previewSpacing;
window._resetSpacingDefaults = _resetSpacingDefaults;
window._equalizeSpacing = _equalizeSpacing;

// ============================================================
// EXPORTS TO WINDOW
// ============================================================
window.openNodeEditPanel = openNodeEditPanel;
window.renderGraph = renderGraph;
window.expandAll = expandAll;
window.collapseAll = collapseAll;

export { calculateLevels, getNodeColor, isNodeVisible, drawShape };
