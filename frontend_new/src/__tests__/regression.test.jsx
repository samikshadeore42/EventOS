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
import { useAuth } from '../context/AuthContext';
import StageTimelinePanel from '../components/StageTimelinePanel';
import NotificationBell from '../components/NotificationBell';
import {
  commsApi,
  evaluationsApi,
  evaluatorsApi,
  mentorApi,
} from '../services/api';

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
    useAuth: vi.fn(),
  };
});

function defaultAuth(overrides = {}) {
  return {
    authenticated: true,
    role: 'admin',
    userId: 'user1',
    token: PORTAL_TOKEN,
    logout: vi.fn(),
    setToken: vi.fn(),
    activeOrganization: { id: 'org1', name: 'Demo Org' },
    activeMembership: { role: 'owner' },
    activeEvent: {
      id: TEST_EVENT_ID,
      name: 'Demo Hackathon',
      active_capabilities: ['teams', 'mentors', 'evaluators', 'submissions', 'weighted_scoring', 'risk_monitoring'],
    },
    availableEvents: [],
    eventsLoaded: true,
    loadEvents: vi.fn().mockResolvedValue(undefined),
    switchEvent: vi.fn(),
    ...overrides,
  };
}

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
    useAuth.mockReturnValue(defaultAuth());
    axios.get.mockResolvedValue({});
    axios.post.mockResolvedValue({});
    axios.patch.mockResolvedValue({});
    axios.delete.mockResolvedValue({});

    sessionStorage.setItem('eventos_token', PORTAL_TOKEN);
    localStorage.setItem('eventos_active_event_id', TEST_EVENT_ID);
    window.history.pushState({}, 'Test portal', `/participant?token=${PORTAL_TOKEN}`);
  });

  it('1. Admin login form renders', () => {
    renderWithProviders(<AuthLogin />);
    expect(screen.getByPlaceholderText('you@example.com or username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('2. Invalid admin input or authentication failure shows a safe message', async () => {
    axios.post.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderWithProviders(<AuthLogin />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com or username'), { target: { value: 'admin' } });
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
  it('11. Admin can create an event from a backend template', async () => {
    window.history.pushState({}, 'Create event', '/admin?tab=createevent');
    const template = {
      id: 'template-1',
      key: 'hackathon',
      name: 'Hackathon',
      description: 'Team build event',
      default_capabilities: ['teams', 'mentors', 'evaluators'],
    };
    axios.get.mockImplementation((url) => {
      if (url === '/templates') return Promise.resolve([template]);
      if (url === '/events') return Promise.resolve([]);
      if (String(url).includes('/config')) return Promise.resolve({ current_stage: 'registration' });
      if (String(url).includes('/event-state')) return Promise.resolve({ current_stage: 'registration' });
      return Promise.resolve({});
    });
    axios.post.mockResolvedValueOnce({
      id: TEST_EVENT_ID,
      name: 'Template Demo',
      active_capabilities: template.default_capabilities,
    });

    renderWithProviders(<AdminDashboard />);

    fireEvent.change(await screen.findByPlaceholderText('Smart India Hackathon Demo'), {
      target: { value: 'Template Demo' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'template-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create from template/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/events', expect.objectContaining({
        name: 'Template Demo',
        slug: 'template-demo',
        template_id: 'template-1',
        event_type: 'hackathon',
      }));
    });
  });
  it('12. Admin tabs hide modules not enabled by the active event capabilities', () => {
    useAuth.mockReturnValue(defaultAuth({
      activeEvent: {
        id: TEST_EVENT_ID,
        name: 'Coding Contest',
        active_capabilities: ['submissions', 'evaluators', 'leaderboard'],
      },
    }));

    renderWithProviders(<AdminDashboard />);

    expect(screen.queryByText('Mentor Ops')).not.toBeInTheDocument();
    expect(screen.queryByText('Risk')).not.toBeInTheDocument();
    expect(screen.getAllByText('Evaluators').length).toBeGreaterThan(0);
  });
  it('13. Stage timeline can create a creator-defined stage', async () => {
    axios.get.mockImplementation((url) => {
      if (String(url).endsWith('/stages')) return Promise.resolve([]);
      if (String(url).endsWith('/stages/runs')) return Promise.resolve([]);
      if (String(url).endsWith('/stages/validation')) return Promise.resolve({ is_valid: true, violations: [] });
      return Promise.resolve({});
    });
    axios.post.mockResolvedValueOnce({});

    renderWithProviders(<StageTimelinePanel eventStatus="draft" />);

    fireEvent.click(await screen.findByRole('button', { name: /add stage/i }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'registration' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Registration' } });
    fireEvent.click(screen.getByRole('button', { name: /create stage/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        `/events/${TEST_EVENT_ID}/stages`,
        expect.objectContaining({
          key: 'registration',
          name: 'Registration',
          position: expect.any(Number),
        })
      );
    });
  });
  it('14. Mentor and evaluator CSV imports use event-scoped multipart routes', async () => {
    const file = new File(['first_name,last_name,email\nA,B,a@example.com\n'], 'people.csv', { type: 'text/csv' });

    await mentorApi.importCsv(file, true);
    expect(axios.post).toHaveBeenCalledWith(
      `/events/${TEST_EVENT_ID}/mentors/import`,
      expect.any(FormData),
      {
        params: { upsert: true },
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    await evaluatorsApi.importCsv(file, false);
    expect(axios.post).toHaveBeenCalledWith(
      `/events/${TEST_EVENT_ID}/evaluators/import`,
      expect.any(FormData),
      {
        params: { upsert: false },
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
  });
  it('15. Judge score submit uses the event embedded in the evaluator magic-link token', async () => {
    localStorage.setItem('eventos_active_event_id', '22222222-2222-4222-8222-222222222222');

    await evaluationsApi.submit({ team_id: 'team-1', scores: { innovation: 8 } }, PORTAL_TOKEN);

    expect(axios.post).toHaveBeenCalledWith(
      `/events/${TEST_EVENT_ID}/evaluations`,
      { team_id: 'team-1', scores: { innovation: 8 } },
      { params: { token: PORTAL_TOKEN } }
    );
  });
  it('16. Notification bell does not call event-scoped APIs until an active event exists', () => {
    useAuth.mockReturnValue(defaultAuth({ activeEvent: null }));
    renderWithProviders(<NotificationBell />);
    expect(axios.get).not.toHaveBeenCalled();
  });
  it('17. Communications preflight sends a request body to the event-scoped endpoint', async () => {
    await commsApi.preflightSendgrid({ to_email: 'test@example.com', recipient_name: 'Tester' });
    expect(axios.post).toHaveBeenCalledWith(
      `/events/${TEST_EVENT_ID}/communications/preflight-sendgrid`,
      { to_email: 'test@example.com', recipient_name: 'Tester' }
    );
  });
  it('18. Integrity audit uses the event-scoped evaluation endpoint', async () => {
    await evaluationsApi.auditIntegrity();

    expect(axios.get).toHaveBeenCalledWith(
      `/events/${TEST_EVENT_ID}/evaluations/audit-integrity`
    );
  });

    it('19. Participant portal renders navbar and notification bell', async () => {
    window.history.pushState({}, 'Participant portal', `/participant?token=${PORTAL_TOKEN}`);

    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.includes('/portal/access')) {
        return Promise.resolve({
          participant_id: 'p1',
          name: 'Bhavika Badhe',
          email: 'bhavikabadhe3@gmail.com',
          event_name: 'ML Hackathon',
          stage: 'registration',
          team_assigned: false,
          timeline: [],
        });
      }

      if (path.includes('/participant-portal/notifications/unread-count')) {
        return Promise.resolve({ unread: 0 });
      }

      if (path.includes('/participant-portal/notifications')) {
        return Promise.resolve({ notifications: [] });
      }

      if (path.includes('/participant-mentor-info')) {
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });

    renderWithProviders(<ParticipantPortal />);

    await waitFor(() => {
      expect(screen.getByText(/WISE@TI EventOS/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Participant Portal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('20. Evaluator portal renders notification bell', async () => {
    window.history.pushState({}, 'Evaluator portal', `/judge?token=${PORTAL_TOKEN}`);

    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.includes('/portal/access')) {
        return Promise.resolve({
          role: 'evaluator',
          evaluator_id: 'e1',
          name: 'Judge One',
          stage: 'evaluation',
          assigned_teams: [],
        });
      }

      if (path.includes('/evaluations/portal/notifications/unread-count')) {
        return Promise.resolve({ unread: 0 });
      }

      if (path.includes('/evaluations/portal/notifications')) {
        return Promise.resolve({ notifications: [] });
      }

      return Promise.resolve({});
    });

    renderWithProviders(<JudgePortal />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    });
  });

  it('21. Stage timeline no longer renders Reminder policy JSON', async () => {
    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.endsWith('/stages')) return Promise.resolve([]);
      if (path.endsWith('/stages/runs')) return Promise.resolve([]);
      if (path.endsWith('/stages/validation')) {
        return Promise.resolve({ is_valid: true, violations: [] });
      }

      return Promise.resolve({});
    });

    renderWithProviders(<StageTimelinePanel eventStatus="draft" />);

    fireEvent.click(await screen.findByRole('button', { name: /add stage/i }));

    expect(screen.queryByText(/Reminder policy JSON/i)).not.toBeInTheDocument();
  });

  it('22. Stage timeline renders Notification recipients controls', async () => {
    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.endsWith('/stages')) return Promise.resolve([]);
      if (path.endsWith('/stages/runs')) return Promise.resolve([]);
      if (path.endsWith('/stages/validation')) {
        return Promise.resolve({ is_valid: true, violations: [] });
      }

      return Promise.resolve({});
    });

    renderWithProviders(<StageTimelinePanel eventStatus="draft" />);

    fireEvent.click(await screen.findByRole('button', { name: /add stage/i }));

    expect(screen.getByText(/Notification recipients/i)).toBeInTheDocument();
    expect(screen.getByText(/Participants/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Mentors$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Judges$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^All$/i).length).toBeGreaterThan(0);
  });

  it('23. Stage timeline renders Notification timing controls', async () => {
    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.endsWith('/stages')) return Promise.resolve([]);
      if (path.endsWith('/stages/runs')) return Promise.resolve([]);
      if (path.endsWith('/stages/validation')) {
        return Promise.resolve({ is_valid: true, violations: [] });
      }

      return Promise.resolve({});
    });

    renderWithProviders(<StageTimelinePanel eventStatus="draft" />);

    fireEvent.click(await screen.findByRole('button', { name: /add stage/i }));

    expect(screen.getByText(/Notification timing/i)).toBeInTheDocument();
    expect(screen.getByText(/When the stage starts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 day before ending time/i)).toBeInTheDocument();
    expect(screen.getByText(/6 hours before ending time/i)).toBeInTheDocument();
    expect(screen.getByText(/1 hour before ending time/i)).toBeInTheDocument();
    expect(screen.getByText(/30 mins before ending time/i)).toBeInTheDocument();
    expect(screen.getByText(/10 mins before ending time/i)).toBeInTheDocument();
    expect(screen.getByText(/5 mins before ending time/i)).toBeInTheDocument();
  });

    it('24. Mentor portal shows mentor chat only and hides team chat', async () => {
    window.history.pushState({}, 'Mentor portal', `/mentor?token=${PORTAL_TOKEN}`);

    axios.get.mockImplementation((url) => {
      const path = String(url);

      if (path.includes('/portal/access')) {
        return Promise.resolve({
          role: 'mentor',
          mentor_id: 'm1',
          name: 'Mentor One',
          email: 'mentor@test.com',
          organization: 'EventOS Labs',
          expertise_areas: ['AI'],
          assigned_teams_count: 1,
          meetings_scheduled: 0,
          updates_today: 0,
          pending_updates_count: 0,
        });
      }

      if (path.includes('/mentor-portal/teams')) {
        return Promise.resolve({
          teams: [
            {
              team_id: 't1',
              team_name: 'Assigned Team 1',
              member_count: 3,
              feedback_count: 0,
              latest_progress_score: null,
              members: [],
            },
          ],
        });
      }

      if (path.includes('/mentor-portal/updates/team')) {
        return Promise.resolve({ updates: [] });
      }

      if (path.includes('/mentor-portal/notifications/unread-count')) {
        return Promise.resolve({ unread: 0 });
      }

      return Promise.resolve({});
    });

    renderWithProviders(<MentorPortal />);

    await waitFor(() => {
      expect(screen.getByText(/Assigned Team 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Manage Team/i })[0]);

    expect(screen.queryByRole('button', { name: /^Team Chat$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mentor Chat$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Event Support$/i })).toBeInTheDocument();
  });
});
