import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dirname, '../..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(resolve(sourceRoot, 'src', specifier.slice(2) + '.ts')).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  REQUIRED_PROFILE_FIELDS,
  missingProfileField,
  isProfileComplete,
} = await import('../../src/lib/profile-requirements.ts');

const complete = {
  legal_business_name: 'Corell',
  business_address: '12 High St, London',
  website_url: 'https://corellcorp.com',
  contact_email: 'owner@example.com',
  phone: '+447700900123',
  industry: 'Retail & ecommerce',
};

test('team size is not a required business-profile field', () => {
  assert.ok(!REQUIRED_PROFILE_FIELDS.includes('team_size'));
});

test('a profile that only omits team size is accepted', () => {
  assert.equal(missingProfileField({ ...complete, team_size: '' }), null);
  assert.equal(missingProfileField({ ...complete }), null);
  assert.equal(isProfileComplete({ ...complete, team_size: null, onboarding_status: 'profile_complete' }), true);
});

test('a blank industry is still refused', () => {
  assert.equal(missingProfileField({ ...complete, industry: '  ' }), 'industry');
  assert.equal(isProfileComplete({ ...complete, industry: '', onboarding_status: 'profile_complete' }), false);
});

test('an already-active business is never sent back to the profile form', () => {
  assert.equal(isProfileComplete({ onboarding_status: 'active' }), true);
  assert.equal(isProfileComplete(null), false);
});
