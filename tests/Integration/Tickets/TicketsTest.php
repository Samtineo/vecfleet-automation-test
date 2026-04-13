<?php

namespace VecfleetTests\Integration\Tickets;

use VecfleetTests\TestCase;

/**
 * Tests de integración para TicketsController.
 *
 * vendor/bin/phpunit --filter TicketsTest --testdox
 */
class TicketsTest extends TestCase
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

    public function test_listar_tickets_sin_token_retorna_401(): void
    {
        $response = $this->get('tickets/newGrid');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_obtener_ticket_sin_token_retorna_401(): void
    {
        $response = $this->get('tickets/1');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_crear_ticket_sin_token_retorna_401(): void
    {
        $response = $this->post('tickets');
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_simple_search_sin_token_retorna_401(): void
    {
        $response = $this->get('tickets/simple-search');
        $this->assertSame(401, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // GET /api/tickets/newGrid
    // -------------------------------------------------------------------------

    public function test_grid_con_token_valido_no_retorna_401(): void
    {
        $response = $this->get('tickets/newGrid', ['page' => 0, 'perPage' => 10], $this->token);
        $this->assertNotSame(401, $response->getStatusCode());
    }

    public function test_grid_retorna_estructura_con_tickets_y_paginacion(): void
    {
        $response = $this->get('tickets/newGrid', ['page' => 0, 'perPage' => 10], $this->token);

        $this->assertJsonResponse($response, 200);
        $body = $this->jsonBody($response);

        $this->assertArrayHasKey('tickets', $body);
        $this->assertArrayHasKey('pagination', $body);
        $this->assertArrayHasKey('page', $body['pagination']);
        $this->assertArrayHasKey('count', $body['pagination']);
        $this->assertArrayHasKey('perPage', $body['pagination']);
    }

    // -------------------------------------------------------------------------
    // GET /api/tickets/simple-search
    // -------------------------------------------------------------------------

    public function test_simple_search_sin_parametros_retorna_array(): void
    {
        $response = $this->get('tickets/simple-search', [], $this->token);

        $this->assertJsonResponse($response, 200);
        $this->assertIsArray($this->jsonBody($response));
    }

    public function test_simple_search_por_texto_retorna_array(): void
    {
        $response = $this->get('tickets/simple-search', ['search' => 'test', 'number' => 5], $this->token);

        $this->assertJsonResponse($response, 200);
        $this->assertIsArray($this->jsonBody($response));
    }

    public function test_simple_search_por_id_inexistente_retorna_null(): void
    {
        $response = $this->get('tickets/simple-search', ['id' => 999999], $this->token);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertNull($this->jsonBody($response));
    }

    // -------------------------------------------------------------------------
    // GET /api/tickets/{id}
    // -------------------------------------------------------------------------

    public function test_obtener_ticket_inexistente_retorna_204(): void
    {
        $response = $this->get('tickets/999999', [], $this->token);
        $this->assertSame(204, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // GET /api/tickets/estados
    // -------------------------------------------------------------------------

    public function test_obtener_estados_retorna_lista_no_vacia(): void
    {
        $response = $this->get('tickets/estados', [], $this->token);

        $this->assertJsonResponse($response, 200);
        $this->assertNotEmpty($this->jsonBody($response));
    }

    // -------------------------------------------------------------------------
    // POST /api/tickets (validación de input)
    // -------------------------------------------------------------------------

    public function test_crear_ticket_sin_body_retorna_error_de_validacion(): void
    {
        $response = $this->post('tickets', [], $this->token);

        $this->assertContains($response->getStatusCode(), [400, 422]);
    }

    public function test_crear_ticket_con_datos_incompletos_retorna_error(): void
    {
        $response = $this->post('tickets', ['tipo' => 'CORRECTIVO'], $this->token);

        $this->assertContains($response->getStatusCode(), [400, 422]);
    }
}
