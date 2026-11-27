/* Course placement is independent of a question's immutable deal and grading ID. */
(function (root) {
  "use strict";
  const tiers = ["basic", "advanced", "challenge"];
  const chapters = ["combined", "retention", "augment", "route", "routeAugment", "transition", "archive"];
  const combined = [
    // Isolate the front line, the back line, a sale, a pair, then an upgrade.
    ["board-02","board-01","interest-01","interest-02","interest-03"],
    // One funded swap or upgrade, the price of an extra slot, then linked swaps.
    ["board-03","interest-07","interest-05","interest-04","board-04",
     "interest-06","interest-08","board-06","board-05","board-09"],
    // Two new fielded units through challenge nine, then three-unit rebuilds.
    ["interest-09","board-14","board-07","board-13","board-15",
     "interest-11","interest-12","interest-13","interest-17","interest-18",
     "board-10","board-11","board-12","board-16","board-18"]
  ];
  const retention = [
    [1,2,3,4,5],
    [6,8,10,9,11,12,13,16,14,15],
    [7,17,18,19,20,21,22,23,25,26,27,28,29,30]  // 站主 2026-11-27：挑戰 9（retention-24）不做了，從公開課表拿掉
  ].map(group=>group.map(n=>"retention-"+String(n).padStart(2,"0")));
  const placements = new Map();
  for (const [skill,groups] of Object.entries({combined,retention})) {
    for (const [level,ids] of groups.entries()) {
      ids.forEach((id,i)=>placements.set(id, {skill,tier:tiers[level],number:i+1,total:ids.length}));
    }
  }

  const idOf = item => typeof item === "string" ? item : item?.id;
  function chapterOf(item) {
    const id = idOf(item);
    const active = placements.get(id);
    if (active) return active.skill;
    const former = /^(board|interest)-(0[1-9]|1[0-9])$/.test(id);
    if (former) return "archive";
    if (typeof item === "object" && item) return item.skill;
    const pending = /^(route-aug|route|augment|transition)-(0[1-9]|1[0-9])$/.exec(id);
    return pending?.[1] === "route-aug" ? "routeAugment" : pending?.[1];
  }
  function tierOf(item) {
    const slot = placements.get(idOf(item));
    return slot?.tier ?? (typeof item === "object" ? item?.tier : undefined);
  }
  const isActive = item => placements.has(idOf(item));
  function rank(order,value) {
    const index=order.indexOf(value);
    return index<0 ? order.length : index;
  }
  function sort(questions) {
    const entries=questions.map((q,i)=>{
      if (q.study) return {q,key:[1,i]};
      const chapter=chapterOf(q);
      const head=[0,rank(chapters,chapter),rank(tiers,tierOf(q))];
      const slot=placements.get(q.id);
      if (slot) return {q,key:[...head,slot.number,i]};
      const opening=q.steps?.[0]?.round || q.rounds?.[0] || q.round;
      const round=/^(\d+)-(\d+)$/.exec(opening?.id);
      const ordinal=/(\d+)$/.exec(q.id);
      return {q,key:[...head,round ? Number(round[1]) : Infinity,
        round ? Number(round[2]) : Infinity, ordinal ? Number(ordinal[1]) : Infinity,i]};
    });
    entries.sort((a,b)=>{
      for (let i=0;i<Math.min(a.key.length,b.key.length);i++) {
        if (a.key[i]!==b.key[i]) return a.key[i]-b.key[i];
      }
      return a.key.length-b.key.length;
    });
    return entries.map(row=>row.q);
  }
  function position(questions,id) {
    const selected=questions.find(q=>q.id===id);
    if (!selected) return null;
    const slot=placements.get(id);
    if (slot) return {...slot};
    const skill=chapterOf(selected),tier=tierOf(selected);
    const group=sort(questions.filter(q=>chapterOf(q)===skill && tierOf(q)===tier));
    return {skill,tier,number:group.indexOf(selected)+1,total:group.length};
  }
  const api=Object.freeze({sort,position,chapterOf,tierOf,isActive});
  if (typeof module==="object" && module.exports) module.exports=api;
  else root.FocusCourseOrder=api;
})(globalThis);
