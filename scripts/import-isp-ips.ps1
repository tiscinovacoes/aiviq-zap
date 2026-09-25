<#
  Importa VARIOS IPs ISP de uma vez para o EVOLUTION_PROXY_POOL do apps/web/.env,
  a partir de um arquivo de texto com 1 IP por linha. Nao imprime senha.

  Formatos aceitos por linha:
    host:porta:usuario:senha
    usuario:senha@host:porta
    http://usuario:senha@host:porta
    host:porta                      (sem autenticacao; so funciona se o provedor liberar sem usuario)

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\import-isp-ips.ps1 -Arquivo C:\caminho\ips.txt -Replace

  -Replace descarta o pool atual (o proxy rotativo antigo). Sem -Replace, acrescenta.
  Apague o arquivo de texto depois: ele guarda as senhas em claro.
#>
param(
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [switch]$Replace,
  [string]$EnvFile
)
$ErrorActionPreference = 'Stop'

if (-not $EnvFile) { $EnvFile = Join-Path $PSScriptRoot '..\apps\web\.env' }
$EnvFile = [System.IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path $EnvFile)) { Write-Host "Nao achei $EnvFile"; exit 1 }
if (-not (Test-Path $Arquivo)) { Write-Host "Nao achei $Arquivo"; exit 1 }

function Parse-Linha([string]$linha) {
  $l = $linha.Trim()
  if (-not $l -or $l.StartsWith('#')) { return $null }
  $proto = 'http'
  if ($l -match '^(?<p>https?|socks5)://(?<r>.+)$') { $proto = $Matches.p; $l = $Matches.r }

  # usuario:senha@host:porta
  if ($l -match '^(?<u>[^:@]+):(?<s>.*)@(?<h>[^:@]+):(?<port>\d{1,5})$') {
    return [ordered]@{ host = $Matches.h; port = $Matches.port; username = $Matches.u; password = $Matches.s; protocol = $proto }
  }
  # host:porta:usuario:senha  (a senha pode conter ':')
  $p = $l.Split(':', 4)
  if ($p.Count -eq 4 -and $p[1] -match '^\d{1,5}$') {
    return [ordered]@{ host = $p[0]; port = $p[1]; username = $p[2]; password = $p[3]; protocol = $proto }
  }
  # host:porta
  if ($p.Count -eq 2 -and $p[1] -match '^\d{1,5}$') {
    return [ordered]@{ host = $p[0]; port = $p[1]; username = ''; password = ''; protocol = $proto }
  }
  return 'INVALIDA'
}

$enc    = New-Object System.Text.UTF8Encoding($false)
$linhas = [System.IO.File]::ReadAllLines($EnvFile, $enc)

$pool = @()
$idx  = -1
for ($i = 0; $i -lt $linhas.Count; $i++) {
  if ($linhas[$i] -match '^\s*EVOLUTION_PROXY_POOL\s*=\s*(.*)$') {
    $idx = $i
    # Atribuir ANTES de embrulhar (PS 5.1 aninha lista JSON com varios itens dentro de @(...)).
    if (-not $Replace) { try { $parsed = ($Matches[1].Trim().Trim("'").Trim('"')) | ConvertFrom-Json; $pool = @($parsed) } catch { $pool = @() } }
  }
}

$novos = 0; $ignoradas = 0; $semAuth = 0; $n = 0
foreach ($linha in [System.IO.File]::ReadAllLines($Arquivo)) {
  $n++
  $e = Parse-Linha $linha
  if ($null -eq $e) { continue }
  if ($e -eq 'INVALIDA') { Write-Host "  linha $n ignorada (formato nao reconhecido)"; $ignoradas++; continue }
  if ($e.username -and $e.username.Contains('{instance}')) { Write-Host "  linha $n ignorada: este importador e para IP ESTATICO (sem {instance})"; $ignoradas++; continue }
  if (-not $e.username) { $semAuth++ }
  $chave = "{0}:{1}:{2}" -f $e.host, $e.port, $e.username
  $pool = @($pool | Where-Object { ("{0}:{1}:{2}" -f $_.host, $_.port, $_.username) -ne $chave }) + @([pscustomobject]$e)
  $novos++
}

if ($novos -eq 0) { Write-Host 'Nenhum IP valido no arquivo. Nada foi alterado.'; exit 1 }

$json = ConvertTo-Json -InputObject @($pool) -Compress
$linhaNova = "EVOLUTION_PROXY_POOL=$json"
if ($idx -ge 0) { $linhas[$idx] = $linhaNova } else { $linhas = @($linhas) + @('', '# Pool de IPs ISP estaticos (1 por chip)', $linhaNova) }
[System.IO.File]::WriteAllLines($EnvFile, $linhas, $enc)

Write-Host ''
Write-Host "OK. $novos IP(s) importado(s); o pool agora tem $($pool.Count) entrada(s). $ignoradas linha(s) ignorada(s). Senhas NAO exibidas."
if ($semAuth -gt 0) { Write-Host "AVISO: $semAuth IP(s) sem usuario/senha. Isso indica autenticacao por IP de origem, que nao funciona com a Evolution no Railway." }
$k = 0; foreach ($p in $pool) { $k++; Write-Host ("  #{0} {1}:{2}" -f $k, $p.host, $p.port) }
Write-Host ''
Write-Host "Apague $Arquivo (tem as senhas em claro) e rode: scripts\test-proxy-pool.ps1"
