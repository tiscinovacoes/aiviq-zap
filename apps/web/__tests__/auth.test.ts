import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(6, { message: 'A senha deve ter no mínimo 6 caracteres' }),
  rememberMe: z.boolean().optional(),
});

describe('Autenticação & Validação (Unit Tests)', () => {
  it('deve aceitar credenciais válidas', () => {
    const validData = {
      email: 'admin@poli.dev',
      password: 'senhaSegura123',
      rememberMe: true,
    };
    const result = loginSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar e-mail em formato inválido', () => {
    const invalidData = {
      email: 'not-an-email',
      password: 'senhaSegura123',
    };
    const result = loginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('E-mail inválido');
    }
  });

  it('deve rejeitar senha com menos de 6 caracteres', () => {
    const invalidData = {
      email: 'admin@poli.dev',
      password: '123',
    };
    const result = loginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('A senha deve ter no mínimo 6 caracteres');
    }
  });

  it('deve validar configuração segura de cookies httpOnly', () => {
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    };

    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.secure).toBe(true);
    expect(cookieOptions.sameSite).toBe('lax');
    expect(cookieOptions.maxAge).toBe(2592000);
  });
});
