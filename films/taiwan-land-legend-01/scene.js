// 画面：一场一个小舞台。时间一律从 timeline.json 取（STAGE.at / STAGE.beat），不手填秒数。
const {scene, word, row, sfx, TX, LOOK, at, beat, W, H, kf, spline, clamp} = STAGE;
const {person, actor, drop, rise, slap, dust, shakeOf, ring_, out, plus} = ACTS;   // 动作语法（engine.md）
