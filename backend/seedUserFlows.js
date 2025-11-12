let fetchFn = globalThis.fetch;

if (!fetchFn) {
  try {
    ({ default: fetchFn } = await import('node-fetch'));
  } catch (error) {
    console.error('❌ Unable to load fetch. Install node-fetch or use Node 18+.');
    throw error;
  }
}

const sessions = [
  {
    sessionId: "demo-1",
    metadata: { url: "/", userAgent: "Chrome/119" },
    events: [
      { type: "navigation", timestamp: 0, target: "/" },
      { type: "navigation", timestamp: 2000, target: "/products" },
      { type: "navigation", timestamp: 4000, target: "/cart" },
      { type: "navigation", timestamp: 6000, target: "/checkout" },
    ],
    completed: true,
  },
  {
    sessionId: "demo-2",
    metadata: { url: "/", userAgent: "Firefox/120" },
    events: [
      { type: "navigation", timestamp: 0, target: "/" },
      { type: "navigation", timestamp: 2500, target: "/pricing" },
      { type: "navigation", timestamp: 4500, target: "/signup" },
    ],
    completed: true,
  },
  {
    sessionId: "demo-3",
    metadata: { url: "/", userAgent: "Safari/17" },
    events: [
      { type: "navigation", timestamp: 0, target: "/" },
      { type: "navigation", timestamp: 2200, target: "/about" },
      { type: "navigation", timestamp: 4800, target: "/contact" },
    ],
    completed: true,
  },
];

for (const s of sessions) {
  await fetchFn("http://localhost:4000/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
}

console.log("✅ Seeded 3 demo sessions with multi-page navigation flow");