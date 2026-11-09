import {test} from 'node:test';
import assert from 'node:assert/strict';
import {themePresets,normalizeAppearance,appearanceTokens,semanticContrastPairs,contrastRatio,saveAppearance} from './appearance.mjs';
test('全部17套种子与24项语义对按WCAG复算，结构边界不低于3:1',()=>{
 for(const preset of themePresets){const t=appearanceTokens(normalizeAppearance(null,preset.id));for(const [fg,bg,min]of semanticContrastPairs)assert.ok(contrastRatio(t[fg],t[bg])>=min,`${preset.id} ${fg}/${bg}: ${contrastRatio(t[fg],t[bg])}`);}
});
test('不能在派生表面同时满足对比的自定义配色在保存前拒绝',()=>{
 let writes=0;assert.throws(()=>saveAppearance({setItem(){writes++;}}, {schemaVersion:1,preset:'custom',colors:{background:'#767676',text:'#ffffff',accent:'#aaddff'}}),/对比/);assert.equal(writes,0);
});
