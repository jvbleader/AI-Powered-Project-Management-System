import re

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'r') as f:
    content = f.read()

# Row 2 children
# Child 1: Phân bổ nhiệm vụ (starts at <Surface title="Phân bổ nhiệm vụ")
c1_start = content.find('<Surface\n          title="Phân bổ nhiệm vụ"')
c1_end = content.find('</Surface>', c1_start) + 10

# Child 2: Tiến độ theo dự án (starts at <Surface\n          title="Tiến độ theo dự án")
c2_start = content.find('<Surface\n          title="Tiến độ theo dự án"')
c2_end = content.find('</Surface>', c2_start) + 10

phan_bo = content[c1_start:c1_end]
tien_do = content[c2_start:c2_end]

# Row 3 children
# Child 3: Task quá hạn
c3_start = content.find('<Surface\n          title={\n            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>\n              <span>Task quá hạn</span>')
c3_end = content.find('</Surface>', c3_start) + 10

# Child 4: Task sắp tới hạn
c4_start = content.find('<Surface\n          title={\n            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>\n              <span>Task sắp tới hạn</span>')
c4_end = content.find('</Surface>', c4_start) + 10

qua_han = content[c3_start:c3_end]
sap_han = content[c4_start:c4_end]

# We need to swap the gridColumn and gridRow properties
# phan_bo takes qua_han's grid styling
# tien_do takes sap_han's grid styling
# qua_han and sap_han lose their grid styling (or we can just remove them)

def extract_grid_props(surface_html):
    match = re.search(r'(gridColumn:.*?,.*?gridRow:.*?,)', surface_html, re.DOTALL)
    if match:
        return match.group(1)
    return None

qua_han_grid = extract_grid_props(qua_han)
sap_han_grid = extract_grid_props(sap_han)

# Remove grid props from tasks
qua_han = re.sub(r'\s*gridColumn:.*?,.*?gridRow:.*?,', '', qua_han, flags=re.DOTALL)
sap_han = re.sub(r'\s*gridColumn:.*?,.*?gridRow:.*?,', '', sap_han, flags=re.DOTALL)

# Add grid props to charts
# For phan_bo, inject before '}}'
phan_bo = phan_bo.replace('minHeight: 330,\n          }}', f'minHeight: 330,\n            {qua_han_grid}\n          }}')
tien_do = tien_do.replace('minHeight: 330,\n          }}', f'minHeight: 330,\n            {sap_han_grid}\n          }}')

# Also we need to make sure the heights match
# Currently charts have minHeight: 330, tasks have height: "100%"
# Tasks should have minHeight: 330 now? Let's just remove height: "100%" from tasks and add it to charts?
# Tasks currently have height: "100%", flex: 1, etc.
# Actually, the layout in Row 2 uses align-items: stretch so they will stretch anyway.

# Now replace in content
# We will do this by replacing the original strings with a placeholder, then replacing placeholders

content = content.replace(phan_bo, '___PHAN_BO___')
content = content.replace(tien_do, '___TIEN_DO___')
content = content.replace(qua_han, '___QUA_HAN___')
content = content.replace(sap_han, '___SAP_HAN___')

# Actually, the original variables phan_bo, tien_do, etc. are from the original content, so they match exactly
# Wait, I modified them above!
# I need to use the unmodified strings for replacement!

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'r') as f:
    content = f.read()

orig_phan_bo = content[c1_start:c1_end]
orig_tien_do = content[c2_start:c2_end]
orig_qua_han = content[c3_start:c3_end]
orig_sap_han = content[c4_start:c4_end]

content = content.replace(orig_phan_bo, qua_han)
content = content.replace(orig_tien_do, sap_han)
content = content.replace(orig_qua_han, phan_bo)
content = content.replace(orig_sap_han, tien_do)

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'w') as f:
    f.write(content)

print("Swapped successfully")
