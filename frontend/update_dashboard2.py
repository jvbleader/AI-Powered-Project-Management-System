import re

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'r') as f:
    content = f.read()

def find_surface(title_substr):
    start = content.find(title_substr)
    if start == -1: return None
    # find the opening <Surface before the title
    start = content.rfind('<Surface', 0, start)
    
    # find the matching </Surface>
    # Since we know there are no nested <Surface> inside these specific elements, we can just find the next </Surface>
    end = content.find('</Surface>', start) + len('</Surface>')
    return content[start:end]

phan_bo = find_surface('title="Phân bổ nhiệm vụ"')
tien_do = find_surface('title="Tiến độ theo dự án"')
qua_han = find_surface('<span>Task quá hạn</span>')
sap_han = find_surface('<span>Task sắp tới hạn</span>')

# extract grid properties from qua_han and sap_han
def extract_grid(s):
    match = re.search(r'(\s*gridColumn:.*?,.*?\s*gridRow:.*?,)', s, re.DOTALL)
    if match:
        return match.group(1)
    return ""

qua_han_grid = extract_grid(qua_han)
sap_han_grid = extract_grid(sap_han)

qua_han_new = re.sub(r'\s*gridColumn:.*?,.*?\s*gridRow:.*?,', '', qua_han, flags=re.DOTALL)
sap_han_new = re.sub(r'\s*gridColumn:.*?,.*?\s*gridRow:.*?,', '', sap_han, flags=re.DOTALL)

phan_bo_new = re.sub(r'(minHeight: 330,\n\s*})', r'minHeight: 330,' + qua_han_grid + r'\n          }', phan_bo)
tien_do_new = re.sub(r'(minHeight: 330,\n\s*})', r'minHeight: 330,' + sap_han_grid + r'\n          }', tien_do)

new_content = content.replace(phan_bo, '___QUA_HAN___')
new_content = new_content.replace(tien_do, '___SAP_HAN___')
new_content = new_content.replace(qua_han, '___PHAN_BO___')
new_content = new_content.replace(sap_han, '___TIEN_DO___')

new_content = new_content.replace('___QUA_HAN___', qua_han_new)
new_content = new_content.replace('___SAP_HAN___', sap_han_new)
new_content = new_content.replace('___PHAN_BO___', phan_bo_new)
new_content = new_content.replace('___TIEN_DO___', tien_do_new)

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'w') as f:
    f.write(new_content)

print("Swap script generated and executed")
