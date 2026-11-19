const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  for (const w of [1280, 600]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
    const r = await p.evaluate(() => {
      const hero = document.querySelector(".hero-img");
      const bg = getComputedStyle(hero).backgroundImage;
      const title = document.querySelector(".hero-title");
      const rect = title.getBoundingClientRect();
      // sample the title's rendered pixels via canvas-free check: is it in viewport
      return {
        hasFull: bg.includes("pillars-hubble-1600"),
        hasLqip: bg.includes("data:image/jpeg"),
        layers: bg.split("url(").length - 1,
        titleVisible: rect.width > 100 && rect.height > 30,
        imgLoaded: Array.from(document.images).every(i => i.complete),
      };
    });
    console.log(w + "px:", JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
