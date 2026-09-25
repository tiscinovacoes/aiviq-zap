<#
  Testa cada IP do EVOLUTION_PROXY_POOL (apps/web/.env) FORA do app:
  mostra o IP de saida, pais, regiao, operadora e se o IP e marcado como datacenter.
  Falha (exit 1) se: algum IP nao responde, dois IPs saem pelo mesmo endereco,
  ou algum IP nao e do Brasil. Nao imprime senha.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\test-proxy-pool.ps1
#>
param([string]$EnvFile)
$ErrorActionPreference = 'Stop'
if (-not $EnvFile) { $EnvFile = Join-Path $PSScriptRoot '..\apps\web\.env' }
$envFile = [System.IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path $envFile)) { Write-Host "Nao achei $envFile"; exit 1 }

$raw = $null
foreach ($l in Get-Content $envFile) { if ($l -match '^\s*EVOLUTION_PROXY_POOL\s*=\s*(.*)$') { $raw = $Matches[1].Trim().Trim("'").Trim('"') } }
if (-not $raw) { Write-Host 'EVOLUTION_PROXY_POOL vazio. Rode scripts\add-isp-ip.ps1 primeiro.'; exit 1 }
# Atribuir ANTES de embrulhar: no PS 5.1, @($raw | ConvertFrom-Json) trata uma lista
# JSON de varios itens como UM item (aninhado) e o teste enxergaria 1 proxy so.
try { $parsed = $raw | ConvertFrom-Json; $pool = @($parsed) } catch { Write-Host 'EVOLUTION_PROXY_POOL nao e um JSON valido.'; exit 1 }

# escapa para o arquivo de config do curl (barra invertida e aspas)
function Esc([string]$s) { return $s.Replace('\', '\\').Replace('"', '\"') }

$campos = 'status,message,country,countryCode,regionName,city,isp,org,hosting,proxy,query'
$url    = "http://ip-api.com/json/?fields=$campos"
$res    = @()
$n      = 0
foreach ($e in $pool) {
  $n++
  $alvo = "{0}://{1}:{2}" -f ($(if ($e.protocol) { $e.protocol } else { 'http' })), $e.host, $e.port
  # A credencial vai num arquivo de config temporario (nao na linha de comando,
  # onde apareceria na lista de processos). Sem BOM: o pipe do PowerShell poe BOM
  # quando $OutputEncoding e UTF-8 e o curl recusa ("unknown config option").
  $tmp = $null
  try {
    $curlArgs = @('-s', '--proxy', $alvo, '--max-time', '25')
    if ($e.username) {
      $tmp = [System.IO.Path]::GetTempFileName()
      $linha = 'proxy-user = "{0}:{1}"' -f (Esc $e.username), (Esc ([string]$e.password))
      [System.IO.File]::WriteAllText($tmp, $linha + "`n", (New-Object System.Text.UTF8Encoding($false)))
      $curlArgs += @('-K', $tmp)
    }
    $out = & curl.exe @curlArgs $url
    if (-not $out) { throw 'sem resposta (timeout ou proxy recusou a conexao)' }
    $j   = $out | ConvertFrom-Json
    if ($j.status -ne 'success') { throw "resposta: $($j.message)" }
    $res += [pscustomobject]@{ '#'=$n; Proxy="$($e.host):$($e.port)"; IPsaida=$j.query; Pais=$j.countryCode; Regiao=$j.regionName; Cidade=$j.city; Operadora=$j.isp; Datacenter=$j.hosting; Erro='' }
  } catch {
    $res += [pscustomobject]@{ '#'=$n; Proxy="$($e.host):$($e.port)"; IPsaida='-'; Pais='-'; Regiao='-'; Cidade='-'; Operadora='-'; Datacenter='-'; Erro=$_.Exception.Message }
  } finally {
    if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
}

$res | Format-Table -AutoSize | Out-String -Width 220 | Write-Host

$problemas = @()
$falhos = @($res | Where-Object { $_.Erro })
if ($falhos.Count) { $problemas += "$($falhos.Count) IP(s) nao responderam (confira usuario/senha/porta)." }
$ok = @($res | Where-Object { -not $_.Erro })
$dup = @($ok | Group-Object IPsaida | Where-Object { $_.Count -gt 1 })
if ($dup.Count) { $problemas += 'IPs repetidos: ' + (($dup | ForEach-Object { $_.Name }) -join ', ') }
$fora = @($ok | Where-Object { $_.Pais -ne 'BR' })
if ($fora.Count) { $problemas += "$($fora.Count) IP(s) fora do Brasil." }
$dc = @($ok | Where-Object { $_.Datacenter -eq $true })
if ($dc.Count) { Write-Host "AVISO: $($dc.Count) IP(s) marcado(s) como datacenter pelo ip-api. Em ISP estatico isso as vezes e falso positivo; confirme com o provedor." }

if ($problemas.Count) { Write-Host ''; $problemas | ForEach-Object { Write-Host "PROBLEMA: $_" }; exit 1 }
Write-Host "Tudo certo: $($ok.Count) IP(s) respondem, todos do Brasil e sem repeticao."
