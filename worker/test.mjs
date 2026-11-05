import { verifyAccess, buildStats, windows, chunks } from "./index.js";
import worker from "./index.js";
import { generateKeyPairSync, createSign } from "node:crypto";
let ok=0, bad=0; const t=(name,c)=>{ if(c){ok++;} else {bad++; console.log("FAIL",name);} };

// JWT
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
const b64u = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const mk = (payload, key = privateKey, kid="k1") => { const h=b64u({alg:"RS256",kid}), p=b64u(payload); const s=createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url"); return `${h}.${p}.${s}`; };
const env = { ACCESS_TEAM: "choko", ACCESS_AUD: "AUD1", ACCOUNT_ID:"A", ZONE_ID:"Z", SITE_TAG:"S", CF_API_TOKEN:"x", ASSETS:{ fetch: async()=> new Response("asset") } };
const certFetch = async (u) => { t("certs url", u === "https://choko.cloudflareaccess.com/cdn-cgi/access/certs"); return new Response(JSON.stringify({ keys: [jwk] })); };
const now = Date.now()/1000;
const good = { aud: ["AUD1"], exp: now + 600, iss: "https://choko.cloudflareaccess.com", email: "me@x" };
const req = (tok, cookie) => new Request("https://chokomkp.com/stats", { headers: { ...(tok ? { "cf-access-jwt-assertion": tok } : {}), ...(cookie ? { cookie } : {}) } });
t("good", (await verifyAccess(req(mk(good)), env, certFetch)).ok === true);
t("cookie", (await verifyAccess(req(null, "a=1; CF_Authorization=" + mk(good)), env, certFetch)).ok === true);
t("no token", (await verifyAccess(req(null), env, certFetch)).why === "login");
t("wrong aud", (await verifyAccess(req(mk({ ...good, aud: ["X"] })), env, certFetch)).ok === false);
t("expired", (await verifyAccess(req(mk({ ...good, exp: now - 5 })), env, certFetch)).ok === false);
t("wrong iss", (await verifyAccess(req(mk({ ...good, iss: "https://evil.cloudflareaccess.com" })), env, certFetch)).ok === false);
const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
t("forged sig", (await verifyAccess(req(mk(good, other)), env, certFetch)).ok === false);
t("tampered", (await verifyAccess(req(mk(good).replace(/\.[^.]+\./, "." + b64u({ ...good, email: "evil" }) + ".")), env, certFetch)).ok === false);
t("alg none", (await verifyAccess(req(b64u({alg:"none",kid:"k1"})+"."+b64u(good)+"."), env, certFetch)).ok === false);
t("setup missing", (await verifyAccess(req(mk(good)), { ...env, ACCESS_AUD: "" }, certFetch)).why === "setup");
t("spoofed email header only", (await verifyAccess(new Request("https://chokomkp.com/stats",{headers:{"cf-access-authenticated-user-email":"me@x"}}), env, certFetch)).ok === false);

// routing (no access configured → 403, never data)
const r1 = await worker.fetch(new Request("https://chokomkp.com/stats"), { ...env, ACCESS_TEAM: "" });
t("403 when not set up", r1.status === 403 && /還沒設定好/.test(await r1.text()));
const r2 = await worker.fetch(new Request("https://chokomkp.com/stats/api?range=today"), { ...env, ACCESS_TEAM: "" });
t("api 403", r2.status === 403);
const r3 = await worker.fetch(new Request("https://chokomkp.com/"), env);
t("other paths go to assets", (await r3.text()) === "asset");
const r4 = await worker.fetch(new Request("https://chokomkp.com/statsx"), env);
t("statsx is asset", (await r4.text()) === "asset");

// windows / chunks
const N = Date.parse("2026-11-05T13:30:00Z");
const w = windows("today", N); t("today start TW midnight", new Date(w.start).toISOString() === "2026-11-04T16:00:00.000Z");
t("prev yesterday", new Date(w.prevStart).toISOString() === "2026-11-03T16:00:00.000Z" && w.prevEnd === N - 86400e3);
t("chunks 30d", chunks(0, 30*86400e3).length === 5 && chunks(0,30*86400e3)[0][0] === 0);

// buildStats with fake GraphQL
const calls=[];
const fake = async (u, init) => {
  const q = JSON.parse(init.body).query; calls.push(q);
  t("auth header", init.headers.authorization === "Bearer x");
  if (q.includes("zones(")) return new Response(JSON.stringify({ data: { viewer: { zones: [{ comps: [{ count: 3, avg:{sampleInterval:1}, dimensions: { clientRequestPath: "/data/items/ahri_z.json", clientDeviceType: "mobile" } }], sessions: [{ count: 5, avg:{sampleInterval:1}, dimensions: { clientRequestPath: "/data/site-data.json", clientDeviceType: "mobile" } }] }] } } }));
  if (q.includes("hours:")) return new Response(JSON.stringify({ data: { viewer: { accounts: [{ hours: [{ count: 10, sum: { visits: 4 }, avg:{sampleInterval:1}, dimensions: { datetimeHour: "2026-11-05T04:00:00Z" } }], sources: [{ count: 7, sum: { visits: 3 }, avg:{sampleInterval:1}, dimensions: { refererHost: "" } }, { count: 3, sum: { visits: 0 }, avg:{sampleInterval:1}, dimensions: { refererHost: "chokomkp.com" } }], devices: [], browsers: [], countries: [] }] } } }));
  return new Response(JSON.stringify({ data: { viewer: { accounts: [{ p0: [{ count: 2, sum: { visits: 1 }, avg:{sampleInterval:1} }], lastHour: [{ count: 1, sum: { visits: 1 }, avg:{sampleInterval:1} }], perf: [] }] } } }));
};
const d = await buildStats(env, "today", true, fake, N);
t("total", d.total.visits === 4 && d.total.views === 10);
t("prev null before launch", d.prev === null);
t("sources filtered", d.sources.length === 1 && d.sources[0].visits === 3);
t("comps", d.comps[0].n === 3 && d.sessions[0].n === 5);
t("country filter", calls.every(q => q.includes('ountryName: "TW"')));
t("not sampled", d.sampled === false);
const d30 = await buildStats({ ...env, SITE_SINCE: "2026-08-01T00:00:00Z" }, "30d", false, fake, N);
t("30d sums 5 chunks", d30.total.visits === 20 && d30.queries === 11 && d30.prev.visits === 1);
t("no TW filter", !calls.slice(-11).some(q => q.includes('"TW"')));
// gql error
let err=null; try { await buildStats(env,"today",true, async()=> new Response(JSON.stringify({errors:[{message:"bad"}]}),{status:200}), N);} catch(e){err=e.message}
t("gql error surfaced", /bad/.test(err||""));
let e2=null; try { await buildStats({...env, CF_API_TOKEN:""},"today",true,fake,N);} catch(e){e2=e.message} t("no token msg", /金鑰/.test(e2||""));
console.log("ok",ok,"fail",bad);
