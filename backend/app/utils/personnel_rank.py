from sqlalchemy import case

ROLE_PM = "Project Manager / Product Owner / Group Member"
ROLE_LEADER = "Leader"
ROLE_DIRECTOR = "Giám đốc"
DEPARTMENT_HEAD_OF_DEV = "Head of Dev"


def personnel_rank(role_name: str | None, department_name: str | None = None) -> int:
    """
    Thứ tự cấp bậc Nhân sự (thấp hơn = cao hơn):
    0 Giám đốc
    1 PM/PO/GM phòng Head of Dev
    2 PM/PO/GM các dự án
    3 Leader
    4 còn lại
    """
    role = (role_name or "").strip()
    department = (department_name or "").strip()

    if role == ROLE_DIRECTOR:
        return 0
    if role == ROLE_PM and department == DEPARTMENT_HEAD_OF_DEV:
        return 1
    if role == ROLE_PM:
        return 2
    if role == ROLE_LEADER:
        return 3
    return 4


def personnel_rank_sql_order(role_column, department_column):
    """SQLAlchemy CASE để order_by theo cấp bậc Nhân sự."""
    return case(
        (role_column == ROLE_DIRECTOR, 0),
        (
            (role_column == ROLE_PM) & (department_column == DEPARTMENT_HEAD_OF_DEV),
            1,
        ),
        (role_column == ROLE_PM, 2),
        (role_column == ROLE_LEADER, 3),
        else_=4,
    )
