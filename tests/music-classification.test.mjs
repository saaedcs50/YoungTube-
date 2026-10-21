import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, before } from 'node:test';

// Regression suite for the shared explicit no-music claim helper
// (shared/musicClassification.ts), used by BOTH the kid client
// (src/filtering.ts) and the Worker search-archive path
// (worker/routes/public-read.ts). The helper is a pure TypeScript module;
// it is compiled here with the project's own TypeScript compiler, the
// same convention as tests/parent-inbox-routes.test.mjs.
//
// Policy under test (Phase 2): only unambiguous explicit no-music claims
// qualify. Ambiguous claims (no rhythm / vocals only / no music effects)
// must NOT classify as no-music, and every other title keeps the callers'
// existing default (hasMusic = true).
const require = createRequire(import.meta.url);
const ts = require('typescript');
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let hasExplicitNoMusicClaim;
let normalizeTitleForMusicMatch;

before(() => {
  const sourcePath = path.join(projectRoot, 'shared/musicClassification.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
  });
  const errors = (result.diagnostics || []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  );
  assert.equal(
    errors.length,
    0,
    errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-music-classification-test-'));
  const outPath = path.join(tempDir, 'musicClassification.js');
  fs.writeFileSync(outPath, result.outputText);
  const mod = require(outPath);
  hasExplicitNoMusicClaim = mod.hasExplicitNoMusicClaim;
  normalizeTitleForMusicMatch = mod.normalizeTitleForMusicMatch;
  assert.equal(typeof hasExplicitNoMusicClaim, 'function');
  assert.equal(typeof normalizeTitleForMusicMatch, 'function');
});

test('supported explicit no-music claims are detected (pre-existing phrases)', () => {
  assert.equal(hasExplicitNoMusicClaim('أنشودة بدون موسيقى'), true);
  assert.equal(hasExplicitNoMusicClaim('Kids Songs No Music'), true);
  assert.equal(hasExplicitNoMusicClaim('أغاني أطفال بدون موسيقى هادئة'), true);
});

test('REGRESSION: explicit claims the old two-phrase check missed are now detected', () => {
  // Each of these returned hasMusic=true before the fix (pre-fix probe,
  // Phase 2): the old check only knew 'no music' and 'بدون موسيقى'.
  assert.equal(hasExplicitNoMusicClaim('أنشودة أطفال بدون موسيقا'), true);
  assert.equal(hasExplicitNoMusicClaim('أغاني أطفال بلا موسيقى'), true);
  assert.equal(hasExplicitNoMusicClaim('أناشيد من دون موسيقى'), true);
  assert.equal(hasExplicitNoMusicClaim('Songs for Kids Without Music'), true);
});

test('normalization: diacritics, tatweel, case and spelling variants preserve meaning', () => {
  // Harakat (diacritics) must not break the phrase match.
  assert.equal(hasExplicitNoMusicClaim('بِدُون مُوسِيقَى للأطفال'), true);
  // Tatweel (kashida) inside the keyword must not break the match.
  assert.equal(hasExplicitNoMusicClaim('أنشودة بدون موسيـقى'), true);
  // English matching is case-insensitive.
  assert.equal(hasExplicitNoMusicClaim('NO MUSIC - Kids Songs'), true);
  assert.equal(hasExplicitNoMusicClaim('Without Music | Nursery Rhymes'), true);
  // The موسيقى / موسيقا spelling pair classifies identically.
  assert.equal(
    hasExplicitNoMusicClaim('نشيد بدون موسيقى'),
    hasExplicitNoMusicClaim('نشيد بدون موسيقا')
  );
  // Normalizer sanity: ى unifies to ي, hamza-alef forms unify to ا.
  assert.equal(normalizeTitleForMusicMatch('موسيقى'), 'موسيقي');
  assert.equal(normalizeTitleForMusicMatch('إيقاع'), 'ايقاع');
});

test('ordinary titles keep the existing default (no claim detected)', () => {
  assert.equal(hasExplicitNoMusicClaim('تعليم الحروف للأطفال'), false);
  assert.equal(hasExplicitNoMusicClaim('أغنية أطفال جميلة'), false);
  assert.equal(hasExplicitNoMusicClaim('Cartoon Episode 12'), false);
  // «بدون» alone is not a claim: the object of the claim must be music.
  assert.equal(hasExplicitNoMusicClaim('أغنية بدون كلام'), false);
  assert.equal(hasExplicitNoMusicClaim('الرسم فقط للأطفال'), false);
  assert.equal(hasExplicitNoMusicClaim(''), false);
});

test('ambiguous claims must NOT auto-classify as no-music', () => {
  // "No rhythm" does not prove the absence of music.
  assert.equal(hasExplicitNoMusicClaim('أنشودة بدون إيقاع'), false);
  assert.equal(hasExplicitNoMusicClaim('نشيد بدون ايقاع'), false);
  assert.equal(hasExplicitNoMusicClaim('إيقاع فقط | أنشودة المسجد'), false);
  // "Vocals only" is a no-instruments claim, not a no-music proof.
  assert.equal(hasExplicitNoMusicClaim('Vocals Only Nasheed'), false);
  assert.equal(hasExplicitNoMusicClaim('Maher Zain - Vocals Only'), false);
  // "No music effects" is about effects, not a no-music claim.
  assert.equal(hasExplicitNoMusicClaim('أنشودة بدون مؤثرات موسيقية'), false);
});

test('boolean contract preserved: hasMusic = !claim at the call sites', () => {
  const hasMusic = (title) => !hasExplicitNoMusicClaim(title);
  assert.equal(hasMusic('أنشودة أطفال بدون موسيقا'), false);
  assert.equal(hasMusic('أغنية أطفال عادية'), true);
  assert.equal(hasMusic('أنشودة بدون إيقاع'), true);
});

test('integration: client and Worker both consume the same shared helper', () => {
  const filtering = fs.readFileSync(path.join(projectRoot, 'src/filtering.ts'), 'utf8');
  const publicRead = fs.readFileSync(
    path.join(projectRoot, 'worker/routes/public-read.ts'),
    'utf8'
  );
  // Both import the one shared helper (no duplicated phrase rules).
  assert.match(filtering, /from '\.\.\/shared\/musicClassification'/);
  assert.match(publicRead, /from '\.\.\/\.\.\/shared\/musicClassification'/);
  assert.match(filtering, /hasExplicitNoMusicClaim\(video\.title\)/);
  assert.match(publicRead, /hasExplicitNoMusicClaim\(titleStr\)/);
  // The old hardcoded two-phrase duplication is gone from both call sites.
  assert.equal(filtering.includes("includes('no music')"), false);
  assert.equal(filtering.includes("includes('بدون موسيقى')"), false);
  assert.equal(publicRead.includes("includes('no music')"), false);
  assert.equal(publicRead.includes("includes('بدون موسيقى')"), false);
});
