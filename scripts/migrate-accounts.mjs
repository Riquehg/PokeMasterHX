// Migração OPCIONAL das contas antigas (tabela "accounts", senha em texto puro) para o Supabase Auth.
// Roda UMA vez, no seu computador:
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-accounts.mjs
//
// Para cada conta antiga: cria o usuário no Auth com o mesmo e-mail/senha (já confirmado),
// cria o perfil com o nome do treinador e a Pokédex antiga. Depois disso, apague a coluna
// "password" da tabela antiga (ou a tabela inteira) — ela não é mais usada pelo jogo.
import { createClient } from '@supabase/supabase-js';
import { SPECIES } from '../shared/data/pokemon.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: accounts, error } = await sb.from('accounts').select('email, password, character_name, profile_data, game_state');
if (error) { console.error(error.message); process.exit(1); }

let ok = 0, skipped = 0;
for (const acc of accounts) {
  const email = String(acc.email || '').trim().toLowerCase();
  const password = String(acc.password || '');
  if (!email || password.length < 6) { // Supabase exige 6+ caracteres
    console.log(`⏭️  ${email || '(sem e-mail)'}: senha curta ou vazia — o jogador deve se cadastrar de novo.`);
    skipped++; continue;
  }
  const name = acc.character_name || acc.profile_data?.trainerName || email.split('@')[0];
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { trainer_name: name } });
  if (created.error) { console.log(`⏭️  ${email}: ${created.error.message}`); skipped++; continue; }
  const oldDex = acc.profile_data?.pokedex || acc.game_state?.players?.[0]?.pokedex || [];
  const pokedex = [...new Set(oldDex.map(String).filter(id => SPECIES[id]))];
  await sb.from('profiles').upsert({ id: created.data.user.id, trainer_name: String(name).slice(0, 20), avatar: Number(acc.profile_data?.avatarId) || 1, pokedex, points: pokedex.length * 10 });
  console.log(`✅ ${email} migrado (${pokedex.length} na Pokédex).`);
  ok++;
}
console.log(`\nFeito: ${ok} migradas, ${skipped} puladas.`);
