# 華鳳特區美建地：數位人口播（lanshu 無限流）

用 `lanshu-infinite-stream-koubo` skill 做的 9:16、40 秒口播。配音沿用 `huafeng-land-vo/assets/narration.wav`。

> **目前是「分鏡預覽」**：主播畫面是 skill 內建的灰色佔位人形，還沒有你本人的數位人，嘴型也沒有對齊。
> 時間軸、版式、圖卡、字幕、口型任務都已經排好；換上真的母片，同一份腳本就能直接出正式版。

## 檔案

| 檔案 | 用途 |
|---|---|
| `script.md` | 腳本＋鏡頭標記（`[隐藏]` 主播隱藏、`[画中画]` 主播縮成圓窗、`[MG: id]` 圖卡） |
| `align.json` | 每句的起訖時間（由旁白逐字時間產生） |
| `mg/cards.html` → `mg/*.png` | 7 張圖卡原始檔，改字後執行 `node mg/build.mjs` |
| `mg_library.json` | 圖卡 id → PNG 與位置 |
| `out/timeline.json`、`qc.txt`、`lipsync.txt`、`cost.txt` | 剪輯時間軸、品質檢查、口型任務、成本估算 |
| `out/華鳳特區美建地-口播分鏡預覽.mp4` | 成品預覽 |

## 重新輸出

```bash
S=.agents/skills/lanshu-infinite-stream-koubo; P=films/huafeng-land-koubo
export ISTREAM_FONT=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc   # 沒有中文字型時才需要
(cd $S && python3 -m istream plan ../../../$P/script.md --cat catalog/spec/plates.json --align ../../../$P/align.json --aspect 9:16 --out ../../../$P/out/timeline.json)
(cd $S && python3 -m istream lipsync plan ../../../$P/out/timeline.json --cat catalog/spec/plates.json --out ../../../$P/out/lipsync_jobs.json)
(cd $S && python3 -m istream render ../../../$P/out/timeline.json --cat catalog/spec/plates.json --jobs ../../../$P/out/lipsync_jobs.json --workdir ../../../$P/build --out ../../../$P/out/華鳳特區美建地-口播分鏡預覽.mp4)
```

## 換成你本人的數位人（正式版）

1. 準備一張正面、光線乾淨、臉沒有被擋住的照片，執行
   `python3 -m istream identity set --photo me.jpg --id chen --outfit "navy blazer over white top"`
2. 打開 `prompts/GENERATE_PACK.md`，把 K01／K02／O01 的提示詞貼到影片模型（可靈、Veo 等）生成母片。標準組約 29–63 美元，只要做一次。
3. `istream slice` 切片、複核標籤後，用新的 catalog 取代上面的 `catalog/spec/plates.json`。
4. 口型：只有主播露臉的 26 秒要送口型模型（另外 13.5 秒被圖卡蓋住，跳過不付費）。估計每支 1.3–2.1 美元，詳見 `out/cost.txt`。

QC 只有一個提醒：圖卡覆蓋率 64%，高於 skill 建議的 15–35%。土地物件需要大量資料圖卡，所以刻意保留。
