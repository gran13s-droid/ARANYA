import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';

/**
 * Real-browser check with two tabs. Uses an installed Edge or Chrome through
 * playwright-core (no browser download). Set E2E_BROWSER_PATH to override.
 * Screenshots are written to e2e/.artifacts/.
 */
const candidates = [
  process.env.E2E_BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => typeof p === 'string' && p.length > 0);
const executablePath = candidates.find((p) => existsSync(p));

const artifacts = fileURLToPath(new URL('./.artifacts/', import.meta.url));
const clientUrl = inject('clientUrl');

type Probe = NonNullable<Window['__aranyaDebug']>;
type ProbeResult = ReturnType<Probe>;

/** Software WebGL is slow and shares the CPU with the game server, so give each browser test room. */
const BROWSER_TEST_TIMEOUT = 120_000;

describe.skipIf(!executablePath)('client in a real browser (2 tabs)', { timeout: BROWSER_TEST_TIMEOUT }, () => {
  let browser: Browser;
  const errors: string[] = [];
  /** Every page opened by a test; closed after each test even when it fails, so failures never leak players into the next test. */
  const pages: Page[] = [];

  const open = async (name: string, query = ''): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    pages.push(page);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
    // Game readiness is checked through the probe, so don't wait for every resource.
    await page.goto(clientUrl + query, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return page;
  };

  const probe = (page: Page): Promise<ProbeResult | null> =>
    page.evaluate(() => (window.__aranyaDebug ? window.__aranyaDebug() : null));

  beforeAll(async () => {
    mkdirSync(artifacts, { recursive: true });
    browser = await chromium.launch({
      executablePath,
      headless: true,
      // Software WebGL so the test also runs on machines/CI without a GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
  });

  afterEach(async () => {
    await Promise.allSettled(pages.splice(0).map((p) => p.close()));
    errors.length = 0;
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('connects both tabs, syncs movement and logs no errors', async () => {
    const a = await open('A');
    const b = await open('B');

    await expect.poll(async () => (await probe(a))?.local ?? null, { timeout: 15_000 }).not.toBeNull();
    await expect.poll(async () => Object.keys((await probe(b))?.remotes ?? {}).length, { timeout: 15_000 }).toBe(1);

    const aId = (await probe(a))!.sessionId;
    const startZ = (await probe(b))!.remotes[aId]!.z;

    await a.bringToFront();
    await a.click('#game');
    await a.keyboard.down('KeyW');
    // Walking north plays the run cycle facing N (Step 1.1 state machine + facing).
    await expect.poll(async () => (await probe(a))?.localAnim, { timeout: 5_000 }).toEqual({ anim: 'run', facing: 'N' });
    await a.waitForTimeout(1000);
    await a.keyboard.up('KeyW');
    await expect.poll(async () => (await probe(a))?.localAnim?.anim, { timeout: 5_000 }).toBe('idle');

    // Tab B must see tab A walk north (server-authoritative, interpolated).
    await expect
      .poll(async () => (await probe(b))!.remotes[aId]!.z - startZ, { timeout: 10_000 })
      .toBeGreaterThan(2);
    // Prediction and the server agree once A stops.
    await expect
      .poll(async () => Math.abs((await probe(a))!.local!.z - (await probe(b))!.remotes[aId]!.z), { timeout: 5_000 })
      .toBeLessThan(0.01);

    await a.screenshot({ path: `${artifacts}tab_a.png` });
    await b.bringToFront();
    await b.screenshot({ path: `${artifacts}tab_b.png` });

    expect(errors).toEqual([]);
  });

  it('draws 200 animated characters without adding draw calls per character (ROADMAP 1.1)', async () => {
    const solo = await open('solo');
    await expect.poll(async () => (await probe(solo))?.characters ?? 0, { timeout: 15_000 }).toBe(1);
    await solo.waitForTimeout(1000);
    const baseline = (await probe(solo))!.drawCalls;
    await solo.close();

    const page = await open('bots', '?bots=200');
    await expect.poll(async () => (await probe(page))?.characters ?? 0, { timeout: 15_000 }).toBe(201);
    await page.waitForTimeout(1500);

    const stats = (await probe(page))!;
    // Characters share 1 sprite manager + 1 thin-instanced shadow mesh, so 200 more cost nothing extra.
    expect(stats.drawCalls - baseline).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${artifacts}bots_200.png` });

    // Vitest hides console output of passing tests, so keep the numbers as an artifact.
    writeFileSync(`${artifacts}bots_200.json`, JSON.stringify({ baselineDrawCalls: baseline, drawCalls: stats.drawCalls, frameTimeMs: stats.frameTimeMs, characters: stats.characters, note: 'software WebGL (SwiftShader)' }, null, 2));
    expect(errors).toEqual([]);
  });

  it('fights a training dummy from the hotbar: combo, damage numbers, combo step 3 (ROADMAP 1.2)', async () => {
    const page = await open('fighter');
    await expect.poll(async () => (await probe(page))?.local ?? null, { timeout: 15_000 }).not.toBeNull();
    await page.click('#game');

    // Walk south to the row of dummies (z = -14), then face them.
    await page.keyboard.down('KeyS');
    await expect.poll(async () => (await probe(page))!.local!.z, { timeout: 10_000 }).toBeLessThan(-12.4);
    await page.keyboard.up('KeyS');
    const before = (await probe(page))!;
    const full = Math.max(...Object.values(before.targets));

    // Record the local animation inside the page (no round trips), then press J
    // three times, each just after the previous swing ends and inside the combo window.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __anims: Set<string> }).__anims = seen;
      setInterval(() => {
        const a = window.__aranyaDebug?.().localAnim?.anim;
        if (a) seen.add(a);
      }, 20);
    });
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(420);
    }
    const anims = new Set(await page.evaluate(() => [...(window as unknown as { __anims: Set<string> }).__anims]));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${artifacts}combat.png` });
    writeFileSync(`${artifacts}combat.json`, JSON.stringify({ before, after: await probe(page), anims: [...anims] }, null, 2));
    expect(anims).toContain('attack1');
    expect(anims).toContain('attack3');

    await expect.poll(async () => (await probe(page))!.numbersShown, { timeout: 5_000 }).toBeGreaterThan(0);
    await expect.poll(async () => Math.min(...Object.values((await probe(page))!.targets)), { timeout: 5_000 }).toBeLessThan(full);
    expect(errors).toEqual([]);
  });
});
