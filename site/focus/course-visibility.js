/* A public chapter can contain deals from several original subjects. */
(function (root) {
  "use strict";
  const publishedSkills=Object.freeze(["combined","retention"]);
  const names=Object.freeze({combined:"最強盤面與利息",retention:"留牌練習",
    augment:"看盤面選增幅",route:"從 2-1 選陣容方向",routeAugment:"八四定陣後選增幅",transition:"D 牌前的過渡"});
  const isPublished=skill=>publishedSkills.includes(skill);
  const state=skill=>isPublished(skill)?"published":"pending";
  // The public build loads the two manifests before the UI requests either.
  const getOrder=()=>typeof module==="object" && module.exports ? require("./course-order.js") : root.FocusCourseOrder;
  const skillForQuestion=id=>getOrder().chapterOf(id);
  const isQuestionPublished=item=>getOrder().isActive(item);
  const visibility=Object.freeze({state,names,isPublished,publishedSkills,skillForQuestion,isQuestionPublished});
  if (typeof module==="object" && module.exports) {
    module.exports=visibility;
    if (require.main===module) process.stdout.write(JSON.stringify(publishedSkills));
  } else {
    root.FocusCourseVisibility=visibility;
  }
})(globalThis);
