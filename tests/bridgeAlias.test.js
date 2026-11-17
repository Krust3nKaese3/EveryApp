const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('bridge script exposes OpenScrBridge and keeps EveryAppBridge', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/bridge/BridgeMessageHandler.ts'), 'utf8');
  assert.match(src, /window\.OpenScrBridge = \{/);
  assert.match(src, /window\.EveryAppBridge = window\.OpenScrBridge/);
  assert.match(src, /SrvOpenScr/);
  assert.match(src, /buildType: '\$\{__DEV__ \? 'SrvOpenScr' : 'OpenScr'\}'/);
  assert.doesNotMatch(src, /window\.EveryAppBridge = \{/);
});
