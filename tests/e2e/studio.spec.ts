import { test, expect } from '@playwright/test';

test('boucle centrale réelle : diff, validation, propagation, recharge, annulation sélective', async ({
  page,
}) => {
  await page.goto('/');
  const dsToggle = page.getByRole('button', {
    name: 'Design System',
    exact: true,
  });
  const previewToggle = page.getByRole('button', {
    name: 'Aperçu',
    exact: true,
  });
  await expect(dsToggle).toHaveAttribute('aria-pressed', 'true');
  const catalogue = page.locator('.stage-catalogue');
  const mobile = page.frameLocator('iframe');
  const mainButton = catalogue.getByRole('button', {
    name: 'Action principale',
    exact: true,
  });
  await expect(mainButton).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await page.getByLabel('Valeur du token').fill('#8A3B20');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('#3154C4');
  await expect(dialog).toContainText('#8A3B20');
  await expect(mainButton).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    catalogue.getByRole('button', { name: 'Réserver une place', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await previewToggle.click();
  await expect(previewToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    mobile.getByRole('button', { name: 'Réserver une place', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    mobile.getByRole('button', { name: 'Découvrir', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await page.reload();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('space.md');
  await page.getByLabel('Valeur du token').fill('22');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await page.getByRole('button', { name: /^Historique/ }).click();
  await page
    .getByRole('dialog', { name: 'Historique' })
    .getByRole('button', { name: 'Annuler la révision 1', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await expect(mainButton).toHaveCSS('padding-left', '22px');
  await previewToggle.click();
  await expect(
    mobile.getByRole('button', { name: 'Réserver une place', exact: true }),
  ).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
});

test('largeurs réelles, interactions, formulaire et desktop responsive', async ({
  page,
}) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe');
  for (const [value, width] of [
    ['0', 320],
    ['1', 375],
    ['2', 430],
    ['3', 1024],
  ] as const) {
    await page
      .getByRole('combobox', { name: 'Largeur d’écran', exact: true })
      .selectOption(value);
    await expect(
      page.getByRole('button', { name: 'Aperçu', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('iframe')).toHaveAttribute(
      'width',
      String(width),
    );
    await expect
      .poll(() =>
        page
          .locator('iframe')
          .evaluate((f: HTMLIFrameElement) => f.contentWindow?.innerWidth),
      )
      .toBe(width);
    expect(
      await frame
        .locator('body')
        .evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const columns = await frame
      .locator('.scenario-grid')
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
      );
    expect(columns).toBe(width >= 700 ? 2 : 1);
  }
  await page
    .getByRole('combobox', { name: 'Largeur d’écran', exact: true })
    .selectOption('1');
  await frame
    .getByRole('button', { name: 'Réserver une place', exact: true })
    .click();
  await expect(
    frame.getByRole('button', { name: 'Réservation confirmée ✓' }),
  ).toBeVisible();
  await frame.getByRole('button', { name: 'Favoris', exact: true }).click();
  await expect(
    frame.getByText('Vos ateliers favoris apparaîtront ici.'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Scénario', exact: true })
    .selectOption('form');
  await frame.getByLabel('Votre prénom').fill('Camille');
  await frame.getByLabel('Adresse e-mail').fill('camille@example.com');
  await frame.getByRole('checkbox').check();
  await frame.getByRole('button', { name: 'S’inscrire', exact: true }).click();
  await expect(frame.getByText(/Merci ! Démonstration locale/)).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page
      .locator('body')
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test('entrée couleur invalide sans mutation et clavier du diff', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Valeur du token').fill('red');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Données invalides');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Valeur du token').fill('#123456');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ne pas appliquer' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('V2 : contraste proposé immédiat sans modifier les composants enregistrés', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#FFFFFF');
  await expect(
    page.getByText('Contraste proposé :', { exact: false }),
  ).toContainText('1.00:1');
  await expect(
    page.getByText('Contraste proposé :', { exact: false }),
  ).toContainText('Contraste à améliorer');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const current = await (await page.request.get('/api/state')).json();
  expect(current.tokens['color.brand'].$value).not.toBe('#FFFFFF');
});

test('V2 : brief privé persistant, indépendant du mode IA', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Mon PFE · brief privé', { exact: true }).click();
  await page
    .getByLabel('Nom du PFE', { exact: true })
    .fill('Mon atelier accessible');
  await page
    .getByLabel('Public concerné', { exact: true })
    .fill('Étudiants en mobilité');
  await page
    .getByLabel('Objectif et critères de réussite', { exact: true })
    .fill('Réserver en moins de trois étapes');
  await page.getByRole('button', { name: 'Enregistrer le brief' }).click();
  await expect(page.getByText('Brief enregistré sur ce poste.')).toBeVisible();
  await page.reload();
  await page.getByText('Mon PFE · brief privé', { exact: true }).click();
  await expect(page.getByLabel('Nom du PFE', { exact: true })).toHaveValue(
    'Mon atelier accessible',
  );
  await expect(
    page.getByRole('combobox', { name: 'Mode de travail' }),
  ).toHaveValue('claude');
});

test('V2 : recherche, brouillon récupéré après recharge et abandon sans écriture', async ({
  page,
}) => {
  await page.goto('/');
  const before = await (await page.request.get('/api/state')).json();
  await page.getByLabel('Rechercher un token').fill('space');
  await expect(
    page.getByText('3 résultat(s).', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('space.lg');
  await page.getByLabel('Valeur du token').fill('31');
  await expect(
    page.getByText('Brouillon non enregistré.', { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Token', exact: true }),
  ).toHaveValue('space.lg');
  await expect(page.getByLabel('Valeur du token')).toHaveValue('31');
  await expect(
    page.getByText('Brouillon récupéré', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abandonner le brouillon' }).click();
  await expect(page.getByLabel('Valeur du token')).toHaveValue(
    String(before.tokens['space.lg'].$value),
  );
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    before.revision,
  );
});

test('V2 : conflit multi-onglets visible dans le diff, aucune perte de données', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#223355');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await other.getByLabel('Valeur du token').fill('#664422');
  await other.getByRole('button', { name: 'Proposer', exact: true }).click();
  await other.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(other.getByRole('dialog')).not.toBeVisible();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Une autre validation');
  await expect(
    dialog.getByRole('button', { name: 'Valider et enregistrer' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  expect(
    (await (await page.request.get('/api/state')).json()).tokens['color.brand']
      .$value,
  ).toBe('#664422');
  await other.close();
});

test('V2 : capacité de session périmée simulée sans rejeu ambigu', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Tokens', exact: true }).waitFor();
  const boot = await (await page.request.get('/api/bootstrap')).json();
  // Un seul refus certain avant mutation, comme une capacité périmée après restart.
  let requests = 0;
  await page.route('**/api/proposals', async (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Validation de session manquante. Rechargez la page.',
        }),
      });
    expect(route.request().headers()['x-ds-studio']).toBe(boot.csrf);
    return route.continue();
  });
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.focus');
  await page.getByLabel('Valeur du token').fill('#776622');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(requests).toBe(2);
  await page.keyboard.press('Escape');
});

test('V2 : clavier, 1024 px et absence de stockage navigateur', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Stockage refusé');
    };
    Storage.prototype.getItem = () => {
      throw new DOMException('Stockage refusé');
    };
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Tokens', exact: true }).waitFor();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Aller aux tokens' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Tokens', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Valeur du token').fill('#114477');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(
    await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
});

// Aucune vue ne défile : le contenu est réduit pour tenir dans la scène.
type Page = import('@playwright/test').Page;
const measureFit = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('.stage-frame')!;
    const content = document.querySelector('.stage-content')!;
    const f = frame.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const bar = document.querySelector('.prompt-bar')!.getBoundingClientRect();
    const settings = document
      .querySelector('.settings')!
      .getBoundingClientRect();
    return {
      frameScroll:
        frame.scrollHeight <= frame.clientHeight &&
        frame.scrollWidth <= frame.clientWidth,
      pageScroll:
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
      inside:
        c.left >= f.left - 1 &&
        c.top >= f.top - 1 &&
        c.right <= f.right + 1 &&
        c.bottom <= f.bottom + 1,
      stageAboveBar: f.bottom <= bar.top,
      settingsAboveBar: settings.bottom <= bar.top,
      settingsRightOfStage: settings.left >= f.right,
      width: f.width,
    };
  });
async function expectFits(page: Page) {
  // L'échelle est recalculée à l'image suivante : on laisse le temps au ResizeObserver.
  await expect
    .poll(async () => {
      const b = await measureFit(page);
      return b.frameScroll && b.inside;
    })
    .toBe(true);
  const box = await measureFit(page);
  expect(box).toMatchObject({
    frameScroll: true,
    pageScroll: true,
    inside: true,
    stageAboveBar: true,
    settingsAboveBar: true,
    settingsRightOfStage: true,
  });
  return box;
}

test('layout v3 : scène sans défilement, panneau repliable, captures 1440 × 900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.stage-catalogue').waitFor();
  await expectFits(page);
  await page.screenshot({ path: 'test-results/layout-design-system.png' });

  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Réserver une place' }).waitFor();
  // L'iframe prend la hauteur de son contenu : pas de défilement interne.
  await expect
    .poll(() =>
      page
        .locator('iframe')
        .evaluate(
          (f: HTMLIFrameElement) =>
            f.contentDocument!.documentElement.scrollHeight <=
            f.contentWindow!.innerHeight,
        ),
    )
    .toBe(true);
  await expectFits(page);
  await page.screenshot({ path: 'test-results/layout-apercu.png' });
  await page
    .getByRole('combobox', { name: 'Largeur d’écran', exact: true })
    .selectOption('3');
  await expect(page.locator('iframe')).toHaveAttribute('width', '1024');
  await expectFits(page);

  // Repli du panneau : la scène s'élargit et l'échelle est recalculée.
  // Position et échelle appliquées au contenu de la scène.
  const scaleText = () =>
    page
      .locator('.stage-content')
      .evaluate((el) => (el as HTMLElement).style.transform);
  const before = await scaleText();
  const opened = await expectFits(page);
  const toggle = page.getByRole('button', { name: 'Replier les paramètres' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.locator('#settings-body')).toBeHidden();
  const closed = await expectFits(page);
  expect(closed.width).toBeGreaterThan(opened.width);
  await expect.poll(scaleText).not.toBe(before);
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await expect(page.locator('#settings-body')).toBeVisible();

  // Redimensionnement de la fenêtre : nouvelle échelle, toujours sans défilement.
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect.poll(scaleText).not.toBe(before);
  await expectFits(page);
  await page
    .getByRole('button', { name: 'Design System', exact: true })
    .click();
  await page.locator('.stage-catalogue').waitFor();
  await expectFits(page);
});

test('layout v3 : toggle et panneau au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const ds = page.getByRole('button', { name: 'Design System', exact: true });
  const preview = page.getByRole('button', { name: 'Aperçu', exact: true });
  await ds.focus();
  await page.keyboard.press('Tab');
  await expect(preview).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  await expect(ds).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('iframe')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(ds).toHaveAttribute('aria-pressed', 'true');
  const toggle = page.getByRole('button', { name: 'Replier les paramètres' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Paramètres', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Rechercher un token')).toBeVisible();
});

test('barre de prompt : Entrée, Maj+Entrée, bulle repliable, diff, arrêt et mode manuel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/agents', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'claude', available: true, detail: 'Claude Code détecté.' },
      ]),
    }),
  );
  await page.goto('/');
  const boot = await (await page.request.get('/api/bootstrap')).json();
  const state = await (await page.request.get('/api/state')).json();
  // Proposition réelle, renvoyée par un agent simulé : aucun appel IA.
  const proposal = await (
    await page.request.post('/api/proposals', {
      headers: { 'x-ds-studio': boot.csrf },
      data: {
        revision: state.revision,
        changes: [{ key: 'color.brand', value: '#225588' }],
      },
    })
  ).json();
  const sent: string[] = [];
  await page.route('**/api/agent', async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body.message);
    expect(body.agent).toBe('claude');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Voici une marque plus profonde.',
        proposal,
      }),
    });
  });
  const input = page.getByLabel('Votre demande');
  const send = page.getByRole('button', { name: 'Envoyer', exact: true });
  await expect(send).toBeDisabled();
  await input.fill('Ligne 1');
  await input.press('Shift+Enter');
  await input.pressSequentially('Ligne 2');
  await expect(input).toHaveValue('Ligne 1\nLigne 2');
  const oneLine = await input.evaluate((el) => el.clientHeight);
  await input.fill('1\n2\n3\n4\n5\n6\n7');
  const fourLines = await input.evaluate((el) => el.clientHeight);
  expect(fourLines).toBeGreaterThan(oneLine);
  expect(fourLines).toBeLessThanOrEqual(4 * 20 + 18 + 2);
  await input.fill('Rends la marque plus profonde');
  await input.press('Enter');
  expect(sent).toEqual(['Rends la marque plus profonde']);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('#225588');
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  const bubble = page.getByRole('region', { name: 'Réponse de Claude' });
  await expect(bubble).toContainText('Voici une marque plus profonde.');
  await bubble.getByRole('button', { name: /Claude/ }).click();
  await expect(
    bubble.getByText('Voici une marque plus profonde.'),
  ).toBeHidden();

  // Arrêter : la demande reste en attente puis est interrompue.
  await page.unroute('**/api/agent');
  await page.route('**/api/agent', () => new Promise(() => {}));
  await input.fill('Encore');
  await input.press('Enter');
  const stop = page.getByRole('button', { name: 'Arrêter', exact: true });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole('alert')).toContainText('Demande interrompue');
  await expect(send).toBeVisible();

  // Mode manuel : champ désactivé, le bouton mène aux tokens.
  await page
    .getByRole('combobox', { name: 'Mode de travail' })
    .selectOption('manual');
  await expect(input).toBeDisabled();
  await page.getByRole('button', { name: 'Ouvrir les tokens' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tokens', exact: true }),
  ).toBeFocused();
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    state.revision,
  );
});
