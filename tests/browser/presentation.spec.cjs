const { test, expect } = require('@playwright/test');

test('complete user-controlled walkthrough, seven layers and both routes', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.getByLabel('Your message').fill('Presenting VPNs 🌍');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (const title of ['Application', 'Presentation', 'Session', 'Transport', 'Network', 'Data link', 'Physical', 'VPN gateway', 'Receiver']) {
    await page.getByRole('button', { name: `Go to ${title}`, exact: true }).click();
    await expect(page.locator('#chapter-title')).toHaveText(title);
    await expect(page.locator('.chapter.active .lane.vpn')).toBeVisible();
    await expect(page.locator('.chapter.active .lane.direct')).toBeVisible();
  }
  while (await page.getByRole('button', { name: 'Next', exact: true }).isEnabled()) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.chapter.active')).toContainText('Presenting VPNs 🌍');
  await page.getByRole('button', { name: 'Inspect layer' }).click();
  await page.getByRole('button', { name: 'Run verification', exact: true }).click();
  await expect(page.locator('#lab-result')).toContainText('PASS');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Next moves packets, translates at boundaries and Previous reverses', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start', exact: true }).click();
  const first = await page.locator('#step-title').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#step-title')).not.toHaveText(first);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#step-title')).toHaveText(first);
  await page.getByRole('button', { name: 'Go to Network', exact: true }).click();
  await expect(page.locator('#track')).toHaveCSS('transform', /matrix/);
  await page.locator('#track').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  const captionsFit = await page.locator('.chapter.active .lane').evaluateAll(lanes => lanes.every(lane => lane.querySelector('.lane-caption').getBoundingClientRect().bottom <= lane.getBoundingClientRect().bottom - 10));
  expect(captionsFit).toBe(true);
  await page.screenshot({ path: 'test-results/network-desktop.png' });
});

test('each layer exposes functioning experiments without console errors', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (const title of ['Connect', 'Application', 'Presentation', 'Session', 'Transport', 'Network', 'Data link', 'Physical', 'VPN gateway', 'Receiver']) {
    await page.getByRole('button', { name: `Go to ${title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Inspect layer' }).click();
    const buttons = page.locator('#experiments button');
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).click();
      await expect(page.locator('#lab-result')).not.toBeEmpty();
      await expect(page.locator('#lab-result')).not.toContainText('Experiment failed');
    }
    await page.getByRole('button', { name: 'Close inspector' }).click();
  }
  expect(errors).toEqual([]);
});

test('empty messages fail, uploaded files and HTTP mode deliver, input is never HTML', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Your message').fill('   ');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#input-error')).toContainText('Enter a message');
  await page.getByLabel('Your message').fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Request protocol').selectOption('HTTP');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Receiver', exact: true }).click();
  await expect(page.locator('.chapter.active img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByLabel('Upload a file').setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('file hello') });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Receiver', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect layer' }).click();
  await expect(page.locator('#inspect-data')).toContainText('demo.txt');
});

test('mobile and reduced motion remain navigable without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Physical', exact: true }).click();
  await expect(page.locator('#chapter-title')).toHaveText('Physical');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.chapter.active .diagram').first().evaluate(el => el.viewBox.baseVal.width)).toBeLessThanOrEqual(500);
  await page.screenshot({ path: 'test-results/physical-mobile.png', fullPage: true });
});

test('standalone HTML opens directly from disk and makes zero network requests', async ({ page }) => {
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  const outgoing = []; page.on('request', req => { if (/^https?:/.test(req.url())) outgoing.push(req.url()); });
  await page.goto(pathToFileURL(path.resolve('VPN-Visualizer.html')).href);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Presentation', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect layer' }).click();
  await page.getByRole('button', { name: 'Toggle RLE compression', exact: true }).click();
  await expect(page.locator('#lab-result')).toContainText('"roundTrip": true');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Go to Receiver', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect layer' }).click();
  await page.getByRole('button', { name: 'Run verification', exact: true }).click();
  await expect(page.locator('#lab-result')).not.toContainText('FAIL');
  await expect(page.locator('#lab-result')).toContainText('PASS');
  await page.getByText('Assignment checklist · this layer', { exact: true }).click();
  await expect(page.locator('#assignment-checklist li')).toHaveCount(11);
  expect(outgoing).toEqual([]);
});

test('all 36 steps render sequentially and fit inside both lanes at laptop size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (let i = 1; i <= 36; i++) {
    await expect(page.locator('#step-count')).toHaveText(`${String(i).padStart(2, '0')} / 36`);
    expect(await page.locator('.chapter.active .diagram').count()).toBe(2);
    expect(await page.locator('.chapter.active .lane').evaluateAll(lanes => lanes.every(lane => {
      const caption = lane.querySelector('.lane-caption').getBoundingClientRect(), parent = lane.getBoundingClientRect();
      return caption.bottom <= parent.bottom && caption.top >= parent.top;
    }))).toBe(true);
    if (i < 36) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/receipt-laptop.png' });
  expect(errors).toEqual([]);
});

test('invalid attachments reject and downloaded original bytes match the upload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Upload a file').setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.locator('#input-error')).toContainText('Unsupported file type');
  await page.getByLabel('Upload a file').setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(8193) });
  await expect(page.locator('#input-error')).toContainText('up to 8 KiB');
  await page.getByLabel('Upload a file').setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
  await expect(page.locator('#input-error')).toContainText('empty');
  const original = Buffer.from('File round-trip with VPN 🌍');
  await page.getByLabel('Upload a file').setInputFiles({ name: 'received.txt', mimeType: 'text/plain', buffer: original });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Receiver', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect layer' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download received data', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('received.txt');
  const fs = require('node:fs'); expect(fs.readFileSync(await file.path())).toEqual(original);
});
