# Changelog

## 开源整理（2026-11-01）

- 补充 MIT LICENSE、项目封面、安装说明、依赖检查和 GitHub Actions 测试。
- 将定稿提示词源文件收进仓库，提示词库可独立重建，原库内容保持一致。
- 导入口型任务时限制输入、输出路径在工作目录内，包含符号链接检查。
- 渲染时验证变速参数，避免将外部 JSON 字符串拼入 FFmpeg 滤镜。
- 新增 7 项回归测试；真实口型服务仍需自行接入，passthrough 仅供预览。

## v1.3 — 手势与表情（2026-10-30）

用户反馈：数字人视频缺少真人常见的手势和面部表情。本版只扩展叠加层、词表和规划器，**不改** K01–K03 定稿，`prompts verify` 照常通过；没有重新生成任何视频。

- **文档：** `docs/GESTURE_EXPRESSION.md`（由 `tools/build_gesture_expression_doc.py` 从叠加层数据渲染），A–I 九节：
  - A 差距诊断：逐段对照 GENERATE_PACK 时间线，并用目录自动统计；
  - B 表情词表 E01–E10；
  - C 手势词表 G01–G11（只用于中景）+ 近景规则；
  - D 三条 30 秒例时间线（K02+ / K04 / K05，中英）；
  - E 脚本 → 标签映射；
  - F 提示词补丁；
  - G 评分卡加项 GE1–GE8；
  - H §2.6 提纲；
  - I 验证计划。
- **SKILL.md：** 新增 §2.6“手势与表情词表”，提纲见 `docs/SKILL_2_6_OUTLINE.md`；§2.2、§4.1、§4.3、§10 同步。
- **叠加层：** `prompts/overlays/gesture_expression.json`（待验证），包括：
  - 只作用于指定底板的句子替换：K02 增强手势和表情，但不加计数和指向；K01 / K03 只加表情；
  - 按景别的表演补丁（中景“手势语法” / 近景“表情语法”，各有短版）和避免补丁；
  - 负面补充：表情类所有底板都加，手部类只加给中景；`negative_drop` 去掉会和补丁冲突的 `looking away`；
  - 新底板 K04（中景手势密集）/ K05（近景表情密集），只存在于叠加层，不进 `library.json`；
  - 意图映射、预期标签补丁、评分卡。
- **CLI：**
  - `prompts overlay --gesture`：在 human_premium 之后再叠 gesture_expression；
  - `--overlay a,b`：按顺序叠多个叠加层；
  - `--plate K04|K05`：取新底板提示词；
  - `catalog build-spec --overlay gesture_expression [--only-overlay] --out catalog/gesture`。
- **GENERATE_PACK：** 末尾固定渲染 `## 手势与表情（P0）`：命令、词表、替换句、补丁、负面、K04 / K05 完整中英提示词和评分卡。`identity set` / `restore` 重建后也会保留。
- **词表 / schema：**
  - 新增 6 个表情键、6 个手势键和 5 个 role（`agree` `contrast` `caveat` `think` `empathy`）；
  - 新增 `GESTURE_ALIASES` / `HAND_GESTURES` / `GESTURE_KIN`；
  - `schema/*`、`TAGS.md`、`PROMPT_LIBRARY.md`（VLM 枚举）已重新生成，旧目录仍然合法。
- **脚本与规划器：**
  - 新意图标记 `[认同] [对比] [提醒]/[转折]/[注意] [思考] [共情]`，以及点名标记 `[手势: …]` / `[表情: …]`；
  - 规划器对新意图按偏好标签加 0.8 分，对点名请求加 2.0 分（只作用于该句第一个跳切段）；选不到点名的动作时给出警告；
  - 老脚本（demo60 替身 / spec 16:9 / spec 9:16 / longform）的规划结果逐字节不变。
- **目录与配方：** `catalog/gesture/`（9 条底板、44 个预期镜头）；`recipes/gesture/`（脚本 → plan.txt / qc.txt / timeline.json，QC 通过，0 FAIL / 0 RISK / 0 WARN，不出片）。
- **测试：** 新增 9 个契约测试（共 37 个）。覆盖：
  - 叠加不改库、定稿逐字一致；
  - 替换只作用于指定底板；
  - K02 无计数 / 指向 / 挥手；
  - 近景时间线不出现手；
  - 负面词按景别加入，冲突词已去掉；
  - 词表、别名、意图互相对得上；
  - 手势目录和叠加层一致，`catalog/spec` 未被改动；
  - 标记解析和规划器点名请求；
  - 生成包章节和文档与数据一致。
- **诚实边界：** 所有表情 / 手势补丁和 K04 / K05 都没有在真实视频模型上跑过，标为“待验证”。G04 计数是高风险，默认用 G05 节拍点 + 字幕 ①②③ 代替。

## v1.2 — 真人感 / 去 AI 味（2026-10-29）

- **§2.5 已并入 SKILL.md**（父会话合并提纲）。

- **文档：** `docs/HUMAN_PREMIUM.md`（由 `tools/build_human_premium_doc.py` 从叠加层数据渲染），内容包括：
  - 现有提示词诊断；
  - 13 条手艺原则（P0 ×7 / P1 ×6）；
  - 中英补丁、参考照规则、10 项入库评分卡、不要做清单；
  - 建议并入 SKILL.md 的 §2.5 提纲；
  - Phase 0 A/B 验证方案。
- **叠加层：** `prompts/overlays/human_premium.json` 是唯一数据源，包括：
  - 句子替换（定格式静止 → 有呼吸、节拍点头 → 语言驱动、均匀平光 → 自然减光、脸部锐利 → 眼睛对焦、露齿笑 → 眼睛先笑）；
  - 场景、表演、首帧补丁（含紧凑版）；
  - 可选气质句、Avoid 补充、负面补充（完整版 / 短版，中英）、评分卡。
- **CLI：** `python3 -m istream prompts overlay --plate K01|… [--first-frame IMG-A] [--lang en|zh|both] [--compact] [--style] [--negative] [--part A|B]`。只在复制时生效，**不改** `library.json`，K01–K03 定稿逐字校验不受影响。
- **GENERATE_PACK：** 末尾固定渲染 `## 真人感 / 去 AI 味（P0）`（P0 补丁 + 负面补充 + 评分卡），`identity set` / `restore` 重建后也会保留。
- **渲染：** `istream render … --grain N`（建议 2–4）在口型之后、MG 和字幕之前，给主播层整体加一层细颗粒，统一口型补丁的质感。
- **测试：** 新增 5 个叠加层契约测试（共 28 个）；identity 测试结束后把 GENERATE_PACK.md 原样恢复，不再写入 “test-teardown” 版本。
- **诚实边界：** 补丁都还没有在真实视频模型上做 A/B，按推测方案处理。

## v1.1 — 用户照片 → 数字人元视频（2026-10-29）

- **CLI：** `python3 -m istream identity set|show|restore`
  - `set --photo` 复制参考图到 `prompts/identity/<slug>/` 与 `dh-library/00_identity/<slug>/`，更新 `blocks.identity` 与首帧图 Subject，写出 **`prompts/GENERATE_PACK.md`**（K01/K02/O01 完整中英提示词 + 无遮挡清单）。
  - `restore` 从 `prompts/identity_default.json` 恢复定稿形象，使 `prompts verify` 再过。
- **文档：** `SKILL.md` §2.0「用户照片 → 数字人元视频」；`README.md` 入口；`docs/USER_PHOTO.md`。
- **诚实边界：** 不自动 VLM 读脸；外貌锁定靠 `--describe` / `--outfit` / `--name`。换身份后 frozen verify 为 N/A，属预期。
- 替身 DEMO 与装配测试未删。

## v1.0 — 初版技能包

- 提示词库、切片、规划、改片、QC、口型任务、渲染、成本、账本；demo60 + longform；22 个契约测试。
