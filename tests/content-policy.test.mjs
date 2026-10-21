import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, before } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const loaded = {};

before(() => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'youngtube-content-policy-'));
  for (const [key, relativePath] of [
    ['music', 'shared/musicClassification.ts'],
    ['taxonomy', 'shared/contentTaxonomy.ts'],
    ['shorts', 'shared/shortsPolicy.ts'],
  ]) {
    const sourcePath = path.join(root, relativePath);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: sourcePath,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    const errors = (compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
    const outputPath = path.join(temp, key + '.js');
    fs.writeFileSync(outputPath, compiled.outputText);
    loaded[key] = require(outputPath);
  }
});

test('taxonomy starts with eight stable browse centers and retains two visible song paths', () => {
  assert.equal(loaded.taxonomy.CONTENT_CENTERS.length, 8);
  assert.equal(loaded.taxonomy.CONTENT_CENTERS.find((c) => c.id === 'music_songs').label, 'أغاني وأناشيد');
  assert.equal(loaded.taxonomy.SONG_VARIANT_CATEGORIES[0].id, 'music_songs_no_music');
  assert.equal(loaded.taxonomy.SONG_VARIANT_CATEGORIES[0].sourceSelectable, false);
});

test('legacy ids normalize without changing the meaning of the original stored value', () => {
  assert.equal(loaded.taxonomy.canonicalizeCategoryId('education'), 'learn');
  assert.equal(loaded.taxonomy.canonicalizeCategoryId('cartoons'), 'stories_programs');
  assert.equal(loaded.taxonomy.canonicalizeCategoryId('calm'), 'calm');
  assert.deepEqual(loaded.taxonomy.normalizeCategoryIds(['education', 'learn', 'crafts']), ['learn', 'arts_crafts']);
});

test('source tags are hints for canonical centers, while the no-music category is video-only', () => {
  assert.ok(loaded.taxonomy.CONTENT_CATEGORY_TAG_ALIASES.learn.includes('letters'));
  assert.ok(loaded.taxonomy.CONTENT_CATEGORY_TAG_ALIASES.music_songs.includes('songs'));
  assert.equal(loaded.taxonomy.isVideoOnlyCategory('music_songs_no_music'), true);
  assert.equal(loaded.taxonomy.isVideoOnlyCategory('music_songs'), false);
});

test('only explicit title claims automatically route songs into the no-music visible path', () => {
  const classify = loaded.music.classifySongVariant;
  const classifySong = (title) => classify({ title, isSongContent: true });
  assert.equal(classifySong('أنشودة الحروف - بدون موسيقى').publicCategory, 'music_songs_no_music');
  assert.equal(classifySong('Kids song - without music').publicCategory, 'music_songs_no_music');
  assert.equal(classifySong('نشيد للأطفال بدون إيقاع').publicCategory, 'music_songs');
  assert.equal(classifySong('أغاني أطفال - إيقاع فقط').publicCategory, 'music_songs');
  assert.equal(classifySong('نشيد الأطفال بدون دف').variant, 'NO_DUFF_CLAIMED');
});

test('claims remain distinct and evidence records the publisher statement, not audio verification', () => {
  const classifySong = (title) => loaded.music.classifySongVariant({ title, isSongContent: true });
  const rhythm = classifySong('أنشودة الأطفال بِدُون إِيقَاع');
  assert.equal(rhythm.variant, 'NO_RHYTHM_CLAIMED');
  assert.equal(rhythm.classificationStatus, 'NEEDS_REVIEW');
  assert.match(rhythm.matchedPhrase, /بدون|بِدُون/u);
  assert.equal(rhythm.evidenceMeaning, 'PUBLISHER_METADATA_CLAIM_NOT_AUDIO_VERIFIED');
  assert.equal(classifySong('أنشودة الحركات، إيقاع فقط').variant, 'RHYTHM_ONLY');
});

test('classifier is opt-in and does not turn non-song content into song content', () => {
  assert.equal(loaded.music.classifySongVariant({ title: 'تعليم الحروف بدون موسيقى', isSongContent: false }), null);
  assert.equal(loaded.music.matchesPublicSongCategory({ title: 'A lesson without music', isSongContent: false }, 'music_songs_no_music'), false);
  assert.equal(loaded.music.matchesPublicSongCategory({ title: 'Nursery rhyme without music' }, 'music_songs_no_music'), true);
  assert.equal(loaded.music.matchesPublicSongCategory({ title: 'Nursery rhyme without rhythm' }, 'music_songs_no_music'), false);
});

test('Arabic taa marbuta spelling variants identify song/nasheed format', () => {
  assert.equal(loaded.music.isLikelySongContentTitle('أغنية الحروف بدون موسيقى'), true);
  assert.equal(loaded.music.isLikelySongContentTitle('اغنيه الحروف بدون موسيقى'), true);
  assert.equal(loaded.music.isLikelySongContentTitle('أنشودة الحروف بدون موسيقى'), true);
  assert.equal(loaded.music.isLikelySongContentTitle('انشوده الحروف بدون موسيقى'), true);
  assert.equal(
    loaded.music.classifySongVariantForCandidate({ title: 'أغنية الحروف بدون موسيقى' }).publicCategory,
    'music_songs_no_music'
  );
  assert.equal(
    loaded.music.classifySongVariantForCandidate({ title: 'أنشودة الحروف بدون موسيقى' }).publicCategory,
    'music_songs_no_music'
  );
});

test('a source tagged songs does not classify a generic lesson by itself', () => {
  assert.equal(
    loaded.music.isSongContentCandidate('A lesson without music', ['songs']),
    false
  );
  assert.equal(
    loaded.music.classifySongVariantForCandidate({
      title: 'تعليم الحروف بدون موسيقى',
      sourceCategoryHints: ['songs'],
    }),
    null
  );
  assert.equal(
    loaded.music.isSongContentCandidate('Nursery rhyme without music', []),
    true
  );
  assert.equal(
    loaded.music.classifySongVariantForCandidate({ title: 'Nursery rhyme without music' }).publicCategory,
    'music_songs_no_music'
  );
});

test('unicode boundaries reject misleading English and Arabic prefixes', () => {
  assert.equal(loaded.music.hasExplicitNoMusicClaim('Without Musical Instruments'), false);
  assert.equal(loaded.music.hasExplicitNoMusicClaim('Without Musicians'), false);
  assert.equal(loaded.music.hasExplicitNoMusicClaim('بدون موسيقيين'), false);
  assert.equal(loaded.music.hasExplicitNoMusicClaim('A song without music!'), true);
});

test('Shorts inference requires duration, date, and aspect ratio; URL path alone only requests review', () => {
  const evaluate = loaded.shorts.evaluateShortsPolicy;
  assert.equal(evaluate({ shortsPathSignal: true }).status, 'NEEDS_REVIEW');
  assert.equal(evaluate({ durationSeconds: 120, videoWidth: 720, videoHeight: 1280, publishedAt: '2025-01-01' }).status, 'SHORTS_LIKELY');
  assert.equal(evaluate({ durationSeconds: 240, videoWidth: 720, videoHeight: 1280, publishedAt: '2025-01-01' }).status, 'LONG_FORM_LIKELY');
  assert.equal(evaluate({ durationSeconds: 120, videoWidth: 720, videoHeight: 1280, publishedAt: '2025-01-01', shortsPathSignal: true }).status, 'SHORTS_LIKELY');
  assert.equal(evaluate({ durationSeconds: 120, videoWidth: 1280, videoHeight: 720, publishedAt: '2025-01-01', shortsPathSignal: true }).status, 'NEEDS_REVIEW');
  assert.equal(evaluate({ durationSeconds: 120, videoWidth: 720, videoHeight: 1280, publishedAt: '2025-11-15', officialArtistChannel: true }).status, 'LONG_FORM_LIKELY');
  assert.equal(evaluate({ durationSeconds: 120, videoWidth: 720, videoHeight: 1280, publishedAt: '2025-12-09', officialArtistChannel: true }).status, 'SHORTS_LIKELY');
  assert.equal(evaluate({ durationSeconds: 120, thumbnailIsPortrait: true, publishedAt: '2025-01-01' }).status, 'NEEDS_REVIEW');
});
