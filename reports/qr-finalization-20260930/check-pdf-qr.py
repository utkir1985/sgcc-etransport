import json,urllib.request,pathlib,io,hashlib
import pymupdf,zxingcpp
from PIL import Image
rows=json.load(open('/tmp/qr-final-documents.json'))
out=pathlib.Path('/tmp/qr-final-pdfs');out.mkdir(exist_ok=True)
results=[]
for r in rows:
 try:
  data=urllib.request.urlopen('http://172.16.90.54:8080/api/documents/'+r['globalId']+'/download',timeout=30).read()
  (out/(r['number']+'.pdf')).write_bytes(data)
  doc=pymupdf.open(stream=data,filetype='pdf');texts=[];codes=set()
  for page in doc:
   texts.append(page.get_text())
   pix=page.get_pixmap(matrix=pymupdf.Matrix(4,4))
   img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
   codes.update(x.text for x in zxingcpp.read_barcodes(img))
  signatures=[x for x in codes if 'F.I.Sh.:' in x]
  central=any('/verify/'+r['globalId'] in x for x in codes)
  fulltext='\n'.join(texts)
  pending='Kutilmoqda' in fulltext or '[QR]' in fulltext
  valid=central and not pending and (len(signatures)>=5 if r['type']=='Yuk xati' else True)
  result={**r,'pages':len(doc),'qrCount':len(codes),'signatureQrCount':len(signatures),'centralQrMatches':central,'hasPlaceholder':pending,'valid':valid,'sha256':hashlib.sha256(data).hexdigest()}
  results.append(result)
  print(r['number'], 'PASS' if valid else 'FAIL', 'QR:',len(codes),'signatures:',len(signatures),flush=True)
 except Exception as e:
  results.append({**r,'valid':False,'error':str(e)});print(r['number'],str(e),flush=True)
pathlib.Path('/tmp/qr-pdf-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('TOTAL',len(results),'PASS',sum(r['valid'] for r in results),flush=True)
