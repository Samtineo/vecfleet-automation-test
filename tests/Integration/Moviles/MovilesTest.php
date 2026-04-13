<?php

namespace VecfleetTests\Integration\Moviles;

use VecfleetTests\TestCase;

/**
 * Tests de integración para MovilController.
 *
 * vendor/bin/phpunit --filter MovilesTest --testdox
 */
class MovilesTest extends TestCase
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

    public function test_listar_moviles_sin_token_retorna_401(): void
    {
        $response = $this->get('moviles');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_crear_movil_sin_token_retorna_401(): void
    {
        $response = $this->post('moviles');
        $this->assertSame(401, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // GET /api/moviles/select
    // -------------------------------------------------------------------------

    public function test_select_moviles_con_token_retorna_array(): void
    {
        $response = $this->get('moviles/select', [], $this->token);

        $this->assertJsonResponse($response, 200);
        $this->assertIsArray($this->jsonBody($response));
    }

    // -------------------------------------------------------------------------
    // GET /api/moviles/newGrid
    // -------------------------------------------------------------------------

    public function test_grid_moviles_retorna_estructura_esperada(): void
    {
        $response = $this->get('moviles/newGrid', ['page' => 0, 'perPage' => 10], $this->token);

        $this->assertJsonResponse($response, 200);
        $body = $this->jsonBody($response);

        $this->assertArrayHasKey('moviles', $body);
        $this->assertArrayHasKey('pagination', $body);
    }

    // -------------------------------------------------------------------------
    // GET /api/moviles/{id}
    // -------------------------------------------------------------------------

    public function test_obtener_movil_inexistente_retorna_error(): void
    {
        $response = $this->get('moviles/999999', [], $this->token);

        $this->assertContains($response->getStatusCode(), [204, 404]);
    }

    // -------------------------------------------------------------------------
    // POST /api/moviles (validación de input)
    // -------------------------------------------------------------------------

    public function test_crear_movil_sin_body_retorna_error_de_validacion(): void
    {
        $response = $this->post('moviles', [], $this->token);

        $this->assertContains($response->getStatusCode(), [400, 422]);
    }
}
