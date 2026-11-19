const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const pages = [
    "/index.html", "/history/index.html", "/academy/index.html",
    "/academy/introduction-to-astronomy/index.html", "/explore/index.html",
    "/explore/planets/jupiter/index.html", "/research/index.html",
    "/research/cosmology/index.html", "/library/index.html", "/search/index.html",
  ];
  let bad = 0;
  for (const path of pages) {
    for (const w of [375, 360]) {
      const p = await b.newPage({ viewport: { width: w, height: 800 } });
      await p.goto("http://127.0.0.1:4173" + path, { waitUntil: "networkidle" });
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const icon = ov > 1 ? "OVERFLOW" : "ok";
      if (ov > 1) bad++;
      console.log(`${icon} ${w}px ${path} overflow=${ov}px`);
      await p.close();
    }
  }
  console.log(bad === 0 ? "ALL CLEAN" : `${bad} pages overflow`);
  await b.close();
})();
