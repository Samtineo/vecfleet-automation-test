# Reporte del proyecto — vecfleet-automation-test

**Fecha de inicio:** 2026-04-13
**Repositorio:** [Samtineo/vecfleet-automation-test](https://github.com/Samtineo/vecfleet-automation-test)
**Destino final:** transferir a la organización VECFleet-Arg cuando esté estabilizado

---

## Contexto

Este proyecto nació como un entorno aislado de automatización de pruebas para la API de VecFleet. La decisión de crearlo por separado (fuera del repositorio `vec-fleet`) tiene como objetivo:

- Que los cambios de QA no afecten el trabajo del equipo de desarrollo
- Permitir iterar rápido sin romper el flujo de CI/CD existente
- Proveer un punto de entrada simple para el equipo de QA sin necesidad de levantar el entorno Docker completo

---

## Stack tecnológico

| Herramienta | Versión | Rol |
|---|---|---|
| **Newman** | 6.2.x | CLI runner de colecciones Postman |
| **newman-reporter-htmlextra** | 1.23.x | Generación de reportes HTML |
| **Node.js** | 22.x | Runtime |
| **Postman Collection** | v2.1 | Definición de requests y test scripts |

---

## Estructura del proyecto

```
vecfleet-automation-test/
├── collections/
│   └── vecfleet-api.postman_collection.json   # Colección VecFleet API (sincronizada desde Vec-collections)
├── environments/
│   ├── vec-dev.postman_environment.json
│   ├── vec-hotfix.postman_environment.json
│   ├── dinant-test.postman_environment.json
│   └── teco-test.postman_environment.json
├── scripts/
│   └── add-tests.js                           # Script para inyectar test scripts en la colección
├── docs/
│   ├── guia-ejecucion.md                      # Paso a paso para correr los tests
│   └── reporte-proyecto.md                    # Este archivo
├── reports/                                   # Reportes HTML generados (ignorado por git)
├── package.json
└── README.md
```

---

## Cobertura actual de test scripts

Se inyectaron test scripts en **11 requests** clave de la colección:

| Carpeta | Request | Tests |
|---|---|---|
| authentication | `/public/auth/login` | Status 200, token no vacío, objeto usuario, tiempo < 3s |
| Autenticación | `/auth/check` | Status 200, tiempo < 2s |
| Bases | `/bases/select` | Status 200, array no vacío, tiempo < 3s |
| Ociosidad | `disponibilidad/newGrid` | Status 200, estructura de objeto, tiempo < 5s |
| Combustibles | `/controles-carga` | Status 200, tiempo < 5s |
| Combustibles | `combustibles/grid` | Status 200, estructura de grilla, tiempo < 5s |
| Tickets | `/newGrid` | Status 200, tickets + paginación, array, tiempo < 5s |
| Tickets | `/grid` | Status 200, tiempo < 5s |
| Tickets | `/{ticket_id}` | Status 200 o 204, tiempo < 3s |
| Formularios > Historico | `formulario/newGrid` | Status 200, tiempo < 5s |
| Commons | `ConfigBussiness` | Status 200, objeto de configuración, tiempo < 2s |

---

## Entornos configurados

| Entorno | URL |
|---|---|
| Vec Dev | `https://vec-dev.vecfleet.io/ws/Public/index.php/api` |
| VEC Hotfix | `https://vec-hotfix.vecfleet.io/ws/Public/index.php/api` |
| Vec Dinant-test | `https://test-dinant.vecfleet.io/ws/Public/index.php/api` |
| Vec teco-test | `https://testing-teco.vec.com.ar/ws/Public/index.php/api` |

---

## Historial de cambios

### 2026-04-13
- Creación del repositorio `vecfleet-automation-test` en [Samtineo/vecfleet-automation-test](https://github.com/Samtineo/vecfleet-automation-test)
- Setup inicial con PHP/PHPUnit (descartado por falta de PHP local)
- Migración a Newman + Postman collection como herramienta principal
- Incorporación de la colección `VecFleet Api.postman_collection.json` desde `Vec-collections`
- Creación de archivos de entorno para vec-dev, vec-hotfix, dinant-test, teco-test
- Inyección de test scripts en 11 requests clave mediante `scripts/add-tests.js`
- Documentación: guía de ejecución y reporte del proyecto

---

## Roadmap

### Fase 1 — Completada ✅
- [x] Repositorio creado y publicado en GitHub
- [x] Newman configurado con scripts npm por entorno
- [x] Colección importada con test scripts en requests clave
- [x] Entornos configurados (4 ambientes)
- [x] Documentación inicial

### Fase 2 — Próximos pasos
- [ ] Completar credenciales en archivos de entorno y ejecutar primera corrida
- [ ] Revisar resultados y ajustar test scripts según comportamiento real de la API
- [ ] Ampliar cobertura: Moviles, Preventivos, Infracciones, GPS
- [ ] Agregar tests negativos (requests sin token, body inválido)

### Fase 3 — CI/CD
- [ ] Configurar GitHub Actions para ejecutar tests automáticamente
- [ ] Publicar reportes HTML como artefactos del pipeline
- [ ] Definir trigger: post-deploy a vec-dev como smoke test
- [ ] Notificaciones de fallo al equipo de QA

### Fase 4 — Madurez
- [ ] Transferir repositorio a la organización **VECFleet-Arg**
- [ ] Integrar con el pipeline de deploy de `vec-fleet`
- [ ] Evaluar unificación con la suite PHPUnit de `tests_new/` (para tests de integración más profundos)

---

## Relación con otros repositorios

| Repositorio | Relación |
|---|---|
| [VECFleet-Arg/vec-fleet](https://github.com/VECFleet-Arg/vec-fleet) | Código fuente — **no modificar desde QA** |
| [Samtineo/Vec-collections](https://github.com/Samtineo/Vec-collections) | Origen de la colección Postman y entornos |
| [VECFleet-Arg/vecfleet-claude-config](https://github.com/VECFleet-Arg/vecfleet-claude-config) | Configuración Claude AI — roles y contexto del equipo QA |
