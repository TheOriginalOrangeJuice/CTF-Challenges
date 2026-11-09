"""Use the shared template/tool, with a legible narrow-column label."""
import pathlib,sys,importlib.util,json
from docx import Document
from docx.shared import Pt
root=pathlib.Path(__file__).resolve().parents[1]
shared=pathlib.Path(sys.argv[1]).resolve()
spec=importlib.util.spec_from_file_location('shared_description',shared/'build_description.py')
tool=importlib.util.module_from_spec(spec);spec.loader.exec_module(tool)
report=tool.build(root/'Description.md',shared/'template.docx',root/'Description.docx')
doc=Document(root/'Description.docx')
for run in doc.tables[0].rows[3].cells[0].paragraphs[0].runs:run.font.size=Pt(10)
for table in doc.tables:
 for row in table.rows:
  for cell in row.cells:
   for paragraph in cell.paragraphs:
    paragraph.paragraph_format.widow_control=True
    if paragraph.text.startswith('14. '):paragraph.paragraph_format.keep_together=True
doc.save(root/'Description.docx')
(root/'organizer/document-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'sections':report['sections'],'images':len(report['images']),'links':len(report['local_links'])}))
