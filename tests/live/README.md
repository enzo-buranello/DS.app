# Tests réels

Ces tests lancent l'app Electron et appellent réellement Claude : ils
consomment du quota, ne font pas partie de `npm test` et ne tournent pas en CI.

```bash
npx playwright test -c tests/live/playwright.config.ts
```

`reference.jpg` est l'image de référence du scénario « maquette ». Les captures
et journaux d'exécution vont dans `tests/live/out/`, ignoré par git.
