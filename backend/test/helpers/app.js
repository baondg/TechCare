/**
 * Loads the compiled Express app (`dist/app.js`) for HTTP-level tests.
 * `npm test` runs `npm run build` first (see `pretest`), so dist is fresh.
 *
 * The app is importable without MySQL/Redis: it only connects lazily per request,
 * and every route asserted here short-circuits (auth, 404, /health) before touching the DB.
 */
const path = require('node:path');
const fs = require('node:fs');

// Keep test output readable; set LOG_LEVEL=debug to see app logs while debugging a test.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

const DIST_APP = path.join(__dirname, '..', '..', 'dist', 'app.js');

function loadApp() {
  if (!fs.existsSync(DIST_APP)) {
    throw new Error(`Missing ${DIST_APP} — run \`npm run build\` before the tests.`);
  }
  return require(DIST_APP).default;
}

/** Starts the app on an ephemeral port. Returns { baseUrl, close }. */
async function startTestServer() {
  const app = loadApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Lists every route registered on an Express 4 app as "METHOD /full/path",
 * walking mounted routers recursively.
 */
function listRoutes(app) {
  const routes = [];

  const mountPathOf = (layer) => {
    if (layer.regexp.fast_slash) return '';
    // Express 4 compiles `app.use('/api/x', router)` to /^\/api\/x\/?(?=\/|$)/i
    return layer.regexp.source
      .replace(/^\^/, '')
      .replace('\\/?(?=\\/|$)', '')
      .replace(/\\\//g, '/');
  };

  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
        for (const method of methods) {
          routes.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        walk(layer.handle.stack, prefix + mountPathOf(layer));
      }
    }
  };

  walk(app._router.stack, '');
  return routes;
}

module.exports = { loadApp, startTestServer, listRoutes };
