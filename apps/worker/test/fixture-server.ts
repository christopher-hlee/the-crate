// A tiny static server for fixture dumps, so tests exercise the HTTP path without the
// network. Point DISCOGS_DUMPS_BASE_URL at it in integration tests.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type FixtureRoutes = Record<string, { body: Buffer | string; type?: string }>;

export async function startFixtureServer(
  routes: FixtureRoutes,
): Promise<{ url: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    hits.push(url);
    const route = routes[url];
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": route.type ?? "application/octet-stream" });
    res.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    hits,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
