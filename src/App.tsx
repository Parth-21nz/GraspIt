/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { FloatingNavbar } from './components/FloatingNavbar';
import { LandingPage } from './components/LandingPage';
import { StudentDashboard } from './components/StudentDashboard';
import { InstructorCMS } from './components/InstructorCMS';
import { AdminPortal } from './components/AdminPortal';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthPage } from './components/AuthPage';
import { ProfilePage } from './components/ProfilePage';
import { uploadImage } from './api/uploads';
import { createRequestGate } from './lib/latestRequest';
import { LoadingScreen, LoadErrorScreen } from './components/LoadingScreen';
import { apiRequest, setCsrfToken } from './api/client';
import { AccountRecoveryPage } from './components/AccountRecoveryPage';
import { AccountSecurity } from './components/AccountSecurity';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  LessonNoteDocument,
  MentorProfile,
  UserDocument,
  UserRole,
  AppView,
  ProfileDocument,
  ProfileUpdate,
} from './types';

const AUTH_STORAGE_KEY = 'graspit_auth_user_id';
const TOKEN_STORAGE_KEY = 'graspit_auth_token';

async function responseError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  const issue = body?.issues?.[0];
  return issue ? `${issue.path}: ${issue.message}` : body?.error || fallback;
}

function viewFromHash(): AppView {
  const view = window.location.hash.slice(1).split('?')[0];
  return ['profile', 'workspace', 'learning', 'auth', 'forgot-password', 'reset-password', 'verify-email'].includes(view) ? view as AppView : 'landing';
}

export default function App() {
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const [courses, setCourses] = useState<CourseDocument[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDocument[]>([]);
  const [notes, setNotes] = useState<LessonNoteDocument[]>([]);
  const [inquiries, setInquiries] = useState<InquiryDocument[]>([]);
  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading GraspIt…');
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapRequests] = useState(createRequestGate);

  // Authenticated User & Active View State (No Role Switcher)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const sessionGeneration = useRef(0);
  const expectsSession = useRef(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  useEffect(() => { try { localStorage.removeItem(AUTH_STORAGE_KEY); localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {} }, []);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [emailDeliveryAvailable, setEmailDeliveryAvailable] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [paymentsMode, setPaymentsMode] = useState<'disabled' | 'mock'>('disabled');
  const profileDirty = useRef(false);
  const setProfileDirty = useCallback((dirty: boolean) => { profileDirty.current = dirty; }, []);

  const clearSession = () => {
    bootstrapRequests.cancel();
    expectsSession.current = false;
    setCsrfToken(null); setSessionError(null);
    setLoading(true);
    setBootstrapError(false);
    setLoadingMessage('Returning to sign in…');
    setSessionVersion(++sessionGeneration.current);
    setCurrentUserId(null);
    setUsers([]); setCourses([]); setEnrollments([]); setNotes([]); setInquiries([]);
    setSelectedPlayerCourseId(null); setCheckoutCourse(null);
    profileDirty.current = false;
    setViewState('auth');
    window.history.replaceState(null, '', '#auth');
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const apiFetch = (input: string, init: RequestInit = {}) => {
    const requestVersion = sessionGeneration.current;
    return apiRequest(input, init).then((res) => {
      if (requestVersion !== sessionGeneration.current) throw new DOMException('Session changed.', 'AbortError');
      if (res.status === 401) clearSession();
      return res;
    });
  };
  const [activeView, setViewState] = useState<AppView>(viewFromHash);
  const setActiveView = (view: AppView) => {
    if (activeView === 'profile' && view !== 'profile' && profileDirty.current && !window.confirm('Leave without saving your profile changes?')) return;
    if (view !== activeView) profileDirty.current = false;
    setViewState(view);
    const hash = view === 'landing' ? '#home' : `#${view}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    const syncView = () => {
      const next = viewFromHash();
      if (next === activeView) return;
      if (activeView === 'profile' && profileDirty.current && !window.confirm('Leave without saving your profile changes?')) {
        window.history.replaceState(null, '', '#profile'); return;
      }
      profileDirty.current = false; setViewState(next);
    };
    window.addEventListener('hashchange', syncView);
    return () => window.removeEventListener('hashchange', syncView);
  }, [activeView]);
  const [selectedPlayerCourseId, setSelectedPlayerCourseId] = useState<
    string | null
  >(null);
  const [checkoutCourse, setCheckoutCourse] = useState<CourseDocument | null>(
    null
  );
  const [pendingCourseAfterAuth, setPendingCourseAfterAuth] =
    useState<CourseDocument | null>(null);

  const loadBootstrap = async (requestVersion = sessionGeneration.current, message = expectsSession.current ? 'Loading your workspace…' : 'Loading GraspIt…') => {
    const request = bootstrapRequests.start();
    const isCurrent = () => request.isCurrent() && requestVersion === sessionGeneration.current;
    const timeout = window.setTimeout(() => request.abort(), 20_000);
    setLoading(true); setLoadingMessage(message); setBootstrapError(false);
    try {
      const res = await apiRequest('/api/bootstrap', { signal: request.signal, cache: 'no-store' });
      if (!isCurrent()) return false;
      if (res.status === 401) { clearSession(); return false; }
      if (!res.ok) throw new Error('Failed to load initial data');
      const data = await res.json();
      if (!isCurrent()) return false;
      if (expectsSession.current && !data.me) {
        clearSession();
        return false;
      }
      setCsrfToken(data.csrfToken ?? null);
      expectsSession.current = Boolean(data.me);
      setDemoMode(Boolean(data.demoMode));
      setEmailDeliveryAvailable(Boolean(data.emailDeliveryAvailable));
      setPaymentsMode(data.paymentsMode === 'mock' ? 'mock' : 'disabled');
      setCurrentUserId(data.me?._id ?? null);
      setUsers(data.users || []);
      setCategories(data.categories || []);
      setCourses(data.courses || []);
      setEnrollments(data.enrollments || []);
      setNotes(data.notes || []);
      setInquiries(data.inquiries || []);
      setMentors(data.mentors || []);
      return true;
    } catch (err) {
      if (!isCurrent()) return false;
      setBootstrapError(true);
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrap(sessionGeneration.current);
    return () => bootstrapRequests.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionVersion]);

  const currentUser: UserDocument | null = currentUserId
    ? users.find((u) => u._id === currentUserId) || null
    : null;

  const handleAuthSuccess = (
    authenticatedUser: UserDocument
  ) => {
    bootstrapRequests.cancel();
    expectsSession.current = true;
    setAuthNotice(null);
    setSessionError(null);
    setLoading(true); setLoadingMessage('Loading your workspace…'); setBootstrapError(false);
    setSessionVersion(++sessionGeneration.current);
    setUsers([authenticatedUser]);
    setCourses([]); setEnrollments([]); setNotes([]); setInquiries([]);
    setCurrentUserId(authenticatedUser._id);


    if (pendingCourseAfterAuth) {
      setCheckoutCourse(pendingCourseAfterAuth);
      setPendingCourseAfterAuth(null);
      setActiveView('landing');
    } else {
      setActiveView(activeView === 'profile' || activeView === 'learning' ? activeView : authenticatedUser.role === 'student' ? 'learning' : 'workspace');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const performLogout = async (all: boolean) => {
    if (profileDirty.current && !window.confirm('Leave without saving your profile changes?')) return;
    const version = sessionGeneration.current;
    setLoading(true); setLoadingMessage(all ? 'Signing out everywhere…' : 'Signing out…');
    try {
      const res = await apiFetch(all ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('We could not sign you out. Please try again.');
      clearSession();
    } catch (err) {
      if (version !== sessionGeneration.current) return;
      setSessionError(err instanceof Error ? err.message : 'We could not sign you out. Please try again.');
      setLoading(false);
    }
  };
  const handleLogout = () => { void performLogout(false); };
  const handleRecoveryDone = async (signIn: boolean) => {
    if (activeView === 'forgot-password') {
      setAuthNotice('If the account is eligible, a reset message is ready in the local mail outbox.');
      setActiveView('auth');
    } else if (signIn) {
      clearSession(); setAuthNotice('Account updated. Please sign in again.');
    } else {
      setActiveView('profile');
      await loadBootstrap();
    }
  };

  // ─── API HANDLERS ───────────────────────────────────────────────────────
  const handleLoadProfile = async (): Promise<ProfileDocument> => {
    const res = await apiFetch('/api/profile');
    if (!res.ok) throw new Error(await responseError(res, 'Your profile could not be loaded.'));
    return res.json();
  };
  const handleSaveProfile = async (input: ProfileUpdate): Promise<ProfileDocument> => {
    const res = await apiFetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error(await responseError(res, 'Your changes could not be saved.'));
    const data: ProfileDocument = await res.json();
    setUsers((previous) => previous.map((user) => user._id === data.user._id ? data.user : user));
    setCourses((previous) => previous.map((course) => course.instructorId === data.user._id ? { ...course, instructorName: data.user.name, instructorRole: data.user.title } : course));
    return data;
  };
  const handleConfirmEnrollment = async (
    courseId: string
  ): Promise<string | null> => {
    if (!currentUser) {
      setActiveView('auth');
      return null;
    }
    const res = await apiFetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
      }),
    });
    if (res.ok) {
      await res.json();
      // Reload so the newly enrolled course arrives with its lesson video URLs
      // (they are withheld from users who are not enrolled).
      setCheckoutCourse(null);
      setSelectedPlayerCourseId(courseId);
      setActiveView('learning');
      await loadBootstrap(sessionGeneration.current, 'Opening your course…');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return null;
    }
    const body = await res.json().catch(() => null);
    return body?.error || 'Enrollment failed. Please try again.';
  };

  const handleToggleLessonProgress = async (
    enrollmentId: string,
    lessonId: string
  ) => {
    const res = await apiFetch(`/api/enrollments/${enrollmentId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Your progress could not be saved. Please retry.'));
    if (res.ok) {
      const updated: EnrollmentDocument = await res.json();
      setEnrollments((prev) =>
        prev.map((e) => (e._id === updated._id ? updated : e))
      );
    }
  };

  const handleAddNote = async (payload: {
    courseId: string;
    lessonId: string;
    lessonTitle: string;
    timestampFormatted: string;
    content: string;
  }) => {
    if (!currentUser) return;
    const res = await apiFetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        userId: currentUser._id,
      }),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Your note could not be saved. Please retry.'));
    if (res.ok) {
      const created: LessonNoteDocument = await res.json();
      setNotes((prev) => [created, ...prev]);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await responseError(res, 'Your note could not be deleted. Please retry.'));
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    }
  };

  const handleCreateCategory = async (name: string, description: string) => {
    const res = await apiFetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        createdByRole: currentUser?.role || 'instructor',
      }),
    });
    if (res.ok) {
      const created: CategoryDocument = await res.json();
      setCategories((prev) => [...prev, created]);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const res = await apiFetch(`/api/categories/${categoryId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c._id !== categoryId));
    }
  };

  const handleCreateCourse = async (payload: Partial<CourseDocument>) => {
    const res = await apiFetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await responseError(res, 'The course could not be saved.'));
    if (res.ok) {
      const data: { course: CourseDocument; categories: CategoryDocument[] } =
        await res.json();
      setCourses((prev) => [data.course, ...prev]);
      if (data.categories) {
        setCategories(data.categories);
      }
    }
  };

  const handleUpdateCourse = async (
    courseId: string,
    payload: Partial<CourseDocument>
  ) => {
    const res = await apiFetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await responseError(res, 'The course could not be saved.'));
    if (res.ok) {
      const updated: CourseDocument = await res.json();
      setCourses((prev) =>
        prev.map((c) => (c._id === updated._id ? updated : c))
      );
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    const res = await apiFetch(`/api/courses/${courseId}`, { method: 'DELETE' });
    if (res.ok) {
      setCourses((prev) => prev.filter((c) => c._id !== courseId));
    } else {
      const body = await res.json().catch(() => null);
      window.alert(body?.error || 'Could not delete this course.');
    }
  };

  const handleUpdateUser = async (
    userId: string,
    payload: { role?: UserRole; status?: 'active' | 'suspended' }
  ) => {
    const res = await apiFetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated: UserDocument = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u._id === updated._id ? updated : u))
      );
    }
  };

  const handleSubmitInquiry = async (payload: {
    name: string;
    email: string;
    topic: string;
    message: string;
  }) => {
    const res = await apiFetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created: InquiryDocument = await res.json();
      setInquiries((prev) => [created, ...prev]);
    }
  };

  const handleToggleInquiryStatus = async (inquiryId: string) => {
    const res = await apiFetch(`/api/inquiries/${inquiryId}`, {
      method: 'PATCH',
    });
    if (res.ok) {
      const updated: InquiryDocument = await res.json();
      setInquiries((prev) =>
        prev.map((i) => (i._id === updated._id ? updated : i))
      );
    }
  };

  if (loading) return <LoadingScreen message={loadingMessage} />;
  if (bootstrapError) return <LoadErrorScreen onRetry={() => void loadBootstrap()} onSignOut={currentUser ? handleLogout : undefined} />;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] relative">
      {/* 1. Floating Glass Pill Navbar (4 links + Logout / Login button) */}
      <FloatingNavbar
        activeView={activeView}
        setActiveView={setActiveView}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => {
          setActiveView('auth');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {sessionError && <p role="alert" className="mx-auto mt-28 max-w-2xl rounded-xl border border-[var(--red)] bg-[var(--surface)] p-4 text-sm">{sessionError}</p>}

      {/* 2. Main View Switch: Auth Page vs. Landing Page vs. Role Workspace */}
      {activeView === 'forgot-password' || activeView === 'reset-password' || activeView === 'verify-email' ? <AccountRecoveryPage key={activeView} mode={activeView} deliveryAvailable={emailDeliveryAvailable} onDone={handleRecoveryDone} /> : activeView === 'auth' || ((activeView === 'profile' || activeView === 'learning') && !currentUser) ? (
        <AuthPage
          showDemoAccounts={demoMode}
          notice={authNotice}
          onAuthSuccess={handleAuthSuccess}
          onBackToLanding={() => setActiveView('landing')}
        />
      ) : activeView === 'profile' && currentUser ? (
        <><ProfilePage currentUser={currentUser} onLoad={handleLoadProfile} onSave={handleSaveProfile} onDirtyChange={setProfileDirty} onBack={() => setActiveView('workspace')} onUploadAvatar={(file, progress, signal) => {
          if (!currentUser) return Promise.reject(new Error('Please sign in before uploading.'));
          return uploadImage(file, progress, signal, '/api/profile/avatar');
        }} /><AccountSecurity user={currentUser} deliveryAvailable={emailDeliveryAvailable} onSignedOut={() => { clearSession(); setAuthNotice('Password changed. Sign in with your new password.'); }} onLogoutAll={() => performLogout(true)} onUpdated={(user) => setUsers(previous => previous.map(row => row._id === user._id ? user : row))} /></>
      ) : activeView === 'landing' || !currentUser ? (
        <LandingPage
          categories={categories}
          courses={courses}
          mentors={mentors}
          enrollments={enrollments}
          currentUser={currentUser}
          onSelectCourseForCheckout={(course) => {
            if (!currentUser) {
              setPendingCourseAfterAuth(course);
              setActiveView('auth');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setCheckoutCourse(course);
            }
          }}
          onOpenCourseInPlayer={(courseId) => {
            if (!currentUser) {
              setActiveView('auth');
              return;
            }
            setSelectedPlayerCourseId(courseId);
            setActiveView('learning');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onCreateCategory={handleCreateCategory}
          onSubmitInquiry={handleSubmitInquiry}
          onStartLearningClick={() => {
            if (!currentUser) {
              setActiveView('auth');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setActiveView('learning');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        />
      ) : (
        <div className="pt-28 pb-24 max-w-[1280px] mx-auto px-6 md:px-12 space-y-8">
          {/* Clean Workspace Session Bar (No Role Switcher) */}
          <div className="p-4 md:px-6 rounded-[22px] bg-[var(--surface)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveView('landing')}
                className="btn-secondary-outline rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>Landing Page</span>
              </button>
              <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                |
              </span>
              <span className="text-xs text-[var(--text-body)]">
                Signed in as{' '}
                <strong className="text-[var(--text-primary)]">
                  {currentUser.name}
                </strong>{' '}
                ·{' '}
                <span className="text-[var(--red)] font-mono-num uppercase font-semibold">
                  {currentUser.role}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary-outline rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[var(--red)]" />
              <span>Logout / Switch Account</span>
            </button>
          </div>

          {/* Learning is available to every role; management keeps its own permissions. */}
          {(activeView === 'learning' || currentUser.role === 'student') && (
            <StudentDashboard
              currentUser={currentUser}
              courses={courses}
              enrollments={enrollments}
              notes={notes}
              initialCourseId={selectedPlayerCourseId}
              onToggleLessonProgress={handleToggleLessonProgress}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onBrowseCatalog={() => {
                setActiveView('landing');
                setTimeout(() => {
                  document
                    .querySelector('#courses')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }, 60);
              }}
              onSelectCourseForCheckout={(course) => setCheckoutCourse(course)}
            />
          )}

          {activeView === 'workspace' && currentUser.role === 'instructor' && (
            <InstructorCMS
              currentUser={currentUser}
              courses={courses.filter((course) => course.instructorId === currentUser._id)}
              categories={categories}
              enrollments={enrollments}
              onCreateCourse={handleCreateCourse}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
              onUploadCover={(file, progress, signal) => {
                if (!currentUser) return Promise.reject(new Error('Please sign in before uploading.'));
                return uploadImage(file, progress, signal);
              }}
            />
          )}

          {activeView === 'workspace' && currentUser.role === 'admin' && (
            <AdminPortal
              currentUser={currentUser}
              users={users}
              courses={courses}
              categories={categories}
              enrollments={enrollments}
              inquiries={inquiries}
              onUpdateUser={handleUpdateUser}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
              onCreateCategory={handleCreateCategory}
              onDeleteCategory={handleDeleteCategory}
              onToggleInquiryStatus={handleToggleInquiryStatus}
              onApplicationReviewed={(user) => setUsers(previous => previous.map(row => row._id === user._id ? user : row))}
            />
          )}
        </div>
      )}

      {/* Simulated Instant Checkout Modal */}
      {currentUser && (
        <CheckoutModal
          course={checkoutCourse}
          currentUser={currentUser}
          paymentsMode={paymentsMode}
          onClose={() => setCheckoutCourse(null)}
          onConfirmEnrollment={handleConfirmEnrollment}
        />
      )}
    </div>
  );
}
