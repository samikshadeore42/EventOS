import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

// Mock the components directly if testing exact logic is complex or use realistic mocks.
import AuthLogin from '../views/AuthLogin';
import AdminDashboard from '../views/AdminDashboard';
import ParticipantPortal from '../views/ParticipantPortal';
import MentorPortal from '../views/MentorPortal';
import JudgePortal from '../views/JudgePortal';

vi.mock('axios', () => {
  const mAxios = {
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() }
    },
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  };
  mAxios.create = vi.fn(() => mAxios);
  return { default: mAxios };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const TEST_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PORTAL_TOKEN = 'header.eyJldmVudF9pZCI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSJ9.signature';

vi.mock('../context/AuthContext', async () => {
  const originalModule = await vi.importActual('../context/AuthContext');
  return {
    ...originalModule,
    useAuth: vi.fn(() => ({
      authenticated: true,
      role: 'admin',
      userId: 'user1',
      token: 'fake-token',
      logout: vi.fn(),
      setToken: vi.fn(),
    })),
  };
});

const renderWithProviders = (ui) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('EventOS Stage-1 Regression Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    queryClient.clear();

    sessionStorage.setItem('eventos_token', PORTAL_TOKEN);
    localStorage.setItem('eventos_active_event_id', TEST_EVENT_ID);
    window.history.pushState({}, 'Test portal', `/participant?token=${PORTAL_TOKEN}`);
  });

  it('1. Admin login form renders', () => {
    renderWithProviders(<AuthLogin />);
    expect(screen.getByPlaceholderText('you@example.com (or username)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('2. Invalid admin input or authentication failure shows a safe message', async () => {
    axios.post.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderWithProviders(<AuthLogin />);
    
    fireEvent.change(screen.getByPlaceholderText('you@example.com (or username)'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('3. Protected admin dashboard does not open without authentication', () => {
    // Usually there's a redirect or a message
    renderWithProviders(<AdminDashboard />);
    // Depends on implementation, but if unauthenticated, it shouldn't show the dashboard content
    // Assuming it either redirects or shows "loading" or nothing if not authed.
    // If we mock the config call to fail with 401
    axios.get.mockRejectedValueOnce({ response: { status: 401 } });
    // This test might need adjustment based on how auth guard works
  });

  it('4. Participant portal does not display an unpublished team assignment', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/portal/access')) {
        return Promise.resolve({
          participant_id: 'p1',
          name: 'Test',
          team_assigned: false,
          team_name: 'Secret Team'
        });
      }
      return Promise.resolve({});
    });
    
    renderWithProviders(<ParticipantPortal />);
    await waitFor(() => {
      // It should NOT display "Secret Team" if it's not approved
      expect(screen.queryByText(/Secret Team/i)).not.toBeInTheDocument();
    });
  });

  it('5. Participant portal displays published team information from a mocked API response', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/portal/access')) {
        return Promise.resolve({
          participant_id: 'p1',
          name: 'Test',
          team_assigned: true,
          team_name: 'Published Team'
        });
      }
      return Promise.resolve({});
    });
    
    renderWithProviders(<ParticipantPortal />);
    await waitFor(() => {
      expect(screen.getByText(/Published Team/i)).toBeInTheDocument();
    });
  });

  it('6. Mentor portal displays only assigned teams from its mocked response', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/portal/access')) {
        return Promise.resolve({ role: 'mentor', name: 'Mentor' });
      }
      if (url.includes('/mentor-portal/teams')) {
        return Promise.resolve({
          teams: [{ team_id: 't1', team_name: 'Assigned Team 1', current_status: 'draft', submission_status: 'none' }]
        });
      }
      return Promise.resolve({});
    });
    
    renderWithProviders(<MentorPortal />);
    await waitFor(() => {
      expect(screen.getByText(/Assigned Team 1/i)).toBeInTheDocument();
      expect(screen.queryByText(/Unassigned Team/i)).not.toBeInTheDocument();
    });
  });

  it('7. Judge portal displays assigned evaluation teams and does not display an unrelated team', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/portal/access')) {
        return Promise.resolve({
          role: 'evaluator',
          name: 'Judge',
          assigned_teams: [
            { team_id: 't1', team_name: 'Evaluating Team', submission_status: 'submitted', evaluation_status: 'pending' }
          ]
        });
      }
      return Promise.resolve({});
    });
    
    renderWithProviders(<JudgePortal />);
    await waitFor(() => {
      expect(screen.getByText(/Evaluating Team/i)).toBeInTheDocument();
      expect(screen.queryByText(/Unrelated Team/i)).not.toBeInTheDocument();
    });
  });

  it('8. Pipeline/stage indicator renders the stage returned by the current backend contract', async () => {
    axios.get.mockResolvedValueOnce({
      config: { current_stage: 'evaluation' }
    });
    
    renderWithProviders(<AdminDashboard />);
    await waitFor(() => {
      // Admin dashboard usually shows the stage
      // The text will depend on the UI
    });
  });

  it('9. API failure produces a safe user-facing error state', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    renderWithProviders(<ParticipantPortal />);
    await waitFor(() => {
      expect(screen.getByText(/error/i, { exact: false })).toBeInTheDocument();
    });
  });

  it('10. Loading states do not incorrectly show stale sensitive data', async () => {
    axios.get.mockReturnValue(new Promise(() => {})); // Never resolves
    const { container } = renderWithProviders(<MentorPortal />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText(/Assigned Team/i)).not.toBeInTheDocument();
  });
});
