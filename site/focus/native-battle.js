/* Connect campaign pieces to the same combat engine used by the site's S19 Trials. */
(function (root) {
  "use strict";

  function normalizePiece(piece, cell, data, catalog) {
    if (!Number.isInteger(cell) || cell < 0 || cell > 27) throw new Error("戰鬥棋格超出半場。");
    const key = (piece.key || piece.id).replace(/^TFT19_/, "");
    if (!data.units.byKey[key]) throw new Error("站內試煉資料沒有棋子 " + key);
    const items = (piece.items || []).map(name => {
      const translated = catalog?.items?.[name]?.key || name;
      if (data.items.byKey[translated] || data.items.compByKey[translated]) return translated;
      const found = [...Object.values(data.items.byKey), ...data.items.components].find(item => item.zh === name);
      if (!found) throw new Error("站內試煉資料沒有裝備 " + name);
      return found.key;
    });
    return {key, star:piece.star || 1, items, pos:[Math.floor(cell / 7), cell % 7]};
  }

  function neighbors({row,col}) {
    const right = col + row % 2;
    return [[row,col+1],[row,col-1],[row-1,right],[row-1,right-1],[row+1,right],[row+1,right-1]]
      .filter(([r,c]) => r >= 0 && r < 8 && c >= 0 && c < 7).map(([row,col]) => ({row,col}));
  }

  // Planning uses the same half-board coordinates as the native combat context.
  // A lesson can pre-place the instrument so its single exercise stays about team selection.
  function lessonInstruments(state, round) {
    if (!round.instrumentBeside) return undefined;
    const i = state.board.findIndex(p => p?.id === round.instrumentBeside);
    if (i < 0) return [];
    const adjacent = neighbors({row:4 + Math.floor(i / 7),col:i % 7});
    const cell = adjacent.find(({row,col}) => row >= 4 && !state.board[(row-4)*7+col]);
    return cell ? [[cell.row-4,cell.col]] : [];
  }

  function run(state, round, scenario, catalog) {
    const runtime = root.TrialsTrainingNativeRuntime;
    if (!runtime || round.type !== "pvp") return null;
    const {data, buildTeam, simulate, hashSeed, makeRng} = runtime;
    const toPieces = (rows, owned) => rows.flatMap((piece, index) =>
      piece ? [normalizePiece(piece, owned ? index : piece.cell, data, catalog)] : []);
    const mine = toPieces(state.board, true);
    const foe = toPieces(round.opponent.units, false);
    const sequence = state.roundIndex + 1;
    const seed = hashSeed(scenario.seed ?? scenario.id, round.id, "training");
    const makeContext = (level, augments, persist, side) => ({
      level, round:sequence, augments, persist,
      rng:makeRng(hashSeed(seed, side, "items"))
    });
    const persist = JSON.parse(JSON.stringify(state.combatPersist || {}));
    const playerContext = makeContext(state.level, state.augments, persist, "player");
    if (round.instrumentBeside) playerContext.instruments = lessonInstruments(state, round);
    const myTeam = buildTeam("player", mine, data, playerContext);
    const enemyTeam = buildTeam("enemy", foe, data, makeContext(round.opponent.level || foe.length, round.opponent.augments || [], {}, "enemy"));
    const result = simulate({seed, teams:[myTeam, enemyTeam], persist, opts:{record:true, round:sequence}});
    const {playerAlive, enemyAlive, byUnit} = result.summary;
    const units = result.units.map(u => ({
      id:u.id, key:u.key, name:u.zh, side:u.side,
      damage:Math.round(byUnit[u.id].dmg), taken:Math.round(byUnit[u.id].taken),
      kills:byUnit[u.id].kills, casts:byUnit[u.id].casts
    }));
    return {
      won:result.winner === "player", winner:result.winner, seconds:result.seconds,
      playerAlive, enemyAlive, units, result, source:"chokomkp-trials"
    };
  }

  // Production integration can import the unmodified native modules directly
  // from /trials/ so the official site and its courses refresh together.
  async function connect(base = "/trials/") {
    if (root.TrialsTrainingNativeRuntime) return;
    const dir = new URL(base.endsWith("/") ? base : base + "/", location.href);
    const [stats, engine, data, rng] = await Promise.all(
      ["stats", "engine", "data", "rng"].map(name => import(new URL("js/" + name + ".js", dir).href))
    );
    const tables = await data.loadData(new URL("data/", dir).href);
    if (!/^s19(?:$|[^0-9])/i.test(tables.units?.version || "") ||
        ![stats.buildTeam, engine.simulate, rng.hashSeed, rng.makeRng].every(fn => typeof fn === "function")) {
      throw new Error("站內戰鬥模組未提供相容的 S19 資料。");
    }
    root.TrialsTrainingNativeRuntime = {
      data:tables,
      buildTeam:stats.buildTeam, simulate:engine.simulate,
      hashSeed:rng.hashSeed, makeRng:rng.makeRng
    };
  }

  root.SimNativeBattle = {run, connect, lessonInstruments, neighbors, get ready() { return !!root.TrialsTrainingNativeRuntime; }};
})(globalThis);
