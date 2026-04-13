<?php

namespace VecfleetTests;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use PHPUnit\Framework\TestCase as BaseTestCase;
use Psr\Http\Message\ResponseInterface;

/**
 * Clase base para todos los tests de integración.
 *
 * Provee un cliente HTTP (Guzzle) preconfigurado con la URL base y el token
 * de autenticación del usuario de prueba.
 */
abstract class TestCase extends BaseTestCase
{
    protected Client $http;
    protected static ?string $token = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->http = new Client([
            'base_uri'    => rtrim($_ENV['API_URL'], '/') . '/',
            'timeout'     => (float) ($_ENV['HTTP_TIMEOUT'] ?? 30),
            'http_errors' => false, // No lanzar excepciones en 4xx/5xx — los assertions los manejan
        ]);
    }

    // -------------------------------------------------------------------------
    // Autenticación
    // -------------------------------------------------------------------------

    /**
     * Realiza el login con las credenciales del .env y cachea el token
     * para toda la sesión de tests (se reutiliza entre tests del mismo proceso).
     */
    protected function obtenerToken(): string
    {
        if (static::$token !== null) {
            return static::$token;
        }

        $response = $this->http->post('public/auth/login', [
            'json' => [
                'usuario' => $_ENV['TEST_USERNAME'],
                'clave'   => $_ENV['TEST_PASSWORD'],
            ],
        ]);

        $this->assertSame(200, $response->getStatusCode(), 'No se pudo obtener el token de autenticación');

        $body = $this->jsonBody($response);
        static::$token = $body['usuario']['token'] ?? null;

        $this->assertNotEmpty(static::$token, 'El token retornado está vacío');

        return static::$token;
    }

    // -------------------------------------------------------------------------
    // Helpers de request
    // -------------------------------------------------------------------------

    protected function get(string $endpoint, array $query = [], ?string $token = null): ResponseInterface
    {
        return $this->http->get($endpoint, [
            'query'   => $query,
            'headers' => $this->headers($token),
        ]);
    }

    protected function post(string $endpoint, array $body = [], ?string $token = null): ResponseInterface
    {
        return $this->http->post($endpoint, [
            'json'    => $body,
            'headers' => $this->headers($token),
        ]);
    }

    protected function put(string $endpoint, array $body = [], ?string $token = null): ResponseInterface
    {
        return $this->http->put($endpoint, [
            'json'    => $body,
            'headers' => $this->headers($token),
        ]);
    }

    protected function delete(string $endpoint, ?string $token = null): ResponseInterface
    {
        return $this->http->delete($endpoint, [
            'headers' => $this->headers($token),
        ]);
    }

    // -------------------------------------------------------------------------
    // Helpers de respuesta
    // -------------------------------------------------------------------------

    protected function jsonBody(ResponseInterface $response): mixed
    {
        return json_decode((string) $response->getBody(), true);
    }

    protected function assertJsonResponse(ResponseInterface $response, int $expectedStatus): void
    {
        $this->assertSame(
            $expectedStatus,
            $response->getStatusCode(),
            'Status code inesperado. Body: ' . $response->getBody()
        );
        $this->assertStringContainsString(
            'application/json',
            $response->getHeaderLine('Content-Type'),
            'La respuesta debe ser JSON'
        );
    }

    // -------------------------------------------------------------------------
    // Privados
    // -------------------------------------------------------------------------

    private function headers(?string $token): array
    {
        $headers = ['Accept' => 'application/json'];

        if ($token !== null) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        return $headers;
    }
}
