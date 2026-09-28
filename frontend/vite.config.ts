import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Standalone sites that live next to the app (outside frontend/). In production each one is deployed
 * on its own subdomain (wiki., privacy. and patch.arabdev.site); in development they are served here.
 */
const STATIC_SITES = ['wiki', 'privacy', 'patch-notes'];
const LICENSE_FILE = resolve(projectRoot, 'LICENSE');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Serves the wiki, privacy policy and patch notes at /wiki/, /privacy/ and /patch-notes/ during
 * development, and publishes LICENSE as /LICENSE.txt in both development and the build.
 */
function staticSites(): Plugin {
  let outDir = 'dist';
  return {
    name: 'arabdev-static-sites',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
        if (path === '/LICENSE.txt') {
          res.setHeader('Content-Type', MIME['.txt']);
          res.end(readFileSync(LICENSE_FILE));
          return;
        }
        const match = path.match(/^\/([a-z-]+)(\/.*)?$/);
        if (!match || !STATIC_SITES.includes(match[1])) return next();
        const [, site, rest] = match;
        if (!rest) {
          res.statusCode = 301;
          res.setHeader('Location', `/${site}/`);
          res.end();
          return;
        }
        const siteRoot = resolve(projectRoot, site);
        let file = resolve(siteRoot, `.${rest}`);
        if (file !== siteRoot && !file.startsWith(siteRoot + sep)) return next();
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(LICENSE_FILE)) cpSync(LICENSE_FILE, resolve(outDir, 'LICENSE.txt'));
    },
  };
}

export default defineConfig({
  plugins: [react(), staticSites()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/media': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // A group also takes in the dependencies of what it captures, so React needs the highest
          // priority: otherwise it lands in "editor" (TipTap depends on it) and every page downloads
          // the whole editor just to get React.
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
              priority: 3,
            },
            { name: 'mui', test: /node_modules[\\/]@(mui|emotion)[\\/]/, priority: 2 },
            { name: 'editor', test: /node_modules[\\/](@tiptap|prosemirror-[a-z]+)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
