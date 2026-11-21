import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

let db: PGlite;
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const usage = JSON.stringify({ model: 'test/model', prompt_tokens: 10, completion_tokens: 10, cost_usd: 0, latency_ms: 20 });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant usage,select on sequences to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  for (const file of ['0001_init.sql','0002_modes_quiz_suggestions.sql','0004_wallet_security.sql']) {
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(sql.replace(/create extension if not exists pgcrypto\s*;/gi, ''));
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [user,'first@example.test',other,'second@example.test']);
}, 60000);
afterAll(async () => { await db?.close(); });

const balance = async () => (await db.query<{ credits_balance: number; credits_reserved: number }>('select credits_balance::int,credits_reserved::int from profiles where id=$1',[user])).rows[0];

describe('real PostgreSQL wallet transactions', () => {
  it('reserves available funds and rejects overspending', async () => {
    await db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(1),user,'test:first','test',400]);
    expect(await balance()).toEqual({ credits_balance: 500, credits_reserved: 400 });
    await expect(db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(2),user,'test:second','test',200])).rejects.toThrow('insufficient_credits');
    expect(await balance()).toEqual({ credits_balance: 500, credits_reserved: 400 });
  });
  it('charges verified usage exactly once and releases unused reservation', async () => {
    await db.query('select settle_generation($1,$2,$3,$4)', [id(1),user,100,usage]);
    await db.query('select settle_generation($1,$2,$3,$4)', [id(1),user,100,usage]);
    expect(await balance()).toEqual({ credits_balance: 400, credits_reserved: 0 });
    const result = await db.query<{ count: number }>('select count(*)::int from usage_events where request_id=$1',[id(1)]);
    expect(result.rows[0].count).toBe(1);
  });
  it('releases failed requests without charging and refuses another owner', async () => {
    await db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(3),user,'test:failure','test',250]);
    await expect(db.query('select settle_generation($1,$2,$3,$4)', [id(3),other,100,usage])).rejects.toThrow('generation_not_found');
    await db.query('select release_generation($1,$2)', [id(3),user]);
    await db.query('select release_generation($1,$2)', [id(3),user]);
    expect(await balance()).toEqual({ credits_balance: 400, credits_reserved: 0 });
  });
  it('does not silently clamp overdraws or underrecord ledger balances', async () => {
    await expect(db.query("select grant_credits($1,-1000,'invalid')",[user])).rejects.toThrow('insufficient_credits');
    expect((await balance()).credits_balance).toBe(400);
  });
  it('daily grants have correct deltas and cannot repeat within the UTC day', async () => {
    await db.query("select grant_credits($1,-350,'spend')",[user]);
    await db.query('select grant_daily_credits()');
    expect((await balance()).credits_balance).toBe(100);
    await db.query("select grant_credits($1,-50,'spend-again')",[user]);
    await db.query('select grant_daily_credits()');
    expect((await balance()).credits_balance).toBe(50);
    expect((await db.query<{ delta: number }>("select delta::int from credit_transactions where user_id=$1 and reason='daily_free_topup'",[user])).rows).toEqual([{ delta: 50 }]);
  });
  it('RLS rejects cross-owner conversation references and private wallet RPC calls', async () => {
    const conv = id(20);
    await db.query('insert into conversations(id,user_id) values($1,$2)',[conv,other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(21),user,'forged','chat',0])).rejects.toThrow('permission denied');
      await expect(db.query("insert into messages(conversation_id,user_id,role,content) values($1,$2,'user','forged')",[conv,user])).rejects.toThrow('row-level security');
      await expect(db.query('update profiles set role=$1 where id=$2',['admin',user])).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  });
});
