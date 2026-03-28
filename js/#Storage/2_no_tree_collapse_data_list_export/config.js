// ============================================================
// Logi Assembly v29 - Configuration
// ============================================================

// Supabase Configuration
export const SUPABASE_URL = 'https://wylxvmkcrexwfpjpbhyy.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHh2bWtjcmV4d2ZwanBiaHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzkxMDYsImV4cCI6MjA4NDIxNTEwNn0.6Bxo42hx4jwlJGWnfjiTpiDUsYfc1QLTN3YtrU1efak';

// Admin email (checked server-side via RLS, client uses for UI only)
export const ADMIN_EMAIL = 'mangaonkaraniket@gmail.com';

// ============================================================
// LEVEL STYLING - Colors, Shapes, Fonts
// ============================================================

// Level Colors (L1 = Final Product → L8+ = Raw Parts)
export const LEVEL_COLORS = [
  "#a5d6a7", // L1: Green (Final Product)
  "#e1bee7", // L2: Purple
  "#b3e5fc", // L3: Light Blue
  "#c8e6c9", // L4: Light Green
  "#fff9c4", // L5: Yellow
  "#ffe0b2", // L6: Orange
  "#ffcdd2", // L7: Pink
  "#e8e8e8"  // L8+: Gray (Raw Parts)
];

// Level Shapes
export const LEVEL_SHAPES = [
  "stadium",           // L1: Stadium (Final Product)
  "octagon",           // L2: Octagon
  "hexagon",           // L3: Hexagon
  "pentagon",          // L4: Pentagon
  "diamond",           // L5: Diamond
  "rounded_rectangle", // L6: Rounded Rectangle
  "rectangle",         // L7: Rectangle
  "parallelogram"      // L8+: Parallelogram (Raw Parts)
];

// Level Font Sizes (v28: Smaller, proportional 14px → 10px)
export const LEVEL_FONT_SIZES = [
  14, // L1
  13, // L2
  12, // L3
  12, // L4
  11, // L5
  11, // L6
  10, // L7
  10  // L8+
];

// Level Font Weights
export const LEVEL_FONT_WEIGHTS = [
  700, // L1: Bold
  600, // L2: Semi-bold
  600, // L3: Semi-bold
  500, // L4: Medium
  500, // L5: Medium
  400, // L6: Normal
  400, // L7: Normal
  400  // L8+: Normal
];

// Group Colors (for color mode)
export const GROUP_COLORS = [
  "#78909c", "#42a5f5", "#ff7043", "#ec407a",
  "#ab47bc", "#26a69a", "#d4e157", "#ffa726"
];

// Status Colors
export const STATUS_COLORS = {
  'DONE': { fill: "#27ae60", stroke: "#1e8449", bg: "#d5f5e3" },
  'IN_PROGRESS': { fill: "#f1c40f", stroke: "#d4ac0d", bg: "#fef9e7" },
  'NOT_STARTED': { fill: "#bdc3c7", stroke: "#95a5a6", bg: "#f4f6f6" },
  'BLOCKED': { fill: "#e74c3c", stroke: "#c0392b", bg: "#fdedec" },
  'ON_HOLD': { fill: "#e67e22", stroke: "#d35400", bg: "#fdebd0" },
  'REVIEW': { fill: "#3498db", stroke: "#2980b9", bg: "#ebf5fb" }
};

// Fastener Colors
export const FASTENER_COLORS = {
  CBE: "#3498db",
  CBST: "#9b59b6",
  M: "#27ae60",
  MS: "#e67e22",
  PRESS: "#e74c3c",
  ORIGINAL: "#7f8c8d",
  OTHER: "#2c3e50"
};

// Sequence Badges
export const SEQUENCE_BADGES = [
  '⓪','①','②','③','④','⑤','⑥','⑦','⑧','⑨',
  '⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'
];

// ============================================================
// NODE DIMENSIONS
// ============================================================
export const NODE_WIDTH_BASE = 120;
export const NODE_WIDTH_MAX = 160;

// ============================================================
// TREE LAYOUT - Per-Level Horizontal Gaps
// Gap between level N and level N+1 (in pixels)
// Index 0 = gap between L1 and L2, Index 1 = gap between L2 and L3, etc.
// If fewer entries than levels, the last value is repeated.
// ============================================================
export const LEVEL_HORIZONTAL_GAPS = [
  300,  // L1 → L2
  250,  // L2 → L3
  220,  // L3 → L4
  200,  // L4 → L5
  180,  // L5 → L6
  160,  // L6 → L7
  150,  // L7 → L8+
];

// Helper: Get gap between two adjacent levels
export function getLevelGap(fromLevelIndex) {
  if (fromLevelIndex < 0) return 0;
  if (fromLevelIndex < LEVEL_HORIZONTAL_GAPS.length) {
    return LEVEL_HORIZONTAL_GAPS[fromLevelIndex];
  }
  return LEVEL_HORIZONTAL_GAPS[LEVEL_HORIZONTAL_GAPS.length - 1];
}

// ============================================================
// PROJECT STYLING
// ============================================================
export const PROJECT_COLORS = [
  { name: 'Blue', value: '#3498db' },
  { name: 'Green', value: '#27ae60' },
  { name: 'Purple', value: '#9b59b6' },
  { name: 'Red', value: '#e74c3c' },
  { name: 'Orange', value: '#f39c12' },
  { name: 'Teal', value: '#1abc9c' },
  { name: 'Pink', value: '#e91e63' },
  { name: 'Yellow', value: '#f1c40f' },
  { name: 'Slate', value: '#607d8b' },
  { name: 'Brown', value: '#795548' },
  { name: 'Indigo', value: '#3f51b5' },
  { name: 'Cyan', value: '#00bcd4' }
];

export const PROJECT_EMOJIS = [
  '📁', '🔧', '💻', '🚗', '📦', '⚙️', '🏗️', '🔩',
  '🛠️', '🏭', '🔍', '🔬', '💡', '🎯', '🚀', '⭐',
  '📋', '📌', '🖥️', '📱', '🤖', '🎨', '📊', '🌟'
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Get level-based styling
export function getLevelColor(level) {
  return LEVEL_COLORS[Math.min(level - 1, 7)];
}

export function getLevelShape(level) {
  return LEVEL_SHAPES[Math.min(level - 1, 7)];
}

export function getLevelFontSize(level) {
  return LEVEL_FONT_SIZES[Math.min(level - 1, 7)];
}

export function getLevelFontWeight(level) {
  return LEVEL_FONT_WEIGHTS[Math.min(level - 1, 7)];
}

export function getGroupColor(groupNum) {
  return GROUP_COLORS[(groupNum || 0) % GROUP_COLORS.length];
}

export function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS['NOT_STARTED'];
}

export function getFastenerColor(type) {
  if (!type) return FASTENER_COLORS.OTHER;
  const prefix = type.toUpperCase().split(/[^A-Z]/)[0];
  return FASTENER_COLORS[prefix] || FASTENER_COLORS.OTHER;
}

export function getSequenceBadge(num) {
  return SEQUENCE_BADGES[Math.min(num, SEQUENCE_BADGES.length - 1)] || num.toString();
}

// Get random project styling
export function getRandomEmoji() {
  return PROJECT_EMOJIS[Math.floor(Math.random() * PROJECT_EMOJIS.length)];
}

export function getRandomColor() {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)].value;
}
