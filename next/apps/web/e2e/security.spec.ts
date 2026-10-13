import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PASSWORD = 'e2e passphrase long enough';

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('[role="log"][aria-live]')
    .analyze();
  const violations = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(violations, `axe violations on ${label}`).toEqual([]);
}

/** RFC 6238 code from a base32 setup key, i.e. what the user's authenticator app would show. */
function totp(setupKey: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of setupKey.replace(/\s+/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function signUpWithOrg(page: Page, info: TestInfo, tag: string) {
  const email = `${tag}-${info.project.name}-${Date.now()}@example.et`;
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('short');
  // The meter guides while typing; the server rule (10+) is still what's enforced.
  await expect(page.getByRole('meter', { name: 'Password strength' })).toHaveAttribute(
    'aria-valuetext',
    'Too short',
  );
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await expect(page.getByRole('meter', { name: 'Password strength' })).not.toHaveAttribute(
    'aria-valuetext',
    'Too short',
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/today$/);
  return email;
}

async function openSecurity(page: Page) {
  await page.goto('/settings?tab=security');
  await expect(page.getByRole('tab', { name: 'Security', selected: true })).toBeVisible();
}

const shots = (info: TestInfo, name: string) =>
  process.env.E2E_SCREENSHOTS ? `${process.env.E2E_SCREENSHOTS}/${info.project.name}-${name}.png` : undefined;

test('two-step verification: set up, sign in with a code, then with a backup code', async ({
  page,
}, info) => {
  const email = await signUpWithOrg(page, info, '2fa');
  await openSecurity(page);
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await expectAccessible(page, 'settings security');
  await page.screenshot({ path: shots(info, 'security-off'), fullPage: true });

  // Set up.
  await page.getByRole('button', { name: 'Turn on two-step verification' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set up two-step verification' });
  // Inside the bottom-sheet dialog we act with the keyboard (Enter on the field or button), as on a
  // phone's Go key. In CI's 360 px emulation, once a field has had focus the pointer hit-test lands
  // one row above the target (visual-viewport offset), so clicks hit the previous control.
  await dialog.getByLabel('Current password').fill('wrong password here');
  await dialog.getByLabel('Current password').press('Enter');
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();
  await dialog.getByLabel('Current password').fill(PASSWORD);
  await dialog.getByLabel('Current password').press('Enter');

  await expect(dialog.getByTestId('qr-code')).toBeVisible();
  const setupKey = (await dialog.getByLabel('Setup key').textContent())!;
  expect(setupKey.replace(/\s/g, '')).toMatch(/^[A-Z2-7]{16,}$/);
  await expectAccessible(page, '2fa setup dialog');
  await page.screenshot({ path: shots(info, 'security-setup') });

  await dialog.getByLabel('6-digit code').fill('000000');
  await dialog.getByLabel('6-digit code').press('Enter');
  await expect(dialog.getByText("That code didn't work", { exact: false })).toBeVisible();
  await dialog.getByLabel('6-digit code').fill(totp(setupKey));
  await dialog.getByLabel('6-digit code').press('Enter');

  await expect(dialog.getByText('Two-step verification is on')).toBeVisible();
  const codes = (await dialog.getByLabel('Backup codes', { exact: true }).textContent())!
    .split('\n')
    .filter(Boolean);
  expect(codes).toHaveLength(10);
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toBeDisabled();
  await dialog.getByText("I've saved these backup codes").click();
  await page.screenshot({ path: shots(info, 'security-backup-codes') });
  await done.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  await expect(page.getByText('This device', { exact: true })).toBeVisible();
  await page.screenshot({ path: shots(info, 'security-on'), fullPage: true });

  // Sign out, sign back in: password, then the code.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your verification code' })).toBeVisible();
  await expectAccessible(page, '2fa challenge');
  await page.screenshot({ path: shots(info, 'sign-in-challenge') });
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText("That code didn't work", { exact: false })).toBeVisible();
  // Next time-step: the code used during setup can't be replayed within the same window.
  await page.getByLabel('6-digit code').fill(totp(setupKey, 1));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Backup code path.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Use a backup code instead' }).click();
  await page.getByLabel('Backup code').fill(codes[0]!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Turn it off again.
  await openSecurity(page);
  await page.getByRole('button', { name: 'Turn off' }).click();
  const off = page.getByRole('dialog', { name: 'Turn off two-step verification?' });
  await off.getByLabel('Current password').fill(PASSWORD);
  await off.getByLabel('Current password').press('Enter');
  await expect(page.getByText('Two-step verification is off.')).toBeVisible();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
});

test('active sessions: see other devices and sign them out', async ({ page, browser }, info) => {
  const email = await signUpWithOrg(page, info, 'sessions');

  // A second device.
  const phone = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const phonePage = await phone.newPage();
  await phonePage.goto('/sign-in');
  await phonePage.getByLabel('Email').fill(email);
  await phonePage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await phonePage.getByRole('button', { name: 'Sign in' }).click();
  await expect(phonePage).toHaveURL(/\/today$/);

  await openSecurity(page);
  const list = page.getByRole('list', { name: "Where you're signed in" });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByText('Safari on iOS')).toBeVisible();
  await expect(list.getByText('This device')).toBeVisible();
  await expectAccessible(page, 'sessions');
  await page.screenshot({ path: shots(info, 'sessions'), fullPage: true });

  await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click();
  await expect(page.getByText('That device is signed out.')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText("You're only signed in on this device.")).toBeVisible();

  // The phone is out on its next request.
  await phonePage.goto('/settings');
  await expect(phonePage).toHaveURL(/\/sign-in/);
  await phone.close();
});
