$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$python = Get-Command python.exe -ErrorAction SilentlyContinue
$pythonArguments = @('app.py')
if (-not $python) {
    $python = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($python) {
        $pythonArguments = @('-3', 'app.py')
    }
}
if (-not $python) {
    throw 'No se encontró Python. Instálalo o agrega python.exe al PATH.'
}

$previousPassword = [Environment]::GetEnvironmentVariable('CARTORA_ADMIN_PASSWORD', 'Process')
$previousPort = [Environment]::GetEnvironmentVariable('CARTORA_PORT', 'Process')
$securePassword = $null
$passwordPointer = [IntPtr]::Zero

try {
    if (-not $env:CARTORA_ADMIN_PASSWORD) {
        $securePassword = Read-Host 'Contraseña para el editor Cartora' -AsSecureString
        if ($securePassword.Length -lt 12) {
            throw 'La contraseña debe tener al menos 12 caracteres.'
        }

        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:CARTORA_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    }
    if ($env:CARTORA_ADMIN_PASSWORD.Length -lt 12) {
        throw 'CARTORA_ADMIN_PASSWORD debe tener al menos 12 caracteres.'
    }

    if (-not $env:CARTORA_PORT) {
        $env:CARTORA_PORT = '5000'
    }

    Write-Host "Cartora se abrirá en http://127.0.0.1:$env:CARTORA_PORT/login"
    Write-Host 'Deja esta ventana abierta mientras usas el editor. Ctrl+C detiene el servidor.'
    & $python.Source @pythonArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Cartora terminó con código $LASTEXITCODE."
    }
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($securePassword) {
        $securePassword.Dispose()
    }
    if ($null -eq $previousPassword) {
        Remove-Item Env:CARTORA_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:CARTORA_ADMIN_PASSWORD = $previousPassword
    }
    if ($null -eq $previousPort) {
        Remove-Item Env:CARTORA_PORT -ErrorAction SilentlyContinue
    } else {
        $env:CARTORA_PORT = $previousPort
    }
}
