// Publish only the web app. Downloader cookies, logs and local scripts never
// belong in the static deployment.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
if (process.argv.includes('--require-cloud')) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/cloud-config.js'), 'utf8'), context);
  const config = context.window.CINEMATIC_CLOUD_CONFIG || {};
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url || '') || !/^sb_publishable_/.test(config.publishableKey || '')) {
    throw new Error('Configura la URL y clave pública de Supabase antes de publicar.');
  }
}
esbuild.buildSync({ entryPoints: [path.join(root, 'src/supabase-client.js')], bundle: true, minify: true,
  platform: 'browser', target: ['chrome100', 'safari15'], outfile: path.join(root, 'js/supabase-client.js') });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons']) {
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
for (const name of ['index.html', 'sw.js', 'css', 'js']) {
  fs.cpSync(path.join(root, name), path.join(root, 'studio-web', name), { recursive: true });
}
console.log('Web lista en dist/');
