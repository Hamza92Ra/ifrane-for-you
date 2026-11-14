import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

// Simple CDP client over Chrome DevTools Protocol to inspect live pages
async function launchChrome() {
  const chromePath = "/home/hamra/.cache/puppeteer/chrome/linux-157.0.8103.78/chrome-linux64/chrome";
  const proc = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--remote-debugging-port=9222",
    "--disable-gpu"
  ]);

  // Wait for CDP to be ready
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get("http://127.0.0.1:9222/json/version", (res) => {
          if (res.statusCode === 200) resolve();
          else reject();
        }).on("error", reject);
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return proc;
}

async function queryCdp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function run() {
  console.log("Starting Multilingual and Responsive UX Suite...");
  const chromeProc = await launchChrome();

  try {
    const pages = await queryCdp("http://127.0.0.1:9222/json/list");
    const wsUrl = pages[0]?.webSocketDebuggerUrl;
    assert.ok(wsUrl, "CDP websocket URL available");

    const ws = new globalThis.WebSocket(wsUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const onMessage = (event) => {
          const parsed = JSON.parse(event.data);
          if (parsed.id === id) {
            ws.removeEventListener("message", onMessage);
            if (parsed.error) reject(parsed.error);
            else resolve(parsed.result);
          }
        };
        ws.addEventListener("message", onMessage);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Page.enable");
    await send("Runtime.enable");

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", { expression, returnByValue: true });
      return res.result?.value;
    }

    async function loadPage(pageUrl, width, height) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width <= 800
      });
      await send("Page.navigate", { url: pageUrl });
      await new Promise((r) => setTimeout(r, 600));
    }

    const viewports = [
      { w: 320, h: 640 },
      { w: 375, h: 667 },
      { w: 390, h: 844 },
      { w: 768, h: 1024 },
      { w: 1024, h: 768 },
      { w: 1440, h: 900 }
    ];

    // 1. Test Arabic RTL metadata and layout
    console.log("Testing Arabic RTL layout...");
    await loadPage("http://localhost:3000/ar", 390, 844);
    const dir = await evaluate("document.documentElement.dir");
    const lang = await evaluate("document.documentElement.lang");
    assert.equal(dir, "rtl", "Arabic route must have dir=rtl");
    assert.equal(lang, "ar", "Arabic route must have lang=ar");
    console.log("PASS: Arabic html attributes dir=rtl and lang=ar");

    // Check WhatsApp button is on the left in RTL
    const waLeft = await evaluate(`
      (() => {
        const el = document.querySelector('.whatsapp-float');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return { right: style.right, left: style.left };
      })()
    `);
    assert.ok(waLeft && waLeft.left !== "auto", "WhatsApp button moves to the left in RTL mode to avoid obstruction");
    console.log("PASS: WhatsApp float moves to left in RTL mode (left:", waLeft.left, ")");

    // 2. Test booking page floating WhatsApp hiding
    console.log("Testing Booking page WhatsApp obstruction protection...");
    await loadPage("http://localhost:3000/fr/book", 375, 667);
    const waDisplay = await evaluate(`
      (() => {
        const el = document.querySelector('.whatsapp-float');
        return el ? window.getComputedStyle(el).display : 'none';
      })()
    `);
    assert.equal(waDisplay, "none", "Floating WhatsApp button is hidden on booking page to prevent blocking form controls");
    console.log("PASS: WhatsApp float is hidden on booking page");

    // 3. Test horizontal overflow and locale direction across page types.
    for (const vp of viewports) {
      for (const locale of ["fr", "en", "ar"]) {
        for (const path of ["", "/book", "/stays/dome", "/stays/cabin"]) {
          await loadPage(`http://localhost:3000/${locale}${path}`, vp.w, vp.h);
          const layout = await evaluate(`({
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            title: document.querySelector('h1')?.textContent
          })`);
          assert.ok(!layout.overflow, `No horizontal overflow on ${locale}${path} at ${vp.w}px`);
          assert.equal(layout.lang, locale, `Correct language on ${locale}${path}`);
          assert.equal(layout.dir, locale === "ar" ? "rtl" : "ltr", `Correct direction on ${locale}${path}`);
          assert.ok(layout.title, `Visible heading on ${locale}${path}`);
        }
      }
    }
    console.log("PASS: Home, booking and stay pages in FR/EN/AR across 6 viewports (320px to 1440px)");

    // 4. Test detail pages and booking flow navigation
    for (const stay of ["dome", "cabin"]) {
      await loadPage(`http://localhost:3000/fr/stays/${stay}`, 375, 667);
      const title = await evaluate("document.querySelector('h1')?.textContent");
      assert.ok(title && title.length > 0, `Detail page for ${stay} loads successfully`);
    }
    console.log("PASS: Accommodation detail pages render correctly");

    ws.close();
    console.log("All multilingual and responsive UX checks passed!");
  } finally {
    chromeProc.kill();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
