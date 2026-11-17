// Lets Node load cloudflare/worker.mjs for tests: "cloudflare:workers" becomes a tiny stand-in.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }') };
  return next(spec, ctx);
}`));
