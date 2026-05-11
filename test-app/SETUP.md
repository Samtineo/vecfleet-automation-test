# VecFleet QA — Guía de configuración del entorno

Esta guía permite configurar el entorno completo de QA desde cero.
Está diseñada para ser ejecutada por Claude Code: podés decirle "configurá mi entorno siguiendo el SETUP.md de test-app" y lo hará automáticamente.

---

## Requisitos previos

- Windows 10/11
- Acceso a la organización GitHub **VECFleet-Arg** (solicitarlo a Samuel Tineo)
- Credenciales personales de **vec-dev** (solicitarlas al equipo)
- Claude Code instalado ([claude.ai/code](https://claude.ai/code))

---

## Setup automático (recomendado)

1. Clonar este repo manualmente una sola vez:
   ```
   git clone https://github.com/VECFleet-Arg/vecfleet-automation-test "C:\Users\<tu_usuario>\OneDrive\Escritorio\Claude\vecfleet-automation-test"
   ```

2. Abrir Claude Code en la carpeta `Escritorio\Claude`

3. Decirle a Claude:
   ```
   Ejecutá el setup de QA siguiendo las instrucciones de:
   vecfleet-automation-test\test-app\SETUP.md
   ```

Claude ejecutará `setup.ps1` que se encarga del resto.

---

## Qué instala y configura el setup

| Paso | Qué hace |
|------|----------|
| Git | Verifica instalación o descarga el instalador |
| gh CLI | Instala GitHub CLI en `%LOCALAPPDATA%\Programs\gh-cli\bin` (sin necesitar admin) |
| GitHub auth | Abre el browser para autenticar con tu cuenta de GitHub |
| Repositorios | Clona los 5 repos del equipo en `Escritorio\Claude\` |
| Credenciales | Crea `vec-dev.env` desde el template para que completes tus datos |
| Quasar patch | Aplica la configuración de testing sobre `vecfleet-quasar` |

---

## Repositorios del equipo

| Repo | Descripción |
|------|-------------|
| `vecfleet-automation-test` | Tests automatizados y configuración de QA |
| `qa-automation` | Scripts y automatizaciones del equipo QA |
| `vecfleet-claude-config` | Configuración de Claude para el equipo |
| `vec-fleet (no-subir-cambios)` | Código fuente de referencia (solo lectura local) |
| `vecfleet-quasar` | App web/mobile (rama `develop`, con patch de testing aplicado) |

---

## Credenciales personales

Cada miembro del equipo usa sus **propias credenciales** de vec-dev.

1. El setup crea `test-app/environments/vec-dev.env` automáticamente desde el template
2. Completar con tus datos:
   ```
   VF_USERNAME=tu_usuario_vecfleet
   VF_PASSWORD=tu_contraseña
   VF_BASE_URL=https://vec-dev.vecfleet.io/ws/Public/index.php/api
   ```
3. Este archivo está en `.gitignore` — **nunca se commitea**

---

## Actualizar el entorno

### Actualizar todos los repos (pull)

Decirle a Claude:
```
Ejecutá git pull en todos los repositorios del directorio CLAUDE.
```

### Actualizar el patch de quasar

Cuando haya cambios en la configuración de testing de quasar:

```powershell
# Desde vecfleet-quasar con los cambios aplicados:
git diff > "..\vecfleet-automation-test\test-app\quasar.patch"
```

Luego commitear el nuevo `quasar.patch` en `vecfleet-automation-test`.

### Reaplicar el patch desde cero

```powershell
$quasarDir = "$env:USERPROFILE\OneDrive\Escritorio\Claude\vecfleet-quasar"
$patchFile  = "$env:USERPROFILE\OneDrive\Escritorio\Claude\vecfleet-automation-test\test-app\quasar.patch"

git -C $quasarDir checkout .
git -C $quasarDir apply $patchFile
```

---

## Estructura de test-app

```
test-app/
  SETUP.md                          ← esta guía
  setup.ps1                         ← script de instalación automática
  quasar.patch                      ← overrides de quasar para testing
  environments/
    vec-dev.env.template            ← template de credenciales (commiteado)
    vec-dev.env                     ← credenciales personales (ignorado en git)
```

---

## Solución de problemas

**El patch de quasar falla al aplicarse**
```powershell
git -C "$env:USERPROFILE\OneDrive\Escritorio\Claude\vecfleet-quasar" checkout .
# Volver a correr setup.ps1
```

**gh auth expiró**
```powershell
$env:PATH = "$env:PATH;$env:LOCALAPPDATA\Programs\gh-cli\bin"
gh auth login --hostname github.com --git-protocol https --web
```

**No tengo acceso a los repos de VECFleet-Arg**
Solicitarlo a Samuel Tineo (stineo@vecfleet.io).
