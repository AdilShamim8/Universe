// Visual smoke: capture key pages at mobile + desktop for eyeball checks.
// Usage: node tests/browser/visual-check.cjs [outdir]
const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2] || "/tmp/shots";
  require("fs").mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const shots = [
    ["/index.html", 375, "home-mobile"],
    ["/index.html", 1280, "home-desktop"],
    ["/explore/index.html", 375, "explore-mobile"],
    ["/history/index.html", 1280, "history-desktop"],
    ["/academy/index.html", 1280, "academy-desktop"],
    ["/library/index.html", 375, "library-mobile"],
  ];
  for (const [path, w, name] of shots) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto("http://127.0.0.1:4173" + path, { waitUntil: "networkidle" });
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: w === 375 });
    await p.close();
    console.log(`${name}.png (${w}px)`);
  }
  await b.close();
})();
