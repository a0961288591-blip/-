# 标签词表 · Tag vocabulary

> 本文件由 `python -m istream schema --write` 从 `istream/vocab.py` 生成，请勿手改。
> Generated from istream/vocab.py — do not edit by hand.

## energy（能量 1–5）

| 值 | 中文 | English |
|---|---|---|
| `1` | 很平静 | very calm |
| `2` | 平稳 | calm |
| `3` | 中等 | medium |
| `4` | 有劲 | lively |
| `5` | 高能（慎用） | high (sparingly) |

## framing

| 值 | 中文 | English |
|---|---|---|
| `cu` | 特写：下巴到额头 | close-up, chin to forehead (mouth flaws most visible — use sparingly) |
| `mcu` | 近景：胸部以上 | medium close-up, mid-chest up (main talking shot) |
| `ms` | 中景：腰部以上 | medium shot, waist up (hands visible) |
| `mws` | 中远景：大腿以上 | medium-wide, thighs up (openings / desk shots) |

## aspect

| 值 | 中文 | English |
|---|---|---|
| `9:16` | 竖屏 | vertical |
| `16:9` | 横屏 | horizontal |
| `1:1` | 方屏 | square |

## angle

| 值 | 中文 | English |
|---|---|---|
| `front` | 正面 ±20° | frontal within ±20° |
| `l30` | 左 3/4 侧（≤30°） | three-quarter left, ≤30° |
| `r30` | 右 3/4 侧（≤30°） | three-quarter right, ≤30° |

## subject_pos

| 值 | 中文 | English |
|---|---|---|
| `left` | 人物在左三分之一 | subject on the left third |
| `center` | 人物居中 | subject centered |
| `right` | 人物在右三分之一 | subject on the right third |

## emotion

| 值 | 中文 | English |
|---|---|---|
| `neutral` | 中性 | neutral |
| `warm` | 亲和 / 带笑 | warm, smiling |
| `serious` | 严肃 / 专注 | serious, focused |
| `curious` | 好奇 / 提问 | curious, questioning |
| `confident` | 笃定 / 下结论 | confident, concluding |
| `empathetic` | 共情 / 安慰 | empathetic |
| `playful` | 轻松 / 俏皮 | playful |
| `surprised` | 惊讶（慎用） | surprised (use sparingly) |

## gesture

| 值 | 中文 | English |
|---|---|---|
| `none` | 无明显动作 | no notable gesture |
| `nod` | 单次点头 | single nod |
| `nod_multi` | 连续小点头 | several quick nods |
| `head_tilt` | 歪头 / 侧倾 | head tilt |
| `brow_raise` | 扬眉 | eyebrow raise |
| `soft_smile` | 浅笑承接：笑意从眼睛起、自然退去（E01） | eye-led soft smile that fades (E01) |
| `think_glance` | 思考一瞥：视线短暂上飘再回镜头（E03） | brief thinking glance away and back to the lens (E03) |
| `brow_furrow` | 轻皱眉：难点 / 提醒，随即舒展（E05） | light concerned furrow that releases (E05) |
| `soft_laugh` | 轻笑后收：鼻子里的短笑（E06） | short soft half-laugh, then settle (E06) |
| `soft_eyes` | 共情柔和：眼神放软（E09） | empathetic softening of the eyes (E09) |
| `knowing_look` | 会心一笑（E10） | knowing half smile (E10) |
| `sway` | 头部随语句轻摆 | head sways with the rhythm |
| `palms_open` | 双手摊开讲解 | both palms open, explaining |
| `palm_single` | 单手摊掌 | one open palm |
| `hands_together` | 双手合拢（总结） | hands come together (summing up) |
| `palm_present` | 掌心向上托举 / 呈现 | palm-up presenting (MG can sit on the palm) |
| `contrast_hands` | 两手对比：先一侧再另一侧（G03） | contrast hands, one side then the other (G03) |
| `hand_beat` | 节拍点：侧掌在腰前轻点（G05，安全版列点） | small side-palm beats at the waist (G05, safe list gesture) |
| `shrug` | 轻耸肩（G07） | small shrug (G07) |
| `size_frame` | 比划大小：两只平展手掌相对（G08） | flat palms frame a size (G08) |
| `hand_on_chest` | 手按胸口：锁骨以下（G09） | hand on chest, well below the collarbone (G09) |
| `steeple` | 指尖相触 / 尖塔手（G11） | steepled fingertips (G11) |
| `lean_in` | 身体前倾 | lean in |
| `lean_back` | 身体后靠 | lean back |
| `smile_greet` | 笑着打招呼 | greeting smile |
| `look_up_to_lens` | 抬眼看向镜头（开场） | lifts gaze to the lens (opening) |
| `turn_to_lens` | 转身回正面向镜头（开场） | turns to face the lens (opening) |
| `settle_in` | 坐定 / 调整入镜（开场） | settles into frame (opening) |
| `point_left` | 向画面左侧示意（不推荐） | points screen-left (discouraged) |
| `point_right` | 向画面右侧示意（不推荐） | points screen-right (discouraged) |
| `count` | 数手指（高风险，不推荐） | counting on fingers (high risk) |

## gaze

| 值 | 中文 | English |
|---|---|---|
| `lens` | 看镜头 | on the lens |
| `down` | 向下 | down |
| `off_left` | 看画面左侧 | off screen-left |
| `off_right` | 看画面右侧 | off screen-right |
| `up` | 向上（思考） | up (thinking) |

## mouth

| 值 | 中文 | English |
|---|---|---|
| `talking` | 说话状态（口型可替换） | speaking state (lip-sync replaceable) |
| `closed` | 闭嘴 | closed |
| `smile_closed` | 闭唇微笑 | closed-lip smile |
| `open_smile` | 露齿笑（口型替换风险高） | open smile (risky for lip-sync) |

## hands

| 值 | 中文 | English |
|---|---|---|
| `out_of_frame` | 手不入画 | hands out of frame |
| `low` | 手在腰前 / 画面下缘 | hands low / bottom edge |
| `chest` | 手在胸口高度 | hands at chest height |
| `near_face` | 手靠近脸（禁止进入自动拼接） | hands near face (excluded from auto-assembly) |

## head_motion

| 值 | 中文 | English |
|---|---|---|
| `still` | 几乎不动 | still |
| `small` | 小幅 | small |
| `medium` | 中等 | medium |
| `large` | 大幅（口型替换风险高） | large (lip-sync risk) |

## role

| 值 | 中文 | English |
|---|---|---|
| `open` | 开场：主播自然出现 | opening: the host naturally appears |
| `hook` | 钩子句 | hook line |
| `narrate` | 普通叙述 | plain narration |
| `explain` | 讲原因 / 解释 | explaining a reason |
| `story` | 讲故事 / 举例（适合 B-roll） | story / example (B-roll friendly) |
| `list` | 列点 ①②③ | list points |
| `data` | 数字 / 数据 | numbers / data |
| `question` | 提问 / 设问 | question |
| `emphasis` | 强调 / 金句 | emphasis / punchline |
| `agree` | 认同 / 肯定 | agreeing / affirming |
| `contrast` | 对比 / 两面 | contrast / two sides |
| `caveat` | 提醒 / 转折 / 难点 | caveat / turn / hard point |
| `think` | 思考 / 设想 | thinking aloud |
| `empathy` | 共情 / 安慰 | empathy / reassurance |
| `summary` | 总结 | summary |
| `pause` | 停顿 / 静场 | pause / silence |
| `listen` | 倾听 / 反应 | listening / reaction |
| `transition` | 章节过渡 | chapter transition |
| `close` | 收尾 | closing |
| `cta` | 关注 / 行动号召 | call to action |

## transition

| 值 | 中文 | English |
|---|---|---|
| `cut` | 硬切（同机位需配合缩放差） | hard cut (needs a scale change within the same setup) |
| `zoomcut` | 缩放跳切：100%↔112–125% | jump cut with punch-in/out |
| `broll_fade` | B-roll / 卡片与主播之间的 4–8 帧淡化 | 4–8 frame fade between B-roll/card and host |
| `mgwipe` | MG 擦除盖住接缝 | MG wipe covering the seam |
| `dip` | 闪白 / 闪黑 2–4 帧（慎用） | 2–4 frame dip (sparingly) |
| `first_only` | 只能做全片第一个镜头（开场入镜） | may only be the very first shot (opening) |

## layout

| 值 | 中文 | English |
|---|---|---|
| `full` | 主播全画面 | host full frame |
| `punch` | 数码推近 112–125% | digital punch-in 112–125% |
| `split` | 主播 + 侧边内容区（MG / 图文） | host plus a side content zone (MG/graphics) |
| `pip` | 主播缩成画中画，内容占主画面 | host shrunk to a PiP window, content takes the frame |
| `hidden` | 主播隐藏，只留配音（B-roll / 卡片） | host hidden, VO continues over B-roll/card |

## zone

| 值 | 中文 | English |
|---|---|---|
| `right_half` | 画面右半区 | right half |
| `left_half` | 画面左半区 | left half |
| `upper_band` | 顶部横带 | upper band |
| `lower_third` | 下三分之一 | lower third |
| `right_strip` | 右侧窄条 | right strip |
| `left_strip` | 左侧窄条 | left strip |
| `full` | 全画面（主播隐藏时） | full frame (host hidden) |

## defect

| 值 | 中文 | English |
|---|---|---|
| `dissolve` | 底板内含叠化（双影） | baked dissolve (double image) |
| `hard_cut` | 底板内含硬切 | baked hard cut |
| `baked_overlay` | 底板烧录了图形 / 乱码 | baked-in graphics / gibberish |
| `hand_glitch` | 手部畸形 | hand artifact |
| `identity_drift` | 身份漂移 | identity drift |
| `flicker` | 闪烁 / 曝光跳 | flicker / exposure jump |
| `mouth_blur` | 嘴部糊 | mouth blur |
| `extra_object` | 多余物体 / 人 | extra object or person |

## reversible

| 值 | 中文 | English |
|---|---|---|
| `no` | 不可倒放 | do not reverse |
| `ok` | 可倒放（需肉眼复核） | reversible, review by eye |
| `good` | 倒放几乎无痕 | reverses invisibly |

## jaw

| 值 | 中文 | English |
|---|---|---|
| `low` | 下颌动作小 | small jaw motion |
| `mid` | 下颌动作中等（最佳） | medium jaw motion (best for lip-sync) |
| `high` | 下颌动作大 | large jaw motion |

## provenance

| 值 | 中文 | English |
|---|---|---|
| `spec` | 按提示词时间线设计的预期标签（生成后必须复核） | expected tags from the prompt timeline (verify after generation) |
| `measured` | 自动测得（运动、人脸、静音、缺陷） | auto-measured (motion, face, silence, defects) |
| `reviewed` | 人工或 VLM 复核过 | reviewed by a human or a VLM |
