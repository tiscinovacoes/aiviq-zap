<#
  Cadastra IP(s) no EVOLUTION_PROXY_POOL do apps/web/.env, SEM expor a senha
  (a senha e lida como SecureString, nao aparece na tela nem no historico).

  Uso (interativo):
    powershell -ExecutionPolicy Bypass -File G:\Projetos\Poli\aiviq-zap-app\scripts\add-isp-ip.ps1 -Replace

  -Replace         descarta o pool atual (o proxy rotativo antigo) antes de cadastrar.
  -MaisSessoes N   alem do IP informado, cria N entradas extras com SESSOES novas (mesmo
                   usuario/senha, so o trecho _session-XXXX muda). Serve para gerar os IPs
                   dos outros chips e os de reserva de uma vez. DEPOIS rode o
                   test-proxy-pool.ps1: ele confirma se cada sessao saiu por um IP diferente.

  Aceita o que o painel do provedor mostra, inclusive com rotulos ("Server:isp.exemplo.net",
  "Username: fulano"): os rotulos sao removidos.
#>
param(
  [switch]$Replace,
  [int]$MaisSessoes = 0,
  [string]$EnvFile,
  # Uso nao interativo (testes). Em uso normal deixe em branco: o script pergunta.
  [string]$HostIp,
  [string]$Porta,
  [string]$Usuario,
  [string]$Protocolo,
  [System.Security.SecureString]$Senha
)
$ErrorActionPreference = 'Stop'

if (-not $EnvFile) { $EnvFile = Join-Path $PSScriptRoot '..\apps\web\.env' }
$envFile = [System.IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path $envFile)) { Write-Host "Nao achei $envFile"; exit 1 }

function Limpar-Host([string]$v) {
  $v = $v.Trim()
  $v = $v -replace '^(?i)\s*(proxy\s*server|server|servidor|host|ip)\s*:\s*', ''   # rotulo do painel
  $v = $v -replace '^(?i)(https?|socks5)://', ''
  return $v.Trim().Trim('/')
}
function Limpar-Usuario([string]$v) {
  return ($v.Trim() -replace '^(?i)\s*(username|user|usuario|usuário|nome de usuario)\s*:\s*', '').Trim()
}

$enc    = New-Object System.Text.UTF8Encoding($false)
$linhas = [System.IO.File]::ReadAllLines($envFile, $enc)

# pool atual
$pool = @()
$idx  = -1
for ($i = 0; $i -lt $linhas.Count; $i++) {
  if ($linhas[$i] -match '^\s*EVOLUTION_PROXY_POOL\s*=\s*(.*)$') {
    $idx = $i
    if (-not $Replace) {
      # Atribuir ANTES de embrulhar (PS 5.1 aninha lista JSON com varios itens dentro de @(...)).
      try { $parsed = ($Matches[1].Trim().Trim("'").Trim('"')) | ConvertFrom-Json; $pool = @($parsed) } catch { $pool = @() }
    }
  }
}

Write-Host ''
Write-Host "Pool atual: $($pool.Count) entrada(s)"
$n = 0
foreach ($e in $pool) { $n++; Write-Host ("  #{0} {1}:{2}" -f $n, $e.host, $e.port) }
Write-Host ''

if (-not $HostIp)    { $HostIp    = Read-Host 'Host do proxy (ex.: isp.exemplo.net, sem rotulo)' }
if (-not $Porta)     { $Porta     = Read-Host 'Porta' }
if (-not $Usuario)   { $Usuario   = Read-Host 'Usuario (vazio se a autenticacao for por IP)' }

$hostIp = Limpar-Host $HostIp
$porta  = ($Porta.Trim() -replace '^(?i)\s*(port|porta)\s*:\s*', '').Trim()
$user   = Limpar-Usuario $Usuario

# "host:porta" colado no campo de host
if ($hostIp -match '^(?<h>[^:]+):(?<p>\d{1,5})$') { $hostIp = $Matches.h; if (-not $porta) { $porta = $Matches.p } }

if ($hostIp -notmatch '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$') {
  Write-Host "Host invalido: '$hostIp'. Use so o endereco (ex.: isp.exemplo.net ou 203.0.113.10), sem espacos, ':' ou rotulos."
  exit 1
}
if ($porta -notmatch '^\d{1,5}$') { Write-Host "Porta invalida: '$porta'. Use so numeros."; exit 1 }
if ($user -and $user.Contains('{instance}')) { Write-Host 'Este script cadastra entradas FIXAS (nada de {instance}).'; exit 1 }

$senhaTxt = ''
if ($user) {
  if (-not $Senha) { $Senha = Read-Host 'Senha' -AsSecureString }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Senha)
  $senhaTxt = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $Protocolo) { $Protocolo = Read-Host 'Protocolo [http]' }
# Enter em branco = http. (Read-Host pode devolver $null fora do console interativo.)
$proto = 'http'
if ($Protocolo -and "$Protocolo".Trim()) { $proto = "$Protocolo".Trim().ToLower() }

# Aviso: sessao curta (o IP troca quando a sessao expira)
if ($user -match '_life-(?<m>\d+)') {
  $min = [int]$Matches.m
  if ($min -lt 1440) {
    Write-Host ''
    Write-Host "AVISO: o usuario tem sessao de $min min (_life-$min). O IP troca quando a sessao expira."
    Write-Host "       No painel, escolha o MAIOR valor de 'Tempo' disponivel para este produto, copie o usuario de novo e refaca."
  }
}

# Entradas: a informada + N sessoes extras
$novos = @([ordered]@{ host = $hostIp; port = $porta; username = $user; password = $senhaTxt; protocol = $proto })
if ($MaisSessoes -gt 0) {
  if ($user -notmatch '_session-[^_\s]+') {
    Write-Host "-MaisSessoes exige um usuario com o trecho _session-XXXX (o painel do provedor gera isso). Nada foi alterado."
    exit 1
  }
  $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray()
  $usados = @([regex]::Match($user, '_session-([^_\s]+)').Groups[1].Value)
  for ($k = 1; $k -le $MaisSessoes; $k++) {
    do { $sid = -join (1..10 | ForEach-Object { $alfabeto | Get-Random }) } while ($usados -contains $sid)
    $usados += $sid
    $u2 = [regex]::Replace($user, '_session-[^_\s]+', "_session-$sid")
    $novos += [ordered]@{ host = $hostIp; port = $porta; username = $u2; password = $senhaTxt; protocol = $proto }
  }
}

foreach ($e in $novos) {
  $chave = "{0}:{1}:{2}" -f $e.host, $e.port, $e.username
  $pool = @($pool | Where-Object { ("{0}:{1}:{2}" -f $_.host, $_.port, $_.username) -ne $chave }) + @([pscustomobject]$e)
}

# -InputObject preserva o array mesmo com 1 item (o pipe o desembrulharia no PS 5.1)
$json = ConvertTo-Json -InputObject @($pool) -Compress
$linhaNova = "EVOLUTION_PROXY_POOL=$json"

if ($idx -ge 0) { $linhas[$idx] = $linhaNova } else { $linhas = @($linhas) + @('', '# Pool de IPs (1 por chip)', $linhaNova) }
[System.IO.File]::WriteAllLines($envFile, $linhas, $enc)

Write-Host ''
Write-Host "OK. $($novos.Count) entrada(s) adicionada(s); o pool agora tem $($pool.Count). A senha NAO foi exibida."
$k = 0; foreach ($p in $pool) { $k++; Write-Host ("  #{0} {1}:{2}" -f $k, $p.host, $p.port) }
Write-Host ''
Write-Host 'Proximo passo: powershell -ExecutionPolicy Bypass -File G:\Projetos\Poli\aiviq-zap-app\scripts\test-proxy-pool.ps1'
