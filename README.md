# 金・プラチナ価格トラッカー（田中貴金属）

田中貴金属工業の公式サイトから金・プラチナ価格をスクレイピングし、
JSON APIとして返すVercel Serverless Proxy + フロントエンド一式。

## ファイル構成

```
tanaka-proxy/
├── api/
│   └── prices.mjs  ← Proxy（Vercel Serverless Function / ESM）
├── index.html      ← フロントエンド（どこにでも置ける）
├── vercel.json
└── README.md
```

## セットアップ（5分）

### 1. Vercel CLIをインストール
```bash
npm i -g vercel
```

### 2. このフォルダでデプロイ
```bash
cd tanaka-proxy
vercel deploy --prod
```
→ `https://your-project.vercel.app` のようなURLが発行される

### 3. index.html の PROXY_URL を書き換える
```js
// index.html の先頭付近
const PROXY_URL = 'https://your-project.vercel.app/api/prices';
```

### 4. index.html をブラウザで開く
ダブルクリックでOK。サーバー不要。

---

## APIレスポンス例

```
GET https://your-project.vercel.app/api/prices
```

```json
{
  "ok": true,
  "fetched_at": "2026-06-27T10:00:00.000Z",
  "latest": {
    "gold":     { "date": "2026/06/27", "retail": 15800, "buyback": 15700 },
    "platinum": { "date": "2026/06/27", "retail":  6200, "buyback":  6100 }
  },
  "history": {
    "gold":     [ { "date": "2026/06/01", "retail": 15500, "buyback": 15400 }, ... ],
    "platinum": [ { "date": "2026/06/01", "retail":  6100, "buyback":  6000 }, ... ]
  }
}
```

- 価格はすべて **円/グラム（税込）**
- 田中貴金属は **営業日 9:30 / 14:00** に価格更新
- Proxy側で30分キャッシュ（`Cache-Control: s-maxage=1800`）

---

## ローカルで動かす場合

```bash
npx vercel dev
# → http://localhost:3000 でフロント＋ /api/prices が動作確認できる
```

index.html は API を相対パス `/api/prices` で呼ぶため、`vercel dev` 配下ならそのまま動く。

---

## 注意

- 田中貴金属のHTML構造が変わるとパーサーが壊れる可能性あり
- 個人利用目的。過度なリクエストは避けること（Proxy側30分キャッシュ済み）
- 価格は参考値。実際の取引は公式サイトで確認
