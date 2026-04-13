# vecfleet-automation-test

Suite de tests automatizados para la API de VecFleet. Corre contra entornos desplegados vía HTTP — no requiere el código fuente de la aplicación.

## Requisitos

- PHP 8.2+
- Composer

## Setup

```bash
# 1. Instalar dependencias
composer install

# 2. Configurar entorno
cp .env.example .env
# Editar .env con la URL del entorno y las credenciales de prueba
```

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base del entorno | `https://vec-dev.vecfleet.io/ws/Public/index.php/api` |
| `TEST_USERNAME` | Usuario de prueba | `qa_user` |
| `TEST_PASSWORD` | Contraseña del usuario | `MiClave1$` |
| `HTTP_TIMEOUT` | Timeout de requests (seg) | `30` |

## Ejecutar tests

```bash
# Todos los tests
composer test

# Por módulo
composer test:auth
composer test:tickets
composer test:moviles
composer test:combustibles

# Un test específico
vendor/bin/phpunit --filter LoginTest --testdox
```

## Estructura

```
tests/
├── bootstrap.php              # Carga .env y autoload
├── TestCase.php               # Clase base con cliente HTTP y helpers
└── Integration/
    ├── Auth/
    │   └── LoginTest.php      # Login, token, endpoints protegidos
    ├── Tickets/
    │   └── TicketsTest.php    # CRUD tickets, grilla, búsqueda
    ├── Moviles/
    │   └── MovilesTest.php    # CRUD vehículos, grilla, select
    └── Combustibles/
        └── CombustiblesTest.php  # Combustibles, controles de carga
```

## Entornos disponibles

Ver [Vec-collections](https://github.com/Samtineo/Vec-collections) para la lista completa de URLs por entorno.

| Entorno | URL |
|---|---|
| Vec Dev | `https://vec-dev.vecfleet.io/ws/Public/index.php/api` |
| Vec Hotfix | `https://vec-hotfix.vecfleet.io/ws/Public/index.php/api` |
| Vec Dinant-test | `https://test-dinant.vecfleet.io/ws/Public/index.php/api` |
| Vec teco-test | `https://testing-teco.vec.com.ar/ws/Public/index.php/api` |

## Convenciones

- Todos los tests están en español (nombres de métodos y comentarios)
- Cada módulo tiene su propia carpeta en `tests/Integration/`
- Los tests no modifican datos de producción — usan entornos de test
- Las credenciales nunca se commitean — siempre en `.env` (ignorado por git)
