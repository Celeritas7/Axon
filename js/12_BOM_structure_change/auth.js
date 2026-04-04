// ============================================================
// Logi Assembly v29 - Authentication Module (Supabase Auth)
// ============================================================

import { db } from './database.js';
import { ADMIN_EMAIL } from './config.js';
import * as state from './state.js';
import { showToast, showAdminUI, showGuestUI, hideAdminUI } from './ui.js';
import { loadProjects } from './projects.js';
import { loadAssembliesForProject } from './assemblies.js';

// ============================================================
// INITIALIZE AUTH - Check existing session
// ============================================================
export async function checkAdminStatus() {
  state.setIsAdmin(false);
  
  try {
    // Check if user already has a session
    const { data: { session }, error } = await db.auth.getSession();
    
    if (error) {
      console.error('Error getting session:', error);
      return;
    }
    
    if (session?.user) {
      handleAuthUser(session.user);
    }
    
    // Listen for auth state changes (login, logout, token refresh)
    db.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session?.user) {
        handleAuthUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        handleSignOut();
      }
    });
    
  } catch (e) {
    console.error('Auth initialization failed:', e);
  }
}

// ============================================================
// HANDLE AUTHENTICATED USER
// ============================================================
function handleAuthUser(user) {
  const email = user.email;
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email?.split('@')[0] || 'User';
  
  const userInfo = { email, name };
  state.setGoogleUser(userInfo);
  
  if (email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    state.setIsAdmin(true);
    showAdminUI(userInfo);
    showToast(`Welcome, ${name}!`, 'success');
    console.log('Admin logged in via Supabase Auth, isAdmin =', state.isAdmin);
  } else {
    state.setIsAdmin(false);
    showGuestUI(userInfo);
    showToast('Logged in as guest (view only)', 'info');
  }
  
  // Reload data for current page
  reloadCurrentPage();
}

// ============================================================
// HANDLE SIGN OUT
// ============================================================
function handleSignOut() {
  state.setIsAdmin(false);
  state.setGoogleUser(null);
  hideAdminUI();
  reloadCurrentPage();
}

// ============================================================
// RELOAD CURRENT PAGE DATA
// ============================================================
function reloadCurrentPage() {
  console.log('Reloading data for page:', state.currentPage, 'isAdmin:', state.isAdmin);
  if (state.currentPage === 'home') {
    loadProjects();
  } else if (state.currentPage === 'assemblies' && state.currentProject) {
    loadAssembliesForProject(state.currentProject.id);
  }
}

// ============================================================
// LOGIN HANDLER - Supabase OAuth with Google
// ============================================================
export async function handleLogin() {
  try {
    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    
    if (error) {
      console.error('Login error:', error);
      showToast('Login failed: ' + error.message, 'error');
    }
    // User will be redirected to Google, then back to the app
    // The onAuthStateChange listener will handle the rest
  } catch (e) {
    console.error('Login failed:', e);
    showToast('Login failed. Please try again.', 'error');
  }
}

// ============================================================
// LOGOUT HANDLER
// ============================================================
export async function handleLogout() {
  try {
    const { error } = await db.auth.signOut();
    
    if (error) {
      console.error('Logout error:', error);
      showToast('Logout failed: ' + error.message, 'error');
      return;
    }
    
    state.setIsAdmin(false);
    state.setGoogleUser(null);
    hideAdminUI();
    showToast('Logged out', 'info');
    
    // Reload current page to remove admin content
    reloadCurrentPage();
    
  } catch (e) {
    console.error('Logout failed:', e);
    showToast('Logout failed', 'error');
  }
}
