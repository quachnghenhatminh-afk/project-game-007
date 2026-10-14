# GDD — Voice Co-op Tower Defense (tên tạm)

*Phiên bản 0.1 — 14/10/2026. Đặt file này ở `docs/GDD.md` trong dự án.*

## 1. Tầm nhìn

Một nhóm 4–6 pháp sư, chiến binh và kỹ sư cùng giữ một pháo đài trước những đợt quái tràn vào. Không ai bấm nút kỹ năng: **mọi người phải hô to câu chú**. Trận đánh trở thành một bản hợp xướng hỗn loạn và vui nhộn. Người chơi phối hợp bằng chính giọng nói của mình, vừa nói chuyện chiến thuật vừa niệm phép.

**Câu chào hàng:** *"Thủ thành co-op, nơi giọng nói của bạn là vũ khí."*

### Trụ cột thiết kế

1. **Hô là bắn.** Giọng nói là cách chính để dùng kỹ năng, và phải phản hồi nhanh, chắc chắn.
2. **Cùng nhau mới thắng.** Combo giữa các class, vai trò bổ sung cho nhau.
3. **Vào chơi trong 30 giây.** Mở link itch.io, nhập mã phòng, chơi. Không tài khoản, không cài đặt.

### Tham khảo

- *Sanctum* — thủ thành góc nhìn thứ nhất, người chơi vừa xây tháp vừa tự bắn.
- *Orcs Must Die!* — bẫy + chiến đấu trực tiếp, nhịp độ nhanh.
- *In Verbis Virtus* — niệm phép bằng giọng nói.
- *Magicka* — ghép nguyên tố tạo phép, sự hỗn loạn vui nhộn khi chơi chung.

## 2. Vòng lặp chơi

**Trong một trận (~20–25 phút):**

```
Giai đoạn chuẩn bị (45s)          Giai đoạn đợt quái (1–2 phút)
- Xây/nâng cấp tháp bằng vàng  →  - Quái đi theo đường tới Lõi pháo đài
- Chọn vị trí đứng             ←  - Niệm phép, sửa tháp, hồi máu đồng đội
- Bàn chiến thuật                 - Nhận vàng + kinh nghiệm khi giết quái
```

Lặp lại ~10 đợt. Đợt 5 và đợt 10 có trùm. Lõi bị phá = thua.

**Giữa các trận (bản đầu):** không có. Mỗi trận bắt đầu từ cấp 1. Tiến trình lâu dài (mở khóa class, trang phục) để sau khi phát hành.

## 3. Điều khiển (góc nhìn thứ nhất)

| Hành động | Phím |
|---|---|
| Di chuyển | WASD |
| Chạy | Shift (tốn thể lực) |
| Nhảy | Space |
| Nhìn | Chuột (pointer lock) |
| Đòn đánh thường | Chuột trái |
| **Niệm chú (push-to-talk)** | **Giữ chuột phải** (hoặc giữ V) — đọc thần chú — thả ra để thi triển |
| Kỹ năng dự phòng | 1 – 4 **trong lúc giữ chuột phải** (thay cho giọng nói) |
| Chế độ xây tháp | B, chọn tháp bằng chuột giữa/lăn chuột, chuột trái để đặt |
| Đánh dấu cho đồng đội | Chuột giữa (ping) |

### 3.1 Cơ chế niệm phép (Mana – Thể lực)

Người chơi **tự do đọc bất kỳ câu chú nào** (không cần theo chỉ dẫn).

**Bản hiện tại (16/10/2026) — tự bắn khi đọc đúng:**

1. **Giữ chuột phải** → hai tay tụ một quả cầu sáng, micro bắt đầu nghe, **mana tụt liên tục** (~25/giây, hết thanh trong ~4 giây).
2. Thanh mana có **vùng PERFECT = nửa trên của thanh** (mốc tròn ở 50%). Câu chú được nhận ra khi mana **còn trong vùng PERFECT** → phép **cường hóa ✦** (to hơn 50%, vòng sóng vàng khi nổ).
3. Câu chú được nhận ra → **phép tự bắn ngay** tới vòng ngắm (không cần thả chuột). Mana ngừng tụt và tự hồi (**đang để 40/giây cho test**).
4. **Tạo khiên** (phím 5): khiên bong bóng bao quanh người chơi, đi theo người chơi, **tồn tại 2 giây** rồi nhấp nháy và biến mất. Cường hóa → khiên to hơn 50%.
5. Phụ đề hiện **2 giây** cho biết người chơi vừa đọc gì và có khớp câu chú nào không.
6. Thanh **thể lực hiện nhưng tạm chưa dùng** (`CASTING.staminaEnabled = false`).

**Bản trước — giữ phép trên tay** (vẫn giữ trong code, bật lại bằng `CASTING.autoCast = false` + `staminaEnabled = true`): phép nhận ra thì nằm trên tay, thể lực tụt ~20/giây, thả chuột mới bắn; thể lực về 0 thì phép tan biến.

Các tình huống đã giả lập và cách xử lý (kiểm thử tự động trong `shared/src/playerState.test.ts`, cho cả hai chế độ):

| Tình huống | Xử lý |
|---|---|
| Đọc nhanh, rõ | Phép cường hóa ✦ trên tay, thả chuột thì bắn |
| Đọc chậm (mana đã qua mốc 70%) | Phép thường |
| Đọc sai / không khớp câu nào | Tiếp tục nghe; hết mana → "Hết mana — phép tan biến" |
| Thả chuột khi đang đọc dở | Chờ kết quả cuối (tối đa 3 giây): khớp → bắn ngay; không khớp → "Niệm hỏng" |
| Bấm chuột phải lỡ tay (< 0,15 giây) | Hủy im lặng, không báo lỗi |
| Mana < 10 khi bắt đầu | Không cho niệm, báo "Không đủ mana" |
| Giữ phép quá lâu, thể lực về 0 | Phép tan biến: "Kiệt sức — phép tan biến" |
| Chuyển cửa sổ / mất focus khi đang niệm | "Đã hủy phép" |
| Micro chưa bật hoặc tắt giọng nói | Giữ chuột phải + phím 1–4 |
| Đọc 2 câu liền nhau | Chỉ lấy câu đầu tiên |
| Chạy (Shift) khi đang giữ phép | Thể lực tụt nhanh gấp đôi; về 0 thì khóa chạy tới khi hồi lại 25 |

Thông số nằm trong `shared/src/balance.ts` (`CASTING`), chỉnh được mà không sửa logic. Chi phí mana riêng của từng câu (`costMana` trong bảng câu lệnh) **chưa dùng** — hiện chi phí = lượng mana tụt trong lúc niệm.

**Cảm giác khi niệm:** hai tay tụ phép (animation `cast_loop`), câu đang nghe hiện ngay dưới tâm ngắm. Animation tụ phép che độ trễ nhận diện.

## 4. Class

Bản đầu (Giai đoạn 1) chỉ có **Pháp Sư**. Đủ 4 class ở Giai đoạn 3.

| Class | Vai trò | Đòn đánh thường |
|---|---|---|
| **Pháp Sư** | Sát thương diện rộng | Tia phép tầm xa |
| **Hộ Vệ** | Chặn quái, gây chú ý | Chém cận chiến |
| **Thầy Thuốc** | Hồi máu, giải hiệu ứng | Phi tiêu yếu, tầm trung |
| **Kỹ Sư** | Xây tháp rẻ hơn, sửa tháp, bẫy | Súng ngắn |

Mọi class đều xây được tháp; Kỹ Sư xây rẻ hơn 30% và có thêm kỹ năng riêng cho tháp.

## 5. Bảng câu lệnh giọng nói

**Nguyên tắc chọn câu:** 2 âm tiết, dễ hô to, khác nhau rõ về âm đầu và thanh điệu, tránh hai câu chung âm tiết đầu trong cùng một class. Danh sách này phải được **test thực tế ở Giai đoạn 0** và sửa theo số liệu.

| Class | Câu lệnh | Hiệu ứng | Phím dự phòng |
|---|---|---|---|
| Pháp Sư | **Hỏa cầu** | Quả cầu lửa nổ diện rộng tại điểm ngắm | 1 |
| Pháp Sư | **Băng giá** | Vùng băng làm chậm quái 60% trong 4s | 2 |
| Pháp Sư | **Sấm sét** | Sét đánh nảy qua 5 mục tiêu | 3 |
| Pháp Sư | **Thiên thạch** *(tối thượng)* | Thiên thạch lớn rơi sau 1.5s | 4 |
| Pháp Sư | **Tạo khiên** | Khiên bao quanh bản thân, tồn tại 2s | 5 |
| Hộ Vệ | **Dựng khiên** | Tạo tường chắn chặn đường 6s | 1 |
| Hộ Vệ | **Khiêu khích** | Quái xung quanh tấn công Hộ Vệ | 2 |
| Hộ Vệ | **Đập đất** | Hất tung quái quanh mình | 3 |
| Hộ Vệ | **Bất khuất** *(tối thượng)* | Không thể chết trong 5s | 4 |
| Thầy Thuốc | **Hồi máu** | Hồi máu đồng đội tại điểm ngắm | 1 |
| Thầy Thuốc | **Thanh tẩy** | Xóa hiệu ứng xấu trong vùng | 2 |
| Thầy Thuốc | **Ban phước** | Tăng tốc đánh cả đội 8s | 3 |
| Thầy Thuốc | **Hồi sinh** *(tối thượng)* | Hồi sinh đồng đội đã gục | 4 |
| Kỹ Sư | **Sửa chữa** | Hồi máu tháp tại điểm ngắm | 1 |
| Kỹ Sư | **Đặt mìn** | Đặt bẫy nổ | 2 |
| Kỹ Sư | **Quá tải** | Tháp tại điểm ngắm bắn nhanh gấp đôi 6s | 3 |
| Kỹ Sư | **Pháo đài** *(tối thượng)* | Mọi tháp được giáp 10s | 4 |
| Chung | **Cứu tôi** | Đánh dấu vị trí xin hồi máu | — |
| Chung | **Tập trung** | Ping mục tiêu tại tâm ngắm | — |

### Combo đồng đội (Giai đoạn 3)

Hai người hô hai câu trong vòng **2 giây**, với điểm ngắm gần nhau, sẽ tạo phép hợp thể:

| Combo | Kết quả |
|---|---|
| Băng giá + Đập đất | **Băng chấn**: đóng băng hoàn toàn quái trong vùng 3s |
| Hỏa cầu + Quá tải | **Pháo lửa**: tháp trong vùng bắn đạn lửa 8s |
| Sấm sét + Dựng khiên | **Tường điện**: tường gây sát thương khi quái chạm |
| Hồi máu + Ban phước | **Thánh ca**: hồi máu theo thời gian cho cả đội |

Combo là lý do lớn nhất để người chơi phải **nói chuyện với nhau**: "Đếm ba rồi cùng hô nhé!"

### Ý tưởng mở rộng (sau phát hành)

- **Hô to = mạnh hơn:** đo âm lượng, hô to thì sát thương +20% nhưng tốn thêm mana.
- **Câu chú dài cho tối thượng:** 3–4 âm tiết, khó niệm hơn nhưng mạnh hơn.

## 6. Tháp

| Tháp | Chức năng | Giá |
|---|---|---|
| Tháp Cung | Bắn đơn mục tiêu nhanh, rẻ | 100 |
| Tháp Pháo | Nổ diện rộng, chậm | 200 |
| Tháp Băng | Làm chậm | 150 |
| Tháp Phép *(Giai đoạn 3)* | Tăng hiệu lực phép của người chơi đứng gần | 250 |

Mỗi tháp nâng cấp 2 lần. Tháp có máu; một số quái tấn công tháp.

## 7. Quái

| Quái | Đặc điểm |
|---|---|
| Lính (goblin) | Cơ bản, đi đông |
| Chạy nhanh | Ít máu, nhanh |
| Khiên | Giáp trước mặt, phải đánh từ bên hông/sau |
| Phá tháp | Ưu tiên tấn công tháp |
| Bay | Bỏ qua tường, chỉ tháp cung/phép và kỹ năng đánh được |
| **Trùm (đợt 5, 10)** | Nhiều máu, kỹ năng diện rộng buộc cả đội phải phối hợp |

Số lượng quái và máu quái **tăng theo số người chơi** trong phòng.

## 8. Bản đồ

- **Bản đồ 1 (Giai đoạn 1) — Thành Pha Lê:** thành trì **hình tròn** (bán kính ~30m) có **4 cửa** theo 4 hướng, đánh số 1–4. Giữa thành là **một viên pha lê lớn** (đây chính là Lõi pháo đài, pha lê vỡ = thua). Xung quanh thành là **rừng thông**; từ mỗi cửa có một con đường xuyên rừng, cuối đường là cổng sinh quái.
  - **Nhịp mở cửa:** đợt đầu quái chỉ tràn vào từ **cửa 1**; các đợt sau lần lượt mở thêm **cửa 2, 3, 4** → người chơi phải chia nhau giữ nhiều hướng. Thứ tự và đợt mở cửa sẽ chốt khi cân bằng ở Giai đoạn 1.
  - Quái đi theo đường: cổng sinh quái → cửa thành → pha lê. Tháp đặt dọc đường và quanh sân trong.
  - **Bối cảnh ban đêm:** trời sao, trăng, đuốc dọc tường thành, cửa thành và hai bên đường; 4 chậu lửa quanh pha lê. Pha lê là nguồn sáng xanh chính giữa thành.
  - **Sương mù giới hạn bản đồ:** sương bắt đầu dày từ bán kính ~72m. Người chơi **đi vào sương được thêm ~12m**: càng vào sâu càng chậm (tới 35% tốc độ) và tầm nhìn chỉ còn vài mét, tới bán kính 84m thì bị chặn ("Sương mù quá dày, không thể đi tiếp"). Cổng sinh quái nằm ở mép sương → quái "bước ra từ sương mù".
  - **Sân trong lát gạch đất**, quảng trường pha lê lát đá phiến, đường ngoài thành là đường đất. Sân chia 4 khu: **chợ** (cửa 1–2), **doanh trại** (2–3), **giếng & vườn** (3–4), **kho & chuồng** (4–1). Mỗi khu có cầu thang đá lên tường thành.
  - **Rừng hỗn hợp:** thông cao 15–23m, thông vừa, thông thấp, cây tán tròn, rất nhiều bụi cây và đá. Thân cây và đá lớn chặn người chơi.
  - Đã có bản dựng placeholder (khối hình học) trong `client/src/render/citadel.ts`; kích thước dùng chung ở `shared/src/balance.ts` (`CITADEL`).
- **Bản đồ 2–3 (Giai đoạn 3):** hai đường song song; đường chia nhánh có cổng mà người chơi có thể đóng/mở.

Bản đồ thiết kế theo dạng **lưới ô** (ô xây được / không xây được / đường đi) để đơn giản hóa việc đặt tháp và tìm đường.

## 9. Trải nghiệm micro (rất quan trọng)

1. **Lobby:** nút "Kiểm tra micro" bắt buộc lần đầu. Xin quyền, tải model giọng nói (~32MB, có thanh tiến trình, chỉ tải một lần).
2. **Màn tập niệm:** người chơi hô thử từng câu lệnh của class mình, thấy kết quả và độ chính xác. Có thể bỏ qua.
3. **Cài đặt:** chọn micro, ngưỡng âm lượng, bật/tắt giọng nói (tắt thì dùng phím 1–4).
4. **Gợi ý trên HUD:** 4 ô kỹ năng hiển thị **câu chú** thay vì chỉ biểu tượng.
5. **Khuyến nghị trên trang itch.io:** dùng Chrome/Edge, đeo tai nghe.

## 10. Danh sách art cần làm

Người dùng (artist) chuẩn bị theo thứ tự ưu tiên. Quy ước kỹ thuật xem `CLAUDE.md` mục 5.

**Giai đoạn 1:**
- Pháp Sư: thân đầy đủ + tay góc nhìn thứ nhất. Animation thân: `idle, walk, run, cast, hit, die`. Animation tay: `idle, attack, cast_loop, cast_release, cast_fail`.
- Quái Lính: `walk, attack, hit, die`.
- 3 tháp (Cung, Pháo, Băng), mỗi tháp 3 cấp. Animation bắn đơn giản.
- Lõi pháo đài.
- Bộ module bản đồ 1: ô đất, đường, đá, cây, tường, dốc.
- Hiệu ứng (có thể dùng particle trong code): cầu lửa, vùng băng, tia sét.

**Giai đoạn 3:**
- 3 class còn lại (thân + tay FP).
- 4–5 loại quái còn lại + 1 trùm.
- Tháp Phép; bộ module bản đồ 2–3.

**Phong cách gợi ý:** stylized, low-poly có texture vẽ tay (hand-painted). Cách này nhẹ trên web, dễ đọc khi đông quái, và hợp với không khí vui nhộn của game.

## 11. Phạm vi và lộ trình

| Giai đoạn | Nội dung | Ước tính |
|---|---|---|
| 0. Kiểm chứng kỹ thuật | Trang thử giọng nói + micro + pointer lock trong iframe itch.io | 1–2 tuần |
| 1. Lõi chơi đơn | 1 bản đồ, Pháp Sư, 3 tháp, 5 đợt quái | 4–5 tuần |
| 2. Multiplayer | Colyseus, lobby mã phòng, 2 → 4 người | 4–6 tuần |
| 3. Nhập vai & nội dung | 4 class, combo, lên cấp trong trận, 3 bản đồ, 6 người | 5–7 tuần |
| 4. Hoàn thiện & phát hành | UI, hướng dẫn, tối ưu, trang itch.io, playtest | 2–3 tuần |

**Tổng ước tính:** 4–6 tháng tới bản demo phát hành, với 1 người làm art và Claude Code làm toàn bộ code.

**Ngoài phạm vi bản đầu:** tài khoản, lưu tiến trình, bảng xếp hạng, mobile, tiếng Anh, voice chat tích hợp trong game (người chơi dùng Discord).

## 12. Rủi ro

| Rủi ro | Mức độ | Cách giảm |
|---|---|---|
| Nhận diện tiếng Việt kém chính xác hoặc chậm | Cao | Grammar giới hạn; test ở Giai đoạn 0; đổi câu lệnh theo số liệu; luôn có phím dự phòng |
| Micro không hoạt động trong iframe itch.io | Cao | Test ở Giai đoạn 0; phương án B: host game ở domain riêng, itch.io chỉ để giới thiệu và dẫn link |
| Micro bắt tiếng đồng đội từ loa | Trung bình | Push-to-talk bắt buộc; khuyến nghị tai nghe |
| Thư viện vosk-browser ít được bảo trì | Trung bình | Cô lập phần nhận diện sau một interface, dễ thay engine khác |
| Hiệu năng khi đông quái + 6 người trên web | Trung bình | Giới hạn ~80 quái, nén asset, ngân sách polygon, test sớm trên máy yếu |
| Phạm vi quá lớn cho 1 người | Cao | Không nhảy giai đoạn; cắt nội dung trước khi cắt chất lượng của cơ chế giọng nói |
| Chi phí server | Thấp | VPS nhỏ khoảng 5–10 USD/tháng đủ cho giai đoạn đầu |

## 13. Câu hỏi còn mở

- Tên game chính thức?
- Bối cảnh/cốt truyện: fantasy cổ điển, hay đậm chất Việt (pháp sư, thầy cúng, quái dân gian)? Câu chú tiếng Việt rất hợp với bối cảnh dân gian Việt Nam.
- Có cho phép chơi một mình (1 người + tăng sức mạnh) không?
- Miễn phí hay trả phí trên itch.io?
