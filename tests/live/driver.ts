import { _electron as electron, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

// Scénarios réels (vrai Claude) : non commités, lancés à la main.
export const out = path.resolve('tests/live/out');
export async function launch(root: string, dirs: string[]) {
  await mkdir(out, { recursive: true });
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_FAKE_AUTH: 'in',
      STUDIO_PICK_DIRS: dirs.join(path.delimiter),
      STUDIO_DEBUG: '1',
    },
  });
  const logFile = createWriteStream(
    path.join(out, `electron-${path.basename(root)}.log`),
  );
  app.process().stdout?.pipe(logFile);
  app.process().stderr?.pipe(logFile);
  app.process().on('exit', (code, sig) => log('ELECTRON EXIT', code, sig));
  const page = await app.firstWindow();
  page.on('crash', () => log('RENDERER CRASH'));
  page.on('close', () => log('PAGE CLOSE'));
  return { app, page };
}

export const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * Attend la fin d'une exécution : note les étapes vues, répond au QCM par
 * `answer` (null : Décider pour moi). Renvoie l'état final.
 */
export async function settle(
  page: Page,
  answer: (labels: string[]) => Promise<'valider' | 'decider'> = async () =>
    'valider',
) {
  const seen = new Set<string>();
  let asked: string[] | null = null;
  const t0 = Date.now();
  for (;;) {
    const steps = page.locator('.agent-steps');
    if (await steps.count()) {
      const t = (
        await steps.innerText({ timeout: 500 }).catch(() => '')
      ).replace(/\s+/g, ' ');
      if (t && !seen.has(t)) {
        seen.add(t);
        log('étapes', t);
      }
    }
    const card = page.getByRole('form', { name: 'Précisions' });
    if (await card.count()) {
      asked = await card.locator('legend').allInnerTexts();
      const opts = await card.locator('.choice').allInnerTexts();
      log('QCM', JSON.stringify(asked), JSON.stringify(opts));
      const how = await answer(asked);
      if (how === 'decider')
        await card.getByRole('button', { name: 'Décider pour moi' }).click();
      else await card.getByRole('button', { name: 'Valider' }).click();
    }
    const confirm = page.getByRole('alertdialog', { name: 'Supprimer' });
    if (await confirm.count()) {
      log('confirmation', await confirm.innerText());
      await confirm.getByRole('button', { name: 'Supprimer' }).click();
    }
    if (await page.getByRole('button', { name: 'Garder' }).count()) break;
    const err = page.locator('.prompt-bar input.error');
    if (await err.count()) {
      log('ÉCHEC', await err.getAttribute('placeholder'));
      return { ok: false, asked, seconds: (Date.now() - t0) / 1000 };
    }
    await page.waitForTimeout(1000);
  }
  const advice = page.getByRole('status', { name: 'Avis' });
  const text = (await advice.count()) ? await advice.innerText() : null;
  log('fin', `${Math.round((Date.now() - t0) / 1000)} s`, 'avis :', text);
  return { ok: true, asked, advice: text, seconds: (Date.now() - t0) / 1000 };
}
