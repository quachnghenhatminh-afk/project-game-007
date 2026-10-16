# CLAUDE.md — Voice Co-op Tower Defense (tên tạm: "Project Game 007")

> File này dành cho Claude Code. Đọc toàn bộ trước khi làm bất cứ việc gì.
> Tài liệu thiết kế đầy đủ: `docs/GDD.md`. Hướng dẫn test itch.io: `docs/HUONG-DAN-TEST-ITCH.md`.

## 1. Bối cảnh dự án

- **Game:** thủ thành + nhập vai, **góc nhìn thứ nhất (FPS-style)**, co-op 4–6 người, chạy trên trình duyệt.
- **Điểm độc đáo:** người chơi **hô câu lệnh tiếng Việt** vào micro để kích hoạt kỹ năng.
- **Phát hành:** HTML5 trên itch.io (file tĩnh trong iframe) + một server multiplayer riêng.
- **Team:** 1 người, là **3D artist, không phải lập trình viên**. Claude Code viết toàn bộ code.

### Cách làm việc với người dùng

- Trả lời và giải thích bằng **tiếng Việt**. Code, tên biến, comment, commit message bằng **tiếng Anh**.
- Người dùng không đọc code. Sau mỗi việc, báo bằng ngôn ngữ thường: đã làm gì, chạy thử thế nào (lệnh chính xác), cần họ kiểm tra gì trên màn hình.
- **Không** yêu cầu người dùng tự sửa code. Nếu cần họ làm gì (xuất model, cấp quyền micro, test trên itch.io), hướng dẫn từng bước.
- Ưu tiên giải pháp **đơn giản, ít phụ thuộc**. Không thêm thư viện khi chưa cần.
- Commit nhỏ, thường xuyên. Mỗi tính năng xong phải chạy được.
- Khi chưa có asset thật, dùng **khối hình học placeholder** (capsule cho người chơi, box cho tháp, sphere cho quái). Không chặn tiến độ vì chờ art.

## 2. Stack công nghệ (đã chốt)

| Phần | Công nghệ |
|---|---|
| Ngôn ngữ | TypeScript (strict) |
| Render 3D | **Three.js** |
| Build client | Vite |
| Multiplayer | **Colyseus** (Node.js, server-authoritative, WebSocket) |
| Nhận diện giọng nói | **vosk-browser** (WASM, chạy trong Web Worker) + mô hình `vosk-model-small-vn-0.4` (~32MB), chế độ **grammar giới hạn** |
| Dự phòng giọng nói | Web Speech API (`webkitSpeechRecognition`, `lang = "vi-VN"`), chỉ Chrome/Edge/Safari |
| Quản lý package | pnpm workspaces |
| Test | Vitest cho logic thuần trong `shared/` và `server/` |

Luôn kiểm tra phiên bản mới nhất của Three.js và Colyseus khi cài; không giả định API từ trí nhớ, đọc docs/typings khi không chắc.

Lưu ý: `vosk-browser` ít được cập nhật gần đây. Nếu gặp lỗi không khắc phục được, báo người dùng và đề xuất phương án thay thế, đừng tự ý đổi.

## 3. Cấu trúc thư mục

```
/
├── CLAUDE.md
├── docs/
│   ├── GDD.md              # Tài liệu thiết kế game
│   └── ASSETS.md           # Danh sách asset cần làm + trạng thái (Claude Code duy trì)
├── shared/                 # Code dùng chung client + server: types, hằng số, dữ liệu cân bằng
│   └── src/
│       ├── commands.ts     # BẢNG CÂU LỆNH GIỌNG NÓI (nguồn sự thật duy nhất)
│       ├── balance.ts      # Chỉ số tháp, quái, kỹ năng
│       └── messages.ts     # Kiểu message client ↔ server
├── server/                 # Colyseus
│   └── src/rooms/GameRoom.ts
├── client/                 # Vite + Three.js
│   ├── public/
│   │   ├── models/         # .glb từ người dùng
│   │   └── voice/          # model Vosk (.tar.gz)
│   └── src/
│       ├── main.ts
│       ├── render/         # scene, camera FPS, ánh sáng, tải asset
│       ├── input/          # bàn phím, chuột (pointer lock)
│       ├── voice/          # micro, worker Vosk, khớp câu lệnh
│       ├── net/            # client Colyseus, nội suy
│       ├── game/           # logic phía client: dự đoán, hiệu ứng
│       └── ui/             # HUD, lobby, màn hình kiểm tra micro
└── tools/
    └── voice-lab/          # Trang thử nghiệm giọng nói độc lập (Giai đoạn 0)
```

## 4. Kiến trúc cốt lõi

### 4.1 Multiplayer (server-authoritative)

- **Server quyết định:** quái (sinh, di chuyển, máu), tháp, sát thương, mana, cooldown, đợt quái, thắng/thua.
- **Client gửi:** vị trí/hướng nhìn của mình (10–20 lần/giây), ý định hành động (`CastIntent`, `BuildIntent`).
- Di chuyển người chơi: client tự di chuyển (cảm giác mượt), server chỉ kiểm tra hợp lý (tốc độ tối đa). Đây là game co-op nên không cần chống gian lận chặt.
- Người chơi khác và quái: nội suy (interpolation) ~100ms phía client.
- **Quái đồng bộ bằng "quãng đường trên đường đi"** (một số `pathProgress`), không gửi tọa độ xyz. Client tự tính vị trí từ đường đi. Rẻ băng thông.
- Phòng chơi bằng **mã phòng 4–5 ký tự**. Không tài khoản, không lưu tiến trình ngoài trận.
- Server production phải chạy **WSS (TLS)** vì itch.io là HTTPS.

### 4.2 Pipeline giọng nói

```
Giữ CHUỘT PHẢI (hoặc V) (push-to-talk) → mana tụt liên tục
  → AudioWorklet đẩy PCM sang Web Worker chạy Vosk (GRAMMAR = câu lệnh + "[unk]")
  → kết quả TẠM (partial) chứa trọn một câu chú → chốt ngay (retrieveFinalResult)
  → kết quả cuối khớp commands.ts → phép nằm trên tay (mana ngừng tụt, thể lực tụt)
     (không khớp → nghe tiếp; thả chuột trước khi nhận ra → chờ kết quả cuối)
  → THẢ chuột → bắn tới điểm ngắm lúc thả → CastIntent { commandId, aimPoint, empowered }
  → gửi server → server kiểm tra mana/thể lực → phát sự kiện cho mọi client
```

Quy tắc (chi tiết + bảng tình huống: `docs/GDD.md` mục 3.1):
- **Push-to-talk bắt buộc.** Không nghe liên tục: tránh micro bắt tiếng đồng đội từ loa/Discord.
- Luật mana/thể lực là logic thuần trong `shared/src/playerState.ts` (có test giả lập tình huống); `client/src/game/spellCaster.ts` nối luật đó với giọng nói, tay, hiệu ứng, HUD.
- Người chơi đọc tự do bất kỳ câu chú nào. Phụ đề 2 giây cho biết vừa đọc gì.
- **Mọi kỹ năng đều có phím tắt dự phòng** (1–7, dùng khi đang giữ chuột phải). Có tùy chọn tắt hẳn giọng nói.
- Khớp câu chú: chính xác trước, rồi **gần đúng ≥70%** theo âm tiết, đúng thứ tự, phải hơn hẳn câu đứng thứ 2 (`fuzzyMatchCommand` trong `shared/src/voiceMatch.ts`).
- Bản đồ: mỗi map trả về `GameMap` (`client/src/render/gameMap.ts`) — va chạm tròn/hộp, điểm xuất phát, vị trí pha lê, ngày/đêm. Hiện có `citadel` và `vn-base`; chọn bằng `?map=` hoặc nút ⚙.
- Âm thanh: `client/src/audio/sfx.ts` tạo bằng WebAudio (chưa có file âm thanh).
- Độ trễ đo trong voice-lab: "từ lúc ngừng nói → phép lên tay" (hoặc "từ lúc thả chuột → kết quả" nếu thả sớm).
- Model Vosk tải **một lần ở lobby** với thanh tiến trình, cache bằng Cache Storage API.
- Ghi log (dev mode) mỗi lần nhận diện: text, thời gian từ thả phím → kết quả. Dùng để đo độ trễ.

### 4.3 Bảng câu lệnh

`shared/src/commands.ts` là nguồn sự thật duy nhất. Grammar của Vosk, phím tắt, UI hướng dẫn đều sinh ra từ bảng này. Mỗi câu lệnh có: `id`, `phrases` (câu chính + alias), `classId`, `hotkey`, `costMana`, `cooldownMs`. Xem danh sách trong `docs/GDD.md` mục 5.

## 5. Quy ước asset (cho người dùng là artist)

Claude Code phải tuân theo khi tải asset, và nhắc người dùng khi asset sai quy ước:

- Định dạng **.glb**. 1 unit = 1 mét. Trục Y hướng lên. Nhân vật nhìn về **+Z**.
- Tên file: `kebab-case` — `enemy-goblin.glb`, `tower-arrow.glb`, `player-mage-body.glb`, `player-mage-fparms.glb`.
- Tên animation clip: `idle`, `walk`, `run`, `attack`, `cast`, `hit`, `die`. Viết thường, tiếng Anh.
- **Mỗi class người chơi cần 2 bản:** thân đầy đủ (người khác nhìn thấy) + tay góc nhìn thứ nhất (`-fparms`).
- Ngân sách gợi ý: quái 1.5k–4k tris, người chơi 8k–15k, tháp 2k–6k. Texture tối đa 1024px, ưu tiên 512px cho quái.
- Claude Code nén asset bằng `gltf-transform` (meshopt + KTX2) trong bước build. Người dùng chỉ cần xuất .glb gốc.
- Duy trì `docs/ASSETS.md`: danh sách asset cần, trạng thái (placeholder / đã có), yêu cầu animation.

## 6. Lộ trình — ĐANG Ở GIAI ĐOẠN 0

### Giai đoạn 0 — Kiểm chứng kỹ thuật (làm đầu tiên)

Mục tiêu: chứng minh giọng nói + micro + pointer lock hoạt động **bên trong iframe itch.io** trước khi viết game.

1. Khởi tạo monorepo pnpm (`shared`, `client`, `server`, `tools/voice-lab`).
2. `tools/voice-lab`: một trang HTML/TS tối giản:
   - Nút "Cho phép micro" → xin quyền.
   - Tải model Vosk tiếng Việt, có thanh tiến trình.
   - Giữ [V] để nói, thả ra → hiện câu nhận được, câu lệnh khớp, **độ trễ (ms)**.
   - Bảng thống kê: số lần thử, tỉ lệ khớp đúng, độ trễ trung bình/p95.
   - Chuyển đổi giữa Vosk và Web Speech API để so sánh.
   - Một khung 3D Three.js nhỏ có pointer lock (click để khóa chuột) để test cùng lúc.
3. Script build ra file `.zip` sẵn sàng upload itch.io.
4. Viết hướng dẫn (tiếng Việt) cho người dùng: upload lên itch.io dạng HTML5, thử trên Chrome, Edge, Firefox, ghi lại kết quả.

**Tiêu chí qua Giai đoạn 0:** trong iframe itch.io, độ trễ thả phím → kết quả < 500ms (p95 < 800ms), tỉ lệ khớp đúng > 90% với bộ 10–15 câu lệnh, pointer lock và micro chạy cùng lúc.

Nếu không đạt: dừng lại, báo người dùng số liệu và đề xuất hướng xử lý (đổi câu lệnh, đổi engine nhận diện, hoặc host game ngoài itch.io và để itch.io chỉ là trang giới thiệu).

### Các giai đoạn sau (chi tiết trong GDD)

1. **Lõi chơi đơn:** 1 bản đồ, 1 đường quái, class Pháp Sư, 3 loại tháp, 5 đợt quái, góc nhìn thứ nhất.
2. **Multiplayer:** Colyseus, lobby mã phòng, 2 → 4 người.
3. **Nhập vai & nội dung:** 4 class, lên cấp trong trận, combo giọng nói giữa đồng đội, 3 bản đồ, mở rộng lên 6 người.
4. **Hoàn thiện & phát hành:** UI, hướng dẫn, hiệu chỉnh micro, tối ưu, trang itch.io.

Không nhảy giai đoạn. Không làm tính năng của giai đoạn sau khi giai đoạn hiện tại chưa đạt tiêu chí.

## 7. Hiệu năng (mục tiêu)

- 60 FPS trên laptop tầm trung có GPU tích hợp, ở 1080p.
- Tối đa ~80 quái trên màn hình. Dùng `InstancedMesh` cho vật thể tĩnh/lặp lại; quái có animation dùng chung `AnimationClip`, tắt cập nhật xương khi ở xa.
- Tổng dung lượng tải lần đầu (không tính model giọng nói) < 30MB.
- Cập nhật mạng: server tick 20Hz.

## 8. Lệnh thường dùng

```
pnpm install
pnpm voice:model  # tải model Vosk tiếng Việt (1 lần, ~34MB, không commit) + xuất model-vocab.txt
pnpm dev          # bản chơi (desktop + mobile, có giọng nói), http://localhost:5173
pnpm voice-lab    # trang đo giọng nói, http://localhost:5174
pnpm build:itch   # bản chơi → release/game-itch.zip (upload chính lên itch.io)
pnpm build:itch-lab  # trang đo giọng nói → release/voice-lab-itch.zip
pnpm preview:itch # chạy thử đúng bản đã build, http://localhost:4173
pnpm test         # Vitest (shared)
pnpm typecheck
```

Ghi chú kỹ thuật đã kiểm chứng:
- `git` không có trong PATH; dùng git đi kèm GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`).
- Model `vosk-model-small-vn-0.4` hỗ trợ grammar (có `Gr.fst` + `HCLr.fst`), không có `words.txt`; danh sách từ được trích từ `Gr.fst` vào `tools/voice-lab/model-vocab.txt`. Test `commands.test.ts` kiểm tra mọi từ trong câu lệnh có trong từ điển model.
- vosk-browser tự cache model đã giải nén trong IndexedDB (`/vosk`, theo URL) → luôn tải model bằng URL cố định. Cache này thay cho Cache Storage API.
- Dùng chung code: `tools/voice-lab` import từ `@game/client/*` (render, input, voice) và `@game/shared`.