// 把 stats.html 包成 page.js（Worker 直接 import 字串）。改完 stats.html 後執行：node worker/build_page.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const html = readFileSync(new URL("stats.html", dir), "utf8");
writeFileSync(new URL("page.js", dir), "// 由 build_page.mjs 從 stats.html 產生，請改 stats.html\nexport default " + JSON.stringify(html) + ";\n");
console.log("page.js", html.length);
