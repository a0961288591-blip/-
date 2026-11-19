# 用户照片 → 数字人元视频 · User photo → digital human

## 顺序（必须）

1. **上传参考照**（正脸、光线干净、尽量无遮挡）
2. `python3 -m istream identity set --photo me.jpg …`
3. 打开 `prompts/GENERATE_PACK.md`，用 **K01 / K02 / O01** 提示词生成**无遮挡**元视频底板
4. `istream slice` 切片入库
5. 再写稿 / plan / edit / lipsync

先有可无限服用的元视频，才有切片；不要反过来。

## 命令

```bash
python3 -m istream identity set --photo ./me.jpg --id mydh \
  --name "可选称呼" \
  --outfit "solid navy blazer over plain white top" \
  --describe "可选外貌锁定（你写什么就锁什么；不会自动读图）"

python3 -m istream identity show
python3 -m istream identity restore   # 恢复包内定稿形象，prompts verify 再过
```

产物：

- `prompts/identity/<slug>/ref.jpg` + `identity.json`
- `dh-library/00_identity/<slug>/`（同内容，方便进素材库）
- `prompts/GENERATE_PACK.md`（一站式复制包）
- 更新后的 `library.json` / `PROMPT_LIBRARY.md` / `prompts-only.txt`

## 诚实边界

- **不会**自动用 VLM 分析你的脸；外貌只来自 `--describe` / `--outfit` / `--name`。
- 换身份后 `istream prompts verify` 会对不上 K01–K03 定稿（frozen_check），属预期；需要校验定稿时先 `identity restore`。
- 提示词仍需你在真实视频模型里跑；本包不替你调用生成 API。
