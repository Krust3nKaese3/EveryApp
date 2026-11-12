const { withAndroidManifest } = require('@expo/config-plugins');

const REDIRECT_ACTIVITY = 'com.spotify.sdk.android.auth.browser.RedirectUriReceiverActivity';
const SPOTIFY_PACKAGES = [
  'com.spotify.music',
  'com.spotify.music.debug',
  'com.spotify.music.canary',
  'com.spotify.music.partners',
];

function ensureRedirect(application) {
  application.activity = application.activity || [];
  let activity = application.activity.find((a) => a.$['android:name'] === REDIRECT_ACTIVITY);
  if (!activity) {
    activity = {
      $: { 'android:name': REDIRECT_ACTIVITY, 'android:exported': 'true' },
      'intent-filter': [],
    };
    application.activity.push(activity);
  }
  activity['intent-filter'] = activity['intent-filter'] || [];
  const has = activity['intent-filter'].some((filter) =>
    (filter.data || []).some((d) => d.$['android:scheme'] === 'everyapp' && d.$['android:host'] === 'spotify-callback')
  );
  if (!has) {
    activity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [{ $: { 'android:scheme': 'everyapp', 'android:host': 'spotify-callback' } }],
    });
  }
}

function ensureQueries(manifest) {
  const queries = manifest.queries || [];
  let block = queries.find((q) => Array.isArray(q.package));
  if (!block) {
    block = { package: [] };
    queries.push(block);
  }
  block.package = block.package || [];
  for (const name of SPOTIFY_PACKAGES) {
    if (!block.package.some((p) => p.$ && p.$['android:name'] === name)) {
      block.package.push({ $: { 'android:name': name } });
    }
  }
  manifest.queries = queries;
}

/** Auth 5 no longer ships the redirect intent-filter. Playback still needs to see the Spotify app. */
module.exports = function withSpotify(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application && manifest.application[0];
    if (application) ensureRedirect(application);
    ensureQueries(manifest);
    return config;
  });
};
