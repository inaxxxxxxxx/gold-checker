// api/prices.mjs — Vercel Serverless Function
// goldapi.io から金・プラチナの「国際スポット価格」を取得し、円/グラムでJSON返却する。
//
// 環境変数 GOLDAPI_KEY に goldapi.io の無料APIキーを設定すること。
//   Vercel: Project Settings → Environment Variables → GOLDAPI_KEY
//
// 返却フォーマットはフロント(index.html)が期待する形に合わせる:
//   { ok, fetched_at, source, latest:{gold,platinum}, history:{gold,platinum} }
//   latest.<metal>.retail = 円/グラム（純度100% = 24金相当のスポット価格）
//   history.<metal> = [{date:"YYYY/MM/DD", retail}, ...]（前日終値・当日の2点）

const TROY_OUNCE_G = 31.1034768; // 1トロイオンス = 31.1034768 g

// goldapi.io のシンボル
const SYMBOLS = {
  gold:     'XAU',
  platinum: 'XPT',
};

// 1メタル分を取得して {retailToday, retailPrev} を返す
async function fetchMetal(symbol, key) {
  const res = await fetch(`https://www.goldapi.io/api/${symbol}/JPY`, {
    headers: {
      'x-access-token': key,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`goldapi ${symbol} HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  // price / prev_close_price はトロイオンス単位（JPY）。純価をグラム換算する。
  const price = Number(data.price);
  const prevClose = Number(data.prev_close_price);

  if (!Number.isFinite(price)) {
    throw new Error(`goldapi ${symbol}: price不正 (${JSON.stringify(data).slice(0, 200)})`);
  }

  const retailToday = price / TROY_OUNCE_G;
  const retailPrev = Number.isFinite(prevClose) && prevClose > 0
    ? prevClose / TROY_OUNCE_G
    : null;

  return { retailToday, retailPrev };
}

// JSTの YYYY/MM/DD 文字列（offsetDays日ずらし可）
function jstDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}/${get('month')}/${get('day')}`;
}

// メタル1件分の latest / history を組み立てる
function buildSeries(metal) {
  const today = jstDate(0);
  const yesterday = jstDate(-1);

  const history = [];
  if (metal.retailPrev != null) {
    history.push({ date: yesterday, retail: Math.round(metal.retailPrev) });
  }
  history.push({ date: today, retail: Math.round(metal.retailToday) });

  return {
    latest: { retail: Math.round(metal.retailToday) },
    history,
  };
}

export default async function handler(req, res) {
  // CORS（フロントが別オリジンから叩く場合に備える）
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = process.env.GOLDAPI_KEY;
  if (!key) {
    return res.status(500).json({
      ok: false,
      error: '環境変数 GOLDAPI_KEY が未設定です（Vercelの Environment Variables に追加してください）',
    });
  }

  try {
    const [gold, platinum] = await Promise.all([
      fetchMetal(SYMBOLS.gold, key),
      fetchMetal(SYMBOLS.platinum, key),
    ]);

    const goldSeries = buildSeries(gold);
    const platSeries = buildSeries(platinum);

    // 無料枠を守るためCDNで長めにキャッシュ（6h fresh / 1d stale-while-revalidate）
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');

    return res.status(200).json({
      ok: true,
      fetched_at: new Date().toISOString(),
      source: 'goldapi.io',
      latest: {
        gold: goldSeries.latest,
        platinum: platSeries.latest,
      },
      history: {
        gold: goldSeries.history,
        platinum: platSeries.history,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
