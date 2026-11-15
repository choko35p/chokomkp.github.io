// 瀏覽器載入資料。loadData 用 fetch；indexData 純函式（Node 測試用）。
const FILES = ['units', 'traits', 'items', 'augments', 'rules', 'enemies'];

export async function loadData(base = './data/') {
  const got = await Promise.all(FILES.map(async (n) => {
    const r = await fetch(base + n + '.json');
    if (!r.ok) throw new Error('載入失敗：' + n + '.json（' + r.status + '）');
    return r.json();
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

// raw = { units, traits, items, augments, rules, enemies }（各檔 JSON 物件）
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
  return {
    units: { byKey: byKeyOf(uList), list: uList, sprite: raw.units.sprite, starMult: raw.units.starMult, version: raw.units.version },
    traits: { byKey: byKeyOf(tList), list: tList },
    items: { byKey: byKeyOf(iList), components: comps, compByKey: byKeyOf(comps), recipes },
    augments: { byKey: byKeyOf(aList), list: aList },
    rules: raw.rules,
    enemies: raw.enemies,
  };
}
