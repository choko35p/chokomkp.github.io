// 瀏覽器載入資料。loadData 用 fetch；indexData 純函式（Node 測試用）。
const FILES = ['units', 'traits', 'items', 'augments', 'rules', 'enemies', 'unlocks'];
const OPTIONAL = new Set(['unlocks']);   // 允許 404（當成機制關閉）

export async function loadData(base = './data/') {
  const got = await Promise.all(FILES.map(async (n) => {
    let r;
    try { r = await fetch(base + n + '.json'); } catch (e) { if (OPTIONAL.has(n)) return { units: [] }; throw e; }
    if (!r.ok) {
      if (OPTIONAL.has(n)) return { units: [] };
      throw new Error('載入失敗：' + n + '.json（' + r.status + '）');
    }
    try { return await r.json(); } catch (e) { if (OPTIONAL.has(n)) return { units: [] }; throw e; }
  }));
  const raw = {};
  FILES.forEach((n, i) => { raw[n] = got[i]; });
  return indexData(raw);
}

function byKeyOf(list) {
  const m = {};
  for (const x of list) m[x.key] = x;
  return m;
}

// raw = { units, traits, items, augments, rules, enemies, unlocks? }（各檔 JSON 物件；unlocks 可省略）
export function indexData(raw) {
  const uList = raw.units.units || [];
  const tList = raw.traits.traits || [];
  const comps = raw.items.components || [];
  const iList = raw.items.items || [];
  const aList = raw.augments.augments || [];
  // recipes：「散件A+散件B」（字母序）-> 成品 key
  const recipes = {};
  for (const it of iList) {
    if (it.recipe && it.recipe.length === 2) recipes[it.recipe.slice().sort().join('+')] = it.key;
  }
  const ul = (raw.unlocks && raw.unlocks.units) || [];
  return {
    unlocks: { version: raw.unlocks && raw.unlocks.version, rule: (raw.unlocks && raw.unlocks.rule) || { guarantee: 'nextShop', slot: 'right' }, list: ul, byKey: byKeyOf(ul) },
    units: { byKey: byKeyOf(uList), list: uList, sprite: raw.units.sprite, starMult: raw.units.starMult, version: raw.units.version },
    traits: { byKey: byKeyOf(tList), list: tList, sprite: raw.traits.sprite },
    items: { byKey: byKeyOf(iList), components: comps, compByKey: byKeyOf(comps), recipes },
    augments: { byKey: byKeyOf(aList), list: aList },
    rules: raw.rules,
    enemies: raw.enemies,
  };
}
