param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Name)
$ErrorActionPreference='Stop'
$quizRoot=Split-Path -Parent $PSScriptRoot
$stageParent=Join-Path 'C:\Users\Public\Docker' $Name
& "$env:USERPROFILE\.codex\skills\condev-development\scripts\stage_tree.ps1" -Source $quizRoot -StageParent $stageParent
$stageProject=Join-Path $stageParent (Split-Path -Leaf $quizRoot)
$manifest=@{}
Get-ChildItem -LiteralPath $stageProject -Recurse -File | ForEach-Object { $rel=$_.FullName.Substring($stageProject.Length+1).Replace('\','/'); $manifest[$rel]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $stageParent 'source-manifest.json') -Encoding UTF8
& tar -cf (Join-Path $stageParent 'tree.tar') -C $stageParent 'The Impossible Security+ Quiz' 'source-manifest.json'
if($LASTEXITCODE -ne 0){throw 'Archive creation failed'}
& docker cp (Join-Path $stageParent 'tree.tar') "rowdy-impossible-dev:/tmp/$Name.tar"
if($LASTEXITCODE -ne 0){throw 'Archive transfer failed'}
$condevExe=Join-Path $env:LOCALAPPDATA 'bin\condev.exe'
$config=Join-Path $PSScriptRoot 'condev.yaml'
& $condevExe -c $config exec -- /bin/bash -lc "mkdir -p /tmp/$Name && tar -xf /tmp/$Name.tar -C /tmp/$Name"
& $condevExe -c $config exec -- python3 "/tmp/$Name/The Impossible Security+ Quiz/organizer/verify_tree.py" "/tmp/$Name/The Impossible Security+ Quiz" "/tmp/$Name/source-manifest.json"
if($LASTEXITCODE -ne 0){throw 'Container parity verification failed'}
