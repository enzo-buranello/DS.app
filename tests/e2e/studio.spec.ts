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
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
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

test('créer un composant : chaque réglage en direct, lien aux tokens, persistance', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau composant' }).click();
  const slot = page.getByRole('button', { name: /^Sélectionner Bouton/ });
  await expect(slot).toHaveAttribute('aria-pressed', 'true');
  const comp = page.locator('.ds-custom').first();
  const css = (prop: string) =>
    comp.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  const combo = (name: string) =>
    page.getByRole('combobox', { name, exact: true });
  const num = (name: string) =>
    page.getByRole('spinbutton', { name, exact: true });

  await page.getByLabel('Nom', { exact: true }).fill('Bouton test');
  await page.getByLabel('Texte', { exact: true }).fill('Valider');
  await expect(comp).toContainText('Valider');

  // Couleurs : token, valeur libre + opacité, stroke.
  const brand: string = (await (await page.request.get('/api/state')).json())
    .tokens['color.brand'].$value;
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  await expect(comp).toHaveCSS('background-color', rgb(brand));
  await combo('Fill').selectOption('hex');
  await page.getByLabel('Fill : hex').fill('#112233');
  await num('Fill : opacité (%)').fill('50');
  await expect(comp).toHaveCSS(
    'background-color',
    /rgba?\(17, 34, 51, 0\.5\)|color\(srgb/,
  );
  await combo('Fill').selectOption('color.brand');
  await num('Fill : opacité (%)').fill('100');
  await combo('Stroke').selectOption('color.danger');
  await combo('Texte (couleur)').selectOption('color.surface');
  await expect(comp).toHaveCSS('color', 'rgb(255, 255, 255)');

  // Bordure.
  await num('Épaisseur (px)').fill('3');
  await combo('Style').selectOption('dashed');
  await expect(comp).toHaveCSS('border-top-width', '3px');
  await expect(comp).toHaveCSS('border-top-style', 'dashed');
  await expect(comp).toHaveCSS('border-top-color', 'rgb(180, 35, 62)');

  // Radius global puis par coin.
  await combo('Rayon global').selectOption('px');
  await num('Rayon global : valeur (px)').fill('12');
  await expect(comp).toHaveCSS('border-top-left-radius', '12px');
  await page.getByText('Rayon par coin').click();
  await combo('Rayon bas droit').selectOption('px');
  await num('Rayon bas droit : valeur (px)').fill('0');
  await expect(comp).toHaveCSS('border-bottom-right-radius', '0px');
  await expect(comp).toHaveCSS('border-top-left-radius', '12px');

  // Auto layout.
  await combo('Direction').selectOption('vertical');
  await expect(comp).toHaveCSS('flex-direction', 'column');
  await combo('Gap').selectOption('space.lg');
  await expect(comp).toHaveCSS('row-gap', '24px');
  await combo('Padding global').selectOption('space.lg');
  await page.getByText('Padding par côté').click();
  await combo('Padding gauche').selectOption('px');
  await num('Padding gauche : valeur (px)').fill('40');
  await expect(comp).toHaveCSS('padding-top', '24px');
  await expect(comp).toHaveCSS('padding-left', '40px');
  await combo('Alignement').selectOption('end');
  await combo('Distribution').selectOption('space-between');
  await expect(comp).toHaveCSS('align-items', 'flex-end');
  await expect(comp).toHaveCSS('justify-content', 'space-between');
  await combo('Largeur').selectOption('fill');
  // Fill : le composant occupe toute la largeur intérieure de son emplacement.
  await expect
    .poll(() =>
      comp.evaluate((el) => {
        const slot = el.parentElement!;
        const pad =
          parseFloat(getComputedStyle(slot).paddingLeft) +
          parseFloat(getComputedStyle(slot).paddingRight);
        return Math.round(
          (el as HTMLElement).offsetWidth - (slot.clientWidth - pad),
        );
      }),
    )
    .toBe(0);
  await combo('Hauteur').selectOption('fixed');
  await num('Hauteur fixe (px)').fill('140');
  await expect(comp).toHaveCSS('height', '140px');

  // Typographie.
  await combo('Famille').selectOption('Georgia');
  await combo('Taille').selectOption('font.heading');
  await combo('Graisse').selectOption('800');
  await num('Interligne').fill('1.2');
  await expect(comp).toHaveCSS('font-family', 'Georgia');
  await expect(comp).toHaveCSS('font-size', '28px');
  await expect(comp).toHaveCSS('font-weight', '800');
  await expect(comp).toHaveCSS('line-height', /33\.6px/);

  // Effets.
  await page.getByLabel('Ombre portée').check();
  await num('Ombre y').fill('6');
  await expect(comp).toHaveCSS('box-shadow', /6px 12px 0px/);
  await num('Flou du calque (px)').fill('1');
  await expect(comp).toHaveCSS('filter', 'blur(1px)');
  await num('Flou du calque (px)').fill('0');

  // Dimensions.
  await num('Largeur min (px)').fill('200');
  await num('Largeur max (px)').fill('320');
  await num('Hauteur min (px)').fill('60');
  await num('Hauteur max (px)').fill('400');
  await expect(comp).toHaveCSS('min-width', '200px');
  await expect(comp).toHaveCSS('max-width', '320px');
  await expect(comp).toHaveCSS('min-height', '60px');
  await expect(comp).toHaveCSS('max-height', '400px');

  // Le fill reste lié au token : une validation de color.brand le met à jour.
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#8A3B20');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Valider et enregistrer' })
    .click();
  await expect(comp).toHaveCSS('background-color', 'rgb(138, 59, 32)');

  // Sauvegarde sur disque, puis repli de section mémorisé après rechargement.
  await expect
    .poll(async () => {
      const { components } = await (
        await page.request.get('/api/components')
      ).json();
      return components[0]?.size.maxHeight;
    })
    .toBe(400);
  const { components } = await (
    await page.request.get('/api/components')
  ).json();
  expect(components[0]).toMatchObject({
    name: 'Bouton test',
    fill: { token: 'color.brand' },
    layout: { gap: { token: 'space.lg' }, padding: { left: { px: 40 } } },
  });
  await page.getByText('Import Figma', { exact: true }).click();
  await expect(page.locator('#figma-import')).toBeHidden();
  await page.reload();
  await expect(page.locator('#figma-import')).toBeHidden();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(
    'Bouton test',
  );
  await expect(page.locator('.ds-custom').first()).toHaveCSS('height', '140px');
  await page.screenshot({ path: 'test-results/composant-manuel.png' });
});

// Plugin simulé : mêmes routes et même code d'appairage que le vrai plugin.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function figmaNode(
  nodeId: string,
  name: string,
  set: null | { id: string; name: string },
  properties: Record<string, string>,
  characters: string,
) {
  return {
    nodeId,
    name,
    set,
    properties,
    fill: { hex: '#18734B', opacity: 1, variable: null },
    stroke: null,
    strokeWeight: 0,
    dash: 'solid',
    radii: [10, 10, 10, 10],
    radiusVariables: [null, null, null, null],
    layout: {
      direction: 'HORIZONTAL',
      gap: 8,
      gapVariable: null,
      padding: [8, 16, 8, 16],
      paddingVariables: [null, null, null, null],
      primary: 'CENTER',
      counter: 'CENTER',
      sizingH: 'HUG',
      sizingV: 'HUG',
    },
    width: 120,
    height: 44,
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    shadow: null,
    blur: 0,
    text: {
      characters,
      fontFamily: 'Inter',
      fontWeight: 600,
      fontSize: 16,
      fontSizeVariable: null,
      lineHeight: { unit: 'AUTO' },
      color: { hex: '#FFFFFF', opacity: 1, variable: null },
    },
  };
}
async function fakePlugin(page: Page) {
  const { pairCode } = await (await page.request.get('/api/figma')).json();
  const headers = { Authorization: `Bearer ${pairCode}` };
  const info = {
    file: { name: 'Kit UI', key: 'AbCdEf123456' },
    pages: [
      { id: 'p1', name: 'Composants' },
      { id: 'p2', name: 'Vide' },
    ],
  };
  const set = { id: '1:1', name: 'Bouton' };
  const exports: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const missing = new Set<string>();
  const run = (cmd: {
    type: string;
    args: {
      pageId: string;
      ids?: string[];
      kind?: string;
      definitions?: unknown[];
      screens?: unknown[];
    };
  }) => {
    if (
      missing.has(cmd.args.pageId) ||
      !info.pages.some((p) => p.id === cmd.args.pageId)
    )
      throw new Error('Page introuvable dans le fichier ouvert.');
    if (cmd.type === 'export') {
      exports.push(cmd.args);
      const first =
        exports.filter(
          (e) => e.kind === cmd.args.kind && e.pageId === cmd.args.pageId,
        ).length === 1;
      const n = cmd.args.definitions!.length + cmd.args.screens!.length;
      return {
        pageId: cmd.args.pageId,
        pageName: info.pages.find((p) => p.id === cmd.args.pageId)!.name,
        created: first ? n : 0,
        updated: first ? 0 : n,
        components: cmd.args.definitions!.length,
        sets: cmd.args.definitions!.length ? 1 : 0,
        screens: cmd.args.screens!.length,
        variables: 18,
        mismatched: [],
      };
    }
    if (cmd.type === 'components')
      return {
        items:
          cmd.args.pageId === 'p2'
            ? []
            : [
                {
                  id: '1:1',
                  name: 'Bouton',
                  type: 'COMPONENT_SET',
                  variants: 2,
                  thumbnail: PNG,
                },
                {
                  id: '2:1',
                  name: 'Badge',
                  type: 'COMPONENT',
                  variants: 1,
                  thumbnail: null,
                },
              ],
      };
    return {
      items: [
        ...(cmd.args.ids!.includes('1:1')
          ? [
              figmaNode('1:2', 'Taille=S', set, { Taille: 'S' }, 'Petit'),
              figmaNode('1:3', 'Taille=L', set, { Taille: 'L' }, 'Grand'),
            ]
          : []),
        ...(cmd.args.ids!.includes('2:1')
          ? [figmaNode('2:1', 'Badge', null, {}, 'Nouveau')]
          : []),
      ],
    };
  };
  let running = true;
  const loop = (async () => {
    while (running) {
      const r = await page.request.post('/plugin/figma/live', {
        headers,
        data: info,
      });
      const { command } = await r.json();
      if (command) {
        try {
          await page.request.post('/plugin/figma/result', {
            headers,
            data: { id: command.id, ok: true, data: run(command) },
          });
        } catch (e) {
          await page.request.post('/plugin/figma/result', {
            headers,
            data: { id: command.id, ok: false, error: (e as Error).message },
          });
        }
      } else await new Promise((r) => setTimeout(r, 200));
    }
  })();
  return {
    info,
    exports,
    missing,
    stop: async () => {
      running = false;
      await loop;
    },
  };
}

test('import Figma : états, pages, sélection multiple, variantes, ré-import et mémoire', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const section = page.locator('#figma-import');
  await expect(section.getByText('Figma non connecté.')).toBeVisible();
  await section.getByRole('button', { name: 'Connecter Figma' }).click();
  const { pairCode } = await (await page.request.get('/api/figma')).json();
  await expect(section.locator('.pair-code')).toHaveText(pairCode);

  const plugin = await fakePlugin(page);
  const fileSelect = section.getByRole('combobox', { name: 'Fichier Figma' });
  await expect(fileSelect).toContainText('Kit UI');
  const pageSelect = section.getByRole('combobox', { name: 'Page' });

  // Page vide puis page avec composants (miniature + nombre de variantes).
  await pageSelect.selectOption('p2');
  await expect(
    section.getByText('Aucun composant sur cette page.'),
  ).toBeVisible();
  await pageSelect.selectOption('p1');
  const list = section.getByRole('list', { name: 'Composants de la page' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('2 variante(s)');
  await expect(list.locator('img')).toHaveCount(1);

  // URL d'un autre fichier : message clair, import bloqué.
  const url = section.getByLabel('Ou coller l’URL du fichier');
  await url.fill('https://www.figma.com/design/ZzZzZzZzZz99/Autre');
  await expect(section.getByRole('alert')).toContainText(
    'ne correspond pas au fichier ouvert',
  );
  await url.fill('https://www.figma.com/design/AbCdEf123456/Kit-UI');
  await url.blur();
  await expect(section.getByRole('alert')).toHaveCount(0);

  const importButton = section.getByRole('button', { name: /^Importer/ });
  await expect(importButton).toBeDisabled();
  await list.getByLabel(/Bouton/).check();
  await list.getByLabel(/Badge/).check();
  await importButton.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Import Figma' }),
  ).toContainText('3 composant(s) créé(s), 0 mis à jour');
  const stage = page.locator('.stage-catalogue');
  await expect(
    stage.getByRole('button', { name: 'Sélectionner Bouton · Taille=S' }),
  ).toBeVisible();
  await expect(
    stage.getByRole('button', { name: 'Sélectionner Bouton · Taille=L' }),
  ).toBeVisible();
  await expect(
    stage.getByRole('button', { name: 'Sélectionner Badge' }),
  ).toContainText('Nouveau');
  const { components } = await (
    await page.request.get('/api/components')
  ).json();
  const imported = components.filter((c: { source: unknown }) => c.source);
  expect(imported).toHaveLength(3);
  // Couleur égale à color.success → liée au token ; rayon 10 → radius.control.
  expect(imported[0].fill).toEqual({ token: 'color.success', opacity: 1 });
  expect(imported[0].radius.topLeft).toEqual({ token: 'radius.control' });
  expect(imported[0].set).toEqual({
    id: '1:1',
    name: 'Bouton',
    properties: { Taille: 'S' },
  });

  // Ré-import : mise à jour, aucun doublon.
  await list.getByLabel(/Bouton/).check();
  await list.getByLabel(/Badge/).check();
  await importButton.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Import Figma' }),
  ).toContainText('0 composant(s) créé(s), 3 mis à jour');
  const after = await (await page.request.get('/api/components')).json();
  expect(
    after.components.filter((c: { source: unknown }) => c.source),
  ).toHaveLength(3);

  // Fichier et page mémorisés après rechargement.
  await page.reload();
  await expect(section.getByRole('combobox', { name: 'Page' })).toHaveValue(
    'p1',
  );
  await expect(section.getByLabel('Ou coller l’URL du fichier')).toHaveValue(
    'https://www.figma.com/design/AbCdEf123456/Kit-UI',
  );

  // Erreur côté plugin : page absente du fichier → message clair.
  const r = await page.request.post('/api/figma/components', {
    headers: {
      'x-ds-studio': (await (await page.request.get('/api/bootstrap')).json())
        .csrf,
    },
    data: { pageId: 'p404' },
  });
  expect(r.status()).toBe(502);
  expect((await r.json()).error).toContain('Figma : Page introuvable');

  // Plugin fermé : retour à l'état « non connecté ».
  await plugin.stop();
  await expect(section.getByText('Figma non connecté.')).toBeVisible({
    timeout: 10_000,
  });
});

test('réglages d’aperçu : dans la fenêtre d’aperçu seulement, repliables, état conservé', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const width = page.getByRole('combobox', { name: 'Largeur d’écran' });
  const panel = page.getByRole('complementary', { name: 'Paramètres' });
  // Vue Design System : aucun réglage d'aperçu, ni dans la scène ni dans le panneau.
  await expect(width).toHaveCount(0);
  await expect(panel.getByRole('combobox', { name: 'Scénario' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const tools = page.getByRole('group', { name: 'Réglages d’aperçu' });
  await expect(tools).toBeVisible();
  await tools
    .getByRole('combobox', { name: 'Largeur d’écran' })
    .selectOption('2');
  await tools.getByRole('combobox', { name: 'Scénario' }).selectOption('form');
  await expect(page.locator('iframe')).toHaveAttribute('width', '430');
  await expect(page.locator('iframe')).toHaveAttribute('src', /scenario=form/);
  const toggle = page.getByRole('button', { name: /Réglages d’aperçu/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(tools).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expectFits(page);
  await toggle.click();
  await expect(tools).toBeVisible();
  // Aller-retour vers le Design System : même largeur, même scénario.
  await page
    .getByRole('button', { name: 'Design System', exact: true })
    .click();
  await expect(width).toHaveCount(0);
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await expect(width).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Scénario' })).toHaveValue(
    'form',
  );
  await expect(page.locator('iframe')).toHaveAttribute('width', '430');
});

test('export Figma : états, Design system, aperçu actuel, page modifiable, ré-export', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const header = page.getByRole('banner');
  const open = async (scope: import('@playwright/test').Locator) => {
    await scope.getByRole('button', { name: 'Exporter' }).click();
    return page.getByRole('dialog', { name: 'Exporter vers Figma' });
  };
  // Plugin non lancé : message clair, choix désactivés, Échap rend le focus.
  let menu = await open(header);
  await expect(menu).toContainText('Plugin Figma non lancé');
  await expect(
    menu.getByRole('button', { name: 'Design system' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(header.getByRole('button', { name: 'Exporter' })).toBeFocused();

  // Plugin lancé avec un mauvais code : « non connecté ».
  await page.request.post('/plugin/figma/live', {
    headers: { Authorization: 'Bearer mauvais-code' },
    data: { file: { name: 'x', key: null }, pages: [] },
  });
  menu = await open(header);
  await expect(menu).toContainText('non connecté');
  await page.keyboard.press('Escape');

  const plugin = await fakePlugin(page);
  const csrf = (await (await page.request.get('/api/bootstrap')).json()).csrf;
  await page.request.post('/api/figma/selection', {
    headers: { 'x-ds-studio': csrf },
    data: { fileUrl: '', pageId: 'p1' },
  });
  menu = await open(header);
  const target = menu.getByRole('combobox', { name: /Page Figma/ });
  await expect(target).toHaveValue('p1');
  await menu.getByRole('button', { name: 'Design system' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Export Figma' });
  await expect(toast).toContainText('« Composants »');
  await expect(
    toast.getByRole('link', { name: 'Ouvrir la page dans Figma' }),
  ).toHaveAttribute(
    'href',
    'https://www.figma.com/design/AbCdEf123456/?node-id=p1',
  );
  const ds = plugin.exports[0];
  expect(ds.kind).toBe('ds');
  expect(ds.tokens['color.brand'].$type).toBe('color');
  const keys = ds.definitions.map((d: { key: string }) => d.key);
  expect(keys).toEqual(
    expect.arrayContaining([
      'Button|Variante=Principal, État=Défaut',
      'Button|Variante=Secondaire, État=Défaut',
      'Button|Variante=Danger, État=Défaut',
      'Button|Variante=Principal, État=Désactivé',
      'BookingCard',
      'Form',
      'Navigation',
    ]),
  );
  const buttons = ds.definitions.filter(
    (d: { set: string }) => d.set === 'Button',
  );
  expect(buttons).toHaveLength(4);
  expect(buttons[0].root.layout.mode).toBe('HORIZONTAL');
  // Le bouton de la carte reste un composant référencé (futur instance).
  const card = ds.definitions.find(
    (d: { key: string }) => d.key === 'BookingCard',
  );
  expect(JSON.stringify(card.root)).toContain(
    '"key":"Button|Variante=Principal, État=Défaut"',
  );

  // Ré-export : même cible, signalé comme mise à jour.
  menu = await open(header);
  await menu.getByRole('button', { name: 'Design system' }).click();
  await expect(toast).toContainText(
    `0 créé(s), ${ds.definitions.length} mis à jour`,
  );

  // Aperçu : bouton dans la barre d'aperçu, page modifiée avant envoi.
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const previewBar = page.locator('.stage-bar');
  menu = await open(previewBar);
  await menu.getByRole('combobox', { name: /Page Figma/ }).selectOption('p2');
  await menu.getByRole('button', { name: 'Aperçu actuel' }).click();
  await expect(toast).toContainText('« Vide »');
  const preview = plugin.exports.at(-1)!;
  expect(preview.kind).toBe('preview');
  expect(preview.screens[0].key).toBe('cards:375');
  expect(preview.screens[0].name).toBe('DS-Studio / Découvrir / 375');
  expect(JSON.stringify(preview.screens[0].root)).toContain(
    '"key":"BookingCard"',
  );

  // Page supprimée côté Figma entre-temps : erreur claire.
  plugin.missing.add('p2');
  menu = await open(previewBar);
  await menu.getByRole('combobox', { name: /Page Figma/ }).selectOption('p2');
  await menu.getByRole('button', { name: 'Aperçu actuel' }).click();
  await expect(page.locator('.dock').getByRole('alert')).toContainText(
    'Figma : Page introuvable',
  );
  await plugin.stop();
});
