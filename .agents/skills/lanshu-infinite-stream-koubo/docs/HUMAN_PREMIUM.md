# 真人感 · 去 AI 味 · 自然又高级 — 元视频底板的生成手艺

> 适用：`prompts/GENERATE_PACK.md` / `PROMPT_LIBRARY.md` 里所有底板（K01–K03 · K01H · L01 · L02 · O01），以及 `identity set --photo` 生成的个人形象包。
> 目标：生成出来的底板像一段**布光讲究的真人访谈**，而不是“AI 数字人”。同时保持本技能的底板纪律：无遮挡、手不碰脸、按回位切点能切、能量低到中。
> **诚实声明：**
> - 本文的提示词补丁还**没有**在真实视频模型上跑过 A/B（见 §8）。
> - 里面的光学和布光语言（85mm、f/2.8、3:1 光比、眼神光）是真实摄影的通用做法，但某个模型是否听话，只能实测。
> - 文中提到的任何工具开关都按“推测”处理。
> **唯一数据源：** 补丁正文以 `prompts/overlays/human_premium.json` 为准（本文由 `tools/build_human_premium_doc.py` 从它渲染）。
> **复制已叠加好的整条提示词：** `python3 -m istream prompts overlay --plate K01 --lang both --negative`。

---

## 1. 诊断：现在的提示词哪里在帮忙，哪里还在“喊”自己是 AI

### 1.1 已经在帮忙的（保留）

| 现有句子 | 位置 | 为什么有用 |
|---|---|---|
| single continuous shot, locked-off camera on a tripod, no camera movement / 三脚架固定机位、无运镜 | 锁定行 | 真实访谈就是固定机位。假“电影感”运镜和手持抖动本身就是 AI 套路，也会破坏切片 |
| Large soft key 45° + soft fill + subtle hair rim / 45° 柔光主光 + 补光 + 发丝轮廓光 | 场景块 | 经典访谈三点光，方向明确，眼神光可预期 |
| constant exposure, no flicker / 曝光恒定、无闪烁 | 场景块 | 去掉 AI 视频最常见的亮度“呼吸” |
| true-to-life skin texture, fine film grain / 真实皮肤纹理、细腻胶片颗粒 | 场景块 | 方向对，但太泛（见 §2 P0-1） |
| speaks … as if mid-conversation, natural jaw and lip movement / 像在对话、下颌嘴唇自然运动 | 表演块 | 说话状态的下颌联动，让口型替换后自然 |
| head turns ≤ 20°, hands out of frame / below chest / 转头 ≤ 20°、手不入画或不过胸 | 表演块 | 无遮挡、能切片，同时避免 AI 最容易画坏的手 |
| Energy low to medium / 能量低到中 | 表演块 | 动作小，复用时不容易被认出来 |
| natural makeup, no jewelry, solid clothing / 淡妆、无首饰、纯色服装 | 身份块 | 少了反光和图案闪烁 |
| Negative: plastic skin, distorted face, flicker, deformed hands … | 负面 | 覆盖了最粗的几类问题 |
| 每条抽 4–5 次 · 同一参考图 · 模型音频静音 | 生成设置 | 给“挑真人感最强那一条”留了余地 |

### 1.2 还在“喊”AI 的地方

| AI 痕迹 | 观众看到什么 | 现在是谁引起的 | 对应原则 |
|---|---|---|---|
| **磨皮 / 塑料皮** | 没有毛孔，脸像一层均匀的粉；高光处油亮 | “Photorealistic” 太泛；没写毛孔、绒毛、肤色不均；负面里只有 plastic skin 一个词 | P0-1 |
| **定格式静止** | 回位那一秒像暂停键，胸口和肩膀完全不动 | 时间线里 3–6 处 **“holds it still for one second / 静止保持一秒”** | P0-2 |
| **死眼 / 空洞凝视** | 眨眼太少，或者间隔完全均匀；眼神不动；眼神光乱 | 只写了 “blinks naturally”；K01 s4 是 6 秒只“眨一次” | P0-3 |
| **节拍器点头** | 点头、摇摆按固定节拍重复 | **“small, slow nods on stressed words / 在重音处缓慢地小幅点头”** 被模型理解成持续节拍 | P0-4 |
| **空洞影棚 + 平光** | 无缝墙均匀发亮，脸和背景没有空间关系 | **“evenly lit, nothing else in frame / 照明均匀”**；补光比例没写 | P0-5 |
| **全景深 CG 质感** | 从头发到墙全部一样清楚，边缘锐利得像抠图 | 没写镜头和光圈；**“sharp focus on the face / 脸部焦点清晰”** 会诱导过度锐化 | P0-6 |
| **起点就是 AI 图** | 第一帧已经磨皮、过亮、对称，后面整段都继承下来 | 首帧图提示词没写光学和皮肤；用户参考照常常是美颜自拍 | P0-7、§4 |
| **蜡像嘴唇 / 一排白牙** | 嘴唇亮面均匀，笑时牙齿连成一块 | **“bright, warm smile / 露出明亮温暖的笑容”** 会引出露齿大笑 | P1-8 |
| **头盔头发、完美对称** | 头发像一整块；左右脸、肩线、领口完全对称 | 身份块 “no loose strands near the face” 必须保留，但没给其他地方留碎发；构图和布光都没留不对称 | P1-9 |
| **广告级调色** | HDR 发光、过饱和、青橙调，像广告或游戏 | 现在没写，但模型默认偏“商业精修”；后期也容易加 | P1-10、§6 |
| **纹理翻滚 / 身份漂移** | 发丝和皮肤细节逐帧“沸腾”，几秒后脸变了一点 | 生成设置与选片标准没有覆盖 | P1-11、P1-12 |
| **口型补丁更“干净”** | 换嘴之后嘴周比脸其余部分更平滑，像贴片 | 口型引擎的固有问题；目前没有统一颗粒这一步 | P1-10（`render --grain`） |

---

## 2. 手艺原则（按优先级）

位置代号：〔场景〕场景与光线块 ·〔表演〕表演块 / 时间线 ·〔身份〕身份块 ·〔负面〕负面框 ·〔首帧〕首帧图 / 参考照 ·〔设置〕生成设置 ·〔选片〕入库挑选 ·〔后期〕轻后期

### P0（不做就会有 AI 味）

| # | 原则 | 怎么做 | 为什么能去 AI 味 | 放在哪 |
|---|---|---|---|---|
| P0-1 | **皮肤就是皮肤** | 写出可见毛孔、轮廓光下的细绒毛、轻微不均匀的肤色、高光处的“自然光泽而非油光”；负面加磨皮、美颜、瓷娃娃、蜡像、油光 | AI 皮肤最常见的问题是“没有信息”：均匀、平滑、反光一致。具体的微观纹理给了模型可执行的目标 | 〔场景〕〔首帧〕〔负面〕〔后期：永不磨皮〕 |
| P0-2 | **静止时也是活人** | 回位段改成“稳稳停留，仍在呼吸、眨眼，不是定格”；表演块加柔和呼吸、极轻的重心移动 | 真人不可能完全不动。切点要的是**低运动**，不是**零运动**；呼吸起伏不会破坏切片和拼接 | 〔表演〕〔选片：逐帧查定格〕 |
| P0-3 | **会思考的眼睛** | 眨眼不规律（偶尔连眨、间隔不均），多在句尾或视线移动时；眼神有细小转动；每只眼一个和主光同侧的柔和眼神光 | “死眼”是恐怖谷的第一来源。人每分钟眨眼约 15–20 次，而且不均匀；眼神光不一致会暴露是合成的 | 〔表演〕〔场景〕〔负面〕〔选片〕 |
| P0-4 | **动作由语言驱动，不按节拍** | 点头改成“跟着重音偶尔一两次，绝不按固定节拍”；重音处扬眉；任何动作不重复 | 节拍器式的点头和摇摆，是观众最快识别出 AI 的动作特征，2 倍速一看就露馅 | 〔表演〕〔负面〕〔选片：2 倍速看〕 |
| P0-5 | **光有比例，墙有空间** | 主光 : 补光 ≈ 3:1，脸的暗面保留柔和立体感；墙面从主光一侧向外自然减光；保留无缝墙（为了合成），但不要“均匀发亮” | 平光加均匀背景就是“空洞影棚”，是 AI 也是廉价企业片的标志。光比和减光让脸有体积、画面有空间 | 〔场景〕（叠加层自动把“照明均匀”换掉） |
| P0-6 | **真镜头的光学** | 等效 85mm 人像镜头，从几米外拍，光圈约 f/2.8；焦点在**眼睛**；耳朵和脑后头发自然虚化；轻微暗角可以有 | 全景深、处处锐利是 CG 的视觉特征。焦外过渡和对焦平面让画面有“镜头”而不是“渲染器” | 〔场景〕〔首帧〕（“脸部焦点清晰”→“眼睛焦点精准”） |
| P0-7 | **首帧和参考照决定一半** | 首帧图按 §3.4 加杂志人像光学和皮肤描述；参考照按 §4 选，拒绝美颜自拍；首帧和底板的光向、色温一致 | 图生视频会**继承**起始画面的皮肤、光线和质感。起点被磨过皮，后面 30 秒都是 AI 脸 | 〔首帧〕〔身份：`--describe` 写真实特征〕 |

### P1（显著加分）

| # | 原则 | 怎么做 | 为什么能去 AI 味 | 放在哪 |
|---|---|---|---|---|
| P1-8 | **真嘴** | 嘴唇有纹理、湿润度自然；牙齿颗颗分明、不是纯白；句间完全闭合；笑容“先从眼睛里出来”，不追求露齿 | 蜡像嘴唇和“白牙墙”很显眼。说话段虽然会被口型引擎重画，但闭嘴段、口型参考和未送口型的片段都直接用底板的嘴 | 〔表演〕〔负面〕〔选片 #5〕 |
| P1-9 | **不完美预算** | 头顶和发缝处留几根碎发（远离脸）；保留真人脸的细微不对称；面料随呼吸有褶皱变化；领口不必完美对称；构图可以略偏 | 完美对称是 AI 的指纹。小不完美让大脑判定“这是被拍下来的，不是被生成的”，前提是不破坏无遮挡 | 〔首帧〕〔身份：手改，见 §3.5〕 |
| P1-10 | **克制的调色，统一的颗粒** | 全部底板用同一个 LUT 和白平衡；**永不**磨皮、**不**锐化；口型之后给主播层整体加一层细颗粒（在 MG 和字幕之前），把口型补丁和原脸统一起来 | 高级感来自克制。口型引擎输出的嘴部常常更平滑，统一颗粒能把“贴片感”压下去 | 〔后期〕：`istream render … --grain 3`（建议 2–4） |
| P1-11 | **像选角一样选片** | 每条抽 4–5 次，用 §5 的 10 项评分卡；1 倍速和 2 倍速各看一遍；逐帧检查回位段有没有完全相同的连续帧 | 生成是概率性的：同一条提示词里，“像真人”的那次和“像 AI”的那次可能就隔一个种子。选片是性价比最高的一步 | 〔选片〕 |
| P1-12 | **稳定优先于细节** | 优先图生视频（I2V）加首帧；运动强度这类参数调到低到中（推测）；关掉“增强细节 / 美颜 / 人脸增强”开关（推测）；入库前不用 AI 超分；不做插帧，保持 24/25 fps | 模型硬加的细节会逐帧闪烁（纹理翻滚）。稍软但稳定，比锐利但沸腾更像真人。60 fps 插帧会带来“肥皂剧感”，嘴部也容易出伪影 | 〔设置〕 |
| P1-13 | **（可选）有景深的访谈布景** | 另做一套“访谈布景”变体底板：身后 2–3 米有失焦的暖色台灯、书架或绿植，墙面有质感 | 有空间纵深的背景是“高级访谈”的直观信号。代价是背景替换难度上升、MG 区域要避开亮点，所以作为独立变体，不改 K 系列 | 〔场景：变体，见 §3.5〕 |

---

## 3. 直接粘贴的补丁（Drop-in patches）

**用法（任选其一）：**
1. **推荐：** `python3 -m istream prompts overlay --plate K01 --lang both --negative`。它自动做 §3.1 的替换、追加 §3.2 和 §3.3、在 Avoid 句后补 AI 痕迹，并输出合并后的负面词。字数受限加 `--compact`；要气质句加 `--style`。
2. 手动：把下面的段落接到对应句子后面。

**字数提醒：**
- 完整叠加后 K01 英文约 4.8k 字符，`--compact` 约 4.0k，中文约 1.2–1.5k。
- 工具上限紧（约 3k 以内）时，按原有规则**优先用中文版**；或者把 Avoid 补充挪进负面框。
- 各工具的具体上限是推测，以实测为准。

**为什么不直接改 `library.json`：** K01–K03 是定稿，`prompts verify` 要求逐字一致。叠加层只在复制时生效。

### 3.1 句子替换（叠加时自动完成）

| 原句 | 改为 | 为什么 |
|---|---|---|
| 照明均匀，画面中没有其他物体<br>*evenly lit, nothing else in frame* | 柔和受光，从主光一侧向外自然减光，画面中没有其他物体<br>*softly lit with a gentle natural falloff away from the key side, nothing else in frame* | 均匀平光的背景 = 空洞影棚，是 AI 味来源之一 |
| 脸部焦点清晰<br>*sharp focus on the face* | 眼睛焦点精准<br>*critical focus on the eyes* | “脸部锐利”容易引出过度锐化的皮肤；真实人像对焦在眼睛 |
| 静止保持一秒<br>*holds it still for one second* | 稳稳停留约一秒，仍在呼吸、眨眼，不是定格<br>*settles there for about one second, still breathing and blinking, never frozen* | 定格式静止像人体模特；切点只需要“低运动”，不需要“零运动” |
| 静止保持两秒<br>*holds it still for two seconds* | 稳稳停留约两秒，仍在呼吸、眨眼，不是定格<br>*settles there for about two seconds, still breathing and blinking, never frozen* | 同上，用于 60 秒接力点 |
| 静止保持到结束<br>*holds it still until the end* | 安静地保持到结束（仍有呼吸和眨眼）<br>*holds it calmly until the end, still breathing and blinking* | 结尾静止也要有呼吸 |
| 在重音处缓慢地小幅点头<br>*small, slow nods on stressed words* | 跟着重音偶尔小幅点头一两次，绝不按固定节拍<br>*one or two small nods driven by the stressed words, never in a steady rhythm* | 节拍器式点头是最明显的动作 AI 痕迹 |
| 露出明亮温暖的笑容<br>*bright, warm smile* | 露出先从眼睛里出来的温暖笑容<br>*warm smile that starts in her eyes* | “明亮的笑”容易露出一整排牙（蜡像牙）；从眼睛开始的笑才像真的 |
| 明亮、轻松的笑容<br>*bright, easy smile* | 轻松、真实、笑到眼睛里的笑容<br>*easy, genuine smile that reaches her eyes* | 同上，O01 开场 |

### 3.2 `blocks.setting` 补丁：光、镜头、调色（高级自然，不是美颜滤镜）

接在 “Setting and light: … / 场景与光线：…” 这一句的末尾：

```text
Shot like a premium documentary interview on a cinema camera with an 85mm-equivalent portrait lens from a few metres away at about f/2.8: the eyes are critically sharp, the ears and the back of the hair fall off gently, and the wall behind her is softly out of focus. Key-to-fill ratio about 3:1, so the shadow side of the face keeps soft modelling, with one soft catchlight in each eye on the key side. Real skin: visible pores, fine vellus hair caught by the rim light, subtle unevenness of tone and a natural sheen on the high points, never glossy and never airbrushed. Restrained, natural film-like grade: true skin hue, soft highlight roll-off, gentle contrast; no beauty filter, no HDR look, no over-sharpening.
```

```text
按高端纪录片访谈的方式拍摄：电影摄影机，等效 85mm 人像镜头，从几米外拍，光圈约 f/2.8；眼睛焦点锐利，耳朵和脑后头发自然虚化，身后墙面柔和失焦。主光与补光约 3:1，脸部暗面保留柔和的立体感；双眼各有一个位于主光一侧的柔和眼神光。皮肤是真实的皮肤：可见毛孔、轮廓光下细小的绒毛、轻微不均匀的肤色，高光处是自然光泽，绝不油亮，绝不磨皮。克制自然的胶片感调色：肤色真实，高光过渡柔和，反差温和；不要美颜滤镜，不要 HDR 质感，不要过度锐化。
```

紧凑版（`--compact`）：

```text
Premium documentary-interview look: 85mm-equivalent lens from a few metres at about f/2.8, eyes critically sharp, soft background falloff, key-to-fill about 3:1, one soft catchlight per eye; real skin with pores and fine vellus hair, natural sheen, never airbrushed; restrained natural grade, no beauty filter, no HDR, no over-sharpening.
```

```text
高端纪录片访谈质感：等效 85mm、几米外、约 f/2.8，眼睛焦点锐利，背景柔和减光；主光与补光约 3:1，双眼各一个柔和眼神光；真实皮肤，可见毛孔和细绒毛，自然光泽，绝不磨皮；克制自然的调色，不要美颜、不要 HDR、不要过度锐化。
```

### 3.3 表演微行为补丁（不影响切片）

接在 “Performance: … / 表演：…” 这一句的末尾。这里**没有任何大动作**：呼吸、重心、眨眼、眼神都是低运动，回位切点照样成立；手的位置沿用原文，不碰脸。

```text
Alive at rest: she is never frozen — her breathing shows softly in her chest and shoulders, she makes tiny weight shifts, and her eyes stay alive with small natural movements. Blinks are irregular (now and then a double blink, sometimes a longer gap), often at the end of a phrase or when her gaze shifts. Expressions are slightly asymmetric and driven by what she says: a brow lifts on a stressed word, a smile starts in the eyes and fades on its own. Between sentences her lips close fully and she takes a small breath. No movement repeats in a regular rhythm. Her hands stay exactly where described above, and nothing ever touches or covers the face.
```

```text
静止时也是活人：她从不定格——胸口和肩膀有柔和可见的呼吸起伏，身体有极轻微的重心移动，眼神有细小的自然转动。眨眼不规律（偶尔连眨两下，偶尔隔得久一点），多出现在一句话结尾或视线移动时。表情略带不对称，并跟着说话内容走：重音处眉毛微抬，笑意先出现在眼睛里，再自己慢慢退去。句与句之间双唇完全闭合，轻轻吸一口气。任何动作都不按固定节拍重复。双手的位置严格按上文描述，任何东西都不碰脸、不挡脸。
```

紧凑版：

```text
Alive at rest, never frozen: soft visible breathing, tiny weight shifts, irregular blinks, slightly asymmetric expressions driven by the words, lips fully closed between sentences; no movement repeats in a rhythm; hands stay as described and nothing touches the face.
```

```text
静止时也是活人，从不定格：有柔和可见的呼吸、极轻微的重心移动、不规律的眨眼，表情略带不对称并跟着内容走，句间双唇完全闭合；任何动作不按节拍重复；双手按上文位置，任何东西不碰脸。
```

### 3.4 首帧图补丁（IMG-A / IMG-B / IMG-A169）

放在 “No text, no logo. / 无文字，无 logo。” 之前（`--first-frame IMG-A` 自动完成）：

```text
Captured like an editorial portrait on a full-frame camera with an 85mm lens at f/2.8: natural skin with pores and fine vellus hair, a few fine flyaway hairs at the crown and along the parting, well away from the face, the subtle natural asymmetry of a real face, matte natural makeup, lips with natural texture, one soft catchlight in each eye, a relaxed and present expression. Not a beauty retouch, not a 3D render.
```

```text
像全画幅相机、85mm 镜头、f/2.8 拍下的杂志人像：真实皮肤，看得到毛孔和细小绒毛；头顶和发缝处有几根细碎发丝，远离脸部；保留真人脸自然的细微不对称；哑光自然妆；嘴唇有真实纹理；双眼各一个柔和眼神光；表情放松、在场。不是美颜精修，不是三维渲染。
```

### 3.5 P1 手动补丁（不在自动叠加里）

- **身份块里的头发（只对默认形象）：** 把 “neatly tied back in a low ponytail with no loose strands near the face” 改成 “neatly tied back in a low ponytail, a few fine flyaways at the crown but nothing near the face or mouth”。中文：“整齐地扎成低马尾，头顶有几根细碎发丝，但脸旁和嘴边没有碎发”。这会改变定稿逐字校验，只用在你自己的身份包里。
- **个人形象包的 `--describe`：** 写 3–5 个**真实且具体**的特征，例如“左颊有一颗小痣”“笑时右侧酒窝更明显”“眉形略不对称”。真实的小特征是对抗“标准化 AI 脸”最有效的锚（推测，Phase 0 验证）。
- **访谈布景变体（P1-13）：** 场景块整句替换为：

```text
Setting and light: a calm, tastefully furnished interview space; two to three metres behind her a softly out-of-focus warm table lamp and a bookshelf, wall with a subtle plaster texture, nothing bright behind her head. Large soft key light 45 degrees from camera left as if from a big window, gentle negative fill on the right, subtle hair rim light, neutral 5600K with the lamp slightly warmer, constant exposure for the whole shot. True-to-life skin texture, critical focus on the eyes, natural color, fine film grain, no flicker.
```

```text
场景与光线：沉静、有品位的访谈空间；她身后两到三米有一盏失焦的暖色台灯和一排书架，墙面有细微的灰泥质感，头部后方没有亮的物体。镜头左侧 45 度大面积柔光主光，像大窗的光；右侧轻微吸光（负补光）；细微发丝轮廓光；5600K 中性白平衡，台灯略暖；整个镜头曝光恒定。真实皮肤纹理，眼睛焦点精准，自然色彩，细腻胶片颗粒，无闪烁。
```

### 3.6 负面补充（追加到每条底板原有负面词之后）

```text
airbrushed skin, beauty filter, porcelain skin, waxy skin, glossy oily skin, over-smoothed face, CGI, 3D render, video game character, uncanny valley, doll-like face, mannequin, perfectly symmetrical face, dead eyes, vacant stare, unblinking, rhythmic blinking, metronomic nodding, robotic movement, frozen pose, floating head, stiff shoulders, constant smile, frozen smile, wax lips, glossy lipstick, fused teeth, blurry teeth, mouth smear, morphing face, identity drift, texture flicker, boiling noise, warping background, shimmering edges, helmet hair, rigid hair, over-sharpened, HDR, halo, bloom glow, oversaturated, teal and orange grade, studio void, flat lighting, everything in focus, AI-generated look
```

```text
磨皮，美颜滤镜，瓷娃娃皮肤，蜡像质感，油光皮肤，过度平滑的脸，CG，三维渲染，游戏角色，恐怖谷，娃娃脸，人体模特，完全对称的脸，眼神空洞，呆滞凝视，不眨眼，节拍式眨眼，机械点头，机器人般的动作，定格姿势，脑袋漂浮感，肩膀僵硬，一直在笑，僵住的笑容，蜡像嘴唇，亮面唇膏，牙齿粘成一片，牙齿模糊，嘴部糊成一团，脸部变形，身份漂移，纹理闪烁，噪点翻滚，背景扭曲，边缘闪烁，头盔式头发，头发僵硬成块，过度锐化，HDR，光晕，泛光，过饱和，青橙调色，空洞影棚，平光，全部清晰无景深，AI 生成感
```

短版（负面框字数受限时）：

```text
airbrushed skin, beauty filter, waxy skin, CGI, uncanny valley, dead eyes, unblinking, metronomic nodding, frozen pose, constant smile, fused teeth, mouth smear, morphing face, texture flicker, over-sharpened
```

**提醒：** 负面词太长可能稀释权重（推测）。先用短版，哪类问题反复出现就补哪类的完整词。

### 3.7 可选气质句（叠加层，不改定稿）

单独成行放在场景句之后（`--style`）。它定的是整体气质，不是具体指令；如果模型因此变得“戏剧化”，就去掉。

```text
Overall feel: a calm, premium interview — natural, intimate and quietly confident, like a carefully lit documentary, not an advertisement and not an avatar.
```

```text
整体气质：沉静、高级的访谈感——自然、亲近、从容自信，像布光讲究的纪录片，而不是广告，也不是虚拟形象。
```

---

## 4. 参考照规则（用户上传照片 → I2V 仍然像真人）

`identity set --photo` 不会自动读脸，**照片本身就是身份和质感的上限**。

| 维度 | 要 | 不要 | 为什么 |
|---|---|---|---|
| 镜头 | 等效 50–85mm；手机用 2×/3× 长焦，站在 1.2–1.5 米外 | 前置自拍、臂长距离的广角 | 广角近拍会放大鼻子、缩小耳朵，模型会把畸变当成“这个人的脸” |
| 光 | 柔和窗光或柔光箱，从**画面左侧**约 45° 打来（和底板主光同侧），暗面有自然过渡 | 闪光灯直打、环形灯（眼里一个圈）、彩色灯、顶光、强逆光 | 光向和底板不一致，模型就要“重新打光”，最容易出塑料皮和错误的眼神光 |
| 色温 | 日光、中性（约 5000–6000K），单一光源色 | 暖黄室内灯混窗光、屏幕蓝光 | 混合色温会被烘进肤色 |
| 表情 | 放松的中性脸，嘴唇轻闭，眼睛看镜头；可再拍一张浅笑备用 | 大笑、露齿笑、嘟嘴、挑眉 | 参考是大笑，底板就会“一直在笑” |
| 构图 | 头肩到胸口，脸高占画面 25–40%，正脸 ±10°，相机和眼睛同高，耳朵可见，头发不遮脸 | 侧脸、俯拍、仰拍、裁掉额头、头发挡眼或嘴 | 正脸、清楚的五官关系是身份锁定的基础，也符合无遮挡 |
| 画质 | 长边 ≥ 2000px，眼睛清晰，无运动模糊，原图直出 | 美颜、滤镜、AI 修图或增强、HDR 模式、人像模式虚化（发丝边缘有伪影）、截图、重压缩 | 任何“修过”的痕迹都会被放大成 AI 味；人像模式的假虚化会让头发边缘在视频里闪 |
| 服装 | 和 `--outfit` 一致；纯色、无图案无 logo；不戴首饰和眼镜，除非每条底板都戴 | 条纹、格子、大 logo、反光面料 | 图案会闪烁、摩尔纹；服装不一致会让模型在两套衣服之间漂移 |
| 背景 | 简洁、浅色或中性 | 杂乱、强图案、其他人 | 背景会被烘进参考特征 |
| 组合（可选） | 同一次拍摄、同一光线下：正脸 1 张 + 左右 3/4 侧各 1 张 + 腰部以上 1 张（给 K02） | 不同年份、不同发型、不同妆容混用 | 多参考图只在工具支持时有用（推测），但前提是“同一个人同一天” |

**直接拒收：**
- 美颜自拍、滤镜照、AI 生成或 AI 增强过的“照片”；
- 戴墨镜、手在脸边、头发挡脸；
- 闪光灯硬光、彩色光；
- 多人合影裁出来的脸；
- 多年前的旧照（年龄感对不上）；
- 没有本人授权的他人照片（合规，见可行性报告 §8）。

**参考照 → 首帧图：** 先用首帧图提示词（加 §3.4 补丁）出 IMG-A / IMG-B，再和参考照并排对比同一性和质感。首帧图被“修漂亮”了就重出，不要带着它去生成底板。

---

## 5. 入库评分卡（真人 vs AI，10 项是 / 否）

每条底板抽 4–5 次，逐条打勾。用手机竖屏，1 倍速看一遍，2 倍速再看一遍；皮肤和嘴放到 100% 看。

| # | 检查（是 / 否） | Check (yes / no) |
|---|---|---|
| 1 | 皮肤：100% 放大看鼻翼和脸颊，毛孔和细纹理清楚，而且帧与帧之间稳定（不磨皮，不“翻滚”） | Skin: at 100% on nose/cheeks, pores and fine texture are visible and stable frame to frame (no airbrush, no boiling) |
| 2 | 眼睛：眨眼不规律（30 秒至少约 6 次、间隔不均），眼神有细小移动，眼神光和主光方向一致 | Eyes: irregular blinks (≈6+ per 30 s, uneven gaps), small eye movements, catchlight matches the key side |
| 3 | 呼吸：回位静止段肩膀和胸口有轻微起伏，不是定格画面 | Breathing: during home-pose holds the shoulders/chest move slightly — not a freeze-frame |
| 4 | 节奏：2 倍速看一遍，没有重复的点头或摇摆循环 | Rhythm: watched at 2×, no repeating nod or sway loop |
| 5 | 嘴：嘴唇有纹理，牙齿颗颗分明、不是一整块白，停顿时嘴完全闭合，没有糊嘴 | Mouth: textured lips, individually defined teeth (not a white block), full closure at pauses, no smear |
| 6 | 身份（一票否决）：0 / 10 / 20 / 30 秒四帧与参考图并排，是同一个人，无漂移 | Identity (veto): frames at 0/10/20/30 s side by side with the reference are the same person, no drift |
| 7 | 头发与边缘：头顶和发缝处有少量自然碎发（远离脸），发丝和耳朵边缘稳定不闪，不是头盔头 | Hair & edges: a few natural flyaways at the crown/parting (off the face), stable hair/ear edges, no helmet hair |
| 8 | 光与景深：脸的暗面有柔和立体感（不是平光），背景有减光和虚化，没有光晕或 HDR 感 | Light & depth: soft modelling on the shadow side (not flat), background falloff and defocus, no glow or HDR |
| 9 | 表情：笑容会出现也会自然退去，中性脸不呆，左右有细微不对称 | Expression: smiles arrive and fade, neutral face is not dead, slight left-right asymmetry |
| 10 | 底板纪律（一票否决）：手不过胸、不碰脸，切点处回位，嘴始终无遮挡，无字幕水印，曝光恒定 | Plate rules (veto): hands below chest and off the face, home pose at cut points, mouth never covered, no text/watermark, constant exposure |

**规则：** 10 项里至少 9 个“是”才入库；第 6 项（身份）或第 10 项（底板纪律）任何一个“否”直接淘汰。
**Rule:** Enter the library only with ≥ 9 of 10 YES; a NO on #6 (identity) or #10 (plate rules) rejects the take regardless.

**快速检查技巧：**
- **#3 定格：** 逐帧看回位段，连续 10 帧以上完全一样 = 定格（复制帧）。
- **#4 节拍：** 把 30 秒拖到 2 倍速，节拍感会非常明显。
- **#6 身份：** 抽 4 帧和参考照拼成一张图并排看；人脸相似度工具目前未内置，见 ARCHITECTURE §5。
- **记录：** 把每条的 10 项结果写进 `08_qc/`。哪一项反复失败，就去对应原则补提示词，而不是一直抽卡。

---

## 6. 不要做（看起来“高级”，实际上 AI 味更重）

| 看起来高级的做法 | 实际后果 | 换成 |
|---|---|---|
| 提示词堆 “8K, masterpiece, ultra-detailed, hyperrealistic, best quality” | 把模型推向 CG 精修：油光皮、过锐、发光 | 用摄影语言：镜头、光比、焦点、皮肤细节（§3.2） |
| 过度锐化 / “crisp, razor sharp” | 皮肤和发丝出现白边，纹理逐帧沸腾 | 焦点在眼睛，其余自然虚化；后期不锐化 |
| HDR、glow、bloom、梦幻柔光、“cinematic haze” | 广告和游戏质感，暗部发灰，高光发光 | 克制调色、柔和高光过渡；柔光宁可不加 |
| 美颜、磨皮、人脸增强（含 GFPGAN / CodeFormer 满强度） | 塑料脸、身份被改 | 永不磨皮；修复只在口型后低强度用，用完和参考照比对 |
| 一直微笑 / “cheerful, always smiling” | 僵笑，恐怖谷 | 笑容会来也会走：“先从眼睛里出来、再自然退去” |
| 加运镜（推、摇、环绕、手持抖动）追求电影感 | 生成运动更容易漂移，而且切片和拼接全废 | 机位锁死；景别变化交给后期推近（`punch`） |
| 极浅景深 f/1.2 奶油虚化 | 发丝边缘抠图感、闪烁 | f/2.8–4，焦外柔和但边缘稳定 |
| 青橙调色、压暗部、饱和嘴唇 | 一眼“滤镜片” | 真实肤色、温和反差、同一 LUT |
| 为了“有生气”加大手势、夸张表情 | 破坏切片和口型（手过脸、头转大），而且像在表演 | 生气来自微行为：呼吸、眨眼、眉、眼神（§3.3） |
| 每段都塞满微动作指令 | 动作过多，变成“演”，重复感反而更强 | 微行为写一次（表演块），时间线只写每段的一个主动作 |
| 完美对称构图 + 左右等量补光（蝴蝶光） | 人体模特感 | 3:1 光比、侧主光、保留脸的不对称 |
| 插帧到 60fps、AI 超分后再切片 | 肥皂剧感、嘴部伪影、细节翻滚 | 原生 24/25 fps；只在母版阶段做一次非生成式放大 |
| 只靠后期加重颗粒“去 AI” | 像套了滤镜，盖不住动作和眼神问题 | 先修 P0（动作、眼睛、皮肤），颗粒只做细而统一的一层 |
| 用“AI 网红”风格图当参考 | 继承标准化 AI 脸 | 真人、原图直出、同光向的参考照（§4） |

---

## 7. 建议并入 SKILL.md 的 §2.5 提纲（只列要点）

- **§2.5 真人感与高级感（去 AI 味）**
  - 一句话目标：像布光讲究的真人访谈；生气来自微行为，不来自大动作；底板纪律不变。
  - P0 七条：真皮肤 · 活着的静止 · 会思考的眼睛 · 由语言驱动的动作 · 有比例的光和有空间的墙 · 真镜头光学 · 首帧和参考照决定一半。
  - 叠加层：`prompts/overlays/human_premium.json`。用 `istream prompts overlay --plate … [--compact] [--style] [--negative]` 复制，不改定稿，`prompts verify` 不受影响。
  - 参考照规则：长焦、同光向、中性表情、原图直出、拒收清单。详见 `docs/HUMAN_PREMIUM.md` §4。
  - 入库评分卡：10 项是 / 否，≥ 9 项通过，身份和底板纪律一票否决；结果写进 `08_qc/`。
  - 生成设置（推测）：I2V + 首帧；运动强度低到中；关掉增强和美颜开关；不插帧；入库前不做 AI 超分。
  - 轻后期：统一 LUT；不磨皮、不锐化；口型后整体加细颗粒（`render --grain 2–4`）。
  - 不要做清单：链接 §6。
  - 验证：Phase 0 A/B（基础版 vs 叠加版），按 §8 的门槛决定是否默认开启叠加层。

---

## 8. 怎么验证（Phase 0 A/B，未执行）

1. **样本：** K01、K02、O01 各跑两组，每组 4 次。A 组用基础提示词，B 组用 `prompts overlay` 叠加版。同一参考照、同一首帧图、同一模型和版本；中文和英文各测一轮。
2. **盲评：** 打乱顺序，5 个人用手机看，每条回答“真人拍的 / AI 生成的”，再填 §5 评分卡。
3. **客观记录：** 30 秒内眨眼次数和间隔分布；回位段有没有复制帧；身份四帧对照；字数是否被截断（尤其 `--compact`）。
4. **通过门槛：** B 组“被判为真人”的比例比 A 组高至少 20 个百分点，评分卡平均通过率更高，而且没有引入新的底板纪律问题（手、遮挡、切点）。满足后才把叠加层设为 GENERATE_PACK 的默认推荐；否则逐段回退（先去掉风格句，再去掉负面长版），找出是哪一段起作用。
5. **记录：** 结果写进 `dh-library/08_qc/human_premium_ab.md`，并把实测单价和返工率回填 `istream/cost.py`。
