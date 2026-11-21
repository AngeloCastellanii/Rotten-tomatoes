import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};

const file = `export const generatedEnvironment = {
  supabaseUrl: ${JSON.stringify(env.SUPABASE_URL ?? '')},
  supabaseAnonKey: ${JSON.stringify(env.SUPABASE_ANON_KEY ?? '')},
  tmdbApiKey: ${JSON.stringify(env.TMDB_API_KEY ?? '')},
};
`;

writeFileSync(new URL('../src/environments/environment.generated.ts', import.meta.url), file);
