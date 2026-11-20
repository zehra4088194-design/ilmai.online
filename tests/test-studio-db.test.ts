import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

let db: PGlite;
const user = '00000000-0000-4000-8000-000000000101';
const other = '00000000-0000-4000-8000-000000000102';
const paperId = '10000000-0000-4000-8000-000000000101';
const questionId = '20000000-0000-4000-8000-000000000101';
const reservationId = '30000000-0000-4000-8000-000000000101';
const usage = JSON.stringify({ model: 'test/model', provider: 'test', prompt_tokens: 10, completion_tokens: 10, cost_usd: 0, latency_ms: 10 });
const config = JSON.stringify({
  title: 'Database test', topic: 'Biology', sourceIds: [], language: 'English',
  difficulty: 'medium', mcq: 1, short: 0, long: 0, duration: 30,
  marks: { mcq: 1, short: 3, long: 10 }, includeMarking: true, includeExplanations: true,
});
const questions = JSON.stringify([{
  id: questionId, revision: 1, type: 'mcq', question: 'Which pigment absorbs light?',
  options: ['Chlorophyll','Glucose','Oxygen','Water'], marks: 1, sourceReference: '', position: 0,
}]);
const answers = JSON.stringify([{
  questionId, revision: 1, correctOption: 0, modelAnswer: '', explanation: 'Chlorophyll absorbs light.',
  markingScheme: [], sourceConfidence: 'supported',
}]);

beforeAll(async () => {
  db = new PGlite();
  const setup = [
    'create role anon;',
    'create role authenticated;',
    'create role service_role bypassrls;',
    'create schema auth;',
    "create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    'grant usage on schema public,auth to authenticated,anon,service_role;',
    'alter default privileges in schema public grant all on tables to service_role;',
    'alter default privileges in schema public grant usage,select on sequences to service_role;',
    'alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;',
  ];
  await db.exec(setup.join('\n'));
  const migrations = [
    '0001_init.sql','0002_modes_quiz_suggestions.sql','0003_auth_onboarding.sql',
    '0004_wallet_security.sql','0005_test_studio.sql','0006_test_studio_indexes.sql',
    '0007_test_generation_quota.sql','0008_test_regeneration_atomic.sql','0009_test_generation_quota_retry.sql',
  ];
  for (const file of migrations) {
    const sql = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
    await db.exec(sql.replace(/create extension if not exists pgcrypto\s*;/gi, ''));
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [user,'first@example.test',other,'second@example.test']);
}, 60000);
afterAll(async () => { await db?.close(); });

describe('Test Studio PostgreSQL data and wallet invariants', () => {
  it('stores questions separately from owner-protected answer rows', async () => {
    await db.query('select save_test_studio_paper($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)',
      [user,paperId,0,'Database test',config,questions,answers,'[]']);
    const paper = await db.query('select version,total_marks,counts from test_papers where id=$1',[paperId]);
    expect(paper.rows[0] as Record<string, unknown>).toMatchObject({ version: 1, total_marks: 1, counts: { mcq: 1, short: 0, long: 0 } });
    const keys = await db.query('select count(*)::int as count from test_answer_keys where test_id=$1',[paperId]);
    expect((keys.rows[0] as { count: number }).count).toBe(1);
  });

  it('rejects stale paper versions and cross-owner reads', async () => {
    await expect(db.query('select save_test_studio_paper($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)',
      [user,paperId,1,'Stale save',config,questions,answers,'[]'])).rejects.toThrow('test_version_conflict');
    const crossOwner = await db.query('select count(*)::int as count from test_papers where id=$1 and user_id=$2',[paperId,other]);
    expect((crossOwner.rows[0] as { count: number }).count).toBe(0);
  });

  it('enforces idempotent, atomic daily quota reservations', async () => {
    const first = await db.query('select reserve_test_generation($1,$2,$3,$4,$5,$6) as value',
      [reservationId,user,'studio:retry',10,1,1]);
    expect((first.rows[0] as { value: { duplicate: boolean } }).value.duplicate).toBe(false);
    const retry = await db.query('select reserve_test_generation($1,$2,$3,$4,$5,$6) as value',
      ['30000000-0000-4000-8000-000000000102',user,'studio:retry',10,1,1]);
    expect((retry.rows[0] as { value: { duplicate: boolean } }).value.duplicate).toBe(true);
    await expect(db.query('select reserve_test_generation($1,$2,$3,$4,$5,$6)',
      ['30000000-0000-4000-8000-000000000103',user,'studio:over-limit',10,1,1])).rejects.toThrow('test_daily_limit');
  });

  it('commits a regeneration and its credit settlement in one transaction', async () => {
    const result = await db.query('select commit_test_regeneration($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb) as value', [
      user,paperId,1,'Database test',config,questions,answers,'[]',reservationId,10,usage,
    ]);
    expect((result.rows[0] as { value: { version: number } }).value.version).toBe(2);
    const state = await db.query('select version from test_papers where id=$1',[paperId]);
    expect((state.rows[0] as { version: number }).version).toBe(2);
    const generation = await db.query('select status,charged from generation_requests where id=$1',[reservationId]);
    expect(generation.rows[0] as Record<string, unknown>).toMatchObject({ status: 'completed', charged: 10 });
  });
});
