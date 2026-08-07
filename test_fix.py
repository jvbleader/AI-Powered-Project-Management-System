import json
import math
import re

output_str = """```json_task_draft
[
  {
    "title": "Triển khai",
    "project_id": 15,
    "subtasks": [
      {
        "title": "Phát triển API",
        "estimated_hours": 16,
        "subtasks": [
          {"title": "API Đọc", "estimated_hours": 8},
          {"title": "API Ghi", "estimated_hours": 8}
        ]
      }
    ]
  }
]
```"""

project_id = 15
project_type_map = {15: "waterfall"}

def fix_task_draft_et(output_str: str) -> str:
    match = re.search(r'```json_task_draft\s*(.*?)\s*```', output_str, re.DOTALL)
    if not match:
        return output_str
    json_str = match.group(1)
    tasks = json.loads(json_str)
    def process_tasks(task_list):
        new_tasks = []
        for t in task_list:
            subtasks = t.get("subtasks", [])
            try:
                et = float(t.get("estimated_hours", 0))
            except:
                et = 0
            
            t_project_id = t.get("project_id", project_id)
            p_type = project_type_map.get(t_project_id, "agile")

            if (not subtasks or len(subtasks) == 0) and et > 8:
                num_parts = math.ceil(et / 8.0)
                base_et = round(et / num_parts, 1)
                
                if p_type == "waterfall":
                    t["subtasks"] = []
                    for i in range(num_parts):
                        part_et = base_et if i < num_parts - 1 else round(et - (base_et * (num_parts - 1)), 1)
                        sub_t = t.copy()
                        sub_t["title"] = f"{t.get('title', 'Task')} (Phần {i+1})"
                        sub_t["estimated_hours"] = part_et
                        if "subtasks" in sub_t:
                            del sub_t["subtasks"]
                        t["subtasks"].append(sub_t)
                    t["estimated_hours"] = round(sum(sub.get("estimated_hours", 0) for sub in t["subtasks"]), 1)
                    new_tasks.append(t)
                else:
                    for i in range(num_parts):
                        part_et = base_et if i < num_parts - 1 else round(et - (base_et * (num_parts - 1)), 1)
                        flat_t = t.copy()
                        flat_t["title"] = f"{t.get('title', 'Task')} (Phần {i+1})"
                        flat_t["estimated_hours"] = part_et
                        if "subtasks" in flat_t:
                            del flat_t["subtasks"]
                        new_tasks.append(flat_t)
            else:
                if len(subtasks) > 0:
                    t["subtasks"] = process_tasks(subtasks)
                    t["estimated_hours"] = round(sum(sub.get("estimated_hours", 0) for sub in t["subtasks"]), 1)
                new_tasks.append(t)
        return new_tasks
    fixed_tasks = process_tasks(tasks)
    return json.dumps(fixed_tasks, ensure_ascii=False, indent=2)

print(fix_task_draft_et(output_str))
