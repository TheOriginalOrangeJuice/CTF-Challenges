"""Render this challenge's Word handoff in Condev with an isolated office profile."""
import pathlib,subprocess,json
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'organizer/v4-document-render';out.mkdir(exist_ok=True)
profile=root.parent/'office-profile'
subprocess.run(['libreoffice','--headless','-env:UserInstallation='+profile.as_uri(),'--convert-to','pdf','--outdir',str(out),str(root/'Description.docx')],check=True,timeout=120)
pdf=out/'Description.pdf'
subprocess.run(['pdftotext','-layout',str(pdf),str(out/'rendered.txt')],check=True)
subprocess.run(['pdftoppm','-scale-to','1200','-png',str(pdf),str(out/'page')],check=True)
print(json.dumps({'pages':len(list(out.glob('page-*.png'))),'pdf':str(pdf)}))
