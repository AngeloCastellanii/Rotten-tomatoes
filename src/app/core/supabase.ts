import { Preferences } from '@capacitor/preferences';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

const storage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

export const isSupabaseConfigured = Boolean(
  environment.supabaseUrl &&
  environment.supabaseAnonKey &&
  !environment.supabaseUrl.includes('TU_PROYECTO') &&
  !environment.supabaseAnonKey.includes('sb_publishable_...'),
);

export const isTmdbConfigured = Boolean(
  environment.tmdbApiKey && environment.tmdbApiKey !== 'tu_api_key',
);

export const supabase: SupabaseClient = createClient(
  environment.supabaseUrl || 'https://placeholder.supabase.co',
  environment.supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
