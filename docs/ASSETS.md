# Danh sách asset

Quy ước kỹ thuật: xem `CLAUDE.md` mục 5 (.glb, 1 unit = 1m, Y lên, nhìn về +Z, tên kebab-case).
Đặt file vào `client/public/models/`. Trạng thái: **placeholder** = đang dùng khối hình học trong code; **đã có** = đã có .glb thật.

## Giai đoạn 1 — Bản đồ 1 "Thành Pha Lê"

| Asset | Tên file gợi ý | Trạng thái | Ghi chú |
|---|---|---|---|
| Đoạn tường thành (cong theo vòng tròn bán kính 30m) | `map-wall-segment.glb` | placeholder | Dày ~2.4m, cao ~7m, có lỗ châu mai. Nên làm module ~1.6m dài để lặp quanh vòng |
| Tháp canh cạnh cửa | `map-gate-tower.glb` | placeholder | Trụ tròn bán kính ~2.4m, cao ~10m + mái nhọn |
| Cửa thành (vòm + cánh cửa) | `map-gate.glb` | placeholder | Lỗ cửa rộng 7m, cao ~5m. Animation tùy chọn: `open`, `close` |
| Pha lê trung tâm (Lõi) | `core-crystal.glb` | placeholder | Cao ~9m, đặt trên bệ đá. Animation: `idle`, `hit`, `die` (vỡ) |
| Bệ pha lê | `core-pedestal.glb` | placeholder | Bán kính ~3.8m |
| Cây thông (2–3 biến thể) | `prop-pine-a.glb`, `prop-pine-b.glb` | placeholder | **Rất ít polygon** (≤ 300 tris) vì có ~1400 cây |
| Cổng sinh quái | `map-spawn-portal.glb` | placeholder | Ở cuối mỗi con đường, đường kính ~7m |
| Ô đường đất, ô sân đá, đá, dốc | `map-road.glb`, `map-plaza.glb`, `prop-rock-a.glb` | placeholder | |

## Giai đoạn 1 — Nhân vật, quái, tháp

| Asset | Tên file | Trạng thái | Animation |
|---|---|---|---|
| Pháp Sư (thân) | `player-mage-body.glb` | placeholder | `idle, walk, run, cast, hit, die` |
| Pháp Sư (tay góc nhìn 1) | `player-mage-fparms.glb` | placeholder | `idle, attack, cast_loop, cast_release, cast_fail` |
| Quái Lính (goblin) | `enemy-goblin.glb` | placeholder | `walk, attack, hit, die` |
| Tháp Cung (3 cấp) | `tower-arrow-1/2/3.glb` | placeholder | `attack` |
| Tháp Pháo (3 cấp) | `tower-cannon-1/2/3.glb` | placeholder | `attack` |
| Tháp Băng (3 cấp) | `tower-frost-1/2/3.glb` | placeholder | `attack` |

Hiệu ứng phép (cầu lửa, vùng băng, tia sét, thiên thạch) hiện làm bằng code, chưa cần art.
