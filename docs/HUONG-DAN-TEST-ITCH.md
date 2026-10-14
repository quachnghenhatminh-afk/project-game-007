# Hướng dẫn đưa game lên itch.io

Có 2 file zip:

| File | Dùng để |
|---|---|
| `release/game-itch.zip` | **Bản chơi được** (máy tính + điện thoại). Đây là file upload chính. |
| `release/voice-lab-itch.zip` | Trang đo giọng nói (thống kê độ chính xác / độ trễ) cho Giai đoạn 0. |

## Bước 1 — Tạo file zip

```
pnpm build:itch        # bản chơi → release/game-itch.zip
pnpm build:itch-lab    # trang đo giọng nói → release/voice-lab-itch.zip
```

## Bước 2 — Upload lên itch.io

1. Đăng nhập itch.io → **Dashboard** → **Create new project**.
2. **Title:** `Thanh Pha Le` (tùy ý). **Kind of project:** **HTML**.
3. **Uploads:** chọn `game-itch.zip`, tick **"This file will be played in the browser"**.
4. **Embed options:**
   - **Viewport dimensions:** `1280 × 720`.
   - Tick **Mobile friendly** → **Orientation: Landscape** (xoay ngang).
   - Tick **Fullscreen button**.
   - Tick **Automatically start on page load** — *không* tick (để người chơi bấm "Run game", trình duyệt mới cho bật micro).
5. **Visibility & access:** **Draft** (chỉ mình bạn) hoặc **Restricted**, rồi **Save & view page**.

## Bước 3 — Thử

**Máy tính (Chrome/Edge):** Run game → chọn kiểu nhận diện → **BẮT ĐẦU** → cho phép micro → giữ **chuột phải**, đọc "hỏa cầu".

**Điện thoại (Android Chrome khuyên dùng):** mở trang itch.io → bấm nút **toàn màn hình** của itch → xoay ngang → **BẮT ĐẦU**.
- "Của Google" nhẹ và nhanh trên điện thoại (cần mạng). "Chạy trong máy" tải 34MB và nặng hơn.
- iPhone (Safari): giọng nói có thể không chạy; vẫn chơi được bằng nút 1–5.

Ghi lại cho Claude: máy / trình duyệt, micro có chạy trong khung itch không, giọng nói có nhận ra không, game có giật không.

## Thử trên máy (không cần itch.io)

```
pnpm dev          # bản chơi, http://localhost:5173
pnpm voice-lab    # trang đo giọng nói, http://localhost:5174
```

Thử bằng điện thoại cùng mạng Wi-Fi: khi chạy `pnpm dev`, dòng `Network:` hiện địa chỉ dạng `http://192.168.x.x:5173` — mở trên điện thoại. *Lưu ý:* qua địa chỉ này (không phải https) trình duyệt điện thoại **chặn micro**, nên chỉ thử được điều khiển cảm ứng; giọng nói trên điện thoại phải thử qua itch.io.
