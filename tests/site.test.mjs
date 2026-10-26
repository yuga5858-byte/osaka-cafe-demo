// デモサイトの自動テスト
// 実行: node --test cafe-demo/tests/   （cafe-demo フォルダ内なら node --test tests/）
// Playwright（ブラウザ自動操作ツール）で実際にページを開いて確認します。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const SHOT_DIR = process.env.SCREENSHOT_DIR || "";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

let server, browser, baseURL;

before(async () => {
  // テスト用の簡易サーバー（外部には公開されません）
  server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  const problems = [];
  const external = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith(baseURL) && !r.url().startsWith("data:")) external.push(r.url()); });
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(baseURL, { waitUntil: "load" });
  return { page, problems, external };
}

const VIEWPORTS = { mobile: { width: 375, height: 812 }, desktop: { width: 1280, height: 800 } };

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`${name}: エラー・404・外部通信がない／横スクロールが出ない`, async () => {
    const { page, problems, external } = await openPage(viewport);
    // 遅延読み込み画像も読み込ませる
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    assert.deepEqual(problems, [], "コンソールエラーや読み込み失敗がある");
    assert.deepEqual(external, [], "外部サービスへの通信がある");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `横にはみ出している (${overflow}px)`);
    const broken = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    assert.deepEqual(broken, [], "表示できない画像がある");
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
    await page.close();
  });
}

test("SEO・基本構造", async () => {
  const { page } = await openPage(VIEWPORTS.desktop);
  assert.equal(await page.getAttribute("html", "lang"), "ja");
  assert.match(await page.title(), /ひだまり舎/);
  assert.ok((await page.getAttribute('meta[name="description"]', "content")).length > 40);
  assert.equal(await page.locator("h1").count(), 1, "h1は1つだけ");
  // 見出しレベルが飛んでいない（h1→h3 など）
  const levels = await page.$$eval("h1,h2,h3,h4,h5,h6", (hs) => hs.map((h) => Number(h.tagName[1])));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, `見出しレベルが飛んでいる: ${levels}`);
  // 構造化データが正しいJSON
  JSON.parse(await page.textContent('script[type="application/ld+json"]'));
  // 必須セクション
  for (const id of ["top", "about", "menu", "hours", "access", "contact"]) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `#${id} がない`);
  }
  // ページ内リンクの行き先が存在する
  const anchors = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute("href").slice(1)));
  for (const id of anchors) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `リンク先 #${id} がない`);
  await page.close();
});

test("デモであること・架空情報であることが明記されている", async () => {
  const { page } = await openPage(VIEWPORTS.mobile);
  const banner = page.locator(".demo-banner");
  assert.ok(await banner.isVisible(), "デモ表示の帯が見えない");
  assert.match(await banner.textContent(), /デモ/);
  assert.match(await banner.textContent(), /架空/);
  assert.equal(await page.getAttribute('meta[name="robots"]', "content"), "noindex, nofollow");
  // 実在するかもしれない外部サイトへのリンクがない（tel: も架空番号なので無し）
  const outLinks = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter((h) => !h.startsWith("#")));
  assert.deepEqual(outLinks, [], "外部リンクがある");
  await page.close();
});

test("アクセシビリティ: 画像のalt・ボタン名・フォーム要素", async () => {
  const { page } = await openPage(VIEWPORTS.desktop);
  const noAlt = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.hasAttribute("alt")).length);
  assert.equal(noAlt, 0, "altのない画像がある");
  const unnamed = await page.$$eval("button, a", (els) => els.filter((e) => !e.textContent.trim() && !e.getAttribute("aria-label")).length);
  assert.equal(unnamed, 0, "名前のないボタン・リンクがある");
  await page.close();
});

test("アクセシビリティ: 文字色と背景色のコントラスト比 4.5:1 以上", async () => {
  const { page } = await openPage(VIEWPORTS.desktop);
  const results = await page.evaluate(() => {
    const parse = (c) => c.match(/[\d.]+/g).slice(0, 4).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length < 4 || c[3] > 0.9) return c;
      }
      return [255, 255, 255];
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || !el.checkVisibility() || el.closest("dialog, .visually-hidden, .skip-link")) continue;
      const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) out.push(`${ratio.toFixed(2)} "${walker.currentNode.textContent.trim().slice(0, 20)}"`);
    }
    return out;
  });
  assert.deepEqual(results, [], "コントラスト不足の文字がある");
  await page.close();
});

test("スマホ: メニューが開閉できる（Escでも閉じる）", async () => {
  const { page } = await openPage(VIEWPORTS.mobile);
  const toggle = page.locator(".nav-toggle");
  const nav = page.locator("#global-nav");
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.ok(await nav.isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  await nav.getByRole("link", { name: "メニュー" }).click();
  assert.equal(await nav.isVisible(), false, "リンクを押したら閉じる");
  await page.close();
});

test("予約・Instagramボタンは動作するふりをせず「未接続」と案内する", async () => {
  const { page, external } = await openPage(VIEWPORTS.desktop);
  const dialog = page.locator("#unavailable-dialog");
  const buttons = page.locator(".js-unavailable");
  const count = await buttons.count();
  assert.ok(count >= 4);
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible())) continue;
    const urlBefore = page.url();
    await btn.click();
    assert.ok(await dialog.isVisible(), "案内ダイアログが出ない");
    assert.match(await dialog.textContent(), /未接続|接続していません/);
    assert.doesNotMatch(await dialog.textContent(), /完了|受け付けました|ありがとうございました/, "予約できたような表示がある");
    assert.equal(page.url(), urlBefore, "ページ遷移してしまう");
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false, "Escで閉じない");
    assert.ok(await btn.evaluate((b) => b === document.activeElement), "閉じた後に元のボタンへフォーカスが戻らない");
  }
  const insta = page.locator('[data-feature="instagram"]');
  await insta.click();
  assert.match(await dialog.textContent(), /Instagram/);
  await dialog.getByRole("button", { name: "閉じる" }).click();
  assert.equal(await dialog.isVisible(), false);
  assert.deepEqual(external, []);
  await page.close();
});

test("表示速度: ページ全体の転送量が軽い（100KB未満）", async () => {
  let total = 0;
  for (const f of ["index.html", "css/style.css", "js/main.js", "images/hero.svg", "images/about.svg", "images/map.svg", "images/favicon.svg"]) {
    total += (await fs.stat(path.join(ROOT, f))).size;
  }
  assert.ok(total < 100 * 1024, `合計 ${total} bytes`);
});
