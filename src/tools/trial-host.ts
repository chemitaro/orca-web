import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const FILES: Record<string, readonly [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/phone.html': ['phone.html', 'text/html; charset=utf-8'],
  '/forbidden.html': ['forbidden.html', 'text/html; charset=utf-8'],
  '/trial.js': ['trial.js', 'text/javascript; charset=utf-8'],
  '/trial-view.js': ['trial-view.js', 'text/javascript; charset=utf-8'],
  '/forbidden.js': ['forbidden.js', 'text/javascript; charset=utf-8'],
  '/trial.css': ['trial.css', 'text/css; charset=utf-8'],
};

export function createTrialHostHandler(options: {
  root: string;
  orcaPort: number;
  allowedHosts: readonly string[];
  highlight: string;
}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.allowedHosts.includes(req.headers.host ?? '')) {
      res.writeHead(421).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.writeHead(405).end();
      return;
    }
    const route = (req.url ?? '').split('?')[0] ?? '';
    if (route === '/config.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        req.method === 'HEAD'
          ? undefined
          : JSON.stringify({ orcaPort: options.orcaPort, highlight: options.highlight }),
      );
      return;
    }
    const file = Object.hasOwn(FILES, route) ? FILES[route] : undefined;
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    void readFile(path.join(options.root, file[0]))
      .then((body) => {
        res.setHeader('Content-Type', file[1]);
        if (file[1].startsWith('text/html')) {
          const bases = [
            ...new Set(options.allowedHosts.map((host) => `http://${host.split(':')[0]}:${options.orcaPort}`)),
          ].join(' ');
          res.setHeader(
            'Content-Security-Policy',
            `default-src 'none'; script-src 'self' ${bases}; style-src 'self'; connect-src 'self' ${bases}; frame-src 'self' ${bases}; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
          );
        }
        res.end(req.method === 'HEAD' ? undefined : body);
      })
      .catch(() => {
        res.writeHead(404).end();
      });
  };
}
