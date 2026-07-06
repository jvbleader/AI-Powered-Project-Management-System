# Backend Review: User Profile And User Management APIs

Trạng thái: `PROPOSAL ONLY - CHƯA TRIỂN KHAI`

## 1. Mục tiêu

Phần frontend đã được chỉnh để demo các luồng sau:

- Người dùng xem và chỉnh sửa hồ sơ cá nhân.
- Admin xem danh sách toàn bộ người dùng dưới dạng bảng.
- Admin tìm kiếm nhanh theo tên, email hoặc mã định danh.
- Admin phân trang danh sách người dùng.
- Admin cập nhật trạng thái tài khoản.
- Admin gán hoặc thu hồi vai trò cho người dùng.

Để frontend này nối được với backend thật, mình đề xuất các thay đổi dưới đây.

## 2. Thay đổi dữ liệu đề xuất

### 2.1 Bảng `users`

Giữ nguyên các cột hiện có và bổ sung:

- `employee_code` `VARCHAR(64)` `UNIQUE`
- `phone_number` `VARCHAR(32)` `NULL`
- `department` `VARCHAR(128)` `NULL`
- `job_title` `VARCHAR(128)` `NULL`
- `address` `VARCHAR(255)` `NULL`
- `avatar_url` `TEXT` `NULL`
- `status` `VARCHAR(32)` với 3 giá trị:
  - `ACTIVE`
  - `SUSPENDED`
  - `LOCKED`
- `last_login_at` `DATETIME NULL`

Ghi chú:

- `is_active` hiện có có thể tiếp tục giữ để tương thích ngược.
- Backend nên đồng bộ `is_active = (status == ACTIVE)`.

### 2.2 Bảng `roles`

- `id`
- `code` `UNIQUE`
- `name`
- `description`
- `created_at`
- `updated_at`

Seed tối thiểu 4 role:

- `ADMIN`
- `MANAGER`
- `LEADER`
- `MEMBER`

### 2.3 Bảng nối `user_roles`

- `user_id`
- `role_id`
- `created_at`

Mục đích:

- Cho phép một người dùng có nhiều vai trò.
- Frontend hiện đã chuẩn bị để nhận `roles: []` và `role` chính.

## 3. API đề xuất

### 3.1 Lấy hồ sơ người dùng hiện tại

`GET /me`

Response đề xuất:

```json
{
  "id": 12,
  "employee_code": "FP-012",
  "full_name": "Nguyen Van A",
  "email": "a@company.com",
  "phone_number": "0901234567",
  "department": "Project Delivery",
  "job_title": "Project Manager",
  "address": "Ho Chi Minh City",
  "avatar_url": "https://...",
  "status": "ACTIVE",
  "is_active": true,
  "roles": ["MANAGER", "LEADER"],
  "primary_role": "MANAGER",
  "last_login_at": "2026-07-03T08:30:00Z",
  "created_at": "2026-07-01T10:00:00Z",
  "updated_at": "2026-07-03T10:15:00Z"
}
```

### 3.2 Cập nhật hồ sơ cá nhân

`PUT /me`

Request:

```json
{
  "full_name": "Nguyen Van A",
  "phone_number": "0901234567",
  "department": "Project Delivery",
  "job_title": "Project Manager",
  "address": "Ho Chi Minh City",
  "avatar_url": "https://..."
}
```

Rule:

- Chỉ người dùng đang đăng nhập mới được sửa hồ sơ của chính họ.
- Không cho người dùng tự đổi `roles`, `status`, `is_admin`, `is_active`.
- Nếu sau này cho phép đổi email thì nên tách endpoint riêng vì liên quan đăng nhập.

### 3.3 Danh sách người dùng

`GET /users`

Query params:

- `search`
- `status`
- `role`
- `page`
- `page_size`

Ví dụ:

`GET /users?search=an&page=1&page_size=10&status=ACTIVE&role=MANAGER`

Response đề xuất:

```json
{
  "items": [
    {
      "id": 12,
      "employee_code": "FP-012",
      "full_name": "Nguyen Van A",
      "email": "a@company.com",
      "phone_number": "0901234567",
      "department": "Project Delivery",
      "job_title": "Project Manager",
      "avatar_url": null,
      "status": "ACTIVE",
      "is_active": true,
      "roles": ["MANAGER"],
      "primary_role": "MANAGER",
      "updated_at": "2026-07-03T10:15:00Z"
    }
  ],
  "total": 24,
  "page": 1,
  "page_size": 10,
  "total_pages": 3
}
```

Rule:

- Chỉ `ADMIN` được xem toàn bộ danh sách.
- Nếu muốn mở rộng cho `MANAGER` hoặc `LEADER`, nên xác định rõ phạm vi dữ liệu nhìn thấy.

### 3.4 Cập nhật trạng thái người dùng

`PATCH /users/{user_id}/status`

Request:

```json
{
  "status": "LOCKED"
}
```

Rule:

- Chỉ `ADMIN` được đổi trạng thái.
- Khi chuyển sang `SUSPENDED` hoặc `LOCKED`, backend nên thu hồi toàn bộ refresh token đang còn hiệu lực của user đó.
- Có thể cân nhắc chặn tự khóa chính tài khoản `ADMIN` hiện tại nếu hệ thống chưa có nhiều admin.

### 3.5 Gán hoặc thu hồi vai trò

`PATCH /users/{user_id}/roles`

Request:

```json
{
  "roles": ["ADMIN", "MANAGER"]
}
```

Rule:

- Chỉ `ADMIN` được sửa vai trò.
- Backend nên validate danh sách role hợp lệ, loại bỏ trùng.
- Nếu request rỗng, có thể ép mặc định về `MEMBER`.

## 4. Bảo mật và kiểm soát truy cập

Đề xuất bổ sung trong dependency/auth layer:

- `get_current_user`: giữ như hiện tại nhưng nên từ chối user có `status != ACTIVE`.
- `require_admin`: dependency riêng để bảo vệ các API quản trị.
- Kiểm tra token hợp lệ + user tồn tại + user chưa bị khóa.

Các điểm cần làm:

- Nếu account `LOCKED` hoặc `SUSPENDED`, trả `403 Forbidden`.
- Revocation refresh token khi:
  - đổi mật khẩu
  - khóa tài khoản
  - tạm dừng tài khoản
- Cookie production nên bật `secure=True`.

## 5. Validation đề xuất

- `full_name`: không rỗng, max length phù hợp.
- `phone_number`: regex cơ bản hoặc normalize trước khi lưu.
- `page >= 1`
- `1 <= page_size <= 100`
- `status` phải thuộc `ACTIVE | SUSPENDED | LOCKED`
- `roles[]` chỉ thuộc tập role đã seed.

## 6. Tương thích với frontend đã sửa

Frontend hiện đã chuẩn bị cho:

- Hồ sơ cá nhân có các trường:
  - `full_name`
  - `phone_number`
  - `department`
  - `job_title`
  - `address`
  - `avatar_url`
- Danh sách user có:
  - `employee_code`
  - `roles`
  - `primary_role`
  - `status`
  - `updated_at`
- Luồng admin:
  - search
  - pagination
  - update status
  - update roles

## 7. Câu hỏi cần bạn duyệt trước

1. Có giữ `is_admin` song song với `roles` để tương thích ngược không, hay chuyển hẳn sang `roles`?
2. `MANAGER` và `LEADER` có được xem toàn bộ user hay chỉ `ADMIN`?
3. Có cho phép user tự đổi email đăng nhập không?
4. Khi `LOCKED`, có muốn revoke cả access token hiện hành hay chỉ refresh token?

## 8. Triển khai sau khi được duyệt

Nếu bạn duyệt proposal này, bước backend mình sẽ làm theo thứ tự:

1. Cập nhật schema/model.
2. Seed role và migrate dữ liệu cũ.
3. Viết dependency quyền truy cập.
4. Mở rộng `GET /me` và thêm `PUT /me`.
5. Thêm `GET /users`, `PATCH /users/{id}/status`, `PATCH /users/{id}/roles`.
6. Kết nối frontend preview sang API thật và bỏ chế độ lưu cục bộ.
