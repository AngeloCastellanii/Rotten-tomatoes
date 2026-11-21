import { Injectable, signal } from '@angular/core';

import { mapAuthError } from './auth-errors';
import { mapProfile } from './mappers';
import type { ActionResult, Profile, UserRole } from './models';
import { isSupabaseConfigured, supabase } from './supabase';
import { normalizeText } from './text';
import { clipText, validateEmail, validateName, validatePassword, validateRole } from './validation';
import { LIMITS } from './limits';

const CONFIG_ERROR =
  'Supabase no está configurado. Crea un archivo .env con SUPABASE_URL y SUPABASE_ANON_KEY y vuelve a iniciar la app.';

let authInFlight = false;
let authCooldownUntil = 0;

function beginAuthRequest(): ActionResult {
  const now = Date.now();
  if (now < authCooldownUntil) {
    const seconds = Math.max(1, Math.ceil((authCooldownUntil - now) / 1000));
    return { ok: false, error: `Espera ${seconds}s antes de intentar de nuevo.` };
  }
  if (authInFlight) {
    return { ok: false, error: 'Ya hay un intento en curso. Espera un momento.' };
  }
  authInFlight = true;
  return { ok: true };
}

function endAuthRequest(failed: boolean) {
  authInFlight = false;
  if (failed) {
    authCooldownUntil = Date.now() + 2500;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<Profile | null>(null);
  readonly loading = signal(true);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.bootstrap();
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
    role: string;
  }): Promise<ActionResult> {
    if (!isSupabaseConfigured) {
      return { ok: false, error: CONFIG_ERROR };
    }
    const gate = beginAuthRequest();
    if (!gate.ok) {
      return gate;
    }

    const nameCheck = validateName(input.name);
    if (!nameCheck.ok) {
      endAuthRequest(false);
      return { ok: false, error: nameCheck.error ?? 'Nombre inválido.' };
    }
    const emailCheck = validateEmail(input.email);
    if (!emailCheck.ok) {
      endAuthRequest(false);
      return { ok: false, error: emailCheck.error ?? 'Correo inválido.' };
    }
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.ok) {
      endAuthRequest(false);
      return { ok: false, error: passwordCheck.error ?? 'Contraseña inválida.' };
    }
    if (!validateRole(input.role)) {
      endAuthRequest(false);
      return { ok: false, error: 'Elige si eres público o crítico.' };
    }

    const name = normalizeText(input.name);
    const email = normalizeText(input.email).toLowerCase();
    const role: UserRole = input.role;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: { data: { name, role } },
      });
      if (error) {
        endAuthRequest(true);
        return { ok: false, error: mapAuthError(error) };
      }
      if (!data.user || !data.session) {
        endAuthRequest(true);
        return {
          ok: false,
          error:
            'La cuenta ya existe. En Supabase abre Authentication, Providers, Email y apaga Confirm email. Después entra con Ya tengo cuenta.',
        };
      }

      const profile = await this.ensureProfile({ id: data.user.id, name, email, role });
      this.user.set(profile);
      endAuthRequest(false);
      return profile
        ? { ok: true }
        : { ok: false, error: 'La cuenta se creó, pero no se pudo guardar el perfil.' };
    } catch (error) {
      endAuthRequest(true);
      return { ok: false, error: mapAuthError(error) };
    }
  }

  async login(input: { email: string; password: string }): Promise<ActionResult> {
    if (!isSupabaseConfigured) {
      return { ok: false, error: CONFIG_ERROR };
    }
    const gate = beginAuthRequest();
    if (!gate.ok) {
      return gate;
    }

    const emailCheck = validateEmail(input.email);
    if (!emailCheck.ok) {
      endAuthRequest(false);
      return { ok: false, error: emailCheck.error ?? 'Correo inválido.' };
    }
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.ok) {
      endAuthRequest(false);
      return { ok: false, error: passwordCheck.error ?? 'Contraseña inválida.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizeText(input.email).toLowerCase(),
        password: input.password,
      });
      if (error || !data.user) {
        endAuthRequest(true);
        return { ok: false, error: mapAuthError(error ?? 'Correo o contraseña incorrectos.') };
      }
      await this.loadProfile(data.user.id, data.user.email ?? '', data.user.user_metadata);
      endAuthRequest(false);
      return { ok: true };
    } catch (error) {
      endAuthRequest(true);
      return { ok: false, error: mapAuthError(error) };
    }
  }

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {
      // La sesión local se cierra igual si el servidor no responde.
    }
    this.user.set(null);
  }

  async updateProfile(input: {
    name: string;
    email: string;
    role: string;
    password?: string;
  }): Promise<ActionResult> {
    const current = this.user();
    if (!current) {
      return { ok: false, error: 'No hay sesión activa.' };
    }
    if (!isSupabaseConfigured) {
      return { ok: false, error: CONFIG_ERROR };
    }

    const nameCheck = validateName(input.name);
    if (!nameCheck.ok) {
      return { ok: false, error: nameCheck.error ?? 'Nombre inválido.' };
    }
    const emailCheck = validateEmail(input.email);
    if (!emailCheck.ok) {
      return { ok: false, error: emailCheck.error ?? 'Correo inválido.' };
    }
    if (!validateRole(input.role)) {
      return { ok: false, error: 'Elige si eres público o crítico.' };
    }

    const name = normalizeText(input.name);
    const email = normalizeText(input.email).toLowerCase();
    const role: UserRole = input.role;

    try {
    if (input.password && input.password.length > 0) {
      const passwordCheck = validatePassword(input.password);
      if (!passwordCheck.ok) {
        return { ok: false, error: passwordCheck.error ?? 'Contraseña inválida.' };
      }
      const { error } = await supabase.auth.updateUser({ password: input.password });
      if (error) {
        return { ok: false, error: mapAuthError(error) };
      }
    }

    if (email !== current.email) {
      const { error } = await supabase.auth.updateUser({ email, data: { name, role } });
      if (error) {
        return { ok: false, error: mapAuthError(error) };
      }
    } else {
      const { error } = await supabase.auth.updateUser({ data: { name, role } });
      if (error) {
        return { ok: false, error: mapAuthError(error) };
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        name,
        email,
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select('*')
      .single();

    if (error || !data) {
      return { ok: false, error: mapAuthError(error ?? 'No se pudo actualizar el perfil.') };
    }
    const profile = mapProfile(data);
    if (!profile) {
      return { ok: false, error: 'No se pudo leer el perfil actualizado.' };
    }
    this.user.set(profile);
    return { ok: true };
    } catch (error) {
      return { ok: false, error: mapAuthError(error) };
    }
  }

  async deleteAccount(): Promise<ActionResult> {
    const current = this.user();
    if (!current) {
      return { ok: false, error: 'No hay sesión activa.' };
    }
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) {
        return { ok: false, error: mapAuthError(error) };
      }
      await supabase.auth.signOut({ scope: 'local' });
      this.user.set(null);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: mapAuthError(error) };
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      if (!isSupabaseConfigured) {
        this.user.set(null);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) {
        this.user.set(null);
        return;
      }
      await this.loadProfile(
        sessionUser.id,
        sessionUser.email ?? '',
        sessionUser.user_metadata,
      );
      supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          this.user.set(null);
          return;
        }
        void this.loadProfile(session.user.id, session.user.email ?? '', session.user.user_metadata);
      });
    } catch {
      this.user.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfile(
    id: string,
    email: string,
    metadata: Record<string, unknown> | undefined,
  ): Promise<void> {
    const rawName = typeof metadata?.['name'] === 'string' ? metadata['name'] : email.split('@')[0];
    const name = validateName(rawName).ok ? normalizeText(rawName) : 'Usuario';
    const role = metadata?.['role'] === 'critic' ? 'critic' : 'audience';
    const profile = (await this.fetchProfile(id)) ?? (await this.ensureProfile({ id, name, email, role }));
    this.user.set(profile);
  }

  private async fetchProfile(id: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      return null;
    }
    return mapProfile(data);
  }

  private async ensureProfile(input: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }): Promise<Profile | null> {
    const existing = await this.fetchProfile(input.id);
    if (existing) {
      return existing;
    }
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: input.id,
        name: validateName(input.name).ok ? clipText(input.name, LIMITS.name.max) : 'Usuario',
        email: input.email,
        role: input.role,
      })
      .select('*')
      .single();
    if (error || !data) {
      return null;
    }
    return mapProfile(data);
  }
}
