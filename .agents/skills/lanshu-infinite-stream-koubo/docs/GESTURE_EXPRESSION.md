# 手势与表情 · Gesture & Expression（v1.3 · P0）

> 用户反馈：数字人视频里缺少真人常见的行为，尤其是**手势**和**常见面部表情**。
> 本文给出可复用底板用的**表情词表（E01–E10）**、**手势词表（G01–G11）**、例时间线、脚本到标签的映射、提示词补丁和入库评分加项。
> 状态：待验证：还没有在真实视频模型上跑过；手势 / 表情补丁和 K04 / K05 都按推测方案处理，跑完 docs/GESTURE_EXPRESSION.md §I 的 Phase 0 A/B 之前不要当成已验证
> 本文由 `tools/build_gesture_expression_doc.py` 从 `prompts/overlays/gesture_expression.json` 生成，词表、时间线、补丁和评分卡都以 JSON 为准，不要手改本文。

**硬规则不变：**
- 嘴永远不被挡，手不碰脸 / 嘴 / 下巴 / 头发。
- 切点（0.5 / 7.5 / 14.5 / 21.5 / 29.0 秒）在回位。
- 头部 ±20°，机位锁死，无首饰 / 眼镜 / logo。
- 能量仍然是“可复用”的中低档。
- 手势像**访谈主持人**，不是短视频舞蹈，也不是舞台表演。
- 所有补丁都在复制时叠加，不改 `library.json`：K01–K03 定稿逐字不变，`prompts verify` 照常通过。

```bash
python3 -m istream prompts overlay --plate K02 --lang both --negative --gesture            # 真人感 + 手势表情（叠加）
python3 -m istream prompts overlay --overlay gesture_expression --plate K02 --negative     # 只叠手势表情
python3 -m istream prompts overlay --plate K04 --lang zh --negative --gesture              # 新：中景手势密集底板
python3 -m istream prompts overlay --plate K05 --lang en --compact --negative --gesture    # 新：近景表情密集底板
python3 -m istream catalog build-spec --overlay gesture_expression --out catalog/gesture  # 预期标签目录（含 K04 / K05）
python3 -m istream plan recipes/gesture/script.md --cat catalog/gesture/plates.json --aspect 9:16 --out /tmp/tl.json
```

---

## A. 差距诊断：现有底板为什么“不像人在说话”

### A.1 逐段看 GENERATE_PACK 里的时间线

| 底板 · 段 | 现在写的 | 问题 |
|---|---|---|
| K01 s1 1–7 s | 平静叙述，重音处缓慢小幅点头，肩部几乎不动 | 整段只有“点头”一种动作。HUMAN_PREMIUM 已把“缓慢点头”改成不规律点头，但表情仍然只有中性一种 |
| K01 s2 8–14 s | 头轻微左倾，关键词处扬眉一次 | 这是全条唯一的“思考 / 好奇”信号。没有视线移开再回来的思考一瞥，真人说“其实……”之前几乎都会有 |
| K01 s3 15–21 s | 明亮温暖的笑容 + 欢迎点头 | 笑容是“开场打招呼”式的，没有说话中途那种起了又退的浅笑 |
| K01 s4 22–28 s | 闭唇倾听，缓慢点头两次 | “缓慢点头两次”是等间隔信号，倾听脸没有任何反应变化 |
| K02 s1 1–7 s | 双手腰前轻握，小幅点头 | 6 秒双手“焊死”，中景最常见的 AI 破绽：手像道具 |
| K02 s2 8–14 s | 双手在胸口高度向外摊开 | 两只手同时、对称地摊开，镜像同步，像机器人；高度写在“胸口”，正好贴着上限 |
| K02 s3 15–21 s | 右手腰部高度一个小摊掌 | 和 s2 同一类“摊开”动作，手势词汇只有一种意思（“我在讲解”） |
| K02 s4 22–28 s | 双手胸前合拢 + 点头 | 可用；但没有表情变化（笃定收句的“落定”感） |
| K02 避免词 | 数手指、指向、挥手、手过胸口 | 禁得对，但禁完之后，列点 / 对比 / 让步这几类最常见的口播意图**没有任何安全手势可用** |
| K03 s2 8–14 s | 连续三个快速小点头 | 节拍器式三连点，是 HUMAN_PREMIUM 评分卡第 4 项要抓的典型问题 |
| K03 s3 15–21 s | 眉头因专注极轻收拢（不是皱眉） | 方向对，但“只收不放”，没有写“随即舒展” |
| K03 s4 22–28 s | 短暂温暖一笑，身体后靠 | 笑没有“起—落” |
| O01 | 抬眼、转身、前倾、坐定 + 笑着打招呼 | 开场专用，四段都是 `smile_greet` 一类，不能当正文表情用 |

### A.2 用数字看（预期标签目录，自动统计）

| 指标 | v1.2 `catalog/spec` | v1.3 `catalog/gesture`（叠加层） |
|---|---|---|
| 预期镜头数 | 36 | 44 |
| 不同的表情 / 头部标签 | 11：brow_raise, head_tilt, lean_back, lean_in, look_up_to_lens, nod, nod_multi, settle_in, smile_greet, sway, turn_to_lens | 17：brow_furrow, brow_raise, head_tilt, knowing_look, lean_back, lean_in, look_up_to_lens, nod, nod_multi, settle_in, smile_greet, soft_eyes, soft_laugh, soft_smile, sway, think_glance, turn_to_lens |
| 不同的手势标签 | 4：hands_together, palm_present, palm_single, palms_open | 7：contrast_hands, hand_beat, hands_together, palm_present, palm_single, palms_open, shrug |
| 带手势的中景镜头 | 7 | 11 |
| 能接 `agree` 意图的镜头 | 0 | 4 |
| 能接 `contrast` 意图的镜头 | 0 | 1 |
| 能接 `caveat` 意图的镜头 | 0 | 4 |
| 能接 `think` 意图的镜头 | 0 | 3 |
| 能接 `empathy` 意图的镜头 | 0 | 1 |

### A.3 HUMAN_PREMIUM（v1.2）解决了什么、没解决什么

- **已解决：** 静止时也在呼吸、眨眼不规律、表情不对称、点头不规律、皮肤和光。这些是“活着”的底噪。
- **没解决：**
  - **说话时“在做什么”**：什么意图配什么表情、什么手势，没有词表；
  - **中景手的语法**：从哪出发、到哪、多高、多久、什么时候回；
  - **脚本侧**：没有办法写“这句要对比手势”。
- 所以视频“活着但不在交流”。

### A.4 三个根因

1. **底板词汇太窄**：表情只有中性 / 好奇 / 温暖，手势只有“摊开”一族。切片再多，也只能重组同几种动作。
2. **禁止词没有配替代动作**：禁了数手指和指向，却没给“列点用节拍点、对比用两手分侧”。模型和剪辑都只能回到“手握腰前”。
3. **意图没有对上标签**：脚本里写“但是”“一方面……另一方面”时，规划器不知道该找什么镜头。v1.3 加了新的 role 和 `[手势:]` / `[表情:]` 标记（见 §E）。

---

## B. 表情词表（P0，10 项）

**通用规则：**
- 表情**小、短、略不对称**：峰值约 0.5–1.5 秒，然后回到放松的中性脸。
- 嘴始终可见、可以送口型。
- 近景、中景都能用。
- 倾听类表情（E07）只在闭嘴段，不送口型。

#### E01 浅笑承接 · Soft smile（`soft_smile`）

- **什么时候用：** 开场、话题落地后、亲和的过渡句
- **表演提示 EN：** A soft smile rises in her eyes first while her lips stay relaxed or just part, then it fades back to neutral within about a second.
- **表演提示 ZH：** 笑意先出现在眼睛里，嘴唇放松或只微微分开，大约一秒内自然退回中性。
- **不要：** 一直挂着的笑、露出一整排牙、左右完全对称的“面具笑”
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 等笑意退了再回位；不要在笑的峰值上切

#### E02 认同点头 · Agreeing nod（`nod`）

- **什么时候用：** “对 / 没错 / 确实”、反问之后、肯定自己的观点
- **表演提示 EN：** One or two small nods at uneven moments with a slight lift of the brows, as if agreeing with what she just said.
- **表演提示 ZH：** 在不规律的时刻小幅点头一两次，眉毛微抬，像在认同自己刚说的话。
- **不要：** 等间隔三连点、像摇头娃娃一样连续点
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 点头之间可以切；不要切在头最低点

#### E03 思考一瞥 · Thinking glance（`think_glance`）

- **什么时候用：** “其实……”、设问之前、要说出一个洞察之前
- **表演提示 EN：** Before the key phrase her eyes drift briefly up and to the side as if finding the right word, then come back to the lens with a small nod.
- **表演提示 ZH：** 说到关键句之前，目光短暂地向斜上方飘一下，像在找合适的词，然后回到镜头，轻轻一点头。
- **不要：** 翻白眼、视线离开镜头超过 1 秒、思考时嘴张着不动
- **适用底板：** 近景 MCU / 中景 MS · 风险 mid
- **切点 / 切片：** 切点前视线至少回到镜头 0.5 秒；适合放在句首或停顿里，口型更安全

#### E04 扬眉点题 · Brow lift on the key word（`brow_raise`）

- **什么时候用：** 重音词、意外的数据、列点里的每一项
- **表演提示 EN：** Her brows lift briefly on the stressed word and her eyes open a touch, then everything relaxes again.
- **表演提示 ZH：** 在重音词上眉毛短暂上扬，眼睛略微睁大一点，然后整张脸放松下来。
- **不要：** 眉毛一直扬着、卡通式惊讶
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 峰值 ≤ 0.5 秒；可以和推近一起用

#### E05 轻皱眉（难点 / 提醒） · Concerned furrow（`brow_furrow`）

- **什么时候用：** “但是 / 注意 / 坑 / 风险”、说到难点
- **表演提示 EN：** On the hard word her brows draw slightly together with a small concerned head tilt and a softer voice, then they release.
- **表演提示 ZH：** 说到难点时眉头轻轻收拢，头微微一侧，语气放软，随即舒展开。
- **不要：** 生气地怒视、深深的皱眉纹一直不散、嘴角往下撇
- **适用底板：** 近景 MCU / 中景 MS · 风险 mid
- **切点 / 切片：** 回位前眉头必须完全舒展

#### E06 轻笑后收 · Soft laugh, then settle（`soft_laugh`）

- **什么时候用：** 轻松自嘲、“我们都这样”、俏皮的插话
- **表演提示 EN：** A short soft laugh through the nose with a small lift of the shoulders, then she settles straight back into calm speaking.
- **表演提示 ZH：** 从鼻子里出来的一声短促轻笑，肩膀微微一抬，然后立刻回到平静的说话状态。
- **不要：** 张大嘴笑、头往后仰、长时间闭眼大笑
- **适用底板：** 近景 MCU / 中景 MS · 风险 mid
- **切点 / 切片：** 不放在切点；回位前嘴已闭合（大笑会让口型替换失效）

#### E07 倾听脸 · Listening face（`head_tilt`）

- **什么时候用：** 停顿、抛出问题之后、“你可能会问”的反应镜头
- **表演提示 EN：** Lips closed, a slight head tilt and engaged eyes, two small nods at uneven moments and a brief quiet half smile.
- **表演提示 ZH：** 嘴唇闭合，头微微一侧，眼神投入，在不规律的时刻小幅点头两次，偶尔浮现一个安静的浅笑。
- **不要：** 眼神发直、嘴在动
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 闭嘴段不送口型；可以整段用作停顿 / 反应镜头

#### E08 笃定收句 · Confident close（`nod`）

- **什么时候用：** 总结、结论、行动号召的最后一个字
- **表演提示 EN：** Her chin stays level, she gives one small downward nod on the last word and her lips close into a calm, settled half smile.
- **表演提示 ZH：** 下巴保持水平，在最后一个字上轻轻向下点头一次，双唇合上，落成一个平静笃定的浅笑。
- **不要：** 得意的坏笑、用力点头
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 很适合直接接回位；是最安全的段尾

#### E09 共情柔和 · Empathetic softening（`soft_eyes`）

- **什么时候用：** “我知道这很难”、说到观众的痛点
- **表演提示 EN：** Her eyes soften, the inner corners of her brows lift slightly, her head tilts a little and a gentle half smile appears.
- **表演提示 ZH：** 眼神变得柔和，眉头内侧微微上抬，头轻轻一侧，嘴角浮现一个温和的浅笑。
- **不要：** 可怜兮兮的表情、夸张的难过
- **适用底板：** 近景 MCU / 中景 MS · 风险 low
- **切点 / 切片：** 适合配慢一点的语速

#### E10 会心一笑（“你懂的”） · Knowing look（`knowing_look`）

- **什么时候用：** “对吧？”、“你懂的”、分享一个内行人的小观察
- **表演提示 EN：** A slightly one-sided half smile with a tiny brow lift and a small nod toward the lens, like sharing an insider point.
- **表演提示 ZH：** 略偏一侧的浅笑，配一点点扬眉，朝镜头轻轻一点头，像在分享一个内行人才懂的点。
- **不要：** 眨单眼、坏笑、挑眉过头
- **适用底板：** 近景 MCU / 中景 MS · 风险 mid
- **切点 / 切片：** 峰值短；不要接在严肃句后面

---

## C. 手势词表（P0，11 项 · 只用于中景 MS，手在画内）

**共同语法（每个手势都必须满足）：**

1. **回位 → 手势 → 回位**：双手从腰前轻握出发，手势落在重音词上，约 2 秒内（最多 2.5 秒）回到腰前；下一个切点前至少静 0.5 秒。
2. **高度上限**：腰部到胸口略低处。**绝不高过胸口，绝不靠近脸、下巴、头发**。手按胸口（G09）必须在锁骨以下。
3. **大多一次一只手**；两只手同时动时要前后错开半拍，**绝不镜像同步**。
4. **手指放松微弯**；不比任何手势符号（OK、比耶、点赞、比心），不用食指指镜头，手里不拿道具。
5. **一段（6 秒）最多两个手势**，相邻两段不用同一个手势；同一手势不按节拍重复。
6. **能量中档**：像坐在对面的访谈主持人，不是演讲台，更不是短视频舞蹈。

**近景规则（MCU）：**
- 近景（MCU：K01 / K03 / K05 / O01 / K01H）双手永远不入画——只靠表情、眼神、呼吸和肩膀；手势只属于腰部以上的中景（MS：K02 / K04 / L02）。近景里一旦手进画面，这一段只能裁掉或淘汰。
- *Close-ups (MCU: K01 / K03 / K05 / O01 / K01H) keep the hands out of frame for good — life comes from expression, eyes, breath and shoulders only. Hand gestures belong to waist-up medium shots (MS: K02 / K04 / L02). If a hand enters an MCU take, crop that span or reject it.*
- K01 / K03 的叠加补丁只加表情，不加任何手部动作。

#### G01 摊手讲解 · Open-palm explain（`palms_open`）

- **路径：** 腰前轻握 → 双手在胸口略低处向外摊开（一只手略早、略高）→ 回到腰前合拢
- **幅度上限：** 手不高过胸口；左右各不超过身体外侧一拳
- **时长 / 回位：** 1.5–2 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** Both palms open outward at lower-chest height in a relaxed explaining gesture, one hand slightly ahead of the other, then come back together at the waist.
- **表演提示 ZH：** 双手在胸口略低处向外摊开，做一个放松的讲解手势，一只手略早于另一只，然后回到腰前合拢。
- **不要：** 两手完全对称同步、摊得太宽像拥抱
- **风险：** low

#### G02 单手递出（“就是这个”） · Palm-up offer（`palm_single`）

- **路径：** 腰前 → 一只手掌心向上，向镜头方向前送约 10 厘米 → 停半拍 → 回到腰前
- **幅度上限：** 腰到胸口之间；不伸直手臂，不伸到镜头前
- **时长 / 回位：** 1–1.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** One hand turns palm-up and offers the idea a little forward toward the lens at waist height, holds for half a beat, then returns to the waist.
- **表演提示 ZH：** 一只手掌心向上，在腰部高度把观点轻轻向镜头方向“递”出去一点，停半拍，再回到腰前。
- **不要：** 用食指指镜头、手伸到镜头前挡脸
- **风险：** low

#### G03 两手对比（“一方面……另一方面”） · Contrast hands（`contrast_hands`）

- **路径：** 腰前 → 左手掌心向上移到身体左侧 → 右手移到身体右侧（略晚半拍）→ 两手回到腰前
- **幅度上限：** 腰部高度；每只手离身体不超过一个前臂
- **时长 / 回位：** 2–2.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** As she compares two options, one hand opens palm-up to one side at waist height, then the other hand to the other side half a beat later, and both return to the waist.
- **表演提示 ZH：** 比较两个选项时，一只手在腰部高度掌心向上移到一侧，另一只手晚半拍移到另一侧，然后两手回到腰前。
- **不要：** 两手同时镜像、像在称重一样上下晃
- **风险：** mid

#### G04 计数 1-2-3（高风险） · Counting 1-2-3 (high risk)（`count`）

- **路径：** 腰前 → 一只手抬到胸口略低处，掌心略朝向自己，依次伸出食指、中指、无名指 → 回到腰前
- **幅度上限：** 只用一只手；手指放松微弯；不高过胸口
- **时长 / 回位：** 2–3 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** One hand rises to lower-chest height, palm turned slightly toward her, and counts one, two, three by raising the index, middle and ring fingers in turn, relaxed and natural, then returns to the waist.
- **表演提示 ZH：** 一只手抬到胸口略低处，掌心略朝向自己，依次伸出食指、中指、无名指数一、二、三，手指放松自然，然后回到腰前。
- **不要：** 两只手一起数、手指僵直张开、比出 OK；数到“二”时掌心必须朝向自己、两指并拢微弯，掌心朝外分开就是比耶（GE7 一票否决）。AI 生成手指出错率最高：至少抽 6 次，过不了就改用 G05 + 字幕 ①②③
- **风险：** high（高风险 · 待验证，默认用 G05 + 字幕 ①②③ 代替）

#### G05 节拍点（安全版列点） · Beat marks（`hand_beat`）

- **路径：** 腰前 → 一只手侧掌（掌心朝侧面）在腰部高度做两三下轻微的向下点 → 回到腰前
- **幅度上限：** 幅度一拳以内；点与点间隔不均匀
- **时长 / 回位：** 1.5–2.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** Listing short points, one relaxed hand makes two or three small downward beats at waist height, palm turned sideways, each landing on a stressed word at uneven intervals, then it returns to the waist.
- **表演提示 ZH：** 列举几个短点时，一只放松的手侧掌在腰部高度轻轻向下点两三下，每一下落在一个重音词上，间隔不均匀，然后回到腰前。
- **不要：** 节拍器式均匀敲击、像在切菜
- **风险：** low

#### G06 合手收束 · Hands together to sum up（`hands_together`）

- **路径：** 腰前 → 双手在胸口略低处轻轻合拢（一只手搭在另一只上）→ 放回腰前
- **幅度上限：** 不高过胸口；不握拳
- **时长 / 回位：** 1.5–2 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** To sum up, both hands come loosely together in front of her lower chest, one resting on the other, then lower back to the waist with one firm nod.
- **表演提示 ZH：** 总结时双手在胸前略低处轻轻合拢，一只手搭在另一只上，然后放回腰前，有力地点头一次。
- **不要：** 十指紧扣用力、搓手
- **风险：** low

#### G07 轻耸肩 · Small shrug（`shrug`）

- **路径：** 腰前 → 双肩轻抬约 2 厘米，掌心在腰前微微翻向上，眉毛一抬 → 落回回位
- **幅度上限：** 肩膀小幅；手不离开腰部高度
- **时长 / 回位：** 1–1.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** With an easy tone she gives a small shrug, her shoulders lifting slightly and her palms turning a little upward at the waist, brows up and a light smile, then everything drops back to the home pose.
- **表演提示 ZH：** 用轻松的语气小小地耸一下肩，双肩微微抬起，掌心在腰前略微翻向上，眉毛一抬，带点笑，然后一切落回回位。
- **不要：** 夸张的“我不知道”大耸肩、摊手到肩膀高度
- **风险：** low

#### G08 比划大小 · Size frame（`size_frame`）

- **路径：** 腰前 → 两只平展的手掌在胸口略低处相对，间距约 30 厘米，表示“这么大一块”→ 回到腰前
- **幅度上限：** 用平展手掌，不用拇指食指捏出“一点点”；不高过胸口
- **时长 / 回位：** 1–1.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** Two flat palms face each other about thirty centimetres apart at lower-chest height to show the size of something, then return to the waist.
- **表演提示 ZH：** 两只平展的手掌在胸口略低处相对，相距约 30 厘米，比划出一个大小，然后回到腰前。
- **不要：** 拇指食指捏小距离（手指细节易出错）、比划到脸前
- **风险：** mid

#### G09 手按胸口（真诚） · Hand on chest（`hand_on_chest`）

- **路径：** 腰前 → 一只手平放在锁骨以下的胸口中间 → 轻轻一点头 → 回到腰前
- **幅度上限：** 手必须在锁骨以下，远离下巴和脸
- **时长 / 回位：** 1–1.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** For a sincere personal point, one open hand rests flat on the centre of her chest well below the collarbones for a moment with a small nod, then returns to the waist.
- **表演提示 ZH：** 说一句真心话时，一只张开的手平放在胸口中间、锁骨以下，停一会儿，轻轻一点头，然后回到腰前。
- **不要：** 手放到锁骨或脖子、拍胸口
- **风险：** low

#### G10 侧向引导（给图形让位） · Open-palm guide to the side（`palm_present`）

- **路径：** 腰前 → 画面一侧的那只手掌心向上，朝画面空的一侧轻轻打开（像在介绍旁边的图）→ 停一拍 → 回到腰前
- **幅度上限：** 胸口略低处；用整只手掌引导，不用食指指
- **时长 / 回位：** 1.5–2 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** Her hand on one side turns palm-up at lower-chest height and opens gently toward the empty side of the frame, as if presenting a graphic beside her, holds for a beat, then returns.
- **表演提示 ZH：** 靠画面一侧的那只手在胸口略低处掌心向上，朝画面空着的一侧轻轻打开，像在介绍她身边的图表，停一拍，然后收回。
- **不要：** 用食指指、转身背对镜头
- **风险：** low

#### G11 指尖相触（思考 / 笃定） · Steepled fingertips（`steeple`）

- **路径：** 腰前 → 两手指尖在腰到胸口之间轻轻相触成“尖塔” → 散开回到腰前
- **幅度上限：** 腰到胸口之间；不抵下巴
- **时长 / 回位：** 1.5–2.5 s，结束后回到腰前轻握；下一个切点前至少静 0.5 秒
- **表演提示 EN：** While she thinks a point through, her fingertips meet lightly in front of her lower chest in a relaxed steeple, then the hands part and return to the waist.
- **表演提示 ZH：** 想清楚一个观点时，两手指尖在胸口略低处轻轻相触成一个放松的“尖塔”，然后分开回到腰前。
- **不要：** 把尖塔手抵在下巴或嘴前、手指僵直
- **风险：** mid

---

## D. 例时间线（30 秒，EN + ZH）

下面三条都按 1 秒回位 + 6 秒动作段的标准节奏，切点处双手（或头部）回位。表格由叠加层生成；“词表 / 标签”一列就是切片后的预期标签。

### D.1 K02+（增强版中景主底板：原 K02 + 叠加层替换句）

不改定稿：生成时用 `prompts overlay --plate K02 --gesture`，叠加层把四个动作段换成下表的句子。
- **不加计数**：K02 的避免词禁了数手指。
- **不加指向**。

| 时间 | 动作（ZH） | Action (EN) | 词表 / 标签 | 角色 |
|---|---|---|---|---|
| 0–1 s | 保持回位姿势，然后开始说话。 | She holds the home pose, then begins speaking. | 起始回位 | — |
| 1–7 s | 自然的对话式说话，双手在腰前轻握；说话间手指自然松开又重新握一次，带着浅笑，认同地小幅点头一次。 | Natural conversational talking with her hands loosely clasped at the waist; once, her fingers loosen and re-clasp as she speaks, with a soft smile and one small agreeing nod. | E01 `soft_smile` + E02 `nod` | narrate, agree |
| 7–8 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 8–14 s | 双手在胸口略低处向外摊开，做一个放松的讲解手势，一只手略早于另一只，关键词上眉毛微微上扬，然后双手回到腰前合拢。 | Both palms open outward at lower-chest height in a relaxed explaining gesture, one hand slightly ahead of the other, her eyebrows lifting a little on the key word, then the hands come back together at the waist. | G01 `palms_open` + E04 `brow_raise` | explain |
| 14–15 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 15–21 s | 带着浅笑继续说话，右手在腰部高度掌心向上、把观点轻轻往前“递”一下，双肩随之轻松地微微一耸，然后与另一只手重新合拢。 | She keeps talking with a light smile while her right hand turns palm-up and offers the point a little forward at waist height, her shoulders lifting in a tiny easy shrug, then the hand rejoins the other. | G02 `palm_single` + G07 `shrug` | narrate, story, caveat |
| 21–22 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 22–28 s | 总结时双手在胸前略低处轻轻合拢，表情落定为平静笃定的浅笑，然后双手放回腰前，有力地点头一次。 | To sum up, both hands come loosely together in front of her lower chest as her expression settles into a calm, confident half smile, then they lower back to the waist with one firm nod. | G06 `hands_together` + E02 `nod` | summary, emphasis |
| 28–30 s | 说完这句话，回到回位姿势，静止保持到结束，最后一帧尽量与第一帧一致。 | She finishes her sentence, returns to the home pose and holds it still until the end, the final frame matching the first frame as closely as possible. | **回位 ✂（尾帧≈首帧）** | — |

### D.2 K04 · 中景手势密集底板（新，叠加层定义）

四段四种手势：G02 递出、G03 对比、G05 节拍点、G07 耸肩，配 E01 / E04 / E02 / E06 表情。
- 计数（G04）**不放进底板**：要试的话，单独抽一条“K04 计数变体”，至少抽 6 次。
- 不合格就一律用 G05 + 字幕 ①②③。

| 时间 | 动作（ZH） | Action (EN) | 词表 / 标签 | 角色 |
|---|---|---|---|---|
| 0–1 s | 保持回位姿势，然后开始说话。 | She holds the home pose, then begins speaking. | 起始回位 | — |
| 1–7 s | 自然地说着话，右手在腰部高度掌心向上，把想法轻轻往前“递”一下，笑意先从眼睛里升起，然后手回到腰前。 | Talking naturally, she turns her right hand palm-up and offers the idea a little forward at waist height, with a soft smile that rises in her eyes, then the hand returns to the waist. | G02 `palm_single` + E01 `soft_smile` | explain, open, narrate |
| 7–8 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 8–14 s | 比较两个选项时，一只手在腰部高度掌心向上移到一侧，另一只手晚半拍移到另一侧，说到第二个选项时眉毛微微上扬；然后两手回到腰前。 | Comparing two options, one hand opens palm-up to one side at waist height and the other hand to the other side half a beat later, her brows lifting a little on the second option; both hands return to the waist. | G03 `contrast_hands` + E04 `brow_raise` | contrast, explain |
| 14–15 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 15–21 s | 列举三个短点时，右手侧掌在腰部高度轻轻向下点三下，每一下落在一个重音词上，间隔不均匀，最后一下配一个小点头；然后手回到腰前。 | Listing three short points, her right hand makes three small downward beats at waist height, palm turned sideways, each landing on a stressed word at uneven intervals, with a small nod on the last one; then the hand returns. | G05 `hand_beat` + E02 `nod` | list, data, emphasis |
| 21–22 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 22–28 s | 用轻松的语气小小地耸一下肩，掌心在腰前微微翻向上，从鼻子里轻笑一声，然后落定为平静笃定的神情，双手回到腰前。 | With a light, easy tone she gives a small shrug, palms turning slightly up at the waist, and a soft half-laugh through the nose, then settles into a calm, confident look as the hands return to the waist. | G07 `shrug` + E06 `soft_laugh` | caveat, story, agree |
| 28–30 s | 说完这句话，回到回位姿势，静止保持到结束，最后一帧尽量与第一帧一致。 | She finishes her sentence, returns to the home pose and holds it still until the end, the final frame matching the first frame as closely as possible. | **回位 ✂（尾帧≈首帧）** | — |

### D.3 K05 · 近景表情密集底板（新，叠加层定义）

手全程不入画。四段：
- s1：E03 思考一瞥 + E04 扬眉；
- s2：E05 轻皱眉 + E09 共情柔和；
- s3：E06 轻笑后收 + E01 浅笑；
- s4：E07 倾听脸 + E10 会心（闭嘴段）。

K05 的避免词和负面词单独写过：去掉了 `looking away` 和 `laughing`，改成“视线离开镜头超过一秒”“张嘴大笑”，不然会和思考一瞥、轻笑冲突。

| 时间 | 动作（ZH） | Action (EN) | 词表 / 标签 | 角色 |
|---|---|---|---|---|
| 0–1 s | 保持回位姿势，然后开始说话。 | She holds the home pose, then begins speaking. | 起始回位 | — |
| 1–7 s | 她开始讲一个想法，目光短暂地向斜上方飘一下，像在找合适的词，随即回到镜头，在关键词上扬起眉毛。 | She begins a thought, her eyes drift briefly up and to the side as if finding the right word, then come back to the lens and her brows lift on the key word. | E03 `think_glance` + E04 `brow_raise` | think, question, emphasis |
| 7–8 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 8–14 s | 说到需要提醒的地方，眉头轻轻收拢，头微微一侧，语气放软，然后在说完这句话时眼神柔和下来，带着共情。 | On a cautionary point her brows draw slightly together with a small head tilt and a softer voice, then her eyes soften with empathy as she finishes the sentence. | E05 `brow_furrow` + E09 `soft_eyes` | caveat, empathy, explain |
| 14–15 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 15–21 s | 一句轻松、让人有共鸣的插话：从鼻子里短促地轻笑一声，肩膀微微一抬，然后立刻回到平静的说话状态，嘴角留着一点浅笑。 | A light, relatable aside: a short soft laugh through the nose with a small lift of the shoulders, then she settles straight back into calm speaking with a lingering soft smile. | E06 `soft_laugh` + E01 `soft_smile` | story, agree |
| 21–22 s | 回到回位姿势，静止保持一秒。 | She returns to the home pose and holds it still for one second. | **回位 ✂** | — |
| 22–28 s | 她停止说话，双唇闭合地倾听，头微微一侧，在不规律的时刻小幅点头两次，浮现一个短暂的会心浅笑。 | She stops speaking and listens with her lips closed, a slight head tilt, two small nods at uneven moments and a brief knowing half smile. | E07 `head_tilt` + E02 `nod` + E10 `knowing_look` | listen, pause |
| 28–30 s | 放松回到回位姿势，只留一丝平静的闭唇笑意，静止保持到结束，最后一帧尽量与第一帧一致。 | She relaxes back into the home pose with a calm, faint closed-lip smile and holds it still until the end, the final frame matching the first frame as closely as possible. | **回位 ✂（尾帧≈首帧）** | — |

完整提示词：

```bash
python3 -m istream prompts overlay --plate K04 --lang both --negative --gesture
python3 -m istream prompts overlay --plate K05 --lang both --negative --gesture
```

`GENERATE_PACK.md` 的“手势与表情（P0）”一节也直接列出了 K04 / K05 的完整中英提示词。

---

## E. 脚本 → 标签映射

### E.1 意图映射表

| 意图 role | 标记 | 触发词 | 中景：表情 + 手势 | 近景替代 | 备注 |
|---|---|---|---|---|---|
| `open` | [开场] | 大家好、今天聊 | E01 浅笑承接 ＋ G02 单手递出（“就是这个”） | E01；开场优先用 O01 的开场专用镜头 |  |
| `agree` **新** | [认同] / [肯定] | 对、没错、确实、是的 | E02 认同点头 / E10 会心一笑（“你懂的”） ＋ G06 合手收束 | E02 / E10 |  |
| `list` | [列点] / ①②③ | 第一、第二、三个 | E04 扬眉点题 ＋ G05 节拍点（安全版列点） / G04 计数 1-2-3（高风险） | E02 小点头 + 字幕 ①②③ | 默认 G05 节拍点；G04 计数是高风险，需要额外抽卡 |
| `contrast` **新** | [对比] | 一方面……另一方面、不是……而是、A 还是 B | E04 扬眉点题 ＋ G03 两手对比（“一方面……另一方面”） | 头部轻轻左右一侧 + E04 |  |
| `caveat` **新** | [提醒] / [转折] / [注意] | 但是、不过、注意、坑、风险 | E05 轻皱眉（难点 / 提醒） / E09 共情柔和 ＋ G07 轻耸肩 / G09 手按胸口（真诚） | E05 |  |
| `think` **新** | [思考] | 其实、你有没有想过、我想了很久 | E03 思考一瞥 ＋ G11 指尖相触（思考 / 笃定） | E03 |  |
| `question` | [提问] | ？、为什么、怎么办 | E03 思考一瞥 / E04 扬眉点题 ＋ G02 单手递出（“就是这个”） | E04 + 推近 |  |
| `emphasis` | [强调] / [重音: 词] | 才叫、记住、关键 | E04 扬眉点题 ＋ G02 单手递出（“就是这个”） / G05 节拍点（安全版列点） | E04 + 推近 |  |
| `data` | [数据] | 数字、倍、百分之 | E04 扬眉点题 ＋ G08 比划大小 / G10 侧向引导（给图形让位） | E04 |  |
| `empathy` **新** | [共情] | 我知道、很多人都、别担心 | E09 共情柔和 ＋ G09 手按胸口（真诚） | E09 |  |
| `story` | [故事]（轻松时加 [表情: 轻笑后收]） | 比如、有一次、我们都 | E06 轻笑后收 / E01 浅笑承接 ＋ G07 轻耸肩 / G02 单手递出（“就是这个”） | E06 |  |
| `summary` | [总结] | 总之、一句话、所以说 | E08 笃定收句 ＋ G06 合手收束 | E08 |  |
| `pause` | [停顿] / 倾听 | （静场、抛出问题后） | E07 倾听脸 ＋ — | E07（闭嘴段，不送口型） |  |
| `cta` | [关注] | 关注、下期 | E01 浅笑承接 / E08 笃定收句 ＋ G02 单手递出（“就是这个”） | E01 → E08 |  |

### E.2 脚本写法

```text
[对比][手势: 对比] 一种是双手焊在腰上，从头站到尾；另一种是每句话都有一个小动作。
[提醒][表情: 皱眉] 但是要注意，手绝对不能挡到脸和嘴。
[认同][表情: 会心] 对，宁可多抽几次，也别把一只怪手放进成片。
[总结][手势: 合手+笃定] 一句话：小、短、有来有回，才像真人。
```

- **新意图标记：**
  - `[认同]` / `[肯定]` → `agree`
  - `[对比]` → `contrast`
  - `[提醒]` / `[转折]` / `[注意]` → `caveat`
  - `[思考]` → `think`
  - `[共情]` → `empathy`
- **点名标记：**
  - 写法是 `[手势: …]` / `[表情: …]`，多个用 `+`、`、` 或 `,` 连接。
  - 可以写中文名（摊手、对比、节拍、耸肩、浅笑、皱眉……），也可以写编号（E01–E10 / G01–G11）或 vocab 键（`hand_beat`）。
  - 认不出的名字会给警告，并被忽略。
- **自动推断不变**：新意图只在显式标记时生效，“但是”这类词不会自动变成 `caveat`。所以老脚本的规划结果逐字节不变（已对 demo60 / longform 四种组合做 diff 验证）。

### E.3 词表 / schema 扩展（向后兼容）

- `istream/vocab.py`（标签唯一来源）：
  - 新增 6 个表情键：`soft_smile` `think_glance` `brow_furrow` `soft_laugh` `soft_eyes` `knowing_look`；
  - 新增 6 个手势键：`contrast_hands` `hand_beat` `shrug` `size_frame` `hand_on_chest` `steeple`；
  - 新增 5 个 role：`agree` `contrast` `caveat` `think` `empathy`；
  - 现在共 31 个手势 / 表情键、20 个 role。
- `GESTURE_ALIASES`：中文名 / 编号 → 键。
- `HAND_GESTURES`：哪些键需要手在画内。
- `GESTURE_KIN`：规划器接受的近似替代，例如 `smile_greet` 可以满足“浅笑”。
- `python3 -m istream schema --write` 已重新生成 `schema/*.json` 和 `schema/TAGS.md`。旧目录全部仍然合法（只加不删）。
- **规划器：**
  - 新 role 有对应的能量和情绪，并按 §E.1 偏好相应标签（+0.8）；
  - 点名的手势 / 表情加权更重（+2.0），只作用于该句第一个跳切段；
  - 选中的镜头没有点名的动作时，会给出 `planner warning`，提示去生成 K04 / K05 或删掉标记。
- **示例配方：** `recipes/gesture/script.md` → `recipes/gesture/out/{plan.txt, qc.txt, timeline.json}`（只规划 + QC，不出片）。

---

## F. 提示词补丁（叠加层 `prompts/overlays/gesture_expression.json`）

### F.1 怎么叠

- **`--gesture`**：在默认的 `human_premium` 之后再叠 `gesture_expression`。
- **`--overlay a,b`**：按给定顺序叠加多个叠加层。
- 叠加层的四类内容各有作用范围：

| 叠加内容 | 作用范围 |
|---|---|
| 句子替换 `replace` | 只作用于标注的底板（`plates`），而且只匹配定稿原句，不会误伤别的底板 |
| 表演补丁 `performance_append_by_framing` | 按景别：中景接“手势语法”，近景接“表情语法” |
| 避免补丁 `avoid_append_by_framing` | 按景别追加到 Avoid / 避免 行末 |
| 负面补充 `negative_extra(_ms)` | 所有底板都加表情类；中景再加手部类；`negative_drop` 去掉会和补丁打架的词 |

### F.2 句子替换（定稿原句 → 叠加后）

| 底板 | 原句 | 改为 | 为什么 |
|---|---|---|---|
| K02 | 自然的对话式说话，双手在腰前轻握，小幅点头。<br>*Natural conversational talking with her hands loosely clasped at the waist and small nods.* | 自然的对话式说话，双手在腰前轻握；说话间手指自然松开又重新握一次，带着浅笑，认同地小幅点头一次。<br>*Natural conversational talking with her hands loosely clasped at the waist; once, her fingers loosen and re-clasp as she speaks, with a soft smile and one small agreeing nod.* | 回位手不是“焊死”的：手指一次松开再握，加 E01 浅笑和 E02 认同点头 |
| K02 | 双手在胸口高度向外摊开，做一个放松的讲解手势，然后回到腰前合拢。<br>*Both palms open outward at chest height in a relaxed explaining gesture, then come back together at the waist.* | 双手在胸口略低处向外摊开，做一个放松的讲解手势，一只手略早于另一只，关键词上眉毛微微上扬，然后双手回到腰前合拢。<br>*Both palms open outward at lower-chest height in a relaxed explaining gesture, one hand slightly ahead of the other, her eyebrows lifting a little on the key word, then the hands come back together at the waist.* | G01 两手错开（去镜像）+ E04 扬眉 |
| K02 | 带着浅笑继续说话，右手在腰部高度做一个小幅、放松的摊掌动作，然后与另一只手重新合拢。<br>*She keeps talking with a light smile while her right hand makes one small, relaxed open-palm movement at waist height, then rejoins the other hand.* | 带着浅笑继续说话，右手在腰部高度掌心向上、把观点轻轻往前“递”一下，双肩随之轻松地微微一耸，然后与另一只手重新合拢。<br>*She keeps talking with a light smile while her right hand turns palm-up and offers the point a little forward at waist height, her shoulders lifting in a tiny easy shrug, then the hand rejoins the other.* | G02 单手递出 + G07 轻耸肩 |
| K02 | 总结时双手在胸前轻轻合拢，再放回腰前，同时自信有力地点头一次。<br>*To sum up, both hands come loosely together in front of her chest, then lower back to the waist as she gives one firm, confident nod.* | 总结时双手在胸前略低处轻轻合拢，表情落定为平静笃定的浅笑，然后双手放回腰前，有力地点头一次。<br>*To sum up, both hands come loosely together in front of her lower chest as her expression settles into a calm, confident half smile, then they lower back to the waist with one firm nod.* | G06 合手 + E08 笃定收句 |
| K01 / K01H | 继续说话，头部极轻微地向左倾斜，在关键词处轻扬一次眉毛，然后回正。<br>*She keeps speaking with a very slight head tilt to the left and one small eyebrow raise on a key word, then straightens.* | 继续说话，头部极轻微地向左倾斜；说到关键词前，目光短暂地向斜上方一瞥，像在找合适的词，随即回到镜头，轻扬一次眉毛，然后回正。<br>*She keeps speaking with a very slight head tilt to the left; before the key word her eyes flick briefly up and to the side as if finding the right word, then come back to the lens with one small eyebrow raise, and she straightens.* | 近景只加表情：E03 思考一瞥 + E04 扬眉 |
| K01 / K01H | 带着闭唇浅笑缓慢地小幅点头两次，自然眨眼一次。<br>*gives two small slow nods with a soft closed-lip smile, and blinks once naturally.* | 带着闭唇浅笑，在不规律的时刻小幅点头两次，脸上有安静的回应，像听到了一个好观点，自然眨眼。<br>*gives two small nods at uneven moments with a soft closed-lip smile, her face quietly responsive as if hearing a good point, and blinks naturally.* | E07 倾听脸：不规律点头 + 有回应 |
| K03 | 连续三个快速的小点头，像在肯定自己的观点。<br>*Three quick small nods in a row as if agreeing with her own point.* | 两三个时机不均的小幅认同点头，眉毛微抬，带一点会心的浅笑，像在肯定自己的观点。<br>*Two or three small agreeing nods at uneven moments, with a slight brow lift and a knowing half smile, as if agreeing with her own point.* | E02 + E10：去掉等间隔三连点 |
| K03 | 眉头因专注而极轻微地收拢（不是皱眉），缓慢点头一次<br>*eyebrows drawn very slightly together in concentration (not frowning), and one slow nod* | 说到难点时眉头轻轻收拢、头微微一侧，带一点关切（不是生气、不是皱眉），随即舒展，缓慢点头一次<br>*eyebrows drawn slightly together on the hard word with a small concerned head tilt (not angry, not frowning), then they release, and one slow nod* | E05 轻皱眉：有起有落 |
| K03 | 说话时短暂地温暖一笑，然后身体略微后靠，放松而自信地把话说完。<br>*A brief warm smile while speaking, then a slight lean back, relaxed and confident, as she finishes the thought.* | 说话时短暂地温暖一笑，笑意先从眼睛里升起、又自然退去，然后身体略微后靠，放松而自信地把话说完。<br>*A brief warm smile that rises in her eyes first and fades naturally while she speaks, then a slight lean back, relaxed and confident, as she finishes the thought.* | E01 浅笑承接：笑意由眼睛带出、有起有落（K03 的避免词禁止大笑，所以这里不用 E06） |

### F.3 表演补丁（Performance / 表演 句末）

**中景 MS · 手势语法：**

```text
Gesture grammar: like a real interview host, her hands help her think — every gesture starts from the home pose, lands on a stressed word and settles back to the waist within about two seconds. Gestures stay between the waist and the lower chest, never above the chest and never near the face, chin or hair. Mostly one hand at a time; when both hands move they are slightly out of sync, never mirrored. Fingers stay relaxed and natural, with no posed hand signs. Small and conversational, never stage acting.
```

```text
手势语法：像真实的访谈主持人，手是在帮她思考——每个手势都从回位姿势出发，落在重音词上，约两秒内回到腰前。手势只在腰部到胸口略低处之间，绝不高过胸口，绝不靠近脸、下巴和头发。大多一次只动一只手；两只手同时动时前后略有错开，绝不镜像同步。手指放松自然，不摆任何手势符号。幅度小、像聊天，绝不是舞台表演。
```

**近景 MCU · 表情语法：**

```text
Expression grammar: her hands never enter the frame — all the life comes from her face, eyes, breath and shoulders. Expressions are small, brief and slightly asymmetric: a soft smile that rises in the eyes and fades, a quick brow lift on a key word, a short thinking glance away and back, a slight concerned furrow on a hard word. Each expression peaks with the words and returns to a relaxed neutral before the next home pose; nothing is held like a mask.
```

```text
表情语法：双手绝不入画——所有生气都来自脸、眼睛、呼吸和肩膀。表情小、短、略带不对称：从眼睛里升起又退去的浅笑，关键词上快速一扬眉，短暂地移开视线思考再回来，说到难点时眉头轻轻一收。每个表情都随着话语到达峰值，在下一个回位前回到放松的中性脸；没有任何表情像面具一样挂着。
```

**短版（`--compact`）：**

```text
Gesture grammar: each gesture starts from and returns to the home pose within about two seconds, lands on a stressed word, stays between waist and lower chest, never near the face; mostly one hand, never mirrored; relaxed fingers, no hand signs, no stage acting.
Expression grammar: hands never in frame; small, brief, asymmetric expressions — eye-led smile, brow lift on key words, short thinking glance, light concerned furrow — each returning to neutral before the home pose.
```

```text
手势语法：每个手势从回位出发、约两秒内回到回位，落在重音词上，只在腰到胸口略低处，绝不靠近脸；多为单手，不镜像；手指放松，不比手势符号，不演。
表情语法：手不入画；表情小、短、不对称——眼睛先笑、关键词扬眉、短暂思考一瞥、轻皱眉——每个都在回位前回到中性。
```

### F.4 避免补丁（Avoid / 避免 行末）

- **中景：** hands coming near the face, chin or hair, hand signs such as OK, peace or thumbs-up, perfectly mirrored two-hand movements, the same gesture repeated in a rhythm, exaggerated stage acting · 手靠近脸、下巴或头发，比 OK、比耶、点赞等手势符号，两手完全镜像同步，同一个手势按节拍重复，夸张的舞台表演
- **近景：** exaggerated or held expressions, cartoon surprise, winking or smirking, eyebrows stuck raised · 夸张或一直挂着的表情，卡通式惊讶，眨单眼或坏笑，眉毛一直扬着

### F.5 负面补充

所有底板：

```text
touching face, hand on chin, touching hair, overacting, theatrical expression, exaggerated surprise, cartoon expression, wink, smirk, frozen grin, eyebrows stuck raised, tongue out, pout
```

```text
摸脸，手托下巴，摸头发，过度表演，舞台腔表情，夸张惊讶，卡通表情，眨单眼，坏笑，僵住的笑，眉毛一直扬着，吐舌头，嘟嘴
```

中景再加：

```text
pointing at camera, index finger pointing, finger guns, OK sign, peace sign, thumbs up, finger heart, jazz hands, waving, clapping, fist pump, crossed arms, hands in pockets, hands behind back, hands above shoulders, mirrored symmetric gestures, synchronized hands, repetitive gestures, metronomic hand beats, robotic gestures, frozen hands, floating hands, extra fingers, missing fingers, fused fingers, twisted wrist, props in hands, exaggerated gestures
```

```text
指向镜头，食指指人，手枪手势，OK 手势，比耶，点赞，比心，爵士手，挥手，鼓掌，握拳庆祝，抱臂，手插兜，手背在身后，手高过肩膀，两手镜像对称，两手同步，重复的手势，节拍器式点手，机械手势，僵住的手，悬空不自然的手，多手指，少手指，手指粘连，手腕扭曲，手里拿道具，夸张手势
```

字数受限时的短版：`touching face, overacting, exaggerated surprise, frozen grin, pointing at camera, OK sign, peace sign, thumbs up, crossed arms, mirrored symmetric gestures, repetitive gestures, extra fingers, fused fingers`

- K01 / K01H：去掉 `looking away` — K01 第 2 段加入了 E03 思考一瞥（≤1 秒、回到镜头）；负面词里的 looking away 会把它压掉。“head turned away / profile view” 仍保留

### F.6 字数（字符数，EN / ZH）

| 底板 | 真人感 + 手势表情 | 同上 `--compact` | 只叠手势表情 | 只叠手势表情 `--compact` |
|---|---|---|---|---|
| K01 | 5508 / 1663 | 4502 / 1371 | 3684 / 1109 | 3443 / 1030 |
| K02 | 5678 / 1708 | 4667 / 1416 | 3912 / 1169 | 3666 / 1090 |
| K04 | 5780 / 1742 | 4769 / 1450 | 4014 / 1203 | 3768 / 1124 |
| K05 | 5575 / 1700 | 4569 / 1408 | 3809 / 1161 | 3568 / 1082 |

**选法：**
- 英文版即使只叠手势表情、加 `--compact`，也在 3,400 字符以上。
- 工具限约 2,500 字符时，用中文版：两层都叠的完整版也不到 2,000 字。
- 工具限约 4,000 字符时，英文用“只叠手势表情 `--compact`”（约 3,400–3,800）。两层叠加的英文版都超过 4,000，要两层就用中文。
- 不要手删定稿句子来压字数。

---

## G. 入库评分卡加项（8 项是 / 否，和 HUMAN_PREMIUM 的 10 项一起用）

| # | 检查（是 / 否） | Check (yes / no) |
|---|---|---|
| GE1 | 回位：每个手势都从腰前回位出发，约 2.5 秒内回到回位；每个切点处双手都在回位 | Return: every gesture starts from the home pose and is back within ~2.5 s; hands are at home at every cut point |
| GE2 | 高度（一票否决）：没有任何一帧手高过胸口或靠近脸、下巴、头发、嘴 | Height (veto): no frame has a hand above the chest or near the face, chin, hair or mouth |
| GE3 | 手指：手势峰值帧 100% 放大，五指数量和形状正常，无粘连、无多指、无扭腕（G04 计数至少抽 6 次） | Fingers: at 100% on gesture peaks, five normal fingers, no fusion, extras or twisted wrists (G04 needs ≥ 6 draws) |
| GE4 | 不像节拍器：2 倍速看，手势和点头不是等间隔重复，两手没有镜像同步 | Not metronomic: at 2×, gestures and nods do not repeat at even intervals and the hands are never mirrored |
| GE5 | 词势对齐：手势和表情的峰值落在重音附近（约 ±0.3 秒），不是乱挥 | Word-gesture sync: gesture/expression peaks land near the stressed word (≈ ±0.3 s), not random waving |
| GE6 | 表情有起有落：笑、扬眉、皱眉都会退回中性，峰值 ≤ 1.5 秒，左右脸有细微不对称 | Expressions rise and fall: smiles, brow lifts and furrows return to neutral, peaks ≤ 1.5 s, slight left-right asymmetry |
| GE7 | 没有手势梗（一票否决）：没有 OK、比耶、点赞、比心、指镜头、挥手、抱臂、插兜、道具 | No meme gestures (veto): no OK, peace, thumbs-up, finger heart, pointing at camera, waving, crossed arms, pockets or props |
| GE8 | 近景纪律：近景底板手完全不入画；表情不夸张，不像舞台表演；倾听段嘴始终闭合 | MCU discipline: hands never enter close-ups; expressions are not theatrical; the mouth stays closed in listening spans |

**规则：** 和 HUMAN_PREMIUM 的 10 项一起用。8 项全部为“是”，这一段才打手势 / 表情标签；有“否”但 GE2、GE7 通过时，这一段仍可入库，但只打基础标签。GE2 或 GE7 任何一个“否”，整段不可用（手挡脸或手势梗）。
*Use together with the HUMAN_PREMIUM 10. Tag a span with gesture/expression tags only if all 8 are YES; with a NO elsewhere but GE2 and GE7 passing, keep the span with basic tags only. A NO on GE2 or GE7 makes the span unusable.*

**打标提醒：**
- 只有 GE 全部通过的段，才在 `review.json` 里打新的表情 / 手势键。
- 通过 GE2 / GE7 但其他有问题的段，只保留基础标签。这样规划器不会把一个“像在乱挥”的段当成 `contrast_hands` 选出来。

---

## H. SKILL.md §2.6 大纲

完整要点见 `docs/SKILL_2_6_OUTLINE.md`；精简版已并入 `SKILL.md` §2.6“手势与表情词表”。

- 目标：底板里的人在**交流**，而不只是“活着”；手势是访谈主持人的语法，不是表演。
- 词表：E01–E10 表情（近景、中景通用），G01–G11 手势（只用于中景）；G04 计数高风险。
- 语法：回位 → 手势 → 回位；腰到胸口略低；约 2 秒；单手为主、不镜像；每段最多两个；近景手不入画。
- 用法：`prompts overlay --gesture`；新底板 K04 / K05；`catalog build-spec --overlay gesture_expression`。
- 脚本：新意图标记 + `[手势:]` / `[表情:]`；老脚本结果不变。
- 入库：GE1–GE8；GE2、GE7 一票否决。
- 验证：§I 的 Phase 0；没跑通之前一律 待验证。

---

## I. 验证计划（全部 待验证）

> 以下内容都没有在真实视频模型上跑过。下面是把“待验证”改成“已验证”的最小实验。

| 步骤 | 做什么 | 通过标准 |
|---|---|---|
| I.1 K02 A/B | 同一首帧、同一工具：K02 基础版 vs `--gesture` 版，各抽 5 次 | 叠加版在 GE1–GE8 平均通过数更高；GE2 / GE7 否决率不高于基础版 |
| I.2 K04 | `--gesture` 抽 6 次，逐段打 GE + HUMAN_PREMIUM | 每段至少 2 / 6 条可入库（打全标签） |
| I.3 K05 | 同上；重点看 E03 思考一瞥是否回到镜头、E06 是否张嘴 | 每段至少 2 / 6 条；E06 张嘴超过一半就把 s3 换成 E01 |
| I.4 G04 计数（可选） | 单独写一条“K04 计数变体”，抽 6 次以上 | 手指 100% 放大全部正常才可入库，否则永久用 G05 + 字幕 |
| I.5 装配 | `recipes/gesture` 用真底板重跑 plan → lipsync → render | 成片抽看：手势落在重音 ±0.3 秒；没有一帧手挡脸 |

**通过之后：**
- 把 `gesture_expression.json` 的 `status` 改成已验证，写上工具名和日期；
- 用真实复核结果（`catalog merge-review`）替换 `catalog/gesture` 的预期标签。

**哪一项不通过：**
- 只把那一条替换句或那一段从叠加层里拿掉；
- 不要改 K01–K03 定稿。
