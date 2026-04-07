// ============================================================
// Axon v29 - Hybrid Chatbot Module
// Rule-based commands + Claude API for intelligent suggestions
// ============================================================

import { db } from './database.js';
import * as state from './state.js';
import { showToast } from './ui.js';
import { loadAssemblyData, renderGraph } from './graph.js';

// ============================================================
// CHATBOT STATE
// ============================================================
let chatHistory = [];
let isProcessing = false;
let lastAIResponse = { query: '', response: '', timestamp: 0 };
let lastAICallTime = 0;
const AI_COOLDOWN_MS = 5000;
const AI_CACHE_MS = 30000;

// Kanji number map
const KANJI_MAP = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function kanjiPeople(n) { return KANJI_MAP[n] || String(n); }

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

  addMessageToChat('user', message);
  input.value = '';

  isProcessing = true;

  try {
    // Try rule-based first
    const ruleResult = await tryRuleEngine(message);
    if (ruleResult) {
      addMessageToChat('assistant', ruleResult.html, false, ruleResult.isAI);
    } else {
      // Fall back to AI
      addMessageToChat('assistant', '✨ Thinking...', true);
      const aiResult = await callClaudeAPI(message);
      removeTypingIndicator();
      addMessageToChat('assistant', aiResult, false, true);
    }
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
function addMessageToChat(role, content, isTyping = false, isAI = false) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  if (isTyping) messageDiv.id = 'typingIndicator';

  const aiTag = isAI ? '<span class="ai-tag">✨ AI</span>' : '';

  messageDiv.innerHTML = `
    <div class="chat-bubble ${role}">
      ${aiTag}${content}
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
// RULE ENGINE — keyword matching for free operations
// ============================================================
async function tryRuleEngine(query) {
  const q = query.toLowerCase().trim();

  if (state.nodes.length === 0) {
    if (/status|block|progress|done|wip|parallel|what can|people|suggest|recommend/.test(q)) {
      return { html: '📭 No assembly loaded. Select a project and assembly first.', isAI: false };
    }
  }

  // ---- HELP ----
  if (/^(help|commands?|what can you)/.test(q)) {
    return { html: getHelpMessage(), isAI: false };
  }

  // ---- STATUS CHANGES (admin only) ----
  const markMatch = q.match(/(?:mark|set)\s+(.+?)\s+(?:as|to)\s+(done|wip|in.?progress|blocked|not.?started|on.?hold|review)/);
  const completeMatch = !markMatch && q.match(/^complete\s+(.+)/);
  const blockMatch = !markMatch && !completeMatch && q.match(/^block\s+(.+)/);

  if (markMatch || completeMatch || blockMatch) {
    if (!state.isAdmin) {
      return { html: '🔒 Status changes require admin access.', isAI: false };
    }
    let searchName, newStatus;
    if (markMatch) {
      searchName = markMatch[1];
      newStatus = normalizeStatus(markMatch[2]);
    } else if (completeMatch) {
      searchName = completeMatch[1];
      newStatus = 'DONE';
    } else {
      searchName = blockMatch[1];
      newStatus = 'BLOCKED';
    }

    const node = fuzzyFindNode(searchName);
    if (!node) return { html: `⚠️ Couldn't find a node matching "<strong>${esc(searchName)}</strong>".`, isAI: false };

    return { html: await updateNodeStatus(node, newStatus), isAI: false };
  }

  // ---- RESOURCE SET: "set X to N people" ----
  const peopleMatch = q.match(/set\s+(.+?)\s+to\s+(\d+)\s*(?:people|person)/);
  if (peopleMatch) {
    if (!state.isAdmin) return { html: '🔒 Resource changes require admin access.', isAI: false };
    const node = fuzzyFindNode(peopleMatch[1]);
    if (!node) return { html: `⚠️ Couldn't find node "${esc(peopleMatch[1])}".`, isAI: false };
    const count = parseInt(peopleMatch[2]);
    return { html: await updatePeopleRequired(node, count), isAI: false };
  }

  // ---- RESOURCE QUERIES ----
  const needsPeopleMatch = q.match(/(?:what|which)\s+(?:needs?|requires?)\s+(\d+)\s*(?:people|person)/);
  if (needsPeopleMatch) {
    const n = parseInt(needsPeopleMatch[1]);
    return { html: queryByPeople(n, 'exact'), isAI: false };
  }
  if (/what can (?:1|one|a single) person/.test(q) || /solo|alone/.test(q)) {
    return { html: queryByPeople(1, 'lte'), isAI: false };
  }

  // ---- STATUS QUERIES ----
  if (/^(?:what(?:'s| is)|show)?\s*(?:the\s+)?status|^overview|^summary/.test(q)) {
    return { html: getStatusSummary(), isAI: false };
  }
  if (/what(?:'s| is) blocked|blocked\??$|show blocked/.test(q)) {
    return { html: getBlockedItems(), isAI: false };
  }
  if (/what(?:'s| is) done|done\??$|show done|completed/.test(q)) {
    return { html: getByStatus('DONE', '✅', 'Done'), isAI: false };
  }
  if (/what(?:'s| is) (?:in progress|wip)|in.?progress\??$|show wip/.test(q)) {
    return { html: getByStatus('IN_PROGRESS', '🔄', 'In Progress'), isAI: false };
  }

  // ---- PROGRESS ----
  if (/progress|completion|percent/.test(q)) {
    return { html: getProgressReport(), isAI: false };
  }

  // ---- PARALLEL / AVAILABLE WORK ----
  if (/parallel|what can i|available work|work on|start\b/.test(q) && !/suggest|recommend|should|plan/.test(q)) {
    return { html: getParallelWork(), isAI: false };
  }

  // ---- FIND / SHOW NODE ----
  const findMatch = q.match(/(?:find|show|where is|locate)\s+(.+)/);
  if (findMatch) {
    return { html: findNodes(findMatch[1]), isAI: false };
  }

  // ---- LIST PARTS ----
  const listMatch = q.match(/list (?:parts|children|components)\s+(?:for|of|in)\s+(.+)/);
  if (listMatch) {
    return { html: listParts(listMatch[1]), isAI: false };
  }

  // ---- AI TRIGGERS — return null to fall through ----
  if (/suggest|recommend|prioritize|what should|critical path|optimize|schedule|plan|which.*should|how many people/.test(q)) {
    return null;
  }

  // ---- PEOPLE COUNT QUERY (generic) ----
  if (/(\d+)\s*people/.test(q)) {
    return null; // → Claude API
  }

  // If nothing matched, fall through to AI
  return null;
}

// ============================================================
// RULE-BASED RESPONSE FUNCTIONS
// ============================================================

function getStatusSummary() {
  const nodes = state.nodes;
  if (!nodes.length) return '📭 No nodes loaded.';

  const counts = {};
  nodes.forEach(n => { counts[n.status] = (counts[n.status] || 0) + 1; });
  const total = nodes.length;
  const done = counts['DONE'] || 0;
  const pct = Math.round((done / total) * 100);

  let html = `<strong>📊 ${esc(state.currentAssemblyName || 'Assembly')}</strong><br>`;
  html += `${total} nodes · ${pct}% complete<br><br>`;
  html += `✅ Done: ${done}<br>`;
  html += `🔄 In Progress: ${counts['IN_PROGRESS'] || 0}<br>`;
  html += `⬜ Not Started: ${counts['NOT_STARTED'] || 0}<br>`;
  html += `🚫 Blocked: ${counts['BLOCKED'] || 0}<br>`;
  if (counts['ON_HOLD']) html += `⏳ On Hold: ${counts['ON_HOLD']}<br>`;
  if (counts['REVIEW']) html += `👁️ Review: ${counts['REVIEW']}<br>`;

  return html;
}

function getBlockedItems() {
  const blocked = state.nodes.filter(n => n.status === 'BLOCKED');
  const onHold = state.nodes.filter(n => n.status === 'ON_HOLD');
  if (!blocked.length && !onHold.length) return '✅ No blocked or on-hold items!';

  let html = `<strong>🚫 Blocked & On-Hold</strong><br><br>`;
  blocked.forEach(n => {
    const seq = n.sequence_tag ? `<span style="color:#e74c3c">[${esc(n.sequence_tag)}]</span> ` : '';
    const people = (n.people_required || 1) > 1 ? ` ${kanjiPeople(n.people_required)}人` : '';
    html += `• ${seq}<strong>${esc(n.name)}</strong>${people}<br>`;
    if (n.notes) html += `&nbsp;&nbsp;📝 ${esc(n.notes)}<br>`;
  });
  if (onHold.length) {
    html += `<br><strong>⏳ On Hold (${onHold.length}):</strong><br>`;
    onHold.forEach(n => { html += `• ${esc(n.name)}<br>`; });
  }
  return html;
}

function getByStatus(status, icon, label) {
  const items = state.nodes.filter(n => n.status === status);
  if (!items.length) return `${icon} No ${label.toLowerCase()} items.`;
  let html = `<strong>${icon} ${label} (${items.length})</strong><br><br>`;
  items.forEach(n => {
    const seq = n.sequence_tag ? `[${esc(n.sequence_tag)}] ` : '';
    html += `• ${seq}${esc(n.name)}<br>`;
  });
  return html;
}

function getProgressReport() {
  const nodes = state.nodes;
  if (!nodes.length) return '📭 No data.';
  const done = nodes.filter(n => n.status === 'DONE').length;
  const total = nodes.length;
  const pct = Math.round((done / total) * 100);

  let html = `<strong>📈 Progress</strong><br>`;
  html += `Overall: ${done}/${total} (${pct}%)<br><br>`;

  const levels = {};
  nodes.forEach(n => {
    if (!levels[n.level]) levels[n.level] = { total: 0, done: 0 };
    levels[n.level].total++;
    if (n.status === 'DONE') levels[n.level].done++;
  });
  Object.keys(levels).sort((a, b) => a - b).forEach(lv => {
    const p = levels[lv];
    const lpct = Math.round((p.done / p.total) * 100);
    html += `L${lv}: ${progressBar(lpct)} ${p.done}/${p.total} (${lpct}%)<br>`;
  });
  return html;
}

function getParallelWork() {
  const nodes = state.nodes;
  const workable = nodes.filter(n => {
    if (n.status === 'DONE' || n.status === 'BLOCKED' || n.status === 'ON_HOLD') return false;
    return n.receivesFrom.every(cid => {
      const child = nodes.find(c => c.id === cid);
      return !child || child.status === 'DONE';
    });
  });
  workable.sort((a, b) => {
    const sa = a.sequence_tag || 'zzz';
    const sb = b.sequence_tag || 'zzz';
    if (sa !== sb) return sa.localeCompare(sb);
    return b.level - a.level;
  });

  if (!workable.length) return '🔒 All work is blocked or complete.';

  let html = `<strong>🚀 Available Work (${workable.length})</strong><br><br>`;
  workable.slice(0, 12).forEach(n => {
    const seq = n.sequence_tag ? `<span style="color:#e74c3c">[${esc(n.sequence_tag)}]</span> ` : '';
    const people = (n.people_required || 1) > 1 ? ` <span style="color:#2c3e50;font-weight:700;">${kanjiPeople(n.people_required)}人</span>` : '';
    const statusIcon = n.status === 'IN_PROGRESS' ? '🔄' : '⬜';
    html += `${statusIcon} ${seq}<strong>${esc(n.name)}</strong>${people}<br>`;
  });
  if (workable.length > 12) html += `<br>...and ${workable.length - 12} more`;
  return html;
}

function findNodes(searchTerm) {
  const q = searchTerm.toLowerCase().trim();
  const matches = state.nodes.filter(n =>
    n.name.toLowerCase().includes(q) ||
    (n.part_number && n.part_number.toLowerCase().includes(q))
  );
  if (!matches.length) return `🔍 No nodes matching "<strong>${esc(searchTerm)}</strong>".`;

  let html = `<strong>🔍 Found ${matches.length} match${matches.length > 1 ? 'es' : ''}</strong><br><br>`;
  matches.slice(0, 10).forEach(n => {
    const statusIcon = getStatusIcon(n.status);
    const seq = n.sequence_tag ? `[${esc(n.sequence_tag)}] ` : '';
    html += `${statusIcon} ${seq}${esc(n.name)} (L${n.level})<br>`;
  });
  return html;
}

function listParts(parentSearch) {
  const parent = fuzzyFindNode(parentSearch);
  if (!parent) return `⚠️ Couldn't find "${esc(parentSearch)}".`;

  const children = parent.receivesFrom.map(cid => state.nodes.find(n => n.id === cid)).filter(Boolean);
  if (!children.length) return `${esc(parent.name)} has no children (leaf node).`;

  let html = `<strong>📋 Children of ${esc(parent.name)}</strong> (${children.length})<br><br>`;
  children.sort((a, b) => (a.sequence_tag || '').localeCompare(b.sequence_tag || ''));
  children.forEach(n => {
    const seq = n.sequence_tag ? `[${esc(n.sequence_tag)}] ` : '';
    const statusIcon = getStatusIcon(n.status);
    html += `${statusIcon} ${seq}${esc(n.name)}<br>`;
  });
  return html;
}

function queryByPeople(count, mode) {
  let matches;
  if (mode === 'exact') {
    matches = state.nodes.filter(n => (n.people_required || 1) === count);
  } else {
    matches = state.nodes.filter(n => (n.people_required || 1) <= count);
  }
  matches = matches.filter(n => n.receivesFrom.length > 0);

  if (!matches.length) {
    return mode === 'exact'
      ? `No assemblies needing exactly ${count} ${count === 1 ? 'person' : 'people'}.`
      : `No assemblies doable by ${count} ${count === 1 ? 'person' : 'people'}.`;
  }

  const label = mode === 'exact'
    ? `Assemblies needing ${kanjiPeople(count)} (${count}人)`
    : `Assemblies doable by ≤${count} person${count > 1 ? 's' : ''}`;

  let html = `<strong>👥 ${label}</strong> (${matches.length})<br><br>`;
  matches.forEach(n => {
    const statusIcon = getStatusIcon(n.status);
    const seq = n.sequence_tag ? `[${esc(n.sequence_tag)}] ` : '';
    html += `${statusIcon} ${seq}${esc(n.name)} — ${kanjiPeople(n.people_required || 1)}人<br>`;
  });
  return html;
}

// ---- STATUS UPDATE ----
async function updateNodeStatus(node, newStatus) {
  try {
    const { error } = await db.from('logi_nodes').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', node.id);
    if (error) throw error;

    node.status = newStatus;
    renderGraph();
    return `✅ <strong>${esc(node.name)}</strong> → ${getStatusIcon(newStatus)} ${formatStatus(newStatus)}`;
  } catch (e) {
    console.error('Status update error:', e);
    return `❌ Failed to update status: ${e.message}`;
  }
}

// ---- PEOPLE REQUIRED UPDATE ----
async function updatePeopleRequired(node, count) {
  if (count < 1 || count > 10) return '⚠️ People required must be 1–10.';
  try {
    const { error } = await db.from('logi_nodes').update({
      people_required: count,
      updated_at: new Date().toISOString()
    }).eq('id', node.id);
    if (error) throw error;

    node.people_required = count;
    renderGraph();
    return `✅ <strong>${esc(node.name)}</strong> → ${kanjiPeople(count)}人 (${count} ${count === 1 ? 'person' : 'people'})`;
  } catch (e) {
    console.error('People update error:', e);
    return `❌ Failed to update: ${e.message}`;
  }
}

// ============================================================
// CLAUDE API — intelligent suggestions
// ============================================================
async function callClaudeAPI(userMessage) {
  const now = Date.now();

  // Rate limiting
  if (now - lastAICallTime < AI_COOLDOWN_MS) {
    const wait = Math.ceil((AI_COOLDOWN_MS - (now - lastAICallTime)) / 1000);
    return `⏳ Please wait ${wait}s before another AI query.`;
  }

  // Cache check
  if (lastAIResponse.query === userMessage && (now - lastAIResponse.timestamp) < AI_CACHE_MS) {
    return lastAIResponse.response;
  }

  lastAICallTime = now;

  try {
    const contextPrompt = buildContextPrompt(userMessage);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are Axon Assembly Assistant — a concise, mobile-friendly build advisor for robotics assembly BOMs. Rules:
• Be SHORT — 3-5 bullet points max, phone-sized responses
• Reference sequence tags (1a, 2b) as PRIMARY build order; level (L1–L8) is secondary
• Use kanji for people counts: 二=2人, 三=3人, 四=4人
• Suggest actionable next steps based on dependencies, status, and resource needs
• For scheduling: respect seq tag order (same number = parallel group, letter = dependency within group)
• Never invent data — only reference what's in the provided BOM state`,
        messages: [{ role: 'user', content: contextPrompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    const data = await response.json();
    const text = data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    const html = formatMarkdown(text);

    lastAIResponse = { query: userMessage, response: html, timestamp: now };
    return html;
  } catch (e) {
    console.error('Claude API error:', e);
    const stats = getStatusSummary();
    return `⚠️ Couldn't reach AI assistant.<br><br>Here's what I have:<br>${stats}`;
  }
}

function buildContextPrompt(userMessage) {
  const nodes = state.nodes;
  const assemblyName = state.currentAssemblyName || 'Unknown Assembly';

  const nodeLines = nodes.map(n => {
    const parts = [`"${n.name}" L${n.level} ${n.status}`];
    if (n.sequence_tag) parts.push(`seq:${n.sequence_tag}`);
    if ((n.people_required || 1) > 1) parts.push(`people:${n.people_required}`);
    if (n.receivesFrom.length > 0) parts.push(`children:${n.receivesFrom.length}`);
    if (n.notes) parts.push(`note:"${n.notes.substring(0, 60)}"`);
    return parts.join(' | ');
  });

  const total = nodes.length;
  const done = nodes.filter(n => n.status === 'DONE').length;
  const blocked = nodes.filter(n => n.status === 'BLOCKED');

  let prompt = `Assembly: ${assemblyName}\n`;
  prompt += `Progress: ${done}/${total} complete (${Math.round((done / total) * 100)}%)\n`;
  if (blocked.length) {
    prompt += `Blocked: ${blocked.map(n => n.name).join(', ')}\n`;
  }
  prompt += `\nAll nodes:\n${nodeLines.join('\n')}\n`;
  prompt += `\nUser question: ${userMessage}`;

  return prompt;
}

// ============================================================
// QUICK ACTIONS
// ============================================================
export function quickStatus() {
  document.getElementById('chatInput').value = 'status';
  sendMessage();
}

export function quickBlocked() {
  document.getElementById('chatInput').value = "what's blocked?";
  sendMessage();
}

export function quickParallel() {
  document.getElementById('chatInput').value = 'what can I work on?';
  sendMessage();
}

export function quickProgress() {
  document.getElementById('chatInput').value = 'progress';
  sendMessage();
}

// ============================================================
// HELPERS
// ============================================================
function fuzzyFindNode(search) {
  const q = search.toLowerCase().trim();
  let match = state.nodes.find(n => n.name.toLowerCase() === q);
  if (match) return match;
  match = state.nodes.find(n => n.name.toLowerCase().startsWith(q));
  if (match) return match;
  match = state.nodes.find(n => n.name.toLowerCase().includes(q));
  if (match) return match;
  match = state.nodes.find(n => n.part_number && n.part_number.toLowerCase().includes(q));
  return match || null;
}

function normalizeStatus(input) {
  const s = input.toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'done' || s === 'complete') return 'DONE';
  if (s === 'wip' || s === 'inprogress') return 'IN_PROGRESS';
  if (s === 'blocked') return 'BLOCKED';
  if (s === 'notstarted') return 'NOT_STARTED';
  if (s === 'onhold') return 'ON_HOLD';
  if (s === 'review') return 'REVIEW';
  return 'NOT_STARTED';
}

function formatStatus(status) {
  const map = {
    DONE: 'Done', IN_PROGRESS: 'In Progress', NOT_STARTED: 'Not Started',
    BLOCKED: 'Blocked', ON_HOLD: 'On Hold', REVIEW: 'Review'
  };
  return map[status] || status;
}

function getStatusIcon(status) {
  const icons = {
    DONE: '✅', IN_PROGRESS: '🔄', NOT_STARTED: '⬜',
    BLOCKED: '🚫', ON_HOLD: '⏳', REVIEW: '👁️'
  };
  return icons[status] || '❓';
}

function progressBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s/gm, '• ')
    .replace(/\n/g, '<br>');
}

function getHelpMessage() {
  return `<strong>🤖 Axon Assembly Assistant</strong><br><br>
<strong>Quick commands (free):</strong><br>
• "status" — overview<br>
• "what's blocked?" — blocked items<br>
• "progress" — completion %<br>
• "what can I work on?" — available tasks<br>
• "find [name]" — search nodes<br>
• "list parts for [name]" — children<br>
• "mark [name] as done" — change status<br>
• "set [name] to 2 people" — resource tag<br>
• "what needs 3 people?" — filter<br><br>
<strong>AI suggestions (✨):</strong><br>
• "suggest next 3 tasks"<br>
• "what should I do with 2 people?"<br>
• "what's the critical path?"<br>
• "prioritize remaining work"`;
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
