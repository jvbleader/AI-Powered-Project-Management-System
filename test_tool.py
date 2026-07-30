from langchain_core.tools import tool

@tool
def create_tasks_in_db(target_project_id: int, tasks_data: list[dict]) -> str:
    """Tạo công việc mới (tasks) vào cơ sở dữ liệu.
    Args:
        target_project_id (int): ID của dự án.
        tasks_data (list[dict]): Danh sách các task cần tạo. Mỗi dict GỒM: title (bắt buộc), description, assignee_id, priority, type.
    """
    return "OK"

print(create_tasks_in_db.args_schema.schema())
