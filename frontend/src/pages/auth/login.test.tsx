import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './login';

vi.mock('../../lib/auth/context', () => ({
  useAuth: () => ({
    login: vi.fn().mockResolvedValue({ success: false, error: 'bad' }),
    isLoading: false,
  }),
}));

describe('LoginPage', () => {
  it('shows validation errors when submitting empty form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText(/email is required/i)).toBeTruthy();
    expect(screen.getByText(/password is required/i)).toBeTruthy();
  });
});
