# Hướng dẫn thử Voice Lab trên itch.io (Giai đoạn 0)

Mục tiêu: kiểm tra micro + nhận diện giọng nói + khóa chuột có chạy **bên trong khung iframe của itch.io** không, và đo độ chính xác/độ trễ.

## Bước 1 — Tạo file zip

Nhờ Claude chạy (hoặc tự chạy trong terminal ở thư mục dự án):

```
pnpm build:itch
```

File tạo ra: `release/voice-lab-itch.zip` (~36MB).

## Bước 2 — Upload lên itch.io

1. Đăng nhập itch.io → **Dashboard** → **Create new project**.
2. **Title:** `voice-lab-test` (tùy ý).
3. **Kind of project:** chọn **HTML**.
4. **Uploads:** bấm **Upload files**, chọn `voice-lab-itch.zip`. Sau khi upload xong, tick **"This file will be played in the browser"**.
5. **Embed options:**
   - Viewport dimensions: **1280 × 720**.
   - Tick **Fullscreen button**.
   - (Nếu có) tick **SharedArrayBuffer support** — *không bắt buộc*, để trống cũng được.
6. **Visibility & access:** chọn **Draft** (chỉ mình bạn thấy) hoặc **Restricted**.
7. Bấm **Save & view page**.

## Bước 3 — Thử trên từng trình duyệt

Thử lần lượt trên **Chrome**, **Edge**, **Firefox**. Đeo tai nghe để micro không bắt tiếng loa.

1. Bấm **Run game**. Dòng chữ nhỏ dưới chữ "Voice Lab" cho biết: trong iframe, HTTPS, chính sách micro… Nếu thấy **"Chính sách micro: BỊ CHẶN"** → ghi lại, đó là itch.io chặn micro.
2. Bấm **Cho phép micro** → trình duyệt hỏi quyền → **Allow**. Nói thử, thanh xanh phải nhảy.
3. Bấm **Tải model Vosk** → chờ thanh tiến trình chạy hết và hiện "Model sẵn sàng".
4. Click vào khung 3D để khóa chuột. Dùng WASD đi lại.
5. **Giữ phím V**, hô câu hiện ở trên màn hình ("Hãy hô: …"), rồi **thả V**. Làm khoảng **50 lần** (mỗi câu ~3 lần).
   - Nếu lỡ nói nhầm/ho/vấp → bấm **"Bỏ lần vừa rồi"**.
6. (Chrome/Edge) Chọn **Web Speech API** rồi làm thêm ~30 lần để so sánh.
7. Bấm **Sao chép kết quả** và dán vào chat cho Claude, kèm tên trình duyệt.

## Ghi lại

| Trình duyệt | Micro chạy trong iframe? | Khóa chuột + micro cùng lúc? | Tỉ lệ đúng (Vosk) | Độ trễ TB / p95 (Vosk) | Ghi chú |
|---|---|---|---|---|---|
| Chrome | | | | | |
| Edge | | | | | |
| Firefox | | | | | |

**Tiêu chí qua Giai đoạn 0:** độ trễ TB < 500ms, p95 < 800ms, tỉ lệ đúng > 90%, micro và khóa chuột chạy cùng lúc.

## Thử trên máy (không cần itch.io)

```
pnpm voice-lab
```

Mở http://localhost:5174 trên trình duyệt.
