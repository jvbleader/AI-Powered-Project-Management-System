import os
import re

data_dir = 'frontend/lib/mock'
data_file = os.path.join(data_dir, 'data.ts')

with open(data_file, 'r') as f:
    content = f.read()

# Define the boundaries of each section manually based on the grep results
sections = {
    "users": (14, 94),
    "projects": (95, 172),
    "sprints": (173, 231),
    "tasks": (232, 514),
    "logworkEntries": (515, 589),
    "taskComments": (590, 620),
    "taskAttachments": (621, 641),
    "aiInsights": (642, 671),
    "aiMessages": (672, 696),
    "aiReports": (697, 720),
    "suggestedPrompts": (721, 727),
}

# we can combine all ai stuff together
# AI = aiInsights + aiMessages + aiReports + suggestedPrompts

lines = content.split('\n')

def extract(start, end):
    # start and end are 1-indexed, inclusive
    return '\n'.join(lines[start-1:end])

files = {
    "users.ts": extract(14, 94),
    "projects.ts": extract(95, 172),
    "sprints.ts": extract(173, 231),
    "tasks.ts": extract(232, 514),
    "logwork.ts": extract(515, 589),
    "comments.ts": extract(590, 620),
    "attachments.ts": extract(621, 641),
    "ai.ts": extract(642, 671) + "\n\n" + extract(672, 696) + "\n\n" + extract(697, 720) + "\n\n" + extract(721, 727),
}

os.makedirs(os.path.join(data_dir, 'data'), exist_ok=True)

import_statements = {
    "users.ts": 'import { UserProfile } from "@/types";\n\n',
    "projects.ts": 'import { Project } from "@/types";\n\n',
    "sprints.ts": 'import { Sprint } from "@/types";\n\n',
    "tasks.ts": 'import { Task } from "@/types";\n\n',
    "logwork.ts": 'import { LogworkEntry } from "@/types";\n\n',
    "comments.ts": 'import { TaskComment } from "@/types";\n\n',
    "attachments.ts": 'import { TaskAttachment } from "@/types";\n\n',
    "ai.ts": 'import { AiInsight, AiMessage, AiReport } from "@/types";\n\n',
}

for filename, content in files.items():
    with open(os.path.join(data_dir, 'data', filename), 'w') as f:
        f.write(import_statements[filename] + content + '\n')

new_data_content = """export * from './data/users';
export * from './data/projects';
export * from './data/sprints';
export * from './data/tasks';
export * from './data/logwork';
export * from './data/comments';
export * from './data/attachments';
export * from './data/ai';
"""

with open(data_file, 'w') as f:
    f.write(new_data_content)

print("Split data.ts successfully")
