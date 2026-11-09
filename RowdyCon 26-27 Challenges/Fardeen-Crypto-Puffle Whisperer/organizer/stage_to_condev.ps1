param([Parameter(Mandatory=$true)][string]$StageName)
$ErrorActionPreference = 'Stop'
if ($StageName -notmatch '^puffle-[a-z0-9-]+$') { throw 'Use a task-owned unique staging name.' }
$projectSource = Split-Path -Parent $PSScriptRoot
$stageParent = Join-Path 'C:/Users/Public/Docker' $StageName
$stageHelper = Join-Path $env:USERPROFILE '.codex/skills/condev-development/scripts/stage_tree.ps1'
& $stageHelper -Source $projectSource -StageParent $stageParent
$stagedProject = Join-Path $stageParent 'Puffle Whisperer'
$records = @(Get-ChildItem -LiteralPath $stagedProject -File -Recurse | ForEach-Object {
    [pscustomobject]@{path=$_.FullName.Substring($stagedProject.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$manifestPath = "$stageParent-manifest.json"
$archivePath = "$stageParent.tar"
$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
& tar.exe -cf $archivePath -C $stageParent 'Puffle Whisperer'
if ($LASTEXITCODE -ne 0) { throw 'Archive preparation failed' }
docker cp $archivePath "condev-default:/tmp/$StageName.tar"
if ($LASTEXITCODE -ne 0) { throw 'Archive transfer failed' }
docker cp $manifestPath "condev-default:/tmp/$StageName-manifest.json"
if ($LASTEXITCODE -ne 0) { throw 'Manifest transfer failed' }
$verify = @'
from pathlib import Path
import hashlib,json,sys,tarfile
name=sys.argv[1]
target=Path('/tmp')/name
target.mkdir(exist_ok=False)
with tarfile.open('/tmp/'+name+'.tar') as archive:archive.extractall(target,filter='data')
root=target/'Puffle Whisperer'
expected={r['path']:r['sha256'] for r in json.loads(Path('/tmp/'+name+'-manifest.json').read_text(encoding='utf-8-sig'))}
actual={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
assert expected==actual,'Archive parity mismatch'
print(json.dumps({'root':str(root),'files':len(actual),'sha256_differences':0}))
'@
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($verify))
$condevExe = Join-Path $env:LOCALAPPDATA 'bin/condev.exe'
& $condevExe exec -- /tmp/puffle-venv-20261103/bin/python -c "import base64;exec(base64.b64decode('$encoded'))" $StageName
if ($LASTEXITCODE -ne 0) { throw 'Transferred source verification failed' }
