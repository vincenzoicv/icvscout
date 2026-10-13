import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('iubenda documents supplement local policies without loading third-party scripts', () => {
  for (const [file, suffix] of [['privacy.html', ''], ['cookie-policy.html', '/cookie-policy']]) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(`href="https://www.iubenda.com/privacy-policy/81625927${suffix}" target="_blank" rel="noopener noreferrer"`));
    assert.ok(html.includes('Cloudflare, Supabase e Supabase Auth'));
    assert.ok(html.includes('data-privacy-settings'));
    assert.ok(html.includes('/assets/privacy-controls.js'));
    assert.ok(html.includes('Brevo'));
    assert.ok(html.includes('Instagram, TikTok e YouTube'));
    assert.doesNotMatch(html, /<script[^>]+(?:src=["'][^"']*iubenda|_iub)/i);
  }
});
