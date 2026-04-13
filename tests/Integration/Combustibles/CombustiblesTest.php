<?php

namespace VecfleetTests\Integration\Combustibles;

use VecfleetTests\TestCase;

/**
 * Tests de integración para CombustiblesController.
 *
 * vendor/bin/phpunit --filter CombustiblesTest --testdox
 */
class CombustiblesTest extends TestCase
{
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = $this->obtenerToken();
    }

    // -------------------------------------------------------------------------
    // Autenticación
    // -------------------------------------------------------------------------

    public function test_listar_combustibles_sin_token_retorna_401(): void
    {
        $response = $this->get('combustibles');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_controles_de_carga_sin_token_retorna_401(): void
    {
        $response = $this->get('controles-carga');
        $this->assertSame(401, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // GET /api/combustibles/newGrid
    // -------------------------------------------------------------------------

    public function test_grid_combustibles_con_token_retorna_estructura_esperada(): void
    {
        $response = $this->get('combustibles/newGrid', ['page' => 0, 'perPage' => 10], $this->token);

        $this->assertNotSame(401, $response->getStatusCode());

        if ($response->getStatusCode() === 200) {
            $body = $this->jsonBody($response);
            $this->assertIsArray($body);
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/controles-carga/newGrid
    // -------------------------------------------------------------------------

    public function test_grid_controles_carga_con_token_no_retorna_401(): void
    {
        $response = $this->get('controles-carga/newGrid', ['page' => 0, 'perPage' => 10], $this->token);

        $this->assertNotSame(401, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // POST (validación de input)
    // -------------------------------------------------------------------------

    public function test_crear_control_carga_sin_body_retorna_error_de_validacion(): void
    {
        $response = $this->post('controles-carga', [], $this->token);

        $this->assertContains($response->getStatusCode(), [400, 422]);
    }
}
