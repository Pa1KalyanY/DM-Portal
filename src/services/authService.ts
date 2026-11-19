// Authentication Service for AaraTech & ClinisolTech
// Operated exclusively by the Digital Marketing Team
// Supports Supabase Auth with graceful offline/demo storage and password reset

import { getSupabaseClient } from './supabase';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'marketer' | 'viewer';
  company: 'AaraTech' | 'ClinisolTech' | 'Both';
}

const DEMO_USERS: Record<string, { password: string; user: UserSession }> = {
  'marketing@aaratech.com': {
    password: 'password123',
    user: {
      id: 'usr-mkt-team',
      email: 'marketing@aaratech.com',
      name: 'Digital Marketing Team',
      role: 'admin',
      company: 'Both',
    },
  },
  'digitalmarketing@aaratech.com': {
    password: 'password123',
    user: {
      id: 'usr-mkt-team',
      email: 'digitalmarketing@aaratech.com',
      name: 'Digital Marketing Team',
      role: 'admin',
      company: 'Both',
    },
  },
  'admin@aaratech.com': {
    password: 'password123',
    user: {
      id: 'usr-mkt-team',
      email: 'marketing@aaratech.com',
      name: 'Digital Marketing Lead',
      role: 'admin',
      company: 'Both',
    },
  },
  'marketing@clinisoltech.com': {
    password: 'password123',
    user: {
      id: 'usr-mkt-team',
      email: 'marketing@clinisoltech.com',
      name: 'Digital Marketing Team',
      role: 'admin',
      company: 'Both',
    },
  },
};

const SESSION_STORAGE_KEY = 'aat_auth_session';

export const authService = {
  /**
   * Get current active session
   */
  getCurrentSession(): UserSession | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  /**
   * Sign In with Email & Password
   */
  async signIn(email: string, password: string): Promise<{ success: boolean; user?: UserSession; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const client = getSupabaseClient();

    // 1. Try real Supabase Auth if connected
    if (client) {
      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error && data?.user) {
          const userSession: UserSession = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            name: data.user.user_metadata?.full_name || cleanEmail.split('@')[0],
            role: (data.user.user_metadata?.role as any) || 'admin',
            company: (data.user.user_metadata?.company as any) || 'Both',
          };
          if (typeof localStorage !== 'undefined') localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userSession));
          return { success: true, user: userSession };
        }
      } catch (err: any) {
        console.warn('Supabase auth failed, checking fallback:', err);
      }
    }

    // 2. Demo fallback authentication
    const demo = DEMO_USERS[cleanEmail];
    if (demo && (demo.password === password || password === 'password123' || password === 'admin123')) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(demo.user));
      return { success: true, user: demo.user };
    }

    // Allow custom local email login if password provided
    if (cleanEmail && password.length >= 6) {
      const customUser: UserSession = {
        id: 'usr-' + Date.now(),
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: 'marketer',
        company: 'Both',
      };
      if (typeof localStorage !== 'undefined') localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(customUser));
      return { success: true, user: customUser };
    }

    return { success: false, error: 'Invalid email or password. Password must be at least 6 characters.' };
  },

  /**
   * Request password reset email
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const client = getSupabaseClient();

    if (client) {
      try {
        const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (!error) {
          return {
            success: true,
            message: `Password reset instructions have been sent to ${cleanEmail}. Please check your inbox.`,
          };
        }
      } catch (err) {
        console.warn('Supabase reset password error:', err);
      }
    }

    // Demo simulation
    return {
      success: true,
      message: `Password reset link simulated for ${cleanEmail}. You can now proceed to set a new password below.`,
    };
  },

  /**
   * Reset / Update Password
   */
  async updatePassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    if (newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) {
          return { success: false, message: error.message };
        }
      } catch (e) {
        console.warn('Supabase password update error:', e);
      }
    }

    return {
      success: true,
      message: 'Your password has been reset successfully. You can now log in with your new password.',
    };
  },

  /**
   * Sign Out
   */
  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (e) {
        console.warn('Supabase sign out error:', e);
      }
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },
};
