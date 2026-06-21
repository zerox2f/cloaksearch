// Inspect HTML structure of target sites using CloakBrowser
import { launch } from 'cloakbrowser';

const urls = [
  'https://www.tierra.vn/tin-tuc/bieu-do-gia-vang-the-gioi-xau-usd',
  'https://vietstock.vn/hang-hoa/vang-va-kim-loai-quy.htm',
];

async function inspectPage(url) {
  console.log(`\n=== Inspecting: ${url} ===`);
  const browser = await launch({ headless: true, humanize: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Get all elements with their tag names and common content classes/ids
    const structure = await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        'article, main, section, .content, .post-content, .entry-content, ' +
        '.article-content, .story-content, .news-content, .main-content, ' +
        '.page-content, .text-content, .body-content, .copy, .text, .body, ' +
        '[role="main"], .detail-content, .article-detail, .news-detail, ' +
        '.post-body, .entry-body, .article-body, .story-body, .news-body, ' +
        '.container, .detail, .article, .post, .story, .news-item'
      );
      
      const results = [];
      candidates.forEach((el) => {
        const text = el.textContent.trim();
        if (text.length > 50) {
          results.push({
            tag: el.tagName,
            id: el.id,
            className: (el.className && typeof el.className === 'string') 
              ? el.className.slice(0, 120) : '',
            textLen: text.length,
            textPreview: text.slice(0, 200).replace(/\s+/g, ' '),
          });
        }
      });
      // Sort by text length descending
      results.sort((a, b) => b.textLen - a.textLen);
      return results;
    });

    console.log(`Found ${structure.length} candidate content containers:`);
    structure.slice(0, 10).forEach((s, i) => {
      const cls = s.className ? '.' + s.className.split(' ').filter(Boolean).join('.') : '';
      console.log(`  [${i}] <${s.tag}>${s.id ? '#'+s.id : ''}${cls}`);
      console.log(`      textLen=${s.textLen}`);
      console.log(`      preview: ${s.textPreview.slice(0, 150)}`);
    });

    // Get page outline
    const outline = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, 1, null, false);
      const tags = [];
      let node;
      while ((node = walker.nextNode()) && tags.length < 40) {
        const tag = node.tagName.toLowerCase();
        const id = node.id ? '#' + node.id : '';
        const cls = node.className && typeof node.className === 'string' 
          ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.') 
          : '';
        const text = (node.textContent || '').trim();
        if (['script', 'style', 'noscript', 'iframe'].includes(tag)) continue;
        if (['div', 'section', 'article', 'main'].includes(tag)) {
          tags.push({ tag: tag + id + cls, textLen: text.length });
        } else if (['h1','h2','h3','h4','p','ul','ol','table','span'].includes(tag)) {
          tags.push({ tag: tag + id + cls, textLen: text.length, text: text.slice(0, 100) });
        }
      }
      return tags;
    });
    
    console.log(`\nPage outline (first 40 elements):`);
    outline.forEach((o) => {
      if (o.text) console.log(`  <${o.tag}> (${o.textLen}ch) "${o.text}"`);
      else console.log(`  <${o.tag}> (${o.textLen}ch)`);
    });

  } finally {
    await browser.close();
  }
}

for (const url of urls) {
  await inspectPage(url);
}
