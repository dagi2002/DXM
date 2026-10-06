// Blocks until a URL answers 2xx (used to start services only after the DB is prepared).
const url = process.argv[2];
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (res.ok) process.exit(0);
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.error(`timed out waiting for ${url}`);
process.exit(1);
