import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = mkdtempSync(path.join(tmpdir(), 'fcip-explanations-'));
execFileSync(path.join(frontend, 'node_modules/.bin/tsc'), [
  '--target', 'ES2020', '--module', 'commonjs', '--moduleResolution', 'node',
  '--skipLibCheck', '--outDir', compiled, 'src/explanations.ts',
], { cwd: frontend, stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { alertExplanation, featureDisplayName, featureExplanation, featureValue, scoreNumber } = require(path.join(compiled, 'explanations.js'));
const contribution = (feature, value) => ({ feature, value, definition: 'Original stored definition', contribution: 0.3 });
const alert = (pattern, details = {}, transactions = []) => ({ pattern_code: pattern, detection_details: details, transactions });

test('context factors explain observed relationships and flow ratios without asserting a crime', () => {
  assert.equal(featureDisplayName('COUNT_R5M'), 'Transaksi dalam 5 menit');
  assert.match(featureExplanation('OUT_IN_VALUE_RATIO_R4H'), /belum membuktikan/);
  assert.match(featureExplanation('KNOWN_COUNTERPARTIES_R24H'), /ID yang hilang/);
  assert.match(featureExplanation('SECONDS_SINCE_PRIOR_CREDIT'), /belum mencocokkan/);
});

test('P02 explains only the recorded band/count/currency and keeps the upper limit exclusive', () => {
  const result = alertExplanation(alert('P02_STRUCTURING', {
    TXN_COUNT_IN_BAND: 3, AGGREGATE_AMOUNT: '1125000000', CURRENCY: 'IDR',
    BAND_LOWER_APPLIED: '350000000', THRESHOLD_APPLIED: '500000000', WINDOW_DAYS_APPLIED: 7,
  }));
  assert.match(result.title, /mendekati batas/);
  assert.equal(result.observations.find((item) => item.label.includes('Transaksi dalam')).value, '3');
  assert.match(result.observations.find((item) => item.label.includes('Rentang')).value, /hingga di bawah/);
  assert.match(result.observations.find((item) => item.label.includes('Total')).value, /1\.125\.000\.000/);
  assert.ok(!JSON.stringify(result).includes('terbukti fraud'));
});

test('relative-only P01 never claims the absolute threshold was exceeded', () => {
  const result = alertExplanation(alert('P01', { AMOUNT_IDR: '500', CURRENCY: 'IDR', ABS_THRESHOLD_APPLIED: '1000', ABS_CONDITION_MET: false, REL_CONDITION_MET: true, RELATIVE_MULTIPLE_OBSERVED: '4.5' }));
  assert.ok(!result.observations.some((item) => item.label === 'Batas nominal yang terlewati'));
  assert.equal(result.observations.find((item) => item.label.startsWith('Perbandingan')).value, '4,5 kali');
});

test('ML threshold remains distinguishable at small values and never becomes a risk percentage', () => {
  const result = alertExplanation(alert('ML_SCORE', { SCORE: 0.0042, THRESHOLD: 0.0036 }));
  assert.equal(result.observations[0].value, '0,0042');
  assert.equal(result.observations[1].value, '0,0036');
  assert.match(result.observations[0].help, /bukan persentase/);
  assert.ok(!result.observations[0].value.includes('%'));
});

test('near-identical scores and cutoffs remain visibly distinct at the decision boundary', () => {
  const below = 0.9003599144;
  const cutoff = 0.9003599145;
  assert.notEqual(scoreNumber(below, cutoff), scoreNumber(cutoff, below));
  assert.notEqual(scoreNumber(0.001234, 0.001235), scoreNumber(0.001235, 0.001234));
  const result = alertExplanation(alert('ML_SCORE', { SCORE: below, THRESHOLD: cutoff }));
  assert.notEqual(result.observations[0].value, result.observations[1].value);
});

test('ML story starts with only its own recorded count and unavailable-baseline observations', () => {
  const input = alert('ML_SCORE', { SCORE: 0.82, THRESHOLD: 0.65, CONTRIBUTIONS: [
    { feature: 'COUNT_R1H', value: 12, contribution: 0.3 },
    { feature: 'NO_BASELINE', value: 1, contribution: 0.1 },
    { feature: 'AMOUNT', value: 500, contribution: 0.05 },
  ] });
  const before = structuredClone(input);
  const result = alertExplanation(input);
  assert.equal(result.observations.length, 4);
  assert.equal(result.observations[0].label, 'Transaksi dalam 1 jam');
  assert.equal(result.observations[0].value, '12');
  assert.equal(result.observations[1].value, 'Riwayat belum cukup');
  assert.equal(result.observations[2].label, 'Skor penilaian model');
  assert.equal(result.observations[3].label, 'Batas agar perlu ditinjau');
  assert.deepEqual(input, before);
});

test('ML story refuses malformed stored observations without deriving replacement facts from other scores', () => {
  const input = alert('ML_SCORE', { SCORE: 0.82, THRESHOLD: 0.65, CONTRIBUTIONS: [
    { feature: 'COUNT_R1H', value: '12' }, { feature: 'NO_BASELINE', value: Number.NaN },
    { feature: 'AMOUNT', value: Number.POSITIVE_INFINITY }, { feature: '', value: 5 }, null,
  ] });
  input.model_signals = [{ contributions: [{ feature: 'COUNT_R1H', value: 99 }] }];
  const result = alertExplanation(input);
  assert.equal(result.observations.length, 2);
  assert.ok(result.observations.every((item) => item.label.includes('Skor') || item.label.includes('Batas')));
});

test('ML story requires an explicit matching score currency and does not infer IDR from fs_v2', () => {
  const input = alert('ML_SCORE', { SCORE: 0.82, THRESHOLD: 0.65, MODEL_VERSION: 'observed-model', SCORE_IDS: ['score-1'], CONTRIBUTIONS: [{ feature: 'AMOUNT', value: 500 }] });
  input.model_signals = [{ id: 'score-other', model_version: 'observed-model', currency: 'USD', feature_set_version: 'fs_v2' }];
  assert.match(alertExplanation(input).observations[0].value, /mata uang belum tersedia/);
  input.model_signals = [{ id: 'score-1', model_version: 'observed-model', feature_set_version: 'fs_v2' }];
  assert.match(alertExplanation(input).observations[0].value, /mata uang belum tersedia/);
  input.model_signals = [{ id: 'score-1', model_version: 'observed-model', currency: 'USD' }];
  assert.match(alertExplanation(input).observations[0].value, /US\$|USD|\$/);
  assert.ok(!alertExplanation(input).observations[0].value.includes('Rp'));
});

test('ML story retains unknown observation values as unavailable and never treats them as zero', () => {
  const result = alertExplanation(alert('ML_SCORE', { SCORE: 0.82, THRESHOLD: 0.65, CONTRIBUTIONS: [{ feature: 'AMOUNT_OVER_PRIOR_MEAN', value: null }] }));
  assert.equal(result.observations[0].value, 'Belum tersedia');
  assert.match(result.observations[0].help, /riwayat yang cukup/);
});

test('sparse data cannot fabricate frequency, money totals, dormancy or risk', () => {
  for (const pattern of ['P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','UNKNOWN']) {
    const result = alertExplanation(alert(pattern));
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].label, 'Transaksi yang ditautkan ke temuan');
    assert.equal(result.observations[0].value, '0');
    assert.ok(result.limitations.length > 0);
  }
});

test('unavailable household context remains explicit rather than interpreting shared device as wrongdoing', () => {
  const result = alertExplanation(alert('P09', { DISTINCT_ENTITY_COUNT: 3, DISTINCT_ACCOUNT_COUNT: 5, HOUSEHOLD_RELATION_COUNT: 'DATA_UNAVAILABLE' }));
  assert.ok(result.limitations.some((item) => item.includes('belum tersedia')));
  assert.match(result.hint, /secara sah/);
});

test('feature novelty and availability flags preserve their direction and unknown values', () => {
  assert.equal(featureValue(contribution('DEVICE_FIRST_USE', 1), {}), 'Belum terlihat sebelumnya');
  assert.equal(featureValue(contribution('DEVICE_FIRST_USE', 0), {}), 'Pernah terlihat sebelumnya');
  assert.equal(featureValue(contribution('DEVICE_FIRST_USE', null), {}), 'Belum tersedia');
  assert.equal(featureValue(contribution('NO_BASELINE', 1), {}), 'Riwayat belum cukup');
  assert.equal(featureValue(contribution('NO_BASELINE', 0), {}), 'Syarat riwayat terpenuhi');
  assert.equal(featureValue(contribution('IS_DEBIT', 0), {}), 'Dana masuk');
});

test('money uses the model source currency; no currency is guessed for behavioral data', () => {
  assert.match(featureValue(contribution('AMOUNT', 1250), { currency: 'USD' }), /US\$|USD|\$/);
  assert.match(featureValue(contribution('AMOUNT', 1250), { feature_set_version: 'behavioral_v1' }), /mata uang belum tersedia/);
  assert.match(featureValue(contribution('AMOUNT', 1250), { feature_set_version: 'fs_v2' }), /Rp/);
  assert.ok(!featureValue(contribution('AMOUNT', 1250), { currency: 'USD' }).includes('Rp'));
});

test('unknown codes expose unavailable simple explanations rather than invented meanings', () => {
  assert.equal(featureDisplayName('UNRECOGNISED_RISK_FEATURE'), 'Indikator tambahan');
  assert.match(featureExplanation('UNRECOGNISED_RISK_FEATURE'), /belum tersedia/);
  assert.equal(featureValue(contribution('UNRECOGNISED_RISK_FEATURE', 0.7), {}), '0,7');
  assert.equal(scoreNumber(Number.NaN), 'Tidak tersedia');
});

test('human explanations never mutate archived source factors or contribution values', () => {
  const input = alert('P03', { CURRENCY: 'IDR', INBOUND_AMOUNT: '100', OUTBOUND_AGGREGATE: '125', PASSTHROUGH_RATIO: '1.25', ELAPSED_HOURS: 3 });
  const original = structuredClone(input);
  const result = alertExplanation(input);
  assert.deepEqual(input, original);
  assert.equal(result.observations.find((item) => item.label.startsWith('Perbandingan')).value, '125%');
  assert.match(result.observations.find((item) => item.label.startsWith('Perbandingan')).help, /tidak membuktikan/);
});
