# Nutzungsbedingungen und Impressum

Die deutsche Fassung, die auch in der App unter „Nutzung“ erscheint, steht in [docs/site/terms.de.md](docs/site/terms.de.md). Englisch: [docs/site/terms.en.md](docs/site/terms.en.md). Die statischen Seiten liegen unter [docs/site/](docs/site/index.html).

`src/legal/documents.ts` wird daraus erzeugt. Nach einer Änderung an den Markdown-Dateien:

```bash
node scripts/sync-legal.js
```

Vor der Veröffentlichung diese Platzhalter ersetzen: `{{BETREIBER_NAME}}`, `{{BETREIBER_ADRESSE}}`, `{{SUPPORT_EMAIL}}`.
