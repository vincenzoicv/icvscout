import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../assets/icv-stories.js', import.meta.url), 'utf8');

test('story follows gallery and precedes live desk, without autoplay or eager video source', () => {
  const section = html.slice(html.indexOf('<section id="storieBianconere"'), html.indexOf('<div class="home-panel live-desk-panel"'));
  assert.ok(section.length > 0);
  assert.ok(html.indexOf('id="matchGallery"') < html.indexOf('id="storieBianconere"'));
  const tag = section.match(/<video\b[^>]+>/)[0];
  assert.match(tag, /preload="none"/);
  assert.match(tag, /controls playsinline/);
  assert.doesNotMatch(tag, /\s(?:src|autoplay)=/);
  assert.match(section, /loading="lazy"/);
  assert.match(section, /nascita-juventus-cover-20260901\.jpg/);
});

test('story cover is a real JPEG asset, not an HTML fallback', () => {
  const bytes = readFileSync(new URL('../assets/nascita-juventus-cover-20260901.jpg', import.meta.url));
  assert.ok(bytes.length > 100000);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(bytes.at(-2), 0xff);
  assert.equal(bytes.at(-1), 0xd9);
});

test('published MP4 fits hosting and has metadata before media for quick start', () => {
  const bytes = readFileSync(new URL('../assets/nascita-juventus-20260831.mp4', import.meta.url));
  assert.ok(bytes.length < 25 * 1024 * 1024);
  const atoms = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    let size = bytes.readUInt32BE(offset);
    atoms.push(bytes.toString('ascii', offset + 4, offset + 8));
    if (size === 1) size = Number(bytes.readBigUInt64BE(offset + 8));
    if (!size) break;
    assert.ok(size >= 8);
    offset += size;
  }
  assert.ok(atoms.includes('moov') && atoms.includes('mdat'));
  assert.ok(atoms.indexOf('moov') < atoms.indexOf('mdat'));
});

function setup(fail = false) {
  const handlers = {};
  const video = { hidden: true, paused: true, dataset: { src: '/movie.mp4' },
    getAttribute() { return this.src; }, focus() { this.focused = true; },
    play() { this.paused = false; return fail ? Promise.reject(new Error('network')) : Promise.resolve(); },
    pause() { this.paused = true; }, addEventListener(n, fn) { handlers[n] = fn; } };
  const play = { hidden: false, addEventListener(n, fn) { handlers[n] = fn; } };
  const error = { hidden: true };
  const document = { hidden: false, getElementById(id) { return { icvStoryVideo: video, icvStoryPlay: play, icvStoryError: error }[id]; },
    addEventListener(n, fn) { handlers[n] = fn; } };
  const window = { addEventListener(n, fn) { handlers[n] = fn; } };
  vm.runInNewContext(script, { document, window });
  return { video, play, error, document, handlers };
}

test('click loads and plays video; leaving page pauses it', async () => {
  const state = setup();
  assert.equal(state.video.src, undefined);
  state.handlers.click();
  assert.equal(state.video.src, '/movie.mp4');
  assert.equal(state.video.hidden, false);
  assert.equal(state.play.hidden, true);
  assert.equal(state.video.focused, true);
  assert.equal(state.video.paused, false);
  state.document.hidden = true;
  state.handlers.visibilitychange();
  assert.equal(state.video.paused, true);
});

test('failed playback exposes a fallback without unhandled rejection', async () => {
  const state = setup(true);
  state.handlers.click();
  await Promise.resolve();
  assert.equal(state.error.hidden, false);
});
