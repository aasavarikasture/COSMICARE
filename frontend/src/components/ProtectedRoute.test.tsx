import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../lib/auth/context', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

describe('ProtectedRoute', () => {
  it('redirects to login when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/private"
            element={
              <ProtectedRoute>
                <div>Private</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/login page/i)).toBeTruthy();
  });
});
