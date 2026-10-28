import { test, expect } from '@playwright/test';

test('guest appearance persists, RTL fits mobile, and discovery is public', async ({ page }) => {
  await page.goto('/appearance');
  await expect(page.getByRole('heading', { name: 'خصّص تجربتك' })).toBeVisible();
  await page.getByRole('combobox', { name: 'الخلفية', exact: true }).click();
  await page.getByRole('option', { name: 'شبكة', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'الخلفية', exact: true })).toHaveText('شبكة');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: 'Developers', exact: true })).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Project gallery', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'ArabDev', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('draft autosave survives reload and publishes a question with private notes', async ({ page, request }) => {
  const username = `dev${Date.now().toString(36)}`;
  const result = await request.post('http://127.0.0.1:8014/api/v1/auth/register', {
    data: {
      username,
      email: `${username}@example.com`,
      password: 'Sunrise2026!',
      password_confirm: 'Sunrise2026!',
      language: 'en',
    },
    headers: { 'X-ArabDev-Client': 'tests' },
  });
  expect(result.ok()).toBeTruthy();
  const auth = (await result.json()).tokens;
  await request.patch('http://127.0.0.1:8014/api/v1/users/me/settings', {
    data: { language: 'en' },
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  // Complete onboarding through the existing API before exercising the editor.
  await request.post('http://127.0.0.1:8014/api/v1/users/me/onboarding/complete', {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('arabdev.lang', 'en'));
  await page.reload();
  await page.getByLabel('Email', { exact: true }).fill(`${username}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('Sunrise2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  const skip = page.getByRole('button', { name: /skip/i });
  if (await skip.count()) await skip.first().click();
  await page.goto('/create');
  await page.getByRole('combobox', { name: 'All types', exact: true }).click();
  await page.getByRole('option', { name: 'Question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('How can I preserve a draft?');
  await page.locator('[contenteditable="true"]').fill('A useful question with recoverable writing.');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await page.getByRole('button', { name: 'Restore writing', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('How can I preserve a draft?');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.waitForURL(/\/posts\/\d+$/);
  await expect(page.getByRole('heading', { name: 'How can I preserve a draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Organize bookmark', exact: true }).click();
  await page.getByLabel('Private note').fill('Only I should see this.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
