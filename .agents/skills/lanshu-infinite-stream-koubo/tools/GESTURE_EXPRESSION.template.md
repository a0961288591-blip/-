# 手势与表情 · Gesture & Expression（v1.3 · P0）

> 用户反馈：数字人视频里缺少真人常见的行为，尤其是**手势**和**常见面部表情**。
> 本文给出可复用底板用的**表情词表（E01–E10）**、**手势词表（G01–G11）**、例时间线、脚本到标签的映射、提示词补丁和入库评分加项。
> 状态：{{status_zh}}
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

{{COVERAGE_TABLE}}

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

{{EXPR_LEXICON}}

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
- {{mcu_rule.zh}}
- *{{mcu_rule.en}}*
- K01 / K03 的叠加补丁只加表情，不加任何手部动作。

{{GESTURE_LEXICON}}

---

## D. 例时间线（30 秒，EN + ZH）

下面三条都按 1 秒回位 + 6 秒动作段的标准节奏，切点处双手（或头部）回位。表格由叠加层生成；“词表 / 标签”一列就是切片后的预期标签。

### D.1 K02+（增强版中景主底板：原 K02 + 叠加层替换句）

不改定稿：生成时用 `prompts overlay --plate K02 --gesture`，叠加层把四个动作段换成下表的句子。
- **不加计数**：K02 的避免词禁了数手指。
- **不加指向**。

{{TIMELINE_K02}}

### D.2 K04 · 中景手势密集底板（新，叠加层定义）

四段四种手势：G02 递出、G03 对比、G05 节拍点、G07 耸肩，配 E01 / E04 / E02 / E06 表情。
- 计数（G04）**不放进底板**：要试的话，单独抽一条“K04 计数变体”，至少抽 6 次。
- 不合格就一律用 G05 + 字幕 ①②③。

{{TIMELINE_K04}}

### D.3 K05 · 近景表情密集底板（新，叠加层定义）

手全程不入画。四段：
- s1：E03 思考一瞥 + E04 扬眉；
- s2：E05 轻皱眉 + E09 共情柔和；
- s3：E06 轻笑后收 + E01 浅笑；
- s4：E07 倾听脸 + E10 会心（闭嘴段）。

K05 的避免词和负面词单独写过：去掉了 `looking away` 和 `laughing`，改成“视线离开镜头超过一秒”“张嘴大笑”，不然会和思考一瞥、轻笑冲突。

{{TIMELINE_K05}}

完整提示词：

```bash
python3 -m istream prompts overlay --plate K04 --lang both --negative --gesture
python3 -m istream prompts overlay --plate K05 --lang both --negative --gesture
```

`GENERATE_PACK.md` 的“手势与表情（P0）”一节也直接列出了 K04 / K05 的完整中英提示词。

---

## E. 脚本 → 标签映射

### E.1 意图映射表

{{INTENT_TABLE}}

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
  - 现在共 {{n_gesture_keys}} 个手势 / 表情键、{{n_role_keys}} 个 role。
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

{{REPLACE_TABLE}}

### F.3 表演补丁（Performance / 表演 句末）

**中景 MS · 手势语法：**

```text
{{perf_ms.en}}
```

```text
{{perf_ms.zh}}
```

**近景 MCU · 表情语法：**

```text
{{perf_mcu.en}}
```

```text
{{perf_mcu.zh}}
```

**短版（`--compact`）：**

```text
{{perf_ms_compact.en}}
{{perf_mcu_compact.en}}
```

```text
{{perf_ms_compact.zh}}
{{perf_mcu_compact.zh}}
```

### F.4 避免补丁（Avoid / 避免 行末）

- **中景：** {{avoid_ms.en}} · {{avoid_ms.zh}}
- **近景：** {{avoid_mcu.en}} · {{avoid_mcu.zh}}

### F.5 负面补充

所有底板：

```text
{{negative.en}}
```

```text
{{negative.zh}}
```

中景再加：

```text
{{negative_ms.en}}
```

```text
{{negative_ms.zh}}
```

字数受限时的短版：`{{negative_ms.short_en}}`

{{negative_drop}}

### F.6 字数（字符数，EN / ZH）

{{LENGTH_TABLE}}

**选法：**
- 英文版即使只叠手势表情、加 `--compact`，也在 3,400 字符以上。
- 工具限约 2,500 字符时，用中文版：两层都叠的完整版也不到 2,000 字。
- 工具限约 4,000 字符时，英文用“只叠手势表情 `--compact`”（约 3,400–3,800）。两层叠加的英文版都超过 4,000，要两层就用中文。
- 不要手删定稿句子来压字数。

---

## G. 入库评分卡加项（8 项是 / 否，和 HUMAN_PREMIUM 的 10 项一起用）

{{SCORECARD_TABLE}}

**规则：** {{scorecard_rule.zh}}
*{{scorecard_rule.en}}*

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
