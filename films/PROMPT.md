請幫我做一支土地物件的直式短影音（9:16、1080×1920、20 秒、繁體中文、有配樂和音效、不配旁白）。

【工具】
1. 影片用 HyperFrames 格式寫：一個 index.html，根元素加 data-composition-id、data-width="1080"、data-height="1920"。所有動畫用 GSAP 寫成一條 paused timeline，掛在 window.__timelines[<composition-id>]。可以改的文字和數字（標題、坪數、單價、電話）放進 data-composition-variables。
2. 配樂和音效：先執行 `npx skills add alchaincyf/huashu-motion -y`，用它的 OM.music / OM.sfx 標好音效位置，再用 `om sound` 產生 assets/sound.wav，放進 <audio id="om-sound">。想用自己的音樂，就直接放 mp3 當 <audio>。
3. 輸出影片用 HyperFrames：`npx hyperframes check .` 檢查，`npx hyperframes render . -o out/成品.mp4` 輸出。
4. 範本：GitHub repo `a0961288591-blip/-` 的 `films/huafeng-land/`（已確認可以用 HyperFrames 直接輸出）。能存取的話，直接複製這個資料夾當起點，只換資料、照片和地界；不能存取就照下面的結構從頭做。
5. 環境沒有 Chrome 的話，指定 Chromium 的路徑（雲端環境是 /opt/pw-browsers/chromium）。
6. 字體用 Noto Sans TC（繁中）。從 Google Fonts 用 text= 參數下載「只含片中文字」的子集；片中文字有改，就要重新下載一次。

【物件資料】←改這裡
- 標題：
- 地段：
- 地坪：　坪
- 使用分區／建蔽率／容積率：
- 單價：　萬/坪（總價自動計算）
- 臨路與面寬（例：北臨○○巷 面寬 34.7m、南臨○○路 8.7m）：
- 賣點 3–5 點：
- 片尾：公司／姓名／電話

【素材】←把照片一起上傳
- 地籍圖截圖（看得到地界和尺寸）
- 同一區域的衛星空照截圖
- 街景照片 3–5 張
- 區位地圖截圖
- （選用）地形線稿

【影片結構】
- 0–3 秒 開場：深藍格線底、大標題、依地籍圖描出並轉正的地形（比例要對）、上下兩條道路和路名、面寬標籤、坪數大字。第一格就要有標題、地形、坪數，當封面。不要拿整張衛星圖當背景，太亂。動畫：地界上有白光繞行 → 地形裡面浮現衛星實景 → 尺寸標籤跳出 →（有雙面臨路才用）「雙面臨路」印章蓋下 → 鏡頭衝進地形。
- 3–7 秒 規格：地形 3D 傾斜、樓板一層層疊高；使用分區、建蔽率、容積率三張卡隨節拍落下；基準容積樓地板 = 地坪 × 容積率，並註明「實際依建管規定」。
- 7–11 秒 街景快切：每秒一張照片卡，各配一個金色標籤。標籤只寫照片裡看得到的事實，不要誇大。
- 11–15 秒 區位：地圖推近，本案圖釘有脈衝光圈，四張生活圈卡逐拍飛入，最後畫面暗下停半拍。
- 15–17.5 秒 價格：單價大字砸入，總價數字跑動，音樂在這裡最強。
- 17.5–20 秒 片尾：標題、規格、公司、姓名、電話。

【風格】
深海軍藍 #0b1a2e＋金 #e8b64c＋米白 #fff8ec。配樂 120 BPM，風格四選一：funk 活潑／cinematic 大氣／pulse 時尚／piano 溫暖。每個動作落下的那一格都配音效。

【精準度】
- 地界要準：用 OpenCV（SIFT 特徵比對＋estimateAffinePartial2D）把地籍圖對到衛星圖，算出角點後再套繪，不要用眼睛估。
- 地圖、街景截圖要保留 Google 浮水印，並加上「© Google」出處小字。

【檢查與交付】
- `npx hyperframes check .` 不能有 error。
- 用 `npx hyperframes snapshot` 看開場、價格、片尾等關鍵畫面。
- `npx hyperframes render` 輸出 MP4，確認有聲音、長度 20 秒、沒有單格閃畫面、沒有超過 1 秒的停頓。
- 把成品 MP4 傳給我，並 commit 和 push。
