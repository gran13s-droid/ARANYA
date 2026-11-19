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

  /** CSS pixel of a world point, for clicking the ground or a target. */
  const screenOf = (page: Page, p: { x: number; y: number; z: number }): Promise<{ x: number; y: number }> =>
    page.evaluate(([x, y, z]) => window.__aranyaProject!(x, y, z), [p.x, p.y, p.z] as const);

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

    // Soft lock (GDD 4.3): Tab locks the nearest target and shows the target panel.
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await probe(page))!.locked, { timeout: 3_000 }).not.toBeNull();
    await expect.poll(async () => page.locator('.hud-target').isVisible(), { timeout: 3_000 }).toBe(true);
    const before = (await probe(page))!;
    const lockedId = before.locked!;
    const full = before.targets[lockedId]!;

    // Record the local animation inside the page (no round trips), then press 1 (attack)
    // three times, each just after the previous swing ends and inside the combo window.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __anims: Set<string> }).__anims = seen;
      setInterval(() => {
        const a = window.__aranyaDebug?.().localAnim?.anim;
        if (a) seen.add(a);
      }, 20);
    });
    // Wait for each swing to be accepted and to finish instead of fixed sleeps: under load
    // (software WebGL + server on one CPU) fixed waits drift and the next press lands early.
    const okAttacks = async (): Promise<number> => (await probe(page))!.acks.filter((x) => x.skill === 'attack' && x.ok).length;
    for (let i = 0; i < 3; i++) {
      const n = await okAttacks();
      await page.keyboard.press('Digit1');
      await expect.poll(okAttacks, { timeout: 3_000, interval: 30 }).toBe(n + 1);
      await expect.poll(async () => (await probe(page))!.localAnim!.anim.startsWith('attack'), { timeout: 3_000, interval: 30 }).toBe(false);
    }
    const anims = new Set(await page.evaluate(() => [...(window as unknown as { __anims: Set<string> }).__anims]));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${artifacts}combat.png` });
    writeFileSync(`${artifacts}combat.json`, JSON.stringify({ before, after: await probe(page), anims: [...anims] }, null, 2));
    expect(anims).toContain('attack1');
    expect(anims).toContain('attack3');

    await expect.poll(async () => (await probe(page))!.numbersShown, { timeout: 5_000 }).toBeGreaterThan(0);
    // The locked target itself took the damage (attacks auto-aimed at it).
    await expect.poll(async () => (await probe(page))!.targets[lockedId]!, { timeout: 5_000 }).toBeLessThan(full);

    // Holding the left mouse button on the locked target keeps attacking it (several accepted attack casts in a row).
    const acksBefore = (await probe(page))!.acks.filter((a) => a.skill === 'attack' && a.ok).length;
    await page.waitForTimeout(800); // leave the combo window so the chain restarts cleanly
    const dummyAt = (await probe(page))!.targetPos[lockedId]!;
    const onDummy = await screenOf(page, { ...dummyAt, y: dummyAt.y + 0.8 });
    await page.mouse.move(onDummy.x, onDummy.y);
    await page.mouse.down();
    await page.waitForTimeout(1600);
    await page.mouse.up();
    await expect.poll(async () => (await probe(page))!.acks.filter((a) => a.skill === 'attack' && a.ok).length - acksBefore, { timeout: 3_000 }).toBeGreaterThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  it('draws Lost Sprout monsters as 48 px pixel sprites (tracker M-01)', async () => {
    const page = await open('monsters');
    await expect.poll(async () => (await probe(page))?.local ?? null, { timeout: 15_000 }).not.toBeNull();
    // Every Lost Sprout gets a sprite once the monsters sync; other species keep the low-poly placeholder.
    await expect.poll(async () => (await probe(page))!.monsterSprites, { timeout: 5_000 }).toBe(3);
    const anims = (await probe(page))!.monsterAnims;
    expect(Object.keys(anims).every((id) => id.startsWith('lostMom_'))).toBe(true);
    expect(Object.values(anims).every((a) => ['idle', 'move', 'attack', 'hit', 'death'].includes(a))).toBe(true);

    // Walk south-west towards their spawn so the screenshot shows them.
    await page.click('#game');
    await page.keyboard.down('KeyA');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1700);
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${artifacts}monsters.png` });
    expect(errors).toEqual([]);
  });

  it('walks by clicking the ground, and walks up to a clicked target and attacks it', async () => {
    const page = await open('clicker');
    await expect.poll(async () => (await probe(page))?.local ?? null, { timeout: 15_000 }).not.toBeNull();
    await page.waitForTimeout(500);

    // Click the ground: walk there in a straight line and stop (the order ends on arrival).
    const start = (await probe(page))!.local!;
    const goal = { x: start.x + 2, y: start.y, z: start.z - 4 };
    const g = await screenOf(page, goal);
    await page.mouse.click(g.x, g.y);
    await expect.poll(async () => (await probe(page))!.moveOrder?.kind ?? null, { timeout: 2_000 }).toBe('point');
    await expect.poll(async () => (await probe(page))!.moveOrder, { timeout: 6_000 }).toBeNull();
    const reached = (await probe(page))!.local!;
    expect(Math.hypot(reached.x - goal.x, reached.z - goal.z)).toBeLessThan(0.5);

    // Click a dummy: lock it, walk into melee reach and swing once.
    const id = 'dummy_jade';
    const before = (await probe(page))!;
    const at = before.targetPos[id]!;
    const t = await screenOf(page, { ...at, y: at.y + 0.8 });
    await page.mouse.click(t.x, t.y);
    await expect.poll(async () => (await probe(page))!.locked, { timeout: 2_000 }).toBe(id);
    await expect
      .poll(async () => (await probe(page))!.acks.filter((a) => a.skill === 'attack' && a.ok).length, { timeout: 8_000 })
      .toBeGreaterThan(before.acks.filter((a) => a.skill === 'attack' && a.ok).length);
    const near = (await probe(page))!.local!;
    expect(Math.hypot(near.x - at.x, near.z - at.z)).toBeLessThan(2.2);
    await expect.poll(async () => (await probe(page))!.targets[id]!, { timeout: 5_000 }).toBeLessThan(before.targets[id]!);
    // A single click swings once and then the order ends.
    await expect.poll(async () => (await probe(page))!.moveOrder, { timeout: 3_000 }).toBeNull();
    await page.screenshot({ path: `${artifacts}click_move.png` });
    expect(errors).toEqual([]);
  });
});
