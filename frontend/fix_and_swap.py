import re

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'r') as f:
    content = f.read()

# Restore the rich titles first
content = content.replace(
    'title="Task quá hạn"',
    'title={\n            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>\n              <span>Task quá hạn</span>\n              <CountBadge value={filteredOverdueTasks.length} tone="red" />\n            </div>\n          }'
)
content = content.replace(
    'title="Task sắp tới hạn"',
    'title={\n            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>\n              <span>Task sắp tới hạn</span>\n              <CountBadge value={filteredUpcomingDeadlines.length} tone="blue" />\n            </div>\n          }'
)

# Now find the four blocks
def get_block(start_str, end_str="</Surface>"):
    start = content.find(start_str)
    if start == -1: return None
    start = content.rfind('<Surface', 0, start)
    end = content.find(end_str, start) + len(end_str)
    return content[start:end]

phan_bo = get_block('title="Phân bổ nhiệm vụ"')
tien_do = get_block('title="Tiến độ theo dự án"')
qua_han = get_block('<span>Task quá hạn</span>')
sap_han = get_block('<span>Task sắp tới hạn</span>')

# extract grid properties
def extract_grid(s):
    match = re.search(r'(\s*gridColumn:.*?,.*?\s*gridRow:.*?,)', s, re.DOTALL)
    if match: return match.group(1)
    return ""

qua_han_grid = extract_grid(qua_han)
sap_han_grid = extract_grid(sap_han)

# remove grid props from tasks
qua_han_new = re.sub(r'\s*gridColumn:.*?,.*?\s*gridRow:.*?,', '', qua_han, flags=re.DOTALL)
sap_han_new = re.sub(r'\s*gridColumn:.*?,.*?\s*gridRow:.*?,', '', sap_han, flags=re.DOTALL)

# add grid props to charts
phan_bo_new = re.sub(r'(minHeight: 330,\n\s*})', r'minHeight: 330,' + qua_han_grid + r'\n          }', phan_bo)
tien_do_new = re.sub(r'(minHeight: 330,\n\s*})', r'minHeight: 330,' + sap_han_grid + r'\n          }', tien_do)

# Swap them
content = content.replace(phan_bo, '___QUA_HAN___')
content = content.replace(tien_do, '___SAP_HAN___')
content = content.replace(qua_han, '___PHAN_BO___')
content = content.replace(sap_han, '___TIEN_DO___')

content = content.replace('___QUA_HAN___', qua_han_new)
content = content.replace('___SAP_HAN___', sap_han_new)
content = content.replace('___PHAN_BO___', phan_bo_new)
content = content.replace('___TIEN_DO___', tien_do_new)

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'w') as f:
    f.write(content)

print("Fixed and swapped successfully!")
