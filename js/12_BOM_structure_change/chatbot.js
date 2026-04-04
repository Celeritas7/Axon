// ============================================================
// Logi Assembly v27 - Chatbot Assistant Module
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast } from './ui.js';

// ============================================================
// CHATBOT STATE
// ============================================================
let chatHistory = [];
let isProcessing = false;

// ============================================================
// OPEN/CLOSE CHAT PANEL
// ============================================================
export function openChatPanel() {
  document.getElementById('chatPanel').classList.add('open');
  document.getElementById('chatInput').focus();
}

export function closeChatPanel() {
  document.getElementById('chatPanel').classList.remove('open');
}

export function toggleChatPanel() {
  const panel = document.getElementById('chatPanel');
  if (panel.classList.contains('open')) {
    closeChatPanel();
  } else {
    openChatPanel();
  }
}

// ============================================================
// SEND MESSAGE
// ============================================================
export async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message || isProcessing) return;
  
  // Add user message to chat
  addMessageToChat('user', message);
  input.value = '';
  
  // Process the query
  isProcessing = true;
  addMessageToChat('assistant', '🤔 Analyzing...', true);
  
  try {
    const response = await processQuery(message);
    removeTypingIndicator();
    addMessageToChat('assistant', response);
  } catch (e) {
    removeTypingIndicator();
    addMessageToChat('assistant', '❌ Error processing your request. Please try again.');
    console.error('Chatbot error:', e);
  }
  
  isProcessing = false;
}

// ============================================================
// ADD MESSAGE TO CHAT UI
// ============================================================
function addMessageToChat(role, content, isTyping = false) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  if (isTyping) messageDiv.id = 'typingIndicator';
  
  messageDiv.innerHTML = `
    <div class="chat-bubble ${role}">
      ${content}
    </div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  chatHistory.push({ role, content });
}

function removeTypingIndicator() {
  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

// ============================================================
// PROCESS QUERY - Main Logic
// ============================================================
async function processQuery(query) {
  const lowerQuery = query.toLowerCase();
  
  // Ensure we have data
  if (state.nodes.length === 0 && state.projects.length === 0) {
    return "📭 No data loaded. Please select a project and assembly first.";
  }
  
  // Route to appropriate handler based on keywords
  if (lowerQuery.includes('status') || lowerQuery.includes('overview') || lowerQuery.includes('summary')) {
    return await getStatusSummary();
  }
  
  if (lowerQuery.includes('block') || lowerQuery.includes('stuck') || lowerQuery.includes('issue') || lowerQuery.includes('problem')) {
    return await getBlockedItems();
  }
  
  if (lowerQuery.includes('parallel') || lowerQuery.includes('alternative') || lowerQuery.includes('what can i') || lowerQuery.includes('work on') || lowerQuery.includes('start')) {
    return await getParallelWorkSuggestions();
  }
  
  if (lowerQuery.includes('progress') || lowerQuery.includes('complete') || lowerQuery.includes('done')) {
    return await getProgressReport();
  }
  
  if (lowerQuery.includes('critical') || lowerQuery.includes('priority') || lowerQuery.includes('urgent')) {
    return await getCriticalPath();
  }
  
  if (lowerQuery.includes('dependency') || lowerQuery.includes('depends') || lowerQuery.includes('waiting')) {
    return await getDependencyAnalysis();
  }
  
  if (lowerQuery.includes('help') || lowerQuery.includes('command') || lowerQuery.includes('what can you')) {
    return getHelpMessage();
  }
  
  // Default response
  return getHelpMessage();
}

// ============================================================
// STATUS SUMMARY
// ============================================================
async function getStatusSummary() {
  const nodes = state.nodes;
  
  if (nodes.length === 0) {
    return "📭 No nodes in current assembly. Select an assembly to analyze.";
  }
  
  const statusCounts = {
    DONE: nodes.filter(n => n.status === 'DONE').length,
    IN_PROGRESS: nodes.filter(n => n.status === 'IN_PROGRESS').length,
    NOT_STARTED: nodes.filter(n => n.status === 'NOT_STARTED').length,
    BLOCKED: nodes.filter(n => n.status === 'BLOCKED').length,
    ON_HOLD: nodes.filter(n => n.status === 'ON_HOLD').length,
    REVIEW: nodes.filter(n => n.status === 'REVIEW').length
  };
  
  const total = nodes.length;
  const completionPercent = Math.round((statusCounts.DONE / total) * 100);
  
  let response = `📊 **Assembly Status: ${state.currentAssemblyName || 'Current'}**\n\n`;
  response += `Total nodes: **${total}**\n`;
  response += `Completion: **${completionPercent}%**\n\n`;
  response += `✅ Done: ${statusCounts.DONE}\n`;
  response += `🔄 In Progress: ${statusCounts.IN_PROGRESS}\n`;
  response += `⏸️ Not Started: ${statusCounts.NOT_STARTED}\n`;
  response += `🚫 Blocked: ${statusCounts.BLOCKED}\n`;
  response += `⏳ On Hold: ${statusCounts.ON_HOLD}\n`;
  response += `👁️ Review: ${statusCounts.REVIEW}`;
  
  return formatResponse(response);
}

// ============================================================
// BLOCKED ITEMS
// ============================================================
async function getBlockedItems() {
  const blockedNodes = state.nodes.filter(n => n.status === 'BLOCKED');
  const onHoldNodes = state.nodes.filter(n => n.status === 'ON_HOLD');
  
  if (blockedNodes.length === 0 && onHoldNodes.length === 0) {
    return "✅ Great news! No blocked or on-hold items in this assembly.";
  }
  
  let response = `🚫 **Blocked & On-Hold Items**\n\n`;
  
  if (blockedNodes.length > 0) {
    response += `**Blocked (${blockedNodes.length}):**\n`;
    blockedNodes.forEach(node => {
      const parents = getParentNames(node);
      response += `• **${node.name}** (L${node.level})`;
      if (node.notes) response += `\n  📝 ${node.notes}`;
      if (parents.length > 0) response += `\n  ⬆️ Blocks: ${parents.join(', ')}`;
      response += '\n';
    });
  }
  
  if (onHoldNodes.length > 0) {
    response += `\n**On Hold (${onHoldNodes.length}):**\n`;
    onHoldNodes.forEach(node => {
      response += `• **${node.name}** (L${node.level})`;
      if (node.notes) response += `\n  📝 ${node.notes}`;
      response += '\n';
    });
  }
  
  return formatResponse(response);
}

// ============================================================
// PARALLEL WORK SUGGESTIONS
// ============================================================
async function getParallelWorkSuggestions() {
  const nodes = state.nodes;
  
  // Find nodes that can be worked on (not blocked by others)
  const workableNodes = nodes.filter(node => {
    // Skip if already done
    if (node.status === 'DONE') return false;
    
    // Skip if blocked or on hold
    if (node.status === 'BLOCKED' || node.status === 'ON_HOLD') return false;
    
    // Check if all children are done (no dependencies blocking)
    const childrenDone = node.receivesFrom.every(childId => {
      const child = nodes.find(n => n.id === childId);
      return !child || child.status === 'DONE';
    });
    
    return childrenDone;
  });
  
  // Sort by level (higher level = raw materials = can start first)
  workableNodes.sort((a, b) => b.level - a.level);
  
  if (workableNodes.length === 0) {
    return "🔒 All available work is either blocked or completed. Check the blocked items for resolution.";
  }
  
  let response = `🚀 **Available Work (${workableNodes.length} items)**\n\n`;
  response += `These items have no blocking dependencies and can be worked on in parallel:\n\n`;
  
  // Group by level
  const byLevel = {};
  workableNodes.forEach(node => {
    const level = node.level;
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(node);
  });
  
  Object.keys(byLevel).sort((a, b) => b - a).forEach(level => {
    response += `**Level ${level}** (${byLevel[level].length} items):\n`;
    byLevel[level].slice(0, 5).forEach(node => {
      const statusIcon = getStatusIcon(node.status);
      response += `${statusIcon} ${node.name}`;
      if (node.part_number) response += ` (${node.part_number})`;
      response += '\n';
    });
    if (byLevel[level].length > 5) {
      response += `  ...and ${byLevel[level].length - 5} more\n`;
    }
    response += '\n';
  });
  
  response += `💡 **Tip:** Start with higher-level items (raw materials) to unblock downstream work.`;
  
  return formatResponse(response);
}

// ============================================================
// PROGRESS REPORT
// ============================================================
async function getProgressReport() {
  const nodes = state.nodes;
  
  if (nodes.length === 0) {
    return "📭 No data to analyze.";
  }
  
  const done = nodes.filter(n => n.status === 'DONE');
  const inProgress = nodes.filter(n => n.status === 'IN_PROGRESS');
  const total = nodes.length;
  
  // Calculate by level
  const levelProgress = {};
  for (let l = 1; l <= 8; l++) {
    const levelNodes = nodes.filter(n => n.level === l);
    if (levelNodes.length > 0) {
      const levelDone = levelNodes.filter(n => n.status === 'DONE').length;
      levelProgress[l] = {
        total: levelNodes.length,
        done: levelDone,
        percent: Math.round((levelDone / levelNodes.length) * 100)
      };
    }
  }
  
  let response = `📈 **Progress Report**\n\n`;
  response += `**Overall:** ${done.length}/${total} complete (${Math.round((done.length/total)*100)}%)\n`;
  response += `**In Progress:** ${inProgress.length} items\n\n`;
  
  response += `**By Level:**\n`;
  Object.keys(levelProgress).forEach(level => {
    const p = levelProgress[level];
    const bar = getProgressBar(p.percent);
    response += `L${level}: ${bar} ${p.done}/${p.total} (${p.percent}%)\n`;
  });
  
  return formatResponse(response);
}

// ============================================================
// CRITICAL PATH ANALYSIS
// ============================================================
async function getCriticalPath() {
  const nodes = state.nodes;
  
  // Find root node (L1)
  const root = nodes.find(n => n.goesInto.length === 0);
  
  if (!root) {
    return "⚠️ No root node found. Cannot analyze critical path.";
  }
  
  // Find longest path to incomplete items
  const incompletePaths = [];
  
  function findPaths(nodeId, path = []) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const newPath = [...path, node];
    
    if (node.status !== 'DONE' && node.receivesFrom.length === 0) {
      // Leaf node that's not done
      incompletePaths.push(newPath);
    }
    
    node.receivesFrom.forEach(childId => {
      findPaths(childId, newPath);
    });
  }
  
  findPaths(root.id);
  
  // Sort by path length (longest = most critical)
  incompletePaths.sort((a, b) => b.length - a.length);
  
  if (incompletePaths.length === 0) {
    return "✅ All paths complete! Assembly is ready.";
  }
  
  let response = `⚡ **Critical Path Analysis**\n\n`;
  response += `Found **${incompletePaths.length}** incomplete paths.\n\n`;
  
  response += `**Longest incomplete path (${incompletePaths[0].length} steps):**\n`;
  incompletePaths[0].forEach((node, i) => {
    const statusIcon = getStatusIcon(node.status);
    const indent = '  '.repeat(i);
    response += `${indent}${i > 0 ? '↳ ' : ''}${statusIcon} ${node.name}\n`;
  });
  
  const blockedInPath = incompletePaths[0].filter(n => n.status === 'BLOCKED');
  if (blockedInPath.length > 0) {
    response += `\n🚨 **${blockedInPath.length} blocked items in critical path!**`;
  }
  
  return formatResponse(response);
}

// ============================================================
// DEPENDENCY ANALYSIS
// ============================================================
async function getDependencyAnalysis() {
  const nodes = state.nodes;
  
  // Find nodes with most dependents (most critical)
  const dependentCounts = nodes.map(node => {
    // Count how many nodes depend on this one (directly or indirectly)
    let count = 0;
    nodes.forEach(other => {
      if (other.receivesFrom.includes(node.id)) count++;
    });
    return { node, dependents: count };
  }).filter(d => d.dependents > 0).sort((a, b) => b.dependents - a.dependents);
  
  // Find nodes waiting on blocked items
  const waitingOnBlocked = nodes.filter(node => {
    return node.receivesFrom.some(childId => {
      const child = nodes.find(n => n.id === childId);
      return child && (child.status === 'BLOCKED' || child.status === 'ON_HOLD');
    });
  });
  
  let response = `🔗 **Dependency Analysis**\n\n`;
  
  if (dependentCounts.length > 0) {
    response += `**Most Critical Components** (most dependents):\n`;
    dependentCounts.slice(0, 5).forEach(d => {
      const statusIcon = getStatusIcon(d.node.status);
      response += `${statusIcon} **${d.node.name}** → ${d.dependents} items depend on this\n`;
    });
  }
  
  if (waitingOnBlocked.length > 0) {
    response += `\n**Waiting on Blocked Items** (${waitingOnBlocked.length}):\n`;
    waitingOnBlocked.slice(0, 5).forEach(node => {
      response += `• ${node.name} (L${node.level})\n`;
    });
    if (waitingOnBlocked.length > 5) {
      response += `  ...and ${waitingOnBlocked.length - 5} more\n`;
    }
  }
  
  return formatResponse(response);
}

// ============================================================
// HELP MESSAGE
// ============================================================
function getHelpMessage() {
  return formatResponse(`🤖 **Assembly Assistant**

I can help you analyze your assembly data. Try asking:

• **"What's the status?"** - Get overall summary
• **"What's blocked?"** - Find blocked items
• **"What can I work on?"** - Parallel work suggestions  
• **"Show progress"** - Progress by level
• **"What's critical?"** - Critical path analysis
• **"Show dependencies"** - Dependency analysis

💡 I analyze the currently loaded assembly.`);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getParentNames(node) {
  return node.goesInto.map(parentId => {
    const parent = state.nodes.find(n => n.id === parentId);
    return parent ? parent.name : 'Unknown';
  });
}

function getStatusIcon(status) {
  const icons = {
    DONE: '✅',
    IN_PROGRESS: '🔄',
    NOT_STARTED: '⬜',
    BLOCKED: '🚫',
    ON_HOLD: '⏳',
    REVIEW: '👁️'
  };
  return icons[status] || '❓';
}

function getProgressBar(percent) {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatResponse(text) {
  // Convert markdown-like formatting to HTML
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// ============================================================
// QUICK ACTIONS
// ============================================================
export function quickStatus() {
  document.getElementById('chatInput').value = "What's the status?";
  sendMessage();
}

export function quickBlocked() {
  document.getElementById('chatInput').value = "What's blocked?";
  sendMessage();
}

export function quickParallel() {
  document.getElementById('chatInput').value = "What can I work on?";
  sendMessage();
}

export function quickProgress() {
  document.getElementById('chatInput').value = "Show progress";
  sendMessage();
}

// ============================================================
// EXPORTS TO WINDOW
// ============================================================
window.openChatPanel = openChatPanel;
window.closeChatPanel = closeChatPanel;
window.toggleChatPanel = toggleChatPanel;
window.sendMessage = sendMessage;
window.quickStatus = quickStatus;
window.quickBlocked = quickBlocked;
window.quickParallel = quickParallel;
window.quickProgress = quickProgress;
