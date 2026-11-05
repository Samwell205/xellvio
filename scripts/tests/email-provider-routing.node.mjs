import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dirname, '../..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(resolve(sourceRoot, 'src', specifier.slice(2) + '.ts')).href, context);
    }
    if (specifier.startsWith('./') && !specifier.endsWith('.ts')) {
      try { return nextResolve(specifier + '.ts', context); } catch {}
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) {
      return { format: 'module', source: stripTypeScriptTypes(readSource(url)), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

function readSource(url) {
  const { readFileSync } = require_node_fs();
  return readFileSync(new URL(url), 'utf8');
}
function require_node_fs() {
  return globalThis.__fs ??= null;
}

// Simpler: read via dynamic import of node:fs
const { readFileSync } = await import('node:fs');
globalThis.__fs = { readFileSync };

process.env.RESEND_API_KEY = 're_test_key';
process.env.LOVABLE_API_KEY = 'lvv_test_key';

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, text: async () => '{"id":"msg-1"}' };
};

const { sendMail, mailerProvider } = await import('../../src/lib/email/mailer.server.ts');

test('mailer provider is resend when both keys are present', () => {
  assert.equal(mailerProvider(), 'resend');
});

test('sign-up / password-reset (auth) emails are sent through Resend', async () => {
  calls.length = 0;
  await sendMail({
    to: 'new-signup@example.com',
    from: 'Xellvio <no-reply@xellvio.com>',
    sender_domain: 'xellvio.com',
    subject: 'Confirm your email',
    html: '<p>Your code is 123456</p>',
    text: 'Your code is 123456',
    purpose: 'auth',
    label: 'auth-signup',
  });

  assert.equal(calls.length, 1, 'exactly one provider call');
  assert.equal(calls[0].url, 'https://connector-gateway.lovable.dev/resend/emails');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['new-signup@example.com']);
  assert.equal(body.subject, 'Confirm your email');
  assert.equal(calls[0].init.headers['X-Connection-Api-Key'], 're_test_key');
});
