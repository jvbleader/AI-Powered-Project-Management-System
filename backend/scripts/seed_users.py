import os
import sys
import random

# Ensure the backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database.connection import SessionLocal
from models.user_model import User
from models.department_model import Department
from utils.password_hash import hash_password

def seed_users():
    db = SessionLocal()
    try:
        departments = [
            "Phát triển phần mềm (Dev)",
            "Quản lý chất lượng (QA)",
            "Thiết kế (UI/UX)",
            "Nhân sự (HR)",
            "Kinh doanh (Sales)",
            "Marketing",
            "Chăm sóc khách hàng (CS)",
            "Quản trị hệ thống (IT/Ops)",
            "Phân tích dữ liệu (Data)",
            "Điều hành (BOD)"
        ]

        roles = [
            ("MEMBER", False),
            ("LEADER", False),
            ("MANAGER", False),
            ("ADMIN", True)
        ]

        first_names = ["Thạch", "Hùng", "Sơn", "Hải", "Tuấn", "Nam", "Phong", "Việt", "Bình", "Cường", "Trang", "Linh", "Lan", "Hương", "Mai", "Ngọc", "Anh", "Hoa", "Thảo", "Phương"]
        last_names = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"]
        middle_names = ["Văn", "Hữu", "Đức", "Công", "Quang", "Minh", "Thị", "Ngọc", "Thu", "Thanh", "Bảo", "Hải"]

        users_created = 0
        print("Đang tạo danh sách 30 người dùng mẫu...")

        default_password = hash_password("default1234")

        for _ in range(30):
            # Tên ngẫu nhiên
            last_name = random.choice(last_names)
            middle_name = random.choice(middle_names)
            first_name = random.choice(first_names)
            full_name = f"{last_name} {middle_name} {first_name}"
            
            # Tạo email (vd: nguyen.van.thach@example.com)
            email_prefix = f"{last_name.lower()}.{middle_name.lower()}.{first_name.lower()}".replace(" ", "").replace("đ", "d")
            # Remove diacritics using simple replacement (this is just mock data, so a basic one is fine)
            accents = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ"
            no_accents = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyy"
            trans = str.maketrans(accents, no_accents)
            email_prefix = email_prefix.translate(trans)
            email = f"{email_prefix}{random.randint(10, 999)}@gmail.com"
            
            # Nếu email đã tồn tại thì bỏ qua
            if db.query(User).filter(User.email == email).first():
                continue

            # Random phone number (Vietnam format)
            phone = f"0{random.choice(['3', '5', '7', '8', '9'])}{random.randint(10000000, 99999999)}"

            # Phân bố vai trò (70% Member, 15% Leader, 10% Manager, 5% Admin)
            role_choice = random.choices(roles, weights=[70, 15, 10, 5])[0]
            role, is_admin = role_choice

            # Random phòng ban
            department = random.choice(departments)

            # Fetch or create department
            dept_obj = db.query(Department).filter(Department.name == department).first()
            if not dept_obj:
                dept_obj = Department(name=department)
                db.add(dept_obj)
                db.commit()
                db.refresh(dept_obj)

            # Trạng thái
            is_active = random.choices([True, False], weights=[85, 15])[0]

            new_user = User(
                full_name=full_name,
                email=email,
                phone_number=phone,
                password_hash=default_password,
                department_id=dept_obj.id,
                role=role,
                is_admin=is_admin,
                is_active=is_active
            )

            db.add(new_user)
            users_created += 1

        db.commit()
        print(f"✅ Đã tạo thành công {users_created} người dùng!")
        print("Mật khẩu đăng nhập mặc định cho tất cả tài khoản: default1234")

    except Exception as e:
        db.rollback()
        print(f"❌ Lỗi khi tạo dữ liệu: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
