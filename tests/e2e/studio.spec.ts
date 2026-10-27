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
  await page.getByText('Importer une image', { exact: true }).click();
  await expect(page.locator('#image-import')).toBeHidden();
  await page.reload();
  await expect(page.locator('#image-import')).toBeHidden();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(
    'Bouton test',
  );
  await expect(page.locator('.ds-custom').first()).toHaveCSS('height', '140px');
  await page.screenshot({ path: 'test-results/composant-manuel.png' });
});

// Plugin simulé : mêmes routes et même code d'appairage que le vrai plugin.
async function fakePlugin(page: Page) {
  const { pairCode } = await (await page.request.get('/api/figma')).json();
  const headers = { Authorization: `Bearer ${pairCode}` };
  const info = {
    file: { name: 'Kit UI', key: 'AbCdEf123456' },
    pages: [
      { id: '0:1', name: 'Composants' },
      { id: '0:2', name: 'Écrans' },
    ],
  };
  const exports: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const missing = new Set<string>();
  const run = (cmd: {
    type: string;
    args: {
      pageId: string;
      kind?: string;
      definitions?: { key: string }[];
      screens?: { key: string }[];
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
        // Ids Figma simulés : l'app les conserve et les renvoie au prochain export.
        nodes: Object.fromEntries(
          [...cmd.args.definitions!, ...cmd.args.screens!].map((d, i) => [
            d.key,
            `9:${i}`,
          ]),
        ),
      };
    }
    throw new Error('Commande inconnue.');
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
  // Panneau latéral, à gauche de l'écran d'aperçu ; replié, il rend la place à la scène.
  const frameWidth = () =>
    page.locator('.stage-frame').evaluate((el) => el.clientWidth);
  const [toolsBox, frameBox] = await Promise.all([
    tools.boundingBox(),
    page.locator('.stage-frame').boundingBox(),
  ]);
  expect(toolsBox!.x + toolsBox!.width).toBeLessThanOrEqual(frameBox!.x);
  expect(toolsBox!.height).toBeGreaterThan(frameBox!.height * 0.9);
  const opened = await frameWidth();
  await toggle.click();
  await expect(tools).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(frameWidth).toBeGreaterThan(opened + 150);
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

test('export Figma : OAuth, fichier › page, plugin, DS, aperçu, ré-export, déconnexion', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const header = page.getByRole('banner');
  const menu = page.getByRole('dialog', { name: 'Exporter vers Figma' });
  const open = async (scope = header) => {
    if (!(await menu.isVisible()))
      await scope.getByRole('button', { name: 'Exporter' }).click();
    return menu;
  };
  // 1. Non connecté : connexion OAuth dans un nouvel onglet (faux Figma local).
  await open();
  await expect(menu).toContainText('Non connecté à Figma');
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    menu.getByRole('link', { name: 'Se connecter à Figma' }).click(),
  ]);
  await expect(tab.getByText('Figma connecté')).toBeVisible();
  await tab.close();
  await expect(menu).toContainText('Connecté : Camille');

  // 2. Fichier par son lien, puis page ; plugin pas encore lancé.
  const link = menu.getByLabel('Fichier Figma (lien)');
  await link.fill('https://www.figma.com/design/ViewOnly12345/Lecture');
  await menu.getByRole('button', { name: 'Charger' }).click();
  await expect(menu).toContainText('Droits insuffisants');
  await link.fill('https://www.figma.com/design/AbCdEf123456/Kit-UI');
  await menu.getByRole('button', { name: 'Charger' }).click();
  const pageSelect = menu.getByRole('combobox', { name: /Page · Kit UI/ });
  await pageSelect.selectOption({ label: 'Composants' });
  const { pairCode } = await (await page.request.get('/api/figma')).json();
  await expect(menu).toContainText('Plugin non lancé');
  await expect(menu.locator('.pair-code')).toHaveText(pairCode);
  await expect(
    menu.getByRole('button', { name: 'Design system' }),
  ).toBeDisabled();

  // Plugin lancé avec un mauvais code : « non connecté ».
  await page.request.post('/plugin/figma/live', {
    headers: { Authorization: 'Bearer mauvais-code' },
    data: { file: { name: 'x', key: null }, pages: [] },
  });
  await expect(menu).toContainText('Plugin lancé mais non connecté');

  // 3. Plugin lancé sur le bon fichier : export du Design system.
  const plugin = await fakePlugin(page);
  const ds = menu.getByRole('button', { name: 'Design system' });
  await expect(ds).toBeEnabled();
  await ds.click();
  const toast = page.getByRole('status').filter({ hasText: 'Export Figma' });
  await expect(toast).toContainText('« Composants »');
  await expect(
    toast.getByRole('link', { name: 'Ouvrir la page dans Figma' }),
  ).toHaveAttribute(
    'href',
    'https://www.figma.com/design/AbCdEf123456/?node-id=0-1',
  );
  const first = plugin.exports[0];
  expect(first.kind).toBe('ds');
  expect(first.pageId).toBe('0:1');
  expect(first.nodes).toEqual({});
  expect(first.tokens['color.brand'].$type).toBe('color');
  const keys = first.definitions.map((d: { key: string }) => d.key);
  expect(keys).toEqual(
    expect.arrayContaining([
      'Button|Variante=Principal, État=Défaut',
      'Button|Variante=Danger, État=Défaut',
      'BookingCard',
      'Form',
      'Navigation',
    ]),
  );
  // Le bouton de la carte reste une référence (instance dans Figma).
  const card = first.definitions.find(
    (d: { key: string }) => d.key === 'BookingCard',
  );
  expect(JSON.stringify(card.root)).toContain(
    '"key":"Button|Variante=Principal, État=Défaut"',
  );

  // 4. Ré-export : les identifiants conservés par l'app sont renvoyés au plugin.
  await open();
  await menu.getByRole('button', { name: 'Design system' }).click();
  await expect(toast).toContainText(
    `0 créé(s), ${first.definitions.length} mis à jour`,
  );
  expect(plugin.exports[1].nodes.BookingCard).toBe(
    `9:${keys.indexOf('BookingCard')}`,
  );

  // 5. Aperçu actuel depuis la barre d'aperçu, vers une autre page.
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await open(page.locator('.stage-bar'));
  await menu
    .getByRole('combobox', { name: /Page · Kit UI/ })
    .selectOption({ label: 'Écrans' });
  await menu.getByRole('button', { name: 'Aperçu actuel' }).click();
  await expect(toast).toContainText('« Écrans »');
  const preview = plugin.exports.at(-1)!;
  expect(preview.kind).toBe('preview');
  expect(preview.pageId).toBe('0:2');
  expect(preview.screens[0].key).toBe('cards:375');
  expect(JSON.stringify(preview.screens[0].root)).toContain(
    '"key":"BookingCard"',
  );

  // 6. Dernier choix mémorisé après rechargement.
  await page.reload();
  await open();
  await expect(menu.getByLabel('Fichier Figma (lien)')).toHaveValue(
    'https://www.figma.com/design/AbCdEf123456/Kit-UI',
  );
  await expect(
    menu.getByRole('combobox', { name: /Page · Kit UI/ }),
  ).toHaveValue('0:2');

  // 7. Plugin ouvert sur un autre fichier : bloqué avec un message clair.
  plugin.info.file = { name: 'Autre fichier', key: 'Zzzzzzzzzz99' };
  await expect(menu).toContainText('Fichier non ouvert dans Figma');
  await expect(
    menu.getByRole('button', { name: 'Design system' }),
  ).toBeDisabled();
  await plugin.stop();

  // 8. Déconnexion.
  await menu.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(menu).toContainText('Non connecté à Figma');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(header.getByRole('button', { name: 'Exporter' })).toBeFocused();
});

const BUTTON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <script>alert(1)</script>
  <rect x="0" y="0" width="160" height="48" rx="10" fill="#3154C4"/>
  <path d="M20 24h16m-6-6 6 6-6 6" stroke="#FFFFFF" stroke-width="2" fill="none" onclick="alert(2)"/>
  <text x="48" y="30" font-size="16" font-weight="600" fill="#FFFFFF" font-family="Arial">Envoyer</text>
</svg>`;
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('importer une image : SVG déposé, capture collée, états d’erreur, résultat modifiable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Serveur partagé entre tests : tokens utilisés ici remis à leur valeur d'origine
  // (par le diff et la validation habituels).
  const state = await (await page.request.get('/api/state')).json();
  const seed: Record<string, string | number> = {
    'color.brand': '#3154C4',
    'color.onBrand': '#FFFFFF',
    'space.sm': 8,
    'space.md': 16,
    'radius.control': 10,
  };
  const changes = Object.entries(seed)
    .filter(([k, v]) => state.tokens[k].$value !== v)
    .map(([key, value]) => ({ key, value }));
  if (changes.length) {
    const csrf = (await (await page.request.get('/api/bootstrap')).json()).csrf;
    const headers = { 'x-ds-studio': csrf };
    const proposal = await (
      await page.request.post('/api/proposals', {
        headers,
        data: { revision: state.revision, changes },
      })
    ).json();
    await page.request.post('/api/commit', {
      headers,
      data: { id: proposal.id },
    });
  }
  await page.goto('/');
  const section = page.locator('#image-import');
  const picker = section.getByLabel('Choisir une image');
  const alert = section.getByRole('alert');

  // Format non supporté, puis image trop lourde : refus immédiat.
  await picker.setInputFiles({
    name: 'anim.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });
  await expect(alert).toContainText('Format non supporté');
  const heavy = Buffer.alloc(4 * 1024 * 1024 + 1);
  PNG_1PX.copy(heavy);
  await picker.setInputFiles({
    name: 'lourde.png',
    mimeType: 'image/png',
    buffer: heavy,
  });
  await expect(alert).toContainText('trop lourde');

  // SVG déposé : conversion directe, sans IA ; script et attributs on* écartés.
  await section.locator('.dropzone').evaluate((zone, svg) => {
    const data = new DataTransfer();
    data.items.add(
      new File([svg], 'bouton-envoyer.svg', { type: 'image/svg+xml' }),
    );
    zone.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, bubbles: true }),
    );
  }, BUTTON_SVG);
  const preview = section.getByRole('region', { name: 'Aperçu de l’import' });
  const source = preview.getByRole('img', { name: /bouton-envoyer\.svg/ });
  // L'image source est réellement décodée (pas bloquée par la CSP).
  await expect
    .poll(() => source.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const result = preview.locator('.ds-custom');
  await expect(result).toContainText('Envoyer');
  await expect(result).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await expect(result.locator('svg path')).toHaveCount(1);
  expect(await result.locator('svg').innerHTML()).not.toMatch(/script|onclick/);
  await preview.getByRole('button', { name: 'Créer' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'créé' }),
  ).toContainText('bouton-envoyer');
  await expect(preview).toBeHidden();
  const created = page
    .locator('.stage-catalogue')
    .getByRole('button', { name: 'Sélectionner bouton-envoyer' });
  await expect(created).toHaveAttribute('aria-pressed', 'true');
  // Modifiable avec la section 1 : fond lié au token, icône qui suit la couleur du texte.
  await expect(
    page.getByRole('combobox', { name: 'Fill', exact: true }),
  ).toHaveValue('color.brand');
  await page
    .getByRole('combobox', { name: 'Fill', exact: true })
    .selectOption('color.danger');
  await page
    .getByRole('combobox', { name: 'Texte (couleur)', exact: true })
    .selectOption('color.text');
  const view = created.locator('.ds-custom');
  await expect(view).toHaveCSS('background-color', 'rgb(180, 35, 62)');
  await expect(view.locator('svg path')).toHaveCSS('stroke', 'rgb(25, 36, 61)');

  // Capture collée (Cmd+V) : analyse par Claude (CLI simulé), rapprochée des tokens.
  await page.evaluate(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], 'capture.png', { type: 'image/png' }),
      );
      window.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data }),
      );
    },
    [...PNG_1PX],
  );
  await expect(preview.locator('.ds-custom')).toContainText('Valider');
  await expect(preview.locator('.ds-custom')).toHaveCSS(
    'background-color',
    'rgb(49, 84, 196)',
  );
  await preview.getByRole('button', { name: 'Réessayer' }).click();
  await expect(preview.locator('.ds-custom')).toContainText('Valider');
  await preview.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(
    'Bouton capturé',
  );
  // Sauvegarde différée de la section 1 : on attend qu'elle soit sur disque.
  await expect
    .poll(async () => {
      const r = await (await page.request.get('/api/components')).json();
      return r.components.find(
        (c: { name: string }) => c.name === 'bouton-envoyer',
      )?.fill.token;
    })
    .toBe('color.danger');
  const { components } = await (
    await page.request.get('/api/components')
  ).json();
  const svg = components.find(
    (c: { name: string }) => c.name === 'bouton-envoyer',
  );
  const shot = components.find(
    (c: { name: string }) => c.name === 'Bouton capturé',
  );
  expect(svg.vector.nodes[0].tag).toBe('path');
  expect(svg.fill).toEqual({ token: 'color.danger', opacity: 1 });
  expect(shot.fill).toEqual({ token: 'color.brand', opacity: 1 });
  expect(shot.layout.padding.left).toEqual({ token: 'space.md' });

  // Réponse de Claude hors format : message clair, rien de créé.
  await picker.setInputFiles({
    name: 'capture.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'),
  });
  await expect(alert).toContainText('Réponse de Claude invalide');
  const after = await (await page.request.get('/api/components')).json();
  expect(after.components).toHaveLength(components.length);
});
