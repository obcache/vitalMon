Param(
  [string]$Summary = ''
)

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$handoffDir = Join-Path $root 'docs/handoffs'
New-Item -ItemType Directory -Force -Path $handoffDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snapshotPath = Join-Path $handoffDir "handoff-$stamp.md"
$latestPath = Join-Path $handoffDir 'HANDOFF.md'

function Capture($Command, [string[]]$Arguments) {
  try {
    $output = & $Command @Arguments 2>&1
    return ($output | Out-String).Trim()
  } catch {
    return $_.Exception.Message
  }
}

function Section($Title, $Body) {
  if ([string]::IsNullOrWhiteSpace($Body)) { $Body = '(none)' }
  return "## $Title`r`n`r`n$Body`r`n"
}

$branch = Capture git @('branch','--show-current')
$status = Capture git @('status','--short')
$recent = Capture git @('log','--oneline','-10')
$todo = if (Test-Path 'docs/planning/To-do.md') { Get-Content -Raw 'docs/planning/To-do.md' } else { '' }
$ledger = if (Test-Path 'docs/dev-ledger.md') { Get-Content -Raw 'docs/dev-ledger.md' } else { '' }
$ledgerTail = if ($ledger.Length -gt 8000) { $ledger.Substring($ledger.Length - 8000) } else { $ledger }

$content = @"
# Project Handoff

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')

## Summary

$Summary

$(Section 'Current Branch' $branch)
$(Section 'Working Tree' $status)
$(Section 'Recent Commits' $recent)
$(Section 'Planning Snapshot' $todo)
$(Section 'Dev Ledger Tail' $ledgerTail)

## Next Session Checklist

- [ ] Read this handoff.
- [ ] Review `docs/planning/To-do.md`.
- [ ] Review recent `docs/dev-ledger.md` entries.
- [ ] Run the smallest relevant validation command before editing.
"@

[System.IO.File]::WriteAllText($snapshotPath, $content, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($latestPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "[handoff] Wrote $snapshotPath"
Write-Host "[handoff] Updated $latestPath"
