# Tài khoản seed — luồng demo khuyến nghị

File này bám theo dữ liệu hiện tại trong `database/seed/backup.sql`, phù hợp để demo vào ngày **2026-08-10**.

> **Mật khẩu mọi tài khoản:** `123456`
>
> **Email:** họ tên không dấu, cách nhau bằng dấu chấm + `@apms.com`

## 2. Bộ tài khoản chuẩn bị sẵn

| Ưu tiên | Email | Họ tên | Role | Phòng / Team | Vì sao nên dùng |
| --- | --- | --- | --- | --- | --- |
| Chính | `dan.tam.ha@apms.com` | Đan Tâm Hà | Giám đốc | Giám đốc / Ban giám đốc | Xem toàn hệ thống, phù hợp mở đầu demo |
| Chính | `ta.nhat.huy@apms.com` | Tạ Nhật Huy | Project Manager / Product Owner / Group Member | Dịch vụ Giải pháp / Master | Có đúng 2 dự án đẹp để demo: `PlanAI` và `PeopleHub` |
| Chính | `bui.gia.khanh@apms.com` | Bùi Gia Khanh | Leader | Dịch vụ Giải pháp / HiStack | Có task đã hoàn tất phần scope và planning |
| Chính | `bach.tue.lam@apms.com` | Bạch Tuệ Lâm | Lập trình viên | Dịch vụ Giải pháp / HiStack | Có task build đang chạy, dễ demo công việc hằng ngày |
| Chính | `diep.thanh.tu@apms.com` | Diệp Thanh Tú | Kỹ sư cầu nối | Dịch vụ Giải pháp / HiStack | Có task test/fix/handover để nối phần cuối flow |
| Chính | `an.khoi.nguyen@apms.com` | An Khôi Nguyên | Admin | Head of Dev / không team | Rất hợp để chốt phần quản trị user |
| Phụ | `hao.nhien@apms.com` | Hạo Nhiên | QA | QC / Fire Files | Chỉ dùng nếu muốn demo thêm một account QA riêng |
| Phụ | `vy.khoa@apms.com` | Vỹ Khoa | Giám đốc | Giám đốc / Ban giám đốc | Account Giám đốc dự phòng |
| Phụ | `yen.chau@apms.com` | Yến Châu | Giám đốc | Giám đốc / Ban giám đốc | Account Giám đốc dự phòng |

Lưu ý:

1. `hao.nhien@apms.com` là QA thật nhưng **không nằm trên tuyến project demo chính** `PlanAI` / `PeopleHub`.
2. Nếu muốn câu chuyện xuyên suốt trên cùng 1 bộ dự án, nên ưu tiên `diep.thanh.tu@apms.com` hơn `hao.nhien@apms.com`.

---

## 3. Hai dự án nên dùng để demo

Hai dự án này là bộ xương sống tốt nhất vì cùng một nhóm người tham gia, dữ liệu task có đủ `done`, `in_progress`, `todo`, và timeline kéo liên tục từ tháng 6 đến tháng 9.

| Dự án | Loại | Manager | Khoảng thời gian | Trạng thái hiện tại ngày 2026-08-10 | Vì sao hợp demo |
| --- | --- | --- | --- | --- | --- |
| `PlanAI` | `agile` | `ta.nhat.huy@apms.com` | `2026-06-22` -> `2026-09-24` | Sprint 1 `closed`, Sprint 2 `active`, Sprint 3 `planned` | Nhìn được đủ vòng đời sprint |
| `PeopleHub` | `waterfall` | `ta.nhat.huy@apms.com` | `2026-07-09` -> `2026-09-26` | Giai đoạn triển khai đang `active` | Đối trọng tốt với `PlanAI` để giải thích waterfall |

### Thành viên chung của 2 dự án

| Email | Họ tên | Vai trò |
| --- | --- | --- |
| `ta.nhat.huy@apms.com` | Tạ Nhật Huy | PM |
| `bui.gia.khanh@apms.com` | Bùi Gia Khanh | Leader |
| `bach.tue.lam@apms.com` | Bạch Tuệ Lâm | Lập trình viên |
| `diep.thanh.tu@apms.com` | Diệp Thanh Tú | Kỹ sư cầu nối |

---

## 4. Nên mở task nào khi đăng nhập từng tài khoản

### 4.1 PM — `ta.nhat.huy@apms.com`

Nên mở:

| Dự án | Task | Trạng thái | Ngày |
| --- | --- | --- | --- |
| `PlanAI` | `Chốt tài liệu bàn giao cho dự án PlanAI` | `todo` | `2026-09-16` -> `2026-09-24` |
| `PeopleHub` | `Chốt tài liệu bàn giao cho xây cổng hồ sơ nghỉ phép và phê duyệt` | `todo` | `2026-09-14` -> `2026-09-26` |

Điểm nói:

1. PM đang nhìn được cả dự án `agile` lẫn `waterfall`.
2. Dữ liệu đủ để nói về planning, execution và handover.

### 4.2 Leader — `bui.gia.khanh@apms.com`

Nên mở:

| Dự án | Task | Trạng thái | Ngày |
| --- | --- | --- | --- |
| `PlanAI` | `Chốt phạm vi cho dựng khung dự án và bảng công việc` | `done` | `2026-06-22` -> `2026-06-28` |
| `PlanAI` | `Thiết kế chi tiết cho dựng khung dự án và bảng công việc` | `done` | `2026-06-29` -> `2026-07-04` |
| `PlanAI` | `Rà soát backlog cho hoàn thiện tạo việc và giao người nhận` | `done` | `2026-07-17` -> `2026-07-27` |
| `PeopleHub` | `Khảo sát phạm vi cho xây cổng hồ sơ nghỉ phép và phê duyệt` | `done` | `2026-07-09` -> `2026-07-22` |
| `PeopleHub` | `Thiết kế kiến trúc cho xây cổng hồ sơ nghỉ phép và phê duyệt` | `done` | `2026-07-23` -> `2026-08-05` |

Điểm nói:

1. Leader phù hợp để kể phần đầu của dòng chảy công việc.
2. Các task đều có tên rõ nghĩa, không còn kiểu placeholder.

### 4.3 Dev — `bach.tue.lam@apms.com`

Nên mở:

| Dự án | Task | Trạng thái | Ngày |
| --- | --- | --- | --- |
| `PlanAI` | `Ghép giao diện và dịch vụ cho hoàn thiện tạo việc và giao người nhận` | `in_progress` | `2026-08-07` -> `2026-08-16` |
| `PeopleHub` | `Xây hạng mục cốt lõi của xây cổng hồ sơ nghỉ phép và phê duyệt` | `in_progress` | `2026-08-06` -> `2026-08-18` |
| `PlanAI` | `Hoàn thiện chức năng chính của hoàn thiện tạo việc và giao người nhận` | `done` | `2026-07-28` -> `2026-08-06` |
| `PeopleHub` | `Hoàn thiện tích hợp cho xây cổng hồ sơ nghỉ phép và phê duyệt` | `todo` | `2026-08-19` -> `2026-08-31` |

Điểm nói:

1. Đây là account dễ demo nhất cho màn hình task và logwork.
2. Có đủ một task vừa làm xong, một task đang làm, và một task sắp tới.

### 4.4 Kỹ sư cầu nối — `diep.thanh.tu@apms.com`

Nên mở:

| Dự án | Task | Trạng thái | Ngày |
| --- | --- | --- | --- |
| `PlanAI` | `Kiểm thử và nghiệm thu dựng khung dự án và bảng công việc` | `done` | `2026-07-11` -> `2026-07-16` |
| `PlanAI` | `Sửa lỗi ưu tiên cao của hoàn thiện tạo việc và giao người nhận` | `todo` | `2026-08-17` -> `2026-08-26` |
| `PlanAI` | `Ổn định luồng chính của dự án PlanAI` | `todo` | `2026-08-27` -> `2026-09-05` |
| `PlanAI` | `Chạy hồi quy trước bàn giao cho dự án PlanAI` | `todo` | `2026-09-06` -> `2026-09-15` |
| `PeopleHub` | `Kiểm thử và đối soát cho xây cổng hồ sơ nghỉ phép và phê duyệt` | `todo` | `2026-09-01` -> `2026-09-13` |

Điểm nói:

1. Account này nối rất mượt từ dev sang phần QA, fix, hồi quy, bàn giao.
2. Nếu muốn thể hiện cuối chu trình delivery thì đây là account nên dùng.

### 4.5 Giám đốc — `dan.tam.ha@apms.com`

Nên mở:

1. Dashboard tổng quan.
2. Danh sách project companywide.
3. Màn `logwork approvals` để nói về kiểm soát tiến độ và phê duyệt công việc.

### 4.6 Admin — `an.khoi.nguyen@apms.com`

Nên mở:

1. Màn `team`.
2. Tìm kiếm user.
3. Xem chi tiết user.
4. Reset mật khẩu hoặc khóa/mở khóa tài khoản.

Lưu ý:

1. Account Admin dùng để demo quản trị nhân sự và tài khoản.
2. Không nên dùng account này để demo dự án, vì theo product flow nó không phải nhân vật chính ở phần project/task.

---

## 5. Luồng nói chuyện gợi ý khi demo

1. Bắt đầu bằng `dan.tam.ha@apms.com` để cho thấy hệ thống có góc nhìn điều hành.
2. Chuyển sang `ta.nhat.huy@apms.com` và mở `PlanAI` trước, vì agile dễ kể câu chuyện sprint.
3. Từ cùng PM đó, mở tiếp `PeopleHub` để giải thích luôn sự khác nhau giữa agile và waterfall mà không phải đổi manager.
4. Đăng nhập `bui.gia.khanh@apms.com` để kể phần scope, thiết kế, backlog.
5. Đăng nhập `bach.tue.lam@apms.com` để đi vào công việc hằng ngày, task đang chạy, logwork.
6. Nếu cần kéo dài demo, chuyển sang `diep.thanh.tu@apms.com` để nói về test, fix, hồi quy và chuẩn bị bàn giao.
7. Kết thúc bằng `an.khoi.nguyen@apms.com` để chốt phần quản trị người dùng.

---

## 6. Tài khoản thay thế nếu muốn đổi không khí demo

Những account dưới đây vẫn rất ổn, nhưng không mượt bằng tuyến `Tạ Nhật Huy -> Bùi Gia Khanh -> Bạch Tuệ Lâm -> Diệp Thanh Tú`.

| Email | Họ tên | Cặp dự án quản lý |
| --- | --- | --- |
| `chau.duc.khang@apms.com` | Châu Đức Khang | `B2B Portal` + `Legacy Migration` |
| `ha.khanh.quan@apms.com` | Hà Khánh Quân | `Payment Hub` + `Ops KPI Board` |
| `phuong.nghi@apms.com` | Phương Nghi | `DataVault` + `Approval Flow` |
| `quynh.chi@apms.com` | Quỳnh Chi | `Observability` + `Service Spec` |
| `uyen.chau@apms.com` | Uyển Châu | `CareDesk` + `CareWiki` |

---

## 7. Ghi chú đồng bộ với seed hiện tại

1. Seed hiện có `45` user và `38` project.
2. Mỗi PM/PO/GM trong seed đang quản lý đúng `2` dự án: `1 agile` và `1 waterfall`.
3. Timeline task đang trải từ `2026-06-16` đến `2026-09-26`.
4. File này chỉ giữ các account hữu ích nhất cho demo, không liệt kê lại toàn bộ user cũ.

*Sinh từ* `database/seed/backup.sql` *và cập nhật theo seed hiện tại.*
