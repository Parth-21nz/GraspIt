/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { FloatingNavbar } from './components/FloatingNavbar';
import { LandingPage } from './components/LandingPage';
import { StudentDashboard } from './components/StudentDashboard';
import { InstructorCMS } from './components/InstructorCMS';
import { AdminPortal } from './components/AdminPortal';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthPage } from './components/AuthPage';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  LessonNoteDocument,
  MentorProfile,
  UserDocument,
  UserRole,
} from './types';

const AUTH_STORAGE_KEY = 'graspit_auth_user_id';
const TOKEN_STORAGE_KEY = 'graspit_auth_token';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
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

  // Authenticated User & Active View State (No Role Switcher)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    readStorage(AUTH_STORAGE_KEY)
  );
  const [token, setToken] = useState<string | null>(() =>
    readStorage(TOKEN_STORAGE_KEY)
  );
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const clearSession = () => {
    setToken(null);
    setCurrentUserId(null);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const apiFetch = (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers }).then((res) => {
      if (res.status === 401 && token) clearSession();
      return res;
    });
  };
  const [activeView, setActiveView] = useState<'landing' | 'workspace' | 'auth'>(
    'landing'
  );
  const [selectedPlayerCourseId, setSelectedPlayerCourseId] = useState<
    string | null
  >(null);
  const [checkoutCourse, setCheckoutCourse] = useState<CourseDocument | null>(
    null
  );
  const [pendingCourseAfterAuth, setPendingCourseAfterAuth] =
    useState<CourseDocument | null>(null);

  useEffect(() => {
    async function fetchBootstrap() {
      try {
        const res = await apiFetch('/api/bootstrap');
        if (!res.ok) throw new Error('Failed to load initial data');
        const data = await res.json();
        setDemoMode(Boolean(data.demoMode));
        if (token && !data.me) {
          // Stored session is expired or invalid
          clearSession();
        }
        setUsers(data.users || []);
        setCategories(data.categories || []);
        setCourses(data.courses || []);
        setEnrollments(data.enrollments || []);
        setNotes(data.notes || []);
        setInquiries(data.inquiries || []);
        setMentors(data.mentors || []);
      } catch (err) {
        console.error('Error loading GraspIt bootstrap data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const currentUser: UserDocument | null = currentUserId
    ? users.find((u) => u._id === currentUserId) || null
    : null;

  const handleAuthSuccess = (
    authenticatedUser: UserDocument,
    authToken: string
  ) => {
    setToken(authToken);
    setUsers((prev) => {
      const exists = prev.some((u) => u._id === authenticatedUser._id);
      return exists
        ? prev.map((u) =>
            u._id === authenticatedUser._id ? authenticatedUser : u
          )
        : [...prev, authenticatedUser];
    });
    setCurrentUserId(authenticatedUser._id);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, authenticatedUser._id);
      localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
    } catch {
      // ignore storage errors
    }

    if (pendingCourseAfterAuth) {
      setCheckoutCourse(pendingCourseAfterAuth);
      setPendingCourseAfterAuth(null);
      setActiveView('landing');
    } else {
      setActiveView('workspace');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogout = () => {
    clearSession();
    setCheckoutCourse(null);
    setActiveView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── API HANDLERS ───────────────────────────────────────────────────────
  const handleConfirmEnrollment = async (
    courseId: string,
    amountPaid: number
  ) => {
    if (!currentUser) {
      setActiveView('auth');
      return;
    }
    const res = await apiFetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser._id,
        courseId,
        amountPaid,
      }),
    });
    if (res.ok) {
      const enrollment: EnrollmentDocument = await res.json();
      setEnrollments((prev) => {
        const exists = prev.some((e) => e._id === enrollment._id);
        return exists ? prev : [enrollment, ...prev];
      });
      setCourses((prev) =>
        prev.map((c) =>
          c._id === courseId ? { ...c, studentsCount: c.studentsCount + 1 } : c
        )
      );
      setCheckoutCourse(null);
      setSelectedPlayerCourseId(courseId);
      setActiveView('workspace');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    if (res.ok) {
      const created: LessonNoteDocument = await res.json();
      setNotes((prev) => [created, ...prev]);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <div className="p-8 rounded-[24px] bg-[var(--surface)] border border-[var(--border)] text-center space-y-3 max-w-sm w-full">
          <div className="font-display text-2xl font-bold tracking-tight">
            GRASP<span className="text-[var(--red)]">IT</span>
          </div>
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            Initializing Curriculum & Workspaces...
          </p>
        </div>
      </div>
    );
  }

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

      {/* 2. Main View Switch: Auth Page vs. Landing Page vs. Role Workspace */}
      {activeView === 'auth' ? (
        <AuthPage
          showDemoAccounts={demoMode}
          onAuthSuccess={handleAuthSuccess}
          onBackToLanding={() => setActiveView('landing')}
        />
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
            setActiveView('workspace');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onCreateCategory={handleCreateCategory}
          onSubmitInquiry={handleSubmitInquiry}
          onStartLearningClick={() => {
            if (!currentUser) {
              setActiveView('auth');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setActiveView('workspace');
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

          {/* Authenticated User's Role Workspace */}
          {currentUser.role === 'student' && (
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

          {currentUser.role === 'instructor' && (
            <InstructorCMS
              currentUser={currentUser}
              courses={courses}
              categories={categories}
              enrollments={enrollments}
              onCreateCourse={handleCreateCourse}
              onUpdateCourse={handleUpdateCourse}
              onDeleteCourse={handleDeleteCourse}
              onCreateCategory={handleCreateCategory}
            />
          )}

          {currentUser.role === 'admin' && (
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
            />
          )}
        </div>
      )}

      {/* Simulated Instant Checkout Modal */}
      {currentUser && (
        <CheckoutModal
          course={checkoutCourse}
          currentUser={currentUser}
          onClose={() => setCheckoutCourse(null)}
          onConfirmEnrollment={handleConfirmEnrollment}
        />
      )}
    </div>
  );
}
