// Minimal test runner: transpiles pure TS modules with the project's TypeScript and runs node:test files.
const ts = require('typescript'); const fs = require('fs'); const path = require('path'); const Module = require('module');
require.extensions['.ts'] = (m, file) => {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  m._compile(out.outputText, file);
};
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js'))) require(path.join(__dirname, f));
