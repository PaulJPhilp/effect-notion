import { describe, it, expect } from 'vitest';
import * as S from 'effect/Schema';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  genDomainSchemaModule,
  type NotionDb,
} from '../scripts/generate-notion-schema';

// Keep lines short; wrap frequently to <= 80 chars.

describe('Domain-level Effect Schema codegen (POC)', () => {
  const fixture: NotionDb = {
    id: 'db123',
    last_edited_time: '2025-01-01T00:00:00.000Z',
    properties: {
      Title: { type: 'title' },
      Status: {
        type: 'select',
        select: {
          options: [
            { id: '1', name: 'Draft' },
            { id: '2', name: 'Published' },
          ],
        },
      },
      Tags: {
        type: 'multi_select',
        multi_select: {
          options: [
            { id: 't1', name: 'tech' },
            { id: 't2', name: 'news' },
          ],
        },
      },
      Views: { type: 'number' },
      Live: { type: 'checkbox' },
      Url: { type: 'url' },
      Author: { type: 'people' },
      Related: { type: 'relation' },
      PublishedAt: { type: 'date' },
      Score: { type: 'formula', formula: { type: 'number' } },
    },
  };

  it('emits expected code with literal unions', async () => {
    const code = genDomainSchemaModule(fixture);

    expect(code).toContain("export const GeneratedDomain = S.Struct({");
    expect(code).toContain("'Title': S.String");
    expect(code).toContain(
      "'Status': S.Union(S.Literal('Draft', 'Published'), S.Undefined)"
    );
    expect(code).toContain("'Tags': S.Array(S.Literal('tech', 'news'))");
    expect(code).toContain("'Views': S.Union(S.Number, S.Undefined)");
    expect(code).toContain("'Live': S.Boolean");
    expect(code).toContain("'Url': S.Union(S.String, S.Undefined)");
    expect(code).toContain("'Author': S.Array(S.String)");
    expect(code).toContain("'Related': S.Array(S.String)");
    expect(code).toContain(
      "'PublishedAt': S.Union(S.DateFromSelf, S.Undefined)"
    );
    expect(code).toContain("'Score': S.Union(S.Number, S.Undefined)");
  });

  it('generated module can be imported and used for validation', async () => {
    const code = genDomainSchemaModule(fixture);
    const out = resolve('src/generated/__tmp__/notion-domain.schema.ts');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, code, 'utf8');

    // Dynamic import to verify module shape.
    const mod = await import(resolve(out));

    const SchemaGenerated: S.Schema<any, any> = mod.GeneratedDomain;

    // Valid sample consistent with unions and types.
    const ok = {
      Title: 'Hello',
      Status: 'Draft',
      Tags: ['tech'],
      Views: 10,
      Live: true,
      Url: 'https://example.com',
      Author: ['u_1'],
      Related: ['p_1'],
      PublishedAt: new Date('2025-01-02T00:00:00.000Z'),
      Score: 5,
    };

    const res = S.decodeEither(SchemaGenerated)(ok);
    expect(res._tag).toBe('Right');

    // Invalid select literal should fail
    const bad = { ...ok, Status: 'Unknown' };
    const badRes = S.decodeEither(SchemaGenerated)(bad);
    expect(badRes._tag).toBe('Left');

    // Cleanup temp output
    rmSync(resolve('src/generated/__tmp__'), { recursive: true, force: true });
  });
});
