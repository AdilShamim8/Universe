const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
  const checks = await p.evaluate(() => {
    const hero = document.querySelector(".hero-img");
    const bg = hero ? getComputedStyle(hero).backgroundImage : "";
    const hasFullImage = bg.includes("pillars-hubble-1600");
    const hasLqip = bg.includes("data:image/jpeg");
    const starfield = !!document.querySelector(".starfield");
    const credit = document.querySelector(".hero-credit");
    const creditText = credit ? credit.textContent.trim().slice(0, 60) : null;
    const h1 = document.querySelector(".hero-title");
    const h1Color = h1 ? getComputedStyle(h1).color : "";
    return { hasFullImage, hasLqip, starfield, creditText, h1Color, bgLen: bg.length };
  });
  console.log(JSON.stringify(checks, null, 1));
  // light theme check
  await p.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const lightOk = await p.evaluate(() => {
    const body = getComputedStyle(document.body);
    return body.backgroundColor;
  });
  console.log("light theme body bg:", lightOk);
  await b.close();
})();
