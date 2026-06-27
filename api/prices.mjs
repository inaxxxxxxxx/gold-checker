// api/prices.js — Vercel Serverless Function
// 田中貴金属のHTMLをスクレイピングして金・プラチナ価格をJSONで返す

const URLS = {
  gold:     'https://gold.tanaka.co.jp/commodity/souba/d-gold.php',
  platinum: 'https://gold.tanaka.co.jp/commodity/souba/d-platinum.php',
};

// HTMLから価格テーブルをパース
// 田中貴金属の価格ページは <table> に日付・小売・買取 が並ぶ形式
function parseRows(html) {
  const rows = [];

  // <tr> ブロックを全て抽出
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trPattern.exec(html)) !== null) {
    const cells = [];
    const tdPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;

    while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
      // HTMLタグ除去 & トリム
      const text = tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
      if (text) cells.push(text);
    }

    // 日付(YYYY/MM/DD)・小売価格・買取価格の3列行を対象
    if (cells.length >= 2 && /^\d{4}\/\d{2}\/\d{2}$/.test(cells[0])) {
      const retail = parseInt(cells[1].replace(/,/g, ''), 10);
      const buyback = cells[2] ? parseInt(cells[2].replace(/,/g, ''), 10) : null;
      if (!isNaN(retail)) {
        rows.push({
          date:    cells[0],
          retail,               // 小売価格（税込）円/g
          buyback: isNaN(buyback) ? null : buyback,  // 買取価格 円/g
        });
      }
    }
  }

  // 新しい順 → 古い順に並べ直す（グラフ用）
  return rows.reverse();
}

async function fetchAndParse(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; personal-price-tracker/1.0)',
      'Accept-Language': 'ja,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  return parseRows(html);
}

export default async function handler(req, res) {
  // CORS — 自分のドメインに制限する場合はここを変更
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate'); // 30分キャッシュ

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [goldRows, platRows] = await Promise.all([
      fetchAndParse(URLS.gold),
      fetchAndParse(URLS.platinum),
    ]);

    const latest = {
      gold:     goldRows.at(-1) ?? null,
      platinum: platRows.at(-1) ?? null,
    };

    return res.status(200).json({
      ok: true,
      fetched_at: new Date().toISOString(),
      latest,          // 最新1件（KPIカード用）
      history: {
        gold:     goldRows,     // 過去〜1ヶ月分
        platinum: platRows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
