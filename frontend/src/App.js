import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n/config';
import './App.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// ── Shared pages (accessible to all authenticated roles) ──────────────────
const ScenariosPage        = lazy(() => import('./pages/ScenariosPage'));
const QuizzesPage          = lazy(() => import('./pages/QuizzesPage'));
const QuizPlayerPage       = lazy(() => import('./pages/QuizPlayerPage'));
const SimulationsPage      = lazy(() => import('./pages/SimulationsPage'));
const SimulationPlayerPage = lazy(() => import('./pages/SimulationPlayerPage'));
const AIChatPage           = lazy(() => import('./pages/AIChatPage'));
const SettingsPage         = lazy(() => import('./pages/SettingsPage'));
const ProfilePage          = lazy(() => import('./pages/ProfilePage'));
const DebriefPage          = lazy(() => import('./pages/DebriefPage'));

// ── User-only pages ────────────────────────────────────────────────────────
const DashboardPage        = lazy(() => import('./pages/DashboardPage'));
const LeaderboardPage      = lazy(() => import('./pages/LeaderboardPage'));
const AnalyticsPage        = lazy(() => import('./pages/AnalyticsPage'));
const GlossaryPage         = lazy(() => import('./pages/GlossaryPage'));
const MyAssignmentsPage    = lazy(() => import('./pages/MyAssignmentsPage'));

// ── Trainer/Admin pages ────────────────────────────────────────────────────
const InstructorDashboard  = lazy(() => import('./pages/InstructorDashboard'));
const ReadinessPage        = lazy(() => import('./pages/ReadinessPage'));
const TraineesPage         = lazy(() => import('./pages/TraineesPage'));
const AssignmentsPage      = lazy(() => import('./pages/AssignmentsPage'));
const InstructorReportsPage = lazy(() => import('./pages/InstructorReportsPage'));
const UserHistoryPage      = lazy(() => import('./pages/UserHistoryPage'));
const ScenarioBuilderPage  = lazy(() => import('./pages/ScenarioBuilderPage'));
const LiveCampaignsPage    = lazy(() => import('./pages/LiveCampaignsPage'));
const LiveReviewPage       = lazy(() => import('./pages/LiveReviewPage'));
const ReportInboxPage      = lazy(() => import('./pages/ReportInboxPage'));
const LiveAnalyticsPage    = lazy(() => import('./pages/LiveAnalyticsPage'));
const AttackSurfaceMapPage = lazy(() => import('./pages/AttackSurfaceMapPage'));
const TriageInboxPage      = lazy(() => import('./pages/TriageInboxPage'));
const FreeTextPage         = lazy(() => import('./pages/FreeTextPage'));
const UsersPage            = lazy(() => import('./pages/UsersPage'));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-primary font-mono animate-pulse">LOADING...</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin routes — full access including user management
// ─────────────────────────────────────────────────────────────────────────────
function AdminRoutes() {
  return (
    <Routes>
      <Route path="/"                        element={<ReadinessPage />} />
      <Route path="/command"                 element={<InstructorDashboard />} />
      {/* User management — admin only */}
      <Route path="/users"                   element={<UsersPage />} />
      {/* Trainer management */}
      <Route path="/trainer/groups"          element={<TraineesPage />} />
      <Route path="/trainer/groups/:id"      element={<TraineesPage />} />
      <Route path="/trainer/assignments"     element={<AssignmentsPage />} />
      <Route path="/trainer/reports"         element={<InstructorReportsPage />} />
      <Route path="/trainer/user-history"    element={<UserHistoryPage />} />
      {/* Content — admin can access everything */}
      <Route path="/scenarios"               element={<ScenariosPage />} />
      <Route path="/live"                    element={<LiveCampaignsPage />} />
      <Route path="/live/review"             element={<LiveReviewPage />} />
      <Route path="/live/reports"            element={<ReportInboxPage />} />
      <Route path="/live/analytics"          element={<LiveAnalyticsPage />} />
      <Route path="/attack-surface"          element={<AttackSurfaceMapPage />} />
      <Route path="/quizzes"                 element={<QuizzesPage />} />
      <Route path="/quizzes/:quizId/play"    element={<QuizPlayerPage />} />
      <Route path="/ai-challenge"            element={<AIChatPage />} />
      <Route path="/scenario-builder"        element={<ScenarioBuilderPage />} />
      <Route path="/triage"                  element={<TriageInboxPage />} />
      <Route path="/write-reply"             element={<FreeTextPage />} />
      <Route path="/simulations"             element={<SimulationsPage />} />
      <Route path="/simulations/:simulationId/play"    element={<ProtectedRoute><SimulationPlayerPage /></ProtectedRoute>} />
      <Route path="/simulations/:simulationId/debrief" element={<DebriefPage />} />
      <Route path="/analytics"               element={<AnalyticsPage />} />
      <Route path="/glossary"                element={<GlossaryPage />} />
      {/* System */}
      <Route path="/settings"                element={<SettingsPage />} />
      <Route path="/profile"                 element={<ProfilePage />} />
      <Route path="*"                        element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trainer routes — training management + content access
// ─────────────────────────────────────────────────────────────────────────────
function TrainerRoutes() {
  return (
    <Routes>
      <Route path="/"                        element={<ReadinessPage />} />
      <Route path="/command"                 element={<InstructorDashboard />} />
      {/* Trainer tools */}
      <Route path="/users"                   element={<UsersPage />} />
      <Route path="/trainer/groups"          element={<TraineesPage />} />
      <Route path="/trainer/groups/:id"      element={<TraineesPage />} />
      <Route path="/trainer/assignments"     element={<AssignmentsPage />} />
      <Route path="/trainer/reports"         element={<InstructorReportsPage />} />
      <Route path="/trainer/user-history"    element={<UserHistoryPage />} />
      {/* Content — trainers can use all training content */}
      <Route path="/scenarios"               element={<ScenariosPage />} />
      <Route path="/live"                    element={<LiveCampaignsPage />} />
      <Route path="/live/review"             element={<LiveReviewPage />} />
      <Route path="/live/reports"            element={<ReportInboxPage />} />
      <Route path="/live/analytics"          element={<LiveAnalyticsPage />} />
      <Route path="/attack-surface"          element={<AttackSurfaceMapPage />} />
      <Route path="/quizzes"                 element={<QuizzesPage />} />
      <Route path="/quizzes/:quizId/play"    element={<QuizPlayerPage />} />
      <Route path="/ai-challenge"            element={<AIChatPage />} />
      <Route path="/scenario-builder"        element={<ScenarioBuilderPage />} />
      <Route path="/triage"                  element={<TriageInboxPage />} />
      <Route path="/write-reply"             element={<FreeTextPage />} />
      <Route path="/simulations"             element={<SimulationsPage />} />
      <Route path="/simulations/:simulationId/play"    element={<ProtectedRoute><SimulationPlayerPage /></ProtectedRoute>} />
      <Route path="/simulations/:simulationId/debrief" element={<DebriefPage />} />
      <Route path="/analytics"               element={<AnalyticsPage />} />
      <Route path="/glossary"                element={<GlossaryPage />} />
      {/* Account */}
      <Route path="/settings"                element={<SettingsPage />} />
      <Route path="/profile"                 element={<ProfilePage />} />
      <Route path="*"                        element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// User routes — personal training progress
// ─────────────────────────────────────────────────────────────────────────────
function UserRoutes() {
  return (
    <Routes>
      <Route path="/"                        element={<DashboardPage />} />
      {/* Assigned exercises */}
      <Route path="/my-assignments"          element={<MyAssignmentsPage />} />
      {/* Training content */}
      <Route path="/scenarios"               element={<ScenariosPage />} />
      <Route path="/quizzes"                 element={<QuizzesPage />} />
      <Route path="/quizzes/:quizId/play"    element={<QuizPlayerPage />} />
      <Route path="/ai-challenge"            element={<AIChatPage />} />
      <Route path="/triage"                  element={<TriageInboxPage />} />
      <Route path="/write-reply"             element={<FreeTextPage />} />
      <Route path="/simulations"             element={<SimulationsPage />} />
      <Route path="/simulations/:simulationId/play"    element={<ProtectedRoute><SimulationPlayerPage /></ProtectedRoute>} />
      <Route path="/simulations/:simulationId/debrief" element={<DebriefPage />} />
      {/* Progress */}
      <Route path="/leaderboard"             element={<LeaderboardPage />} />
      <Route path="/analytics"               element={<AnalyticsPage />} />
      <Route path="/glossary"                element={<GlossaryPage />} />
      {/* Account */}
      <Route path="/settings"                element={<SettingsPage />} />
      <Route path="/profile"                 element={<ProfilePage />} />
      <Route path="*"                        element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App shell — mounts the right route tree based on role
// ─────────────────────────────────────────────────────────────────────────────
function AppShell() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('soceng_theme') || 'dark';
    document.documentElement.classList.toggle('light', savedTheme === 'light');
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono animate-pulse">INITIALIZING...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return showRegister ? (
      <RegisterPage onRegister={() => setShowRegister(false)} onSwitchToLogin={() => setShowRegister(false)} />
    ) : (
      <LoginPage onSwitchToRegister={() => setShowRegister(true)} />
    );
  }

  // Select route tree based on role
  const role = user?.role || 'user';
  let RouteComponent;
  if (role === 'admin') {
    RouteComponent = AdminRoutes;
  } else if (role === 'trainer') {
    RouteComponent = TrainerRoutes;
  } else {
    RouteComponent = UserRoutes;
  }

  return (
    <Layout onLogout={logout}>
      <Suspense fallback={<PageLoader />}>
        <RouteComponent />
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" />
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
