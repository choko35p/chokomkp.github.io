// 巧克力MKP的戰棋研究室｜站主專用讀者統計（chokomkp.com/stats）
//
// - 只有 /stats 開頭的網址會進到這支程式，其他網址照舊直接給 site/ 裡的靜態檔案。
// - 兩道鎖：Cloudflare Access 先擋（只放行站主的 Gmail），這裡再驗一次 Access 簽發的通行證。
//   Access 還沒設定好（ACCESS_TEAM / ACCESS_AUD 空白）時，一律不給看，不會先公開。
// - 數字是打開頁面當下向 Cloudflare 查的，不經過 Claude，也不存任何讀者資料。
import PAGE from "./page.js";

const TW_OFFSET = 8 * 3600 * 1000;
const RANGES = { today: 0, "24h": 24, "7d": 168, "30d": 720 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p !== "/stats" && !p.startsWith("/stats/")) return env.ASSETS.fetch(request);

    const auth = await verifyAccess(request, env);
    if (!auth.ok) return denied(auth.why, p.startsWith("/stats/api"));

    if (p === "/stats/api") {
      try {
        const body = await buildStats(env, url.searchParams.get("range"), url.searchParams.get("tw") !== "0");
        return json(body, 200);
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 502);
      }
    }
    if (p === "/stats" || p === "/stats/") return new Response(PAGE, { headers: secureHeaders("text/html; charset=utf-8") });
    return new Response("找不到這個頁面", { status: 404, headers: secureHeaders("text/plain; charset=utf-8") });
  },
};

/* ---------------- 權限 ---------------- */

const b64urlBytes = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

let CERTS = null; // { at, keys }
async function accessKeys(team, fetchImpl) {
  if (CERTS && Date.now() - CERTS.at < 3600e3) return CERTS.keys;
  const r = await fetchImpl(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs " + r.status);
  const keys = (await r.json()).keys || [];
  CERTS = { at: Date.now(), keys };
  return keys;
}

export async function verifyAccess(request, env, fetchImpl = fetch) {
  const team = (env.ACCESS_TEAM || "").trim();
  const aud = (env.ACCESS_AUD || "").trim();
  if (!team || !aud) return { ok: false, why: "setup" };
  const token = request.headers.get("cf-access-jwt-assertion") || getCookie(request, "CF_Authorization");
  if (!token) return { ok: false, why: "login" };
  try {
    const [h, pl, sig] = token.split(".");
    const header = b64urlJson(h);
    const payload = b64urlJson(pl);
    if (header.alg !== "RS256") return { ok: false, why: "login" };
    const jwk = (await accessKeys(team, fetchImpl)).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, why: "login" };
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${pl}`));
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const now = Date.now() / 1000;
    if (!good || !auds.includes(aud) || !(payload.exp > now) || payload.iss !== `https://${team}.cloudflareaccess.com`) {
      return { ok: false, why: "login" };
    }
    return { ok: true, email: payload.email || "" };
  } catch {
    return { ok: false, why: "login" };
  }
}

function denied(why, isApi) {
  const msg = why === "setup"
    ? "統計頁的登入保護還沒設定好，所以先不顯示任何數字。"
    : "這一頁只有站主能看。請從 Cloudflare 的登入畫面用站主的信箱登入。";
  if (isApi) return json({ error: msg }, 403);
  const html = `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>讀者統計｜站主專用</title><body style="font:16px/1.7 system-ui,'Microsoft JhengHei',sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#242321"><h1 style="font-size:1.25rem">讀者統計｜站主專用</h1><p>${msg}</p></body></html>`;
  return new Response(html, { status: 403, headers: secureHeaders("text/html; charset=utf-8") });
}

function secureHeaders(type) {
  return {
    "content-type": type,
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}
const json = (o, status) => new Response(JSON.stringify(o), { status, headers: secureHeaders("application/json; charset=utf-8") });

/* ---------------- 統計 ---------------- */

export function windows(range, now = Date.now()) {
  const r = range in RANGES ? range : "today";
  let start;
  if (r === "today") {
    const tw = new Date(now + TW_OFFSET);
    start = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - TW_OFFSET;
  } else start = now - RANGES[r] * 3600e3;
  const span = now - start;
  const prevStart = r === "today" ? start - 24 * 3600e3 : start - span;
  return { range: r, start, end: now, prevStart, prevEnd: prevStart + span };
}

const iso = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

// 網站在 chokomkp.com 上線的時間；更早的資料不存在，查詢範圍從這裡開始。
const DEFAULT_SINCE = "2026-11-05T02:00:00Z";
// Cloudflare 的統計：一次查 7 天以內是逐筆精確，超過 7 天會改成抽樣估算（數字變成 10 的倍數）。
// 所以長範圍切成每段 7 天以內分開查再加總。每次查詢的項目數也有上限，所以分成好幾個查詢一起送。
const CHUNK = 7 * 86400e3;

export function chunks(a, b, size = CHUNK) {
  const out = [];
  for (let e = b; e > a; e -= size) out.unshift([Math.max(a, e - size), e]);
  return out;
}

export function buildQueries(env, w, tw) {
  const since = Date.parse(env.SITE_SINCE || DEFAULT_SINCE);
  const country = tw ? `, countryName: "TW"` : "";
  const rum = (a, b) => `filter: { siteTag: "${env.SITE_TAG}", bot: 0, requestPath_notlike: "/stats%", datetime_geq: "${iso(a)}", datetime_lt: "${iso(b)}"${country} }`;
  const acct = (nodes) => `{ viewer { accounts(filter: { accountTag: "${env.ACCOUNT_ID}" }) {\n  ${nodes.join("\n  ")}\n} } }`;
  const grp = (name, dims, a, b, order = "sum_visits_DESC", limit = 50) =>
    `${name}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, ${rum(a, b)}, orderBy: [${order}]) { count sum { visits } avg { sampleInterval } dimensions { ${dims} } }`;
  const tot = (name, a, b) => `${name}: rumPageloadEventsAdaptiveGroups(limit: 1, ${rum(a, b)}) { count sum { visits } avg { sampleInterval } }`;

  const s0 = Math.max(w.start, since);
  const p0 = Math.max(w.prevStart, since);
  const cur = s0 < w.end ? chunks(s0, w.end) : [];
  const prev = p0 < w.prevEnd ? chunks(p0, w.prevEnd) : [];

  const account = cur.map(([a, b]) => acct([
    grp("hours", "datetimeHour", a, b, "datetimeHour_ASC", 1000),
    grp("sources", "refererHost", a, b),
    grp("devices", "deviceType", a, b),
    grp("browsers", "userAgentBrowser userAgentOS", a, b),
    grp("countries", "countryName", a, b),
  ]));
  const extra = prev.map(([a, b], i) => tot(`p${i}`, a, b));
  const lh = Math.max(w.end - 3600e3, since);
  if (lh < w.end) extra.push(tot("lastHour", lh, w.end));
  const perfStart = Math.max(s0, w.end - CHUNK);
  if (perfStart < w.end) extra.push(`perf: rumPerformanceEventsAdaptiveGroups(limit: 5, ${rum(perfStart, w.end)}) { count quantiles { pageLoadTimeP50 pageLoadTimeP90 firstContentfulPaintP50 } dimensions { deviceType } }`);
  const misc = extra.length ? acct(extra) : null;

  // 陣容頁會各自載入 data/items/<陣容>.json，用它推算「哪套陣容被打開」。這份資料最多只保留 30 天。
  const zStart = Math.max(s0, w.end - 30 * 86400e3 + 60e3);
  const zc = tw ? `, clientCountryName: "TW"` : "";
  const zone = (zStart < w.end ? chunks(zStart, w.end) : []).map(([a, b]) => {
    const zf = (x) => `filter: { datetime_geq: "${iso(a)}", datetime_lt: "${iso(b)}", edgeResponseStatus_lt: 400${zc}${x} }`;
    return `{ viewer { zones(filter: { zoneTag: "${env.ZONE_ID}" }) {
  comps: httpRequestsAdaptiveGroups(limit: 500, ${zf(`, clientRequestPath_like: "/data/items/%"`)}, orderBy: [count_DESC]) { count avg { sampleInterval } dimensions { clientRequestPath clientDeviceType } }
  sessions: httpRequestsAdaptiveGroups(limit: 20, ${zf(`, clientRequestPath_in: ["/data/site-data.json", "/data/vods.json"]`)}, orderBy: [count_DESC]) { count avg { sampleInterval } dimensions { clientRequestPath clientDeviceType } }
} } }`;
  });
  return { account, misc, zone, start: s0, prevStart: p0, zoneStart: zStart, perfStart, nPrev: prev.length };
}

async function gql(env, query, fetchImpl) {
  const r = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || (j.errors && j.errors.length)) {
    const m = j && j.errors && j.errors[0] && j.errors[0].message;
    throw new Error("Cloudflare 查詢失敗：" + (m || r.status));
  }
  return j.data.viewer;
}

const sampledRows = (rows) => (rows || []).some((x) => x.avg && x.avg.sampleInterval > 1.01);

// 把各段的分組結果依維度加總
function merge(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x.dimensions || {});
    const o = m.get(k) || { ...x.dimensions, visits: 0, views: 0 };
    o.visits += x.sum ? x.sum.visits : 0;
    o.views += x.count;
    m.set(k, o);
  }
  return [...m.values()];
}

export async function buildStats(env, range, tw, fetchImpl = fetch, now = Date.now()) {
  if (!env.CF_API_TOKEN) throw new Error("還沒設定讀取金鑰（CF_API_TOKEN）");
  const w = windows(range, now);
  const q = buildQueries(env, w, tw);
  const [accs, misc, zones] = await Promise.all([
    Promise.all(q.account.map((x) => gql(env, x, fetchImpl).then((v) => v.accounts[0] || {}))),
    q.misc ? gql(env, q.misc, fetchImpl).then((v) => v.accounts[0] || {}) : {},
    Promise.all(q.zone.map((x) => gql(env, x, fetchImpl).then((v) => v.zones[0] || {}))),
  ]);
  const all = (k) => accs.flatMap((a) => a[k] || []);
  const hours = all("hours");
  const one = (rows) => ({ visits: rows.reduce((s, x) => s + x.sum.visits, 0), views: rows.reduce((s, x) => s + x.count, 0) });
  const prevRows = Array.from({ length: q.nPrev }, (_, i) => misc[`p${i}`] || []).flat();
  const zc = zones.flatMap((z) => z.comps || []), zs = zones.flatMap((z) => z.sessions || []);
  const zmerge = (rows) => merge(rows, (d) => d.clientRequestPath + "|" + d.clientDeviceType).map((x) => ({ path: x.clientRequestPath, device: x.clientDeviceType, n: x.views }));
  return {
    generatedAt: new Date(now).toISOString(),
    range: w.range, tw,
    window: { start: iso(q.start), requestedStart: iso(w.start), end: iso(w.end), prevStart: iso(q.prevStart), prevEnd: iso(w.prevEnd), compsStart: iso(q.zoneStart), perfStart: iso(q.perfStart), since: env.SITE_SINCE || DEFAULT_SINCE },
    total: one(hours), prev: q.nPrev ? one(prevRows) : null, lastHour: one(misc.lastHour || []),
    trend: hours.map((x) => ({ t: x.dimensions.datetimeHour, visits: x.sum.visits, views: x.count })),
    sources: merge(all("sources"), (d) => d.refererHost || "").map((x) => ({ host: x.refererHost || "", visits: x.visits, views: x.views })).filter((x) => x.visits > 0),
    devices: merge(all("devices"), (d) => d.deviceType).map((x) => ({ device: x.deviceType, visits: x.visits, views: x.views })),
    browsers: merge(all("browsers"), (d) => d.userAgentBrowser + "|" + d.userAgentOS).map((x) => ({ browser: x.userAgentBrowser, os: x.userAgentOS, visits: x.visits, views: x.views })),
    countries: merge(all("countries"), (d) => d.countryName).map((x) => ({ country: x.countryName, visits: x.visits, views: x.views })),
    perf: (misc.perf || []).map((x) => ({ device: x.dimensions.deviceType, n: x.count, load50: x.quantiles.pageLoadTimeP50, load90: x.quantiles.pageLoadTimeP90, fcp50: x.quantiles.firstContentfulPaintP50 })),
    comps: zmerge(zc),
    sessions: zmerge(zs),
    sampled: sampledRows(hours) || sampledRows(all("sources")) || sampledRows(zc),
    queries: q.account.length + (q.misc ? 1 : 0) + q.zone.length,
  };
}
