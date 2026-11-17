/**
 * Writes the in-app strings and the static HTML from docs/site/*.md.
 * Run from the repo root: node scripts/sync-legal.js
 */
const fs = require('fs');
const path = require('path');
const { renderMarkdown, escapeHtml } = require('../docs/site/render.js');

const root = path.join(__dirname, '..');
const site = path.join(root, 'docs/site');

function read(name) {
  const text = fs.readFileSync(path.join(site, name), 'utf8');
  if (!text.endsWith('\n')) throw new Error(`${name} must end with a newline`);
  return text;
}

const privacyDe = read('privacy.de.md');
const termsDe = read('terms.de.md');
const privacyEn = read('privacy.en.md');
const termsEn = read('terms.en.md');

const documents = `// In-app copy of docs/site/privacy.de.md and docs/site/terms.de.md.
// Regenerate with: node scripts/sync-legal.js
export const PRIVACY_MD = ${JSON.stringify(privacyDe)};

export const TERMS_MD = ${JSON.stringify(termsDe)};
`;
fs.writeFileSync(path.join(root, 'src/legal/documents.ts'), documents);

const pages = [
  ['datenschutz.html', 'de', 'Datenschutzerklärung – EveryApp', privacyDe, 'datenschutz.html', 'privacy.html'],
  ['privacy.html', 'en', 'Privacy policy – EveryApp', privacyEn, 'datenschutz.html', 'privacy.html'],
  ['nutzung.html', 'de', 'Nutzungsbedingungen und Impressum – EveryApp', termsDe, 'nutzung.html', 'terms.html'],
  ['terms.html', 'en', 'Terms and legal notice – EveryApp', termsEn, 'nutzung.html', 'terms.html'],
];

function page({ lang, title, body, deHref, enHref }) {
  const deLabel = lang === 'de' ? '<strong>Deutsch</strong>' : '<a href="' + deHref + '">Deutsch</a>';
  const enLabel = lang === 'en' ? '<strong>English</strong>' : '<a href="' + enHref + '">English</a>';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="site.css">
</head>
<body>
  <header>
    <p>EveryApp</p>
    <nav>
      <a href="index.html">Übersicht</a>
      ${deLabel}
      ${enLabel}
      <a href="datenschutz.html">Datenschutz</a>
      <a href="privacy.html">Privacy</a>
      <a href="nutzung.html">Nutzung</a>
      <a href="terms.html">Terms</a>
    </nav>
  </header>
  <main>
${body.trimEnd()}
  </main>
  <footer>Entwurf, keine Rechtsberatung. Anbieter: Manuel Di Liberto, Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland, krust3nkaese@gmail.com.</footer>
</body>
</html>
`;
}

for (const [file, lang, title, markdown, deHref, enHref] of pages) {
  const html = page({ lang, title, body: renderMarkdown(markdown), deHref, enHref });
  fs.writeFileSync(path.join(site, file), html);
}

const index = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EveryApp – Rechtliches</title>
  <link rel="stylesheet" href="site.css">
</head>
<body>
  <header>
    <p>EveryApp</p>
    <nav>
      <a href="datenschutz.html">Datenschutz</a>
      <a href="privacy.html">Privacy</a>
      <a href="nutzung.html">Nutzung und Impressum</a>
      <a href="terms.html">Terms and legal notice</a>
    </nav>
  </header>
  <main>
    <h1>Rechtliches</h1>
    <p>EveryApp ist eine Container-App. Mini-Apps aus GitHub laufen als HTML und JavaScript in einer WebView. Es gibt keinen eigenen Server, kein Nutzerkonto und kein Analyse-SDK.</p>
    <ul>
      <li><a href="datenschutz.html">Datenschutzerklärung (Deutsch)</a></li>
      <li><a href="privacy.html">Privacy policy (English)</a></li>
      <li><a href="nutzung.html">Nutzungsbedingungen und Impressum (Deutsch)</a></li>
      <li><a href="terms.html">Terms of use and legal notice (English)</a></li>
    </ul>
    <p>Für GitHub Pages die Quelle <code>/docs</code> auf dem Branch <code>main</code> wählen. Die Datenschutz-URL ist dann <code>https://&lt;owner&gt;.github.io/&lt;repo&gt;/site/datenschutz.html</code>.</p>
    <p>Anbieter: Manuel Di Liberto, Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland, krust3nkaese@gmail.com. Nach einer Textänderung <code>node scripts/sync-legal.js</code> ausführen.</p>
  </main>
</body>
</html>
`;
fs.writeFileSync(path.join(site, 'index.html'), index);
console.log('synced legal pages');
