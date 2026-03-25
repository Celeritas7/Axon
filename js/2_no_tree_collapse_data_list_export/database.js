// ============================================================
// Logi Assembly v27 - Database Module
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Create Supabase client
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test connection
export async function testConnection() {
  try {
    const { data, error } = await db
      .from('logi_assemblies')
      .select('id')
      .limit(1);
    return !error;
  } catch (e) {
    console.error('Connection test failed:', e);
    return false;
  }
}

// Update database connection indicator
export function updateDbIndicator(connected) {
  const indicator = document.getElementById('dbIndicator');
  if (indicator) {
    if (connected) {
      indicator.classList.remove('disconnected');
    } else {
      indicator.classList.add('disconnected');
    }
  }
}
