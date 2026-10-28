import { test, expect } from '@playwright/test';
import { seedDoc } from '../../app/shared/seedDoc.js';

// Les paquets de détail de l'inspecteur sont repliés par défaut ; les parcours
// ci-dessous les manipulent tous, on les ouvre (même mécanisme que l'utilisateur).
// Le test « paquets repliés par défaut » vérifie l'état initial sans ce réglage.
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith('inspecteur : paquets')) return;
  await page.addInitScript(() => {
    const titles = ['Position', 'Apparence', 'Fond', 'Contour', 'Effets'];
    const all = [...titles, 'Interaction', 'Avancé', 'Typographie'];
    localStorage.setItem(
      'ds-studio-inspector-sections',
      JSON.stringify(Object.fromEntries(all.map((t) => [t, true]))),
    );
  });
});

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
  await dialog.getByRole('button', { name: 'Rejeter' }).click();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(49, 84, 196)');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
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
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await page.getByRole('button', { name: /^Historique/ }).click();
  await page
    .getByRole('dialog', { name: 'Historique' })
    .getByRole('button', { name: 'Annuler la révision 1', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
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
    // Grille en auto-layout avec retour à la ligne : colonnes = cartes
    // alignées sur la même ligne.
    const columns = await frame
      .locator('.scenario-grid')
      .evaluate(
        (el) =>
          [...el.children].filter(
            (c) =>
              c.getBoundingClientRect().top ===
              el.children[0].getBoundingClientRect().top,
          ).length,
      );
    expect(columns).toBe(width >= 700 ? 2 : 1);
  }
  await page
    .getByRole('combobox', { name: 'Largeur d’écran', exact: true })
    .selectOption('1');
  // Interactions natives : prototype en mode Test (P).
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: /^Test/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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
  await expect(page.getByRole('button', { name: 'Rejeter' })).toBeFocused();
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
  await page.getByText('Mon PFE', { exact: true }).click();
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
  await page.getByText('Mon PFE', { exact: true }).click();
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
  await expect(page.getByText('Brouillon', { exact: true })).toBeVisible();
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
  await other.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(other.getByRole('dialog')).not.toBeVisible();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Une autre validation');
  await expect(
    dialog.getByRole('button', { name: 'Enregistrer', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Rejeter' }).click();
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

test('barre de prompt : Entrée, Maj+Entrée, bulle repliable, écriture directe, arrêt et mode manuel', async ({
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
  // Écriture réelle, renvoyée par un agent simulé : aucun appel IA.
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
    const next = await (
      await page.request.post('/api/commit', {
        headers: { 'x-ds-studio': boot.csrf },
        data: { id: proposal.id },
      })
    ).json();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Voici une marque plus profonde.',
        applied: { type: 'token', patches: proposal.patches, state: next },
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
  // Appliqué directement, sans diff, puis annulable par Cmd+Z.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Modification appliquée.')).toBeVisible();
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/state')).json()).tokens[
          'color.brand'
        ].$value,
    )
    .toBe(state.tokens['color.brand'].$value);
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
  // Écriture puis annulation : deux révisions, valeur d'origine.
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    state.revision + 2,
  );
});

test('créer un composant : inspecteur complet en direct, tokens, états, persistance', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau composant' }).click();
  const panel = page.getByRole('region', { name: /Bouton 1/ });
  await expect(panel).toContainText('Composant maître');
  const comp = page.locator('.stage-catalogue .ds-custom').first();
  const combo = (name: string) =>
    page.getByRole('combobox', { name, exact: true });
  const field = (name: string) => page.getByLabel(name, { exact: true });
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

  // Calque : renommer.
  await field('Nom du calque').fill('Bouton test');
  await expect(page.getByRole('region', { name: /Bouton test/ })).toBeVisible();

  // Fond : token, valeur libre + opacité, plusieurs fonds empilés.
  const brand: string = (await (await page.request.get('/api/state')).json())
    .tokens['color.brand'].$value;
  await expect(comp).toHaveCSS('background-color', rgb(brand));
  await combo('Fond 1').selectOption('hex');
  await field('Fond 1 : hex').fill('#112233');
  await field('Fond 1 : opacité').fill('50');
  await expect(comp).toHaveCSS(
    'background-color',
    /rgba?\(17, 34, 51, 0\.5\)|color\(srgb/,
  );
  await combo('Fond 1').selectOption('color.brand');
  await field('Fond 1 : opacité').fill('100');
  await page.getByRole('button', { name: 'Ajouter un fond' }).click();
  await expect(comp).toHaveCSS('background-image', /linear-gradient/);
  await page.getByRole('button', { name: 'Fond 1 : masquer' }).click();
  await expect(comp).toHaveCSS('background-color', rgb(brand));
  await page.getByRole('button', { name: 'Fond 1 : supprimer' }).click();
  await expect(combo('Fond 1')).toHaveValue('color.brand');

  // Contour.
  await page.getByRole('button', { name: 'Ajouter un contour' }).click();
  await combo('Contour').selectOption('color.danger');
  await field('Épaisseur').fill('3');
  await combo('Style du contour').selectOption('dashed');
  await expect(comp).toHaveCSS('border-top-width', '3px');
  await expect(comp).toHaveCSS('border-top-style', 'dashed');
  await expect(comp).toHaveCSS('border-top-color', 'rgb(180, 35, 62)');

  // Rayons : global puis par coin.
  await combo('Rayon').selectOption('px');
  await field('Rayon : valeur').fill('12');
  await expect(comp).toHaveCSS('border-top-left-radius', '12px');
  await page.getByLabel('Rayon par coin').click();
  await combo('Rayon bas droit').selectOption('px');
  await field('Rayon bas droit : valeur').fill('0');
  await expect(comp).toHaveCSS('border-bottom-right-radius', '0px');
  await expect(comp).toHaveCSS('border-top-left-radius', '12px');

  // Auto-layout : direction, espacement, marges par côté, alignement 9 positions.
  await combo('Direction').selectOption('vertical');
  await expect(comp).toHaveCSS('flex-direction', 'column');
  await combo('Espacement').selectOption('space.lg');
  await expect(comp).toHaveCSS('row-gap', '24px');
  // Marges différentes selon les côtés : l'inspecteur s'ouvre « par côté ».
  await expect(page.getByLabel('Marges par côté')).toBeChecked();
  await page.getByLabel('Marges par côté').click();
  await combo('Marge intérieure').selectOption('space.lg');
  await page.getByLabel('Marges par côté').click();
  await combo('Marge gauche').selectOption('px');
  await field('Marge gauche : valeur').fill('40');
  await expect(comp).toHaveCSS('padding-top', '24px');
  await expect(comp).toHaveCSS('padding-left', '40px');
  await page.getByRole('button', { name: 'Aligner bas droite' }).click();
  await expect(comp).toHaveCSS('align-items', 'flex-end');
  await expect(comp).toHaveCSS('justify-content', 'flex-end');
  await combo('Espacement').selectOption('auto');
  await expect(comp).toHaveCSS('justify-content', 'space-between');

  // Dimensions : expression, flèches (Maj = ×10), min et max.
  await combo('Largeur').selectOption('fixed');
  await field('Largeur fixe').fill('16*15');
  await field('Largeur fixe').press('Enter');
  await expect(comp).toHaveCSS('width', '240px');
  await combo('Hauteur').selectOption('fixed');
  await field('Hauteur fixe').fill('130');
  await field('Hauteur fixe').press('Shift+ArrowUp');
  await expect(comp).toHaveCSS('height', '140px');
  await field('Largeur min').fill('200');
  await field('Largeur max').fill('320');
  await field('Hauteur min').fill('60');
  await field('Hauteur max').fill('400');
  await expect(comp).toHaveCSS('min-width', '200px');
  await expect(comp).toHaveCSS('max-height', '400px');

  // Typographie (héritée par le libellé).
  await combo('Police').selectOption('Georgia');
  await combo('Taille du texte').selectOption('font.heading');
  await combo('Graisse').selectOption('800');
  await combo('Interlignage').selectOption('ratio');
  await field('Interlignage : valeur').fill('1.2');
  await expect(comp).toHaveCSS('font-family', 'Georgia');
  await expect(comp).toHaveCSS('font-size', '28px');
  await expect(comp).toHaveCSS('font-weight', '800');
  await expect(comp).toHaveCSS('line-height', /33\.6px/);

  // Effets empilés.
  await page.getByRole('button', { name: 'Ajouter un effet' }).click();
  await field('Effet 1 : y').fill('6');
  await expect(comp).toHaveCSS('box-shadow', /0px 6px 12px/);
  await page.getByRole('button', { name: 'Ajouter un effet' }).click();
  await combo('Effet 2 : type').selectOption('layer-blur');
  await field('Effet 2 : rayon').fill('1');
  await expect(comp).toHaveCSS('filter', 'blur(1px)');
  await page.getByRole('button', { name: 'Effet 2 : supprimer' }).click();

  // Calque : opacité.
  await field('Opacité').fill('50');
  await expect(comp).toHaveCSS('opacity', '0.5');
  await field('Opacité').fill('100');

  // État « Survol » : réglage à part, montré sur le canevas.
  await combo('État').selectOption('hover');
  await expect(comp).toHaveAttribute('data-ds-preview', 'hover');
  await combo('Fond 1').selectOption('color.danger');
  await expect(comp).toHaveCSS('background-color', 'rgb(180, 35, 62)');
  await combo('État').selectOption('base');
  await expect(comp).not.toHaveAttribute('data-ds-preview', /.*/);
  await expect(comp).toHaveCSS('background-color', rgb(brand));

  // Le fond reste lié au token : une validation de color.brand le met à jour.
  await page.getByRole('button', { name: 'Désélectionner' }).click();
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#8A3B20');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(comp).toHaveCSS('background-color', 'rgb(138, 59, 32)');

  // Écrit dans le document (gestes regroupés), relu après rechargement.
  type Node = {
    type: string;
    name: string;
    props: {
      size?: { maxHeight?: number };
      fills?: { color: unknown }[];
      layout?: { gap?: unknown; padding?: { left: unknown } };
    };
    states?: { hover?: { fills?: { color: unknown }[] } };
  };
  const mine = async () =>
    Object.values(
      (
        (await (await page.request.get('/api/doc')).json()) as {
          nodes: Record<string, Node>;
        }
      ).nodes,
    ).find((n) => n.type === 'component' && n.name === 'Bouton test');
  await expect
    .poll(async () => (await mine())?.props.size?.maxHeight)
    .toBe(400);
  expect(await mine()).toMatchObject({
    props: {
      fills: [{ color: { token: 'color.brand' } }],
      layout: { gap: 'auto', padding: { left: { px: 40 } } },
    },
    states: { hover: { fills: [{ color: { token: 'color.danger' } }] } },
  });
  await page.reload();
  await expect(page.locator('.stage-catalogue .ds-custom').first()).toHaveCSS(
    'height',
    '140px',
  );
  await page.screenshot({ path: 'test-results/composant-manuel.png' });
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
  // Le composant rejoint « Mes composants » et s'ouvre dans l'inspecteur.
  await expect(
    page.getByRole('region', { name: /bouton-envoyer/ }),
  ).toContainText('Composant maître');
  await expect(
    page.getByRole('combobox', { name: 'Fond 1', exact: true }),
  ).toHaveValue('color.brand');
  await page
    .getByRole('combobox', { name: 'Fond 1', exact: true })
    .selectOption('color.danger');
  await page
    .getByRole('combobox', { name: 'Couleur du texte', exact: true })
    .selectOption('color.text');
  const view = page.locator('.stage-catalogue [data-ds-name="bouton-envoyer"]');
  await expect(view).toHaveCSS('background-color', 'rgb(180, 35, 62)');
  await expect(view.locator('svg path')).toHaveCSS('stroke', 'rgb(25, 36, 61)');
  // Retour aux réglages (import d'image) : on ferme la sélection.
  await page.getByRole('button', { name: 'Désélectionner' }).click();

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
  await expect(page.getByLabel('Nom du calque', { exact: true })).toHaveValue(
    'Bouton capturé',
  );
  // Écrit dans le document : vecteur validé, fond lié au token.
  type Node = {
    id: string;
    type: string;
    name: string;
    children: string[];
    vector?: { nodes: { tag: string }[] };
    props: {
      fills?: { color: unknown }[];
      layout?: { padding?: { left: unknown } };
    };
  };
  const nodes = async () =>
    (
      (await (await page.request.get('/api/doc')).json()) as {
        nodes: Record<string, Node>;
      }
    ).nodes;
  const named = async (name: string) =>
    Object.values(await nodes()).find(
      (n) => n.type === 'component' && n.name === name,
    );
  await expect
    .poll(async () => (await named('bouton-envoyer'))?.props.fills?.[0]?.color)
    .toEqual({ token: 'color.danger', opacity: 1 });
  const all = await nodes();
  const svg = (await named('bouton-envoyer'))!;
  const shot = (await named('Bouton capturé'))!;
  const vector = svg.children
    .map((c) => all[c])
    .find((n) => n.type === 'vector');
  expect(vector?.vector?.nodes[0].tag).toBe('path');
  expect(shot.props.fills?.[0]?.color).toEqual({
    token: 'color.brand',
    opacity: 1,
  });
  expect(shot.props.layout?.padding?.left).toEqual({ token: 'space.md' });
  const count = Object.values(all).filter((n) => n.type === 'component').length;

  // Réponse de Claude hors format : message clair, rien de créé.
  await page.getByRole('button', { name: 'Désélectionner' }).click();
  await picker.setInputFiles({
    name: 'capture.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'),
  });
  await expect(alert).toContainText('Réponse de Claude invalide');
  expect(
    Object.values(await nodes()).filter((n) => n.type === 'component'),
  ).toHaveLength(count);
});

// Plugin Figma simulé : même protocole que figma-plugin (ui.html + code.js).
async function figmaPlugin(fileName: string) {
  const nodes = new Map<string, Record<string, unknown>>([
    [
      '1:5',
      {
        id: '1:5',
        type: 'TEXT',
        name: 'Titre',
        width: 120,
        height: 24,
        characters: 'Bonjour',
      },
    ],
  ]);
  let next = 100;
  const commands: Record<string, (p: Record<string, unknown>) => unknown> = {
    ping: () => ({ pong: true }),
    get_document_info: () => ({
      name: fileName,
      currentPage: { id: '0:1', name: 'Composants' },
      pages: [{ id: '0:1', name: 'Composants' }],
    }),
    get_selection: () => [nodes.get('1:5')],
    get_node: ({ id }) => {
      const n = nodes.get(String(id));
      if (!n) throw new Error(`Nœud introuvable : ${id}.`);
      return n;
    },
    create_frame: (p) => {
      const n = { id: `1:${++next}`, type: 'FRAME', ...p };
      nodes.set(n.id, n);
      return n;
    },
    set_text: ({ id, text }) => {
      const n = nodes.get(String(id));
      if (n?.type !== 'TEXT') throw new Error('Ce nœud n’est pas un texte.');
      n.characters = text;
      return n;
    },
    delete_node: ({ id }) => {
      nodes.delete(String(id));
      return { deleted: id };
    },
  };
  // Export : lots réassemblés, avancement publié, annulation respectée.
  const parts: string[] = [];
  const cancelled = new Set<string>();
  const exports: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  let slow = 0;
  const exportCommand = async (id: string, kind: string) => {
    const payload = JSON.parse(parts.join(''));
    parts.length = 0;
    exports.push(payload);
    const total = 4;
    for (let done = 1; done <= total; done++) {
      await new Promise((r) => setTimeout(r, slow));
      if (cancelled.has(id)) throw new Error('Export annulé.');
      ws.send(
        JSON.stringify({
          id,
          progress: { done, total, label: `${kind} ${done}` },
        }),
      );
    }
    return {
      pageId: '0:9',
      pageName: payload.page.mode === 'new' ? payload.page.name : 'Composants',
      created: exports.length === 1 ? 12 : 0,
      createdIds: [],
      updated: exports.length === 1 ? 0 : 12,
      warnings: ['Police « system-ui » absente dans Figma : Inter utilisée.'],
      orphans: [],
    };
  };
  const ws = new WebSocket('ws://127.0.0.1:3056');
  ws.onmessage = async (event) => {
    const { id, command, params } = JSON.parse(String(event.data));
    try {
      let result: unknown;
      if (command === 'export_chunk') parts[params.index] = params.data;
      else if (command === 'cancel') cancelled.add(params.target);
      else if (
        command === 'export_design_system' ||
        command === 'export_preview'
      )
        result = await exportCommand(id, command);
      else result = commands[command](params);
      ws.send(JSON.stringify({ id, ok: true, result: result ?? {} }));
    } catch (e) {
      ws.send(JSON.stringify({ id, ok: false, error: (e as Error).message }));
    }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  return Object.assign(ws, {
    exports,
    setSlow: (ms: number) => (slow = ms),
  });
}

test('pont Figma : état, chaque commande depuis le panneau de test, reconnexion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const indicator = page
    .getByRole('banner')
    .getByRole('button', { name: /Figma :/ });
  await expect(indicator).toContainText('Figma : en attente du plugin');
  await indicator.click();
  const panel = page.getByRole('dialog', { name: 'Pont Figma' });
  await expect(panel).toContainText('En attente du plugin');
  await expect(panel.getByRole('button', { name: 'ping' })).toBeDisabled();

  const plugin = await figmaPlugin('Nosh');
  await expect(indicator).toContainText('Figma : connecté · Nosh');
  const result = panel.locator('.figma-result');
  const run = async (name: string) => {
    await panel.getByRole('button', { name, exact: true }).click();
    await expect(result.getByRole('status')).toContainText(`${name} ·`);
    return result.locator('pre');
  };
  await expect(await run('ping')).toContainText('"pong": true');
  await expect(await run('get_document_info')).toContainText('"name": "Nosh"');
  await expect(await run('get_selection')).toContainText('"id": "1:5"');
  // L'id du nœud sélectionné alimente les commandes suivantes.
  const nodeId = panel.getByLabel('ID du nœud');
  await expect(nodeId).toHaveValue('1:5');
  await panel.getByLabel('Nouveau texte').fill('Bonsoir');
  await expect(await run('set_text')).toContainText('"characters": "Bonsoir"');
  await expect(await run('get_node')).toContainText('"characters": "Bonsoir"');

  await panel.getByLabel('Nom de la frame').fill('Carte test');
  await expect(await run('create_frame')).toContainText('"name": "Carte test"');
  const frameId = await nodeId.inputValue();
  expect(frameId).toMatch(/^1:1\d\d$/);
  await expect(await run('delete_node')).toContainText(
    `"deleted": "${frameId}"`,
  );
  // Erreur du plugin : affichée telle quelle.
  await run('get_node');
  await expect(result.getByRole('status')).toContainText('get_node · erreur');
  await expect(result.locator('pre')).toContainText('Figma : Nœud introuvable');

  // Plugin fermé puis relancé : l'app suit sans rechargement.
  plugin.close();
  await expect(indicator).toContainText('Figma : en attente du plugin');
  const again = await figmaPlugin('Nosh v2');
  await expect(indicator).toContainText('Figma : connecté · Nosh v2');
  await expect(await run('ping')).toContainText('"pong": true');
  again.close();
});

test('exporter vers Figma : pont absent, page cible, progression, DS puis aperçu, annulation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const header = page.getByRole('banner');
  const menu = page.getByRole('dialog', { name: 'Exporter vers Figma' });
  await header.getByRole('button', { name: 'Exporter' }).click();
  await expect(menu).toContainText(
    'Lance le plugin DS-Studio dans Figma desktop.',
  );
  await expect(menu.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await expect(menu.getByRole('combobox')).toHaveCount(0);

  const plugin = await figmaPlugin('Nosh');
  await expect(menu).toContainText('Fichier Figma : Nosh');
  const ds = menu.getByRole('button', { name: 'Design system', exact: true });
  await expect(ds).toHaveAttribute('aria-pressed', 'true');
  const target = menu.getByRole('combobox', { name: 'Page cible' });
  await expect(target.locator('option')).toHaveCount(2); // courante + nouvelle
  await target.selectOption('new');
  await expect(menu.getByLabel('Nom de la nouvelle page')).toHaveValue(
    'DS-Studio – Design system',
  );
  plugin.setSlow(150);
  await menu.getByRole('button', { name: 'Exporter design system' }).click();
  const bar = menu.getByRole('progressbar', { name: 'Avancement de l’export' });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow', /^(25|50|75)$/);
  const toast = page
    .getByRole('status')
    .filter({ hasText: 'Export Design system' });
  await expect(toast).toContainText(
    '« DS-Studio – Design system » : 12 créé(s), 0 mis à jour',
  );
  await expect(toast).toContainText('Police « system-ui » absente');
  await expect(menu).toBeHidden();

  // Payload réellement produit par l'app à partir du rendu.
  const ds1 = plugin.exports[0];
  expect(ds1.kind).toBe('design_system');
  expect(ds1.page).toEqual({ mode: 'new', name: 'DS-Studio – Design system' });
  expect(ds1.variables).toHaveLength(18);
  expect(
    ds1.variables.find((v: { token: string }) => v.token === 'color.brand'),
  ).toMatchObject({ name: 'color/brand', type: 'COLOR' });
  const ids = ds1.components.map((c: { id: string }) => c.id);
  expect(ids).toEqual(
    expect.arrayContaining([
      'button/primary',
      'button/secondary',
      'button/danger',
      'button/primary-disabled',
      'booking-card',
      'form',
      'navigation',
    ]),
  );
  const primary = ds1.components.find(
    (c: { id: string }) => c.id === 'button/primary',
  );
  // Format v2 : lu dans le document ; l'état survol devient une variante.
  expect(ds1.version).toBe(2);
  expect(primary).toMatchObject({
    set: 'Button',
    variant: 'Variante=Principal, État=Défaut, Interaction=Défaut',
    properties: [{ name: 'Texte', type: 'TEXT' }],
  });
  expect(ids).toContain('button/primary::hover');
  expect(primary.root.fills[0]).toMatchObject({
    type: 'SOLID',
    variable: 'color.brand',
  });
  expect(primary.root.children[0].refs).toEqual({ characters: 'Texte' });
  expect(primary.root.layout.direction).toBe('HORIZONTAL');
  expect(primary.root.radiusVariables[0]).toBe('radius.control');
  expect(primary.root.sizingH).toBe('HUG');
  const card = ds1.components.find(
    (c: { id: string }) => c.id === 'booking-card',
  );
  expect(JSON.stringify(card.root)).toContain('"instanceOf":"button/primary"');
  const styles = ds1.textStyles.map((t: { name: string }) => t.name);
  // Tailles arrondies : pas de « 19.200001 » qui changerait l'id d'un export à l'autre.
  for (const name of styles) expect(name).not.toMatch(/\.\d{3,}/);
  expect(styles).toEqual(
    expect.arrayContaining([expect.stringMatching(/^DS-Studio\/Corps/)]),
  );
  expect(
    ds1.textStyles.find((t: { name: string }) =>
      t.name.startsWith('DS-Studio/Corps'),
    ).fontSizeVariable,
  ).toBe('font.body');

  // Aperçu depuis la barre d'aperçu : choix pré-sélectionné, page courante.
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await page
    .locator('.stage-bar')
    .getByRole('button', { name: 'Exporter' })
    .click();
  await expect(
    menu.getByRole('button', { name: 'Aperçu actuel', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  plugin.setSlow(0);
  await menu.getByRole('button', { name: 'Exporter aperçu actuel' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Export Aperçu actuel' }),
  ).toContainText('0 créé(s), 12 mis à jour');
  const preview = plugin.exports[1];
  expect(preview.kind).toBe('preview');
  expect(preview.page).toEqual({ mode: 'current' });
  expect(preview.screen.id).toBe('screen/cards/375');
  expect(JSON.stringify(preview.screen.root)).toContain(
    '"instanceOf":"booking-card"',
  );
  expect(preview.components.map((c: { id: string }) => c.id)).toContain(
    'booking-card',
  );

  // Annulation : le plugin est prévenu, l'app l'indique.
  await page
    .locator('.stage-bar')
    .getByRole('button', { name: 'Exporter' })
    .click();
  plugin.setSlow(400);
  await menu.getByRole('button', { name: 'Exporter aperçu actuel' }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '25');
  await menu.getByRole('button', { name: 'Annuler' }).click();
  await expect(menu.getByRole('alert')).toContainText('Export annulé');
  plugin.close();
});

// Centre d'un élément de l'aperçu en coordonnées de page (iframe mise à l'échelle).
async function previewPointOnce(
  page: import('@playwright/test').Page,
  selector: string,
) {
  return page.locator('iframe').evaluate((f: HTMLIFrameElement, sel) => {
    const el = f.contentDocument!.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const s = fr.width / f.offsetWidth;
    return {
      x: fr.left + (r.left + r.width / 2) * s,
      y: fr.top + (r.top + r.height / 2) * s,
    };
  }, selector);
}
// Mesure stable : l'iframe peut encore grandir (et la scène se remettre à
// l'échelle) juste après le premier rendu.
async function previewPoint(page: Page, selector: string) {
  let last = await previewPointOnce(page, selector);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await previewPointOnce(page, selector);
    if (next.x === last.x && next.y === last.y) return next;
    last = next;
  }
  return last;
}
test('mode Édition : sélection, override d’instance, texte, maître, annulation, mode Test', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Token dans la vue DS : écrit directement, propagé au catalogue.
  // L'overlay capte le pointeur : on clique à la position de l'élément.
  const box = await page
    .locator('[data-ds-token="color.success"]')
    .boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + 10);
  await expect(page.getByTestId('prompt-chip')).toContainText('color.success');
  await page.getByLabel('Valeur hex du token').fill('#226644');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/state')).json()).tokens[
          'color.success'
        ].$value,
    )
    .toBe('#226644');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('edit-selection')).toBeHidden();

  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const frame = page.frameLocator('iframe');
  const cta = '[data-ds-inst="cards.rhythm.cta"]';
  await expect(frame.locator(cta)).toBeVisible();
  let p = await previewPoint(page, cta);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByRole('region', { name: /Button · Secondaire/ });
  await expect(panel).toContainText('Instance');
  // Le clic en mode Édition ne déclenche pas la navigation du bouton.
  await expect(frame.locator('.scenario')).toHaveAttribute(
    'data-screen',
    'cards',
  );
  await panel
    .getByRole('combobox', { name: 'Fond 1', exact: true })
    .selectOption('color.danger');
  await expect(panel).toContainText('1 override');
  const bg = (sel: string) =>
    frame.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(() => bg(cta)).toBe('rgb(180, 35, 62)');
  const doc = async () =>
    (await (await page.request.get('/api/doc')).json()) as {
      nodes: Record<
        string,
        {
          props: { fills?: { color: unknown }[] };
          overrides?: Record<string, { characters?: string }>;
          componentProps?: { Texte?: { default: string } };
        }
      >;
    };
  const fillOf = async (id: string) =>
    (await doc()).nodes[id].props.fills?.[0]?.color;
  const danger = { token: 'color.danger', opacity: 1 };
  await expect.poll(() => fillOf('cards.rhythm.cta')).toEqual(danger);
  // Le maître n'a pas changé : le bouton secondaire reste blanc.
  expect(await fillOf('button/secondary')).toEqual({
    token: 'color.surface',
    opacity: 1,
  });

  // Double-clic : édition du texte dans l'overlay.
  p = await previewPoint(page, cta);
  await page.mouse.dblclick(p.x, p.y);
  const text = page.getByLabel(/Texte de Button/);
  await text.fill('Je m’inscris');
  await text.press('Enter');
  await expect(frame.locator(cta)).toHaveText('Je m’inscris');

  // « Appliquer au composant » : style ET texte passent sur le maître.
  await panel.getByRole('button', { name: 'Appliquer au composant' }).click();
  await expect.poll(() => fillOf('button/secondary')).toEqual(danger);
  const after = await doc();
  expect(after.nodes['button/secondary'].componentProps?.Texte?.default).toBe(
    'Je m’inscris',
  );
  expect(after.nodes['cards.rhythm.cta'].overrides).toBeUndefined();
  await expect(frame.locator(cta)).toHaveText('Je m’inscris');

  // Annulation geste par geste : maître, texte puis couleur. La pile
  // survit au rechargement.
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => fillOf('button/secondary'))
    .toEqual({ token: 'color.surface', opacity: 1 });
  await expect
    .poll(async () => (await page.request.get('/api/history')).json())
    .toMatchObject({ undone: [expect.anything()] });
  await page.reload();
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await expect(frame.locator(cta)).toBeVisible();
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(
      async () =>
        (await doc()).nodes['cards.rhythm.cta'].overrides?.[
          'button/secondary/label'
        ]?.characters,
    )
    .toBeUndefined();
  await expect.poll(() => fillOf('cards.rhythm.cta')).toEqual(danger);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => fillOf('cards.rhythm.cta')).toBeUndefined();
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/state')).json()).tokens[
          'color.success'
        ].$value,
    )
    .not.toBe('#226644');
  // Le survol du bouton reste actif (états distincts de la base).
  await page.keyboard.press('p');
  await frame
    .locator('[data-ds-inst="cards.booking>booking-card/cta"]')
    .hover();
  await expect
    .poll(() => bg('[data-ds-inst="cards.booking>booking-card/cta"]'))
    .toBe('rgb(36, 63, 153)');
  await page.keyboard.press('e');

  // Mode Test : navigation, saisie, puis retour à l'état initial en Édition.
  await page.keyboard.press('p');
  await expect(page.getByTestId('edit-overlay')).toHaveCount(0);
  await frame.getByRole('button', { name: 'Voir les ateliers' }).click();
  await expect(frame.locator('.scenario')).toHaveAttribute(
    'data-screen',
    'form',
  );
  await frame.getByLabel('Votre prénom').fill('Camille');
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('e');
  await expect(page.getByTestId('edit-overlay')).toBeVisible();
  await expect(frame.locator('.scenario')).toHaveAttribute(
    'data-screen',
    'cards',
  );
  await expect(frame.getByLabel('Votre prénom')).toHaveCount(0);
});

test('inspecteur sur une instance : variante, override par propriété, texte interne, lien, image', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const frame = page.frameLocator('iframe');
  const combo = (name: string) =>
    page.getByRole('combobox', { name, exact: true });
  const bg = (sel: string) =>
    frame.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
  const cta = '[data-ds-inst="cards.rhythm.cta"]';
  await expect(frame.locator(cta)).toBeVisible();
  let p = await previewPoint(page, cta);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByRole('region', { name: /Button · Secondaire/ });
  await expect(panel).toContainText('Instance');

  // Variante : propriété de l'instance, pas un override.
  await combo('Variante').selectOption('Danger');
  await expect.poll(() => bg(cta)).toBe('rgb(180, 35, 62)');
  await expect(page.getByRole('region', { name: /Button/ })).toContainText(
    'Identique au composant',
  );
  // Override d'une propriété, puis retour à la valeur du composant.
  await combo('Fond 1').selectOption('color.success');
  await expect(page.getByRole('region', { name: /Button/ })).toContainText(
    '1 override',
  );
  await page.getByRole('button', { name: 'Réinitialiser Fond' }).click();
  await expect.poll(() => bg(cta)).toBe('rgb(180, 35, 62)');
  // Interaction : nouvelle cible de navigation.
  await combo('Cible de navigation').selectOption('screen.cards');
  const doc = async () =>
    (await (await page.request.get('/api/doc')).json()) as {
      nodes: Record<
        string,
        {
          interactions?: { action: { screen?: string } }[];
          overrides?: Record<string, { characters?: string }>;
          props: { fills?: { type: string; asset?: string }[] };
        }
      >;
    };
  await expect
    .poll(
      async () =>
        (await doc()).nodes['cards.rhythm.cta'].interactions?.[0]?.action
          .screen,
    )
    .toBe('screen.cards');

  // Cmd+clic : calque le plus profond (titre dans l'instance de carte).
  const title = '[data-ds-node="cards.booking>booking-card/title"]';
  p = await previewPoint(page, title);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('ControlOrMeta');
  await expect(
    page.getByRole('region', { name: /Carte réservation · Non › Titre/ }),
  ).toBeVisible();
  await page.getByLabel('Contenu du texte').fill('Titre local');
  await expect(frame.locator(title)).toHaveText('Titre local');
  await combo('Taille du texte').selectOption('px');
  await page.getByLabel('Taille du texte : valeur', { exact: true }).fill('30');
  await expect(frame.locator(title)).toHaveCSS('font-size', '30px');
  await expect
    .poll(
      async () =>
        (await doc()).nodes['cards.booking'].overrides?.['booking-card/title']
          ?.characters,
    )
    .toBe('Titre local');
  // Le maître n'est pas touché.
  await page.getByRole('button', { name: 'Réinitialiser Texte' }).click();
  await expect(frame.locator(title)).toHaveText('Faire moins, mais mieux.');

  // Fond image sur un calque d'écran : fichier vérifié par le serveur.
  const card = '[data-ds-node="cards.rhythm"]';
  const box = await page
    .locator('iframe')
    .evaluate((f: HTMLIFrameElement, sel) => {
      const r = f.contentDocument!.querySelector(sel)!.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const s = fr.width / f.offsetWidth;
      return { x: fr.left + (r.left + 6) * s, y: fr.top + (r.top + 6) * s };
    }, card);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(box.x, box.y);
  await page.keyboard.up('ControlOrMeta');
  await expect(
    page.getByRole('region', { name: /Carte rythme/ }),
  ).toContainText('Calque');
  await page.getByLabel('Fond 1 : fichier image').setInputFiles({
    name: 'motif.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });
  await expect(frame.locator(card)).toHaveCSS(
    'background-image',
    /\/api\/assets\/[0-9a-f]{32}\.png/,
  );
  await expect
    .poll(
      async () => (await doc()).nodes['cards.rhythm'].props.fills?.[0]?.type,
    )
    .toBe('image');
});

test('calques et structure : arbre synchronisé, insertion, raccourcis, composant, écrans', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const frame = page.frameLocator('iframe');
  const layers = page.getByRole('complementary', { name: 'Calques' });
  const row = (key: string) => layers.locator(`[data-key="${key}"]`);
  type Doc = {
    screens: string[];
    nodes: Record<
      string,
      {
        type: string;
        name: string;
        parent: string | null;
        children: string[];
        componentId?: string;
      }
    >;
  };
  const doc = async () =>
    (await (await page.request.get('/api/doc')).json()) as Doc;

  // Sélection du canevas reflétée dans l'arbre.
  const cta = '[data-ds-inst="cards.rhythm.cta"]';
  await expect(frame.locator(cta)).toBeVisible();
  const p = await previewPoint(page, cta);
  await page.mouse.click(p.x, p.y);
  await expect(row('cards.rhythm.cta')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Arbre → canevas, puis insertion d'un texte (T) juste après.
  await row('cards.title').click();
  await expect(page.getByRole('region', { name: /Titre/ })).toBeVisible();
  await page.keyboard.press('t');
  await expect(frame.getByText('Texte', { exact: true })).toHaveCount(1);
  const main = async () => (await doc()).nodes['cards.main'].children;
  await expect.poll(async () => (await main()).length).toBe(5);
  const textId = (await main())[2];
  await expect(row(textId)).toHaveAttribute('aria-selected', 'true');
  // Cmd+D : duplique ; Suppr : supprime.
  await page.keyboard.press('ControlOrMeta+d');
  await expect(frame.getByText('Texte', { exact: true })).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(frame.getByText('Texte', { exact: true })).toHaveCount(1);
  // Renommer (double-clic), masquer, annuler.
  await row(textId).dblclick();
  await layers.getByLabel('Renommer Texte').fill('Note');
  await layers.getByLabel('Renommer Texte').press('Enter');
  await expect(row(textId)).toContainText('Note');
  await row(textId).hover();
  await layers.getByRole('button', { name: 'Masquer Note' }).click();
  await expect(frame.getByText('Texte', { exact: true })).toBeHidden();
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(frame.getByText('Texte', { exact: true })).toBeVisible();

  // Glisser-déposer : l'introduction passe en tête du contenu.
  await row('cards.intro').dragTo(row('cards.kicker'), {
    targetPosition: { x: 40, y: 2 },
  });
  await expect.poll(async () => (await main())[0]).toBe('cards.intro');

  // Cmd+Alt+K : la carte devient un composant, une instance prend sa place.
  await row('cards.rhythm').click();
  await page.keyboard.press('ControlOrMeta+Alt+KeyK');
  await expect
    .poll(async () => {
      const d = await doc();
      const id = d.nodes['cards.grid'].children[1];
      return (
        d.nodes[id].type === 'instance' &&
        d.nodes[d.nodes[id].componentId!].parent === 'catalogue.custom'
      );
    })
    .toBe(true);
  await expect(frame.getByText('Un quartier qui inspire.')).toBeVisible();
  await expect(
    page.getByRole('region', { name: /Carte rythme/ }),
  ).toContainText('Instance');
  // Nouvelle variante : un component set se forme.
  await layers.getByRole('button', { name: 'Ajouter une variante' }).click();
  await expect
    .poll(async () =>
      Object.values((await doc()).nodes).some(
        (n) => n.type === 'component-set' && n.name === 'Carte rythme',
      ),
    )
    .toBe(true);

  // Écrans : créer, y insérer un cadre (F), supprimer.
  await layers.getByRole('button', { name: 'Nouvel écran' }).click();
  await expect(frame.locator('.scenario')).toHaveAttribute(
    'data-screen',
    'ecran-3',
  );
  await expect(
    page.getByRole('combobox', { name: 'Scénario', exact: true }),
  ).toHaveValue('ecran-3');
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('f');
  await expect
    .poll(async () => (await doc()).nodes['screen.ecran-3'].children.length)
    .toBe(1);
  await layers
    .getByRole('button', { name: 'Supprimer l’écran Écran 3' })
    .click();
  await expect
    .poll(async () => (await doc()).screens)
    .toEqual(['screen.cards', 'screen.form']);
  await expect(frame.locator('.scenario')).toHaveAttribute(
    'data-screen',
    'cards',
  );
});
test('canevas : multi-sélection « Mixte », rectangle, poignées, déplacement, réordonner, repères', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Les tests partagent le serveur : on repart du document de départ.
  const current = await (await page.request.get('/api/doc')).json();
  const seed = seedDoc();
  const ids = new Set([
    ...Object.keys(current.nodes),
    ...Object.keys(seed.nodes),
  ]);
  const ops = [...ids]
    .map((id) => ({
      id,
      before: current.nodes[id] ?? null,
      after: seed.nodes[id] ?? null,
    }))
    .filter((op) => JSON.stringify(op.before) !== JSON.stringify(op.after));
  await page.goto('/');
  const boot = await (await page.request.get('/api/bootstrap')).json();
  const reset = await page.request.post('/api/doc/ops', {
    headers: { 'x-ds-studio': boot.csrf },
    data: { ops, screens: { before: current.screens, after: seed.screens } },
  });
  expect(reset.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const frame = page.frameLocator('iframe');
  const layers = page.getByRole('complementary', { name: 'Calques' });
  const row = (key: string) => layers.locator(`[data-key="${key}"]`);
  type Node = {
    children: string[];
    props: {
      layer?: { opacity?: number };
      size?: { width?: { mode: string; px?: number } };
      position?: { mode?: string; x?: number; y?: number };
    };
  };
  const nodes = async () =>
    (
      (await (await page.request.get('/api/doc')).json()) as {
        nodes: Record<string, Node>;
      }
    ).nodes;
  const node = (sel: string) => frame.locator(`[data-ds-node="${sel}"]`);
  await expect(node('cards.title')).toBeVisible();

  // Maj+clic : deux calques, valeurs communes, écriture sur les deux.
  await row('cards.title').click();
  const intro = await previewPoint(page, '[data-ds-node="cards.intro"]');
  await page.keyboard.down('Shift');
  await page.mouse.click(intro.x, intro.y);
  await page.keyboard.up('Shift');
  const multi = page.getByRole('region', { name: /2 calques/ });
  await expect(multi).toBeVisible();
  await expect(page.getByTestId('edit-selection-extra')).toHaveCount(1);
  await expect(row('cards.intro')).toHaveAttribute('aria-selected', 'true');
  await expect(multi.getByLabel('Opacité', { exact: true })).toHaveValue('100');
  // Largeurs différentes ou identiques : la valeur « Mixte » vient du rendu.
  await multi.getByLabel('Opacité', { exact: true }).fill('50');
  await expect
    .poll(async () => {
      const n = await nodes();
      return [
        n['cards.title'].props.layer?.opacity,
        n['cards.intro'].props.layer?.opacity,
      ];
    })
    .toEqual([0.5, 0.5]);
  // Valeur mixte : la taille du texte diffère entre titre et introduction.
  await expect(
    multi.getByLabel('Taille du texte', { exact: true }),
  ).toHaveValue('');
  await expect(
    multi
      .getByLabel('Taille du texte', { exact: true })
      .locator('option:checked'),
  ).toHaveText('Mixte');
  // Un seul geste : Cmd+Z annule les deux.
  await page.locator('.stage-bar').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => (await nodes())['cards.title'].props.layer?.opacity)
    .toBe(undefined);
  await expect(page.getByRole('region', { name: /2 calques/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('edit-selection-extra')).toHaveCount(0);

  // Rectangle de sélection : les deux cartes de la grille.
  await row('cards.rhythm').click();
  const booking = await previewPoint(page, '[data-ds-node="cards.booking"]');
  const rhythm = await previewPoint(page, '[data-ds-node="cards.rhythm"]');
  await page.mouse.move(booking.x, booking.y);
  await page.mouse.down();
  await page.mouse.move(booking.x + 20, booking.y + 10, { steps: 3 });
  await expect(page.getByTestId('edit-marquee')).toBeVisible();
  await page.mouse.move(rhythm.x, rhythm.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('region', { name: /2 calques/ })).toBeVisible();
  await expect(row('cards.booking')).toHaveAttribute('aria-selected', 'true');
  await expect(row('cards.rhythm')).toHaveAttribute('aria-selected', 'true');

  // Poignée droite : la carte passe en largeur fixe ; Cmd+Z la rend.
  await row('cards.rhythm').click();
  const handle = page.locator('.edit-handle[data-handle="e"]');
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + 4, h.y + 4);
  await page.mouse.down();
  await page.mouse.move(h.x - 30, h.y + 4, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await nodes())['cards.rhythm'].props.size?.width?.mode)
    .toBe('fixed');
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => (await nodes())['cards.rhythm'].props.size?.width?.mode)
    .toBe('fill');

  // Réordonner dans l'auto-layout : la carte passe avant la réservation.
  const left = await frame
    .locator('[data-ds-node="cards.booking"]')
    .evaluate((el) => el.getBoundingClientRect().left);
  const r0 = await previewPoint(page, '[data-ds-node="cards.rhythm"]');
  const b0 = await previewPoint(page, '[data-ds-node="cards.booking"]');
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  await page.mouse.move(r0.x - 10, r0.y, { steps: 3 });
  await page.mouse.move(b0.x - (b0.x - left) * 0.9, b0.y, { steps: 8 });
  await expect(page.getByTestId('edit-insert')).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(async () => (await nodes())['cards.grid'].children)
    .toEqual(['cards.rhythm', 'cards.booking']);

  // Repères Alt : distance entre le titre et l'introduction.
  await row('cards.title').click();
  const i1 = await previewPoint(page, '[data-ds-node="cards.intro"]');
  await page.mouse.move(i1.x, i1.y);
  await page.keyboard.down('Alt');
  await page.mouse.move(i1.x + 2, i1.y);
  await expect(page.getByTestId('edit-guide').first()).toBeVisible();
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('edit-guide')).toHaveCount(0);
  // Repères d'espacement : survol du contenu (auto-layout vertical).
  await row('cards.main').click();
  await page.mouse.move(i1.x, i1.y);
  await expect(page.getByTestId('edit-band').first()).toBeVisible();

  // Calque absolu : glisser le déplace, les flèches l'ajustent.
  await row('cards.title').click();
  await page.keyboard.press('r');
  await expect
    .poll(async () => (await nodes())['cards.main'].children.length)
    .toBe(5);
  const rect = (await nodes())['cards.main'].children[2];
  await page.getByLabel('Position absolue (hors auto-layout)').check();
  await expect
    .poll(async () => (await nodes())[rect].props.position?.mode)
    .toBe('absolute');
  const c = await previewPoint(page, `[data-ds-node="${rect}"]`);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await nodes())[rect].props.position?.x ?? 0)
    .toBeGreaterThan(10);
  const x = (await nodes())[rect].props.position!.x!;
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => (await nodes())[rect].props.position?.x)
    .toBe(x + 10);
});

test('versions : onglet périmé invité à recharger, serveur périmé signalé', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.stage-body')).toBeVisible();
  // Rien à signaler sur une version à jour.
  await expect(page.locator('.version-banner')).toHaveCount(0);
  // Bundle plus récent publié pendant que l'onglet est ouvert.
  await page.route('**/api/version', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        client: 'assets/index-plus-recent.js',
        serverStale: false,
        exportVersion: 2,
      }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const banner = page.locator('.version-banner');
  await expect(banner).toContainText('rechargez la page');
  await expect(banner.getByRole('button', { name: 'Recharger' })).toBeVisible();
  // Serveur antérieur à ce contrôle (route absente) : à relancer.
  await page.unroute('**/api/version');
  await page.route('**/api/version', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(banner).toContainText('version antérieure du code');
  // Recharger (version à jour) : le bandeau disparaît.
  await page.unroute('**/api/version');
  await page.reload();
  await expect(page.locator('.stage-body')).toBeVisible();
  await expect(page.locator('.version-banner')).toHaveCount(0);
});

test('inspecteur : paquets essentiels dépliés, détails repliés et retenus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau composant' }).click();
  const section = (t: string) =>
    page.locator('details.ins-section', {
      has: page.getByRole('heading', { name: new RegExp(`^${t}`) }),
    });
  const summary = (t: string) => section(t).locator('summary');
  for (const t of ['Composant', 'Mise en page', 'Dimensions'])
    await expect(section(t)).toHaveAttribute('open', '');
  for (const t of ['Position', 'Apparence', 'Fond', 'Effets', 'Avancé'])
    await expect(section(t)).not.toHaveAttribute('open', '');
  await summary('Fond').click();
  await expect(
    page.getByRole('combobox', { name: 'Fond 1', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Nouveau composant' }).click();
  await expect(section('Fond')).toHaveAttribute('open', '');
});
