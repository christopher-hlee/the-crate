// Splits one readable into several PassThroughs, pausing the source until every branch has
// drained, so the slowest consumer sets the pace. Optional branches (the R2 snapshot) are
// dropped on error instead of failing the whole stream.

import { PassThrough, type Readable } from "node:stream";

export type TeeBranch = { stream: PassThrough; optional: boolean };

export function tee(source: Readable, branches: { optional: boolean }[]): PassThrough[] {
  const live: TeeBranch[] = branches.map((b) => ({
    stream: new PassThrough({ highWaterMark: 1 << 20 }),
    optional: b.optional,
  }));
  const waitingOn = new Set<PassThrough>();
  const settle = (out: PassThrough) => {
    if (waitingOn.delete(out) && waitingOn.size === 0) source.resume();
  };
  source.on("data", (chunk: Buffer) => {
    for (const b of live) {
      if (!b.stream.write(chunk)) {
        waitingOn.add(b.stream);
        b.stream.once("drain", () => settle(b.stream));
      }
    }
    if (waitingOn.size > 0) source.pause();
  });
  source.on("end", () => {
    for (const b of live) b.stream.end();
  });
  source.on("error", (err) => {
    for (const b of live) b.stream.destroy(err);
  });
  for (const b of live) {
    b.stream.on("error", (err) => {
      if (!b.optional) {
        source.destroy(err);
        return;
      }
      const i = live.indexOf(b);
      if (i !== -1) live.splice(i, 1);
      settle(b.stream);
    });
  }
  return live.map((b) => b.stream);
}
