#!/usr/bin/env python3
"""Retry pending final PDFs through the Admin API; no DB or QrLink secrets required."""
import json
import os
import sys
import urllib.error
import urllib.request

base = os.environ.get('ETRANSPORT_URL', 'http://127.0.0.1:8080').rstrip('/')
token = os.environ.get('ETRANSPORT_ADMIN_TOKEN', '')
if not token:
    sys.exit('ETRANSPORT_ADMIN_TOKEN muhit o‘zgaruvchisiga administrator tokenini kiriting.')
request = urllib.request.Request(base + '/api/documents/sync-qrlink-files', data=b'', method='POST',
                                 headers={'Authorization': 'Bearer ' + token})
try:
    with urllib.request.urlopen(request, timeout=3600) as response:
        result = json.load(response)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result.get('success') and result.get('data', {}).get('failed', 0) == 0 else 1)
except urllib.error.HTTPError as error:
    sys.exit(f'Sinxronlash API xatosi: HTTP {error.code}')
except (urllib.error.URLError, TimeoutError) as error:
    sys.exit(f'Sinxronlash tugamadi: {error}')
