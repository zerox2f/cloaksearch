// Quick test: verify new selectors improve content extraction
import { launch } from 'cloakbrowser';
import * as cheerio from 'cheerio';

const targets = [
  { url: 'https://www.tierra.vn/tin-tuc/bieu-do-gia-vang-the-gioi-xau-usd', selector: '#blog_Detail_Page' },
  { url: 'https://vietstock.vn/hang-hoa/vang-va-kim-loai-quy.htm', selector: '.archives' },
];

async function test(url, selector) {
  console.log(`\n=== Testing: ${url} with selector: ${selector} ===`);
  const browser = await launch({ headless: true, humanize: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);

    // Remove noise (same as parseContent)
    $('script, style, noscript, iframe, img, video, audio, canvas, svg, object, embed, applet, form, input, textarea, select, button, label, fieldset, legend, optgroup, option').remove();
    $('nav, header, footer, .nav, .header, .footer, .sidebar, .menu, .breadcrumb, aside, .ad, .advertisement, .ads, .social-share, .share-buttons, .comments, .comment-section, .related-posts, .recommendations, .newsletter-signup, .cookie-notice, .popup, .modal, .overlay, .tooltip, .toolbar, .ribbon, .banner, .promo, .sponsored').remove();

    const $content = $(selector).first();
    if ($content.length === 0) {
      console.log(`❌ Selector "${selector}" not found!`);
      return;
    }

    const text = $content.text().trim().replace(/\s+/g, ' ');
    console.log(`✅ Found content with "${selector}": ${text.length} chars`);
    console.log(`Preview: ${text.slice(0, 300)}`);
  } finally {
    await browser.close();
  }
}

for (const t of targets) {
  await test(t.url, t.selector);
}
