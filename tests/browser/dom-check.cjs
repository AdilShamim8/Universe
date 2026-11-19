const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:4173/explore/", { waitUntil: "networkidle" });
  const counts = await p.evaluate(() => ({
    siblingTables: document.querySelectorAll('#solar-system ~ .data-table-wrap table').length,
    rowsViaSibling: document.querySelectorAll('#solar-system ~ .data-table-wrap table tbody tr').length,
    scaleOl: document.querySelectorAll('#scale ~ ol.timeline-event li').length,
    scaleOlAny: document.querySelectorAll('#scale ~ ol').length,
    mtlCards: document.querySelectorAll('.mtl-items .mtl-card').length,
    allDataTableRows: document.querySelectorAll('.data-table tbody tr').length,
  }));
  console.log(JSON.stringify(counts, null, 1));
  await b.close();
})();
