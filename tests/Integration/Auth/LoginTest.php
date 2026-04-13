<?php

namespace VecfleetTests\Integration\Auth;

use VecfleetTests\TestCase;

/**
 * Tests de integración del endpoint POST /api/public/auth/login.
 *
 * vendor/bin/phpunit --filter LoginTest --testdox
 */
class LoginTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Credenciales válidas
    // -------------------------------------------------------------------------

    public function test_login_con_credenciales_validas_retorna_200(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => $_ENV['TEST_USERNAME'],
            'clave'   => $_ENV['TEST_PASSWORD'],
        ]);

        $this->assertJsonResponse($response, 200);
    }

    public function test_login_exitoso_retorna_token_no_vacio(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => $_ENV['TEST_USERNAME'],
            'clave'   => $_ENV['TEST_PASSWORD'],
        ]);

        $body = $this->jsonBody($response);

        $this->assertNotEmpty(
            $body['usuario']['token'] ?? null,
            'El login exitoso debe retornar un token no vacío'
        );
    }

    public function test_login_exitoso_retorna_datos_del_usuario(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => $_ENV['TEST_USERNAME'],
            'clave'   => $_ENV['TEST_PASSWORD'],
        ]);

        $body = $this->jsonBody($response);

        $this->assertArrayHasKey('usuario', $body, 'La respuesta debe incluir los datos del usuario');
    }

    // -------------------------------------------------------------------------
    // Credenciales inválidas
    // -------------------------------------------------------------------------

    public function test_login_con_clave_incorrecta_retorna_401(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => $_ENV['TEST_USERNAME'],
            'clave'   => 'claveIncorrecta99',
        ]);

        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_login_con_usuario_inexistente_retorna_401(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => 'usuario_que_no_existe_xyz',
            'clave'   => 'cualquierClave1$',
        ]);

        $this->assertSame(401, $response->getStatusCode());
    }

    // -------------------------------------------------------------------------
    // Validación de input
    // -------------------------------------------------------------------------

    public function test_login_sin_parametros_retorna_error(): void
    {
        $response = $this->post('public/auth/login', []);

        $this->assertContains(
            $response->getStatusCode(),
            [400, 401, 422],
            'Login sin parámetros debe retornar un código de error'
        );
    }

    public function test_login_sin_clave_retorna_error(): void
    {
        $response = $this->post('public/auth/login', [
            'usuario' => $_ENV['TEST_USERNAME'],
        ]);

        $this->assertContains($response->getStatusCode(), [400, 401, 422]);
    }

    // -------------------------------------------------------------------------
    // Endpoints protegidos
    // -------------------------------------------------------------------------

    public function test_endpoint_protegido_sin_token_retorna_401(): void
    {
        $response = $this->get('personas');

        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_endpoint_protegido_con_token_valido_no_retorna_401(): void
    {
        $token    = $this->obtenerToken();
        $response = $this->get('regiones', [], $token);

        $this->assertNotSame(401, $response->getStatusCode());
    }
}
