import React, { useState } from 'react';
import {
  Users,
  Layers,
  BookOpen,
  Trash2,
  CheckCircle2,
  Star,
  Mail,
  Plus,
  Clock,
  Eye,
  X,
  Video,
} from 'lucide-react';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  UserDocument,
  UserRole,
} from '../types';

interface AdminPortalProps {
  currentUser: UserDocument;
  users: UserDocument[];
  courses: CourseDocument[];
  categories: CategoryDocument[];
  enrollments: EnrollmentDocument[];
  inquiries: InquiryDocument[];
  onUpdateUser: (
    userId: string,
    payload: { role?: UserRole; status?: 'active' | 'suspended' }
  ) => Promise<void>;
  onUpdateCourse: (
    courseId: string,
    payload: Partial<CourseDocument>
  ) => Promise<void>;
  onDeleteCourse: (courseId: string) => Promise<void>;
  onCreateCategory: (name: string, description: string) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onToggleInquiryStatus: (inquiryId: string) => Promise<void>;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  users,
  courses,
  categories,
  enrollments,
  inquiries,
  onUpdateUser,
  onUpdateCourse,
  onDeleteCourse,
  onCreateCategory,
  onDeleteCategory,
  onToggleInquiryStatus,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [inspectingCourse, setInspectingCourse] =
    useState<CourseDocument | null>(null);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onCreateCategory(newCatName.trim(), newCatDesc.trim());
    setNewCatName('');
    setNewCatDesc('');
  };

  const pendingCourses = courses.filter((c) => c.status === 'pending');
  const totalPlatformBookings = enrollments.reduce(
    (acc, e) => acc + e.amountPaid,
    0
  );

  return (
    <div className="space-y-10">
      {/* Top Admin Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[var(--border)] pb-8">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold block mb-2">
            03 · Platform Governance & Moderation
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Admin Control Center
          </h1>
          <p className="text-sm text-[var(--text-body)] mt-1">
            Approve instructor course submissions, govern subject taxonomy, and
            moderate user roles.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Pending Approval
            </div>
            <div className="font-display text-2xl font-bold text-[var(--red)] tabular-nums mt-1">
              {pendingCourses.length}
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Catalog Tracks
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {courses.length}
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Categories
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {categories.length}
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Sample Booking Value
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              ₹{totalPlatformBookings.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* PRIORITY QUEUE: PENDING COURSE APPROVALS */}
      <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--red)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="icon-circle-crimson">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Pending Instructor Course Submissions ({pendingCourses.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                New courses submitted from the Instructor CMS require your approval
                before appearing in the public catalog.
              </p>
            </div>
          </div>
        </div>

        {pendingCourses.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            All instructor course submissions have been reviewed. Create a new
            course in the Instructor CMS to test the approval queue.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {pendingCourses.map((course) => {
              const lessonCount = course.modules.reduce(
                (acc, m) => acc + m.lessons.length,
                0
              );
              return (
                <div
                  key={course._id}
                  className="p-6 bg-[var(--surface-2)] flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4 min-w-0">
                    {course.thumbnail && (
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-28 h-18 rounded-xl object-cover border border-[var(--border)] shrink-0"
                      />
                    )}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2.5 py-0.5 rounded-full border border-[var(--red)] text-[var(--red)] font-mono-num text-[11px] font-semibold uppercase tracking-wider">
                          Awaiting Approval
                        </span>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="uppercase tracking-wider text-[var(--text-primary)] font-semibold">
                          {course.category}
                        </span>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="text-[var(--text-body)]">
                          {course.level}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)] break-words">
                        {course.title}
                      </h3>
                      <p className="text-xs text-[var(--text-body)] max-w-2xl break-words">
                        {course.subtitle}
                      </p>
                      <div className="text-xs text-[var(--text-muted)] pt-1">
                        Submitted by {course.instructorName} ·{' '}
                        {course.modules.length} Modules ({lessonCount} Video
                        Lectures) · ₹{course.price.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setInspectingCourse(course)}
                      className="btn-secondary-outline rounded-lg px-3.5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--red)]" />
                      <span>Inspect Syllabus & URLs</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCourse(course._id, { status: 'draft' })
                      }
                      className="btn-secondary-outline rounded-lg px-3.5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                    >
                      Return to Draft
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCourse(course._id, { status: 'published' })
                      }
                      className="btn-crimson rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--red)]" />
                      <span>Approve & Publish</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 1: COURSE CATALOG GOVERNANCE & FEATURED CURATION */}
      <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center gap-3">
          <span className="icon-circle-crimson">
            <BookOpen className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              All Platform Courses & Publication Status
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Control published visibility, inspect lecture URLs, and curate
              featured tracks.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3.5 px-6">Track Title</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Instructor</th>
                <th className="py-3.5 px-4">Publication Status</th>
                <th className="py-3.5 px-6 text-right">Governance Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {courses.map((course) => (
                <tr
                  key={course._id}
                  className="hover:bg-[var(--surface-2)] transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="font-bold text-[var(--text-primary)]">
                      {course.title}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono-num">
                      ₹{course.price.toLocaleString('en-IN')} ·{' '}
                      {course.studentsCount.toLocaleString()} learners
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs uppercase tracking-wider text-[var(--red)] font-semibold whitespace-nowrap">
                    {course.category}
                  </td>
                  <td className="py-4 px-4 text-xs text-[var(--text-body)] whitespace-nowrap">
                    {course.instructorName}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap">
                    <span
                      className={`text-xs font-mono-num uppercase font-semibold ${
                        course.status === 'pending'
                          ? 'text-[var(--red)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {course.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectingCourse(course)}
                        className="btn-secondary-outline rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center whitespace-nowrap cursor-pointer"
                      >
                        Inspect
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCourse(course._id, {
                            featured: !course.featured,
                          })
                        }
                        className={`rounded-lg px-3 py-1.5 min-w-[108px] text-xs font-semibold uppercase tracking-wider border inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                          course.featured
                            ? 'border-[var(--red)] text-[var(--text-primary)] bg-[var(--surface-2)]'
                            : 'btn-secondary-outline'
                        }`}
                      >
                        <Star
                          className={`w-3.5 h-3.5 text-[var(--red)] shrink-0 ${
                            course.featured ? 'fill-[var(--red)]' : ''
                          }`}
                        />
                        <span>{course.featured ? 'Featured' : 'Feature'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCourse(course._id, {
                            status:
                              course.status === 'published'
                                ? 'draft'
                                : 'published',
                          })
                        }
                        className="btn-crimson rounded-lg px-3.5 py-1.5 min-w-[104px] text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center whitespace-nowrap cursor-pointer"
                      >
                        {course.status === 'published'
                          ? 'Unpublish'
                          : 'Approve & Publish'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCourse(course._id)}
                        aria-label="Delete course"
                        className="btn-secondary-outline rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: USER ROLE & ACCOUNT MODERATION */}
      <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="icon-circle-crimson">
              <Users className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                User Role & Access Control Directory
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Reassign Student, Instructor, or Admin privileges and manage
                account standing.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3.5 px-6">User Identity</th>
                <th className="py-3.5 px-4">Title / Bio</th>
                <th className="py-3.5 px-4">Assigned Role</th>
                <th className="py-3.5 px-4">Standing</th>
                <th className="py-3.5 px-6 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {users.map((u) => (
                <tr
                  key={u._id}
                  className="hover:bg-[var(--surface-2)] transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="font-bold text-[var(--text-primary)]">
                      {u.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono-num">
                      {u.email}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-xs font-semibold text-[var(--text-body)]">
                      {u.title}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        onUpdateUser(u._id, {
                          role: e.target.value as UserRole,
                        })
                      }
                      aria-label={`Change role for ${u.name}`}
                      className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs uppercase tracking-wider font-semibold text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                    >
                      <option value="student">Student</option>
                      <option value="instructor">Instructor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`text-xs uppercase tracking-wider font-mono-num font-semibold ${
                        u.status === 'active'
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--red)]'
                      }`}
                    >
                      {u.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateUser(u._id, {
                          status:
                            u.status === 'active' ? 'suspended' : 'active',
                        })
                      }
                      className="btn-secondary-outline rounded-lg px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                    >
                      {u.status === 'active' ? 'Suspend' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: EXTENSIBLE CATEGORIES & INQUIRIES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Global Category Taxonomy Governance */}
        <div className="lg:col-span-6 rounded-[26px] bg-[var(--surface)] border border-[var(--border)] p-6 space-y-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
            <span className="icon-circle-crimson">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                Global Category Taxonomy
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Add or prune subject categories displayed across GraspIt.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleCreateCategory}
            className="flex flex-wrap gap-3"
          >
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category name..."
              className="flex-1 min-w-[150px] w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
            />
            <input
              type="text"
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              placeholder="Short description..."
              className="flex-1 min-w-[150px] w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
            />
            <button
              type="submit"
              className="w-full sm:w-auto shrink-0 btn-crimson rounded-lg px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--red)]" />
              <span>Add</span>
            </button>
          </form>

          <div className="space-y-2.5">
            {categories.map((cat) => (
              <div
                key={cat._id}
                className="p-3.5 rounded-[14px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--text-primary)] break-words">
                    {cat.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] break-words">
                    {cat.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteCategory(cat._id)}
                  aria-label={`Remove ${cat.name} category`}
                  className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors p-1 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Admissions & Enterprise Cohort Inquiries */}
        <div className="lg:col-span-6 rounded-[26px] bg-[var(--surface)] border border-[var(--border)] p-6 space-y-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
            <span className="icon-circle-crimson">
              <Mail className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                Admissions & Cohort Inquiries ({inquiries.length})
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Submitted from the public #contact form.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {inquiries.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-4">
                No inquiries submitted yet.
              </p>
            ) : (
              inquiries.map((inq) => (
                <div
                  key={inq._id}
                  className="p-4 rounded-[16px] bg-[var(--surface-2)] border border-[var(--border)] space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-[var(--text-primary)] break-words">
                        {inq.name}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] ml-2 font-mono-num break-all">
                        {inq.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleInquiryStatus(inq._id)}
                      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider border shrink-0 whitespace-nowrap cursor-pointer ${
                        inq.status === 'reviewed'
                          ? 'border-[var(--border)] text-[var(--text-muted)]'
                          : 'border-[var(--red)] text-[var(--red)] font-semibold'
                      }`}
                    >
                      {inq.status === 'reviewed' ? 'Reviewed' : 'Mark Reviewed'}
                    </button>
                  </div>
                  <div className="text-xs uppercase tracking-wider text-[var(--red)] font-semibold break-words">
                    {inq.topic}
                  </div>
                  <p className="text-xs text-[var(--text-body)] leading-relaxed break-words">
                    {inq.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Admin Syllabus & Lecture Video URL Inspection Modal */}
      {inspectingCourse && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0707]/85 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-[28px] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--red)] font-semibold">
                  Admin Curriculum Audit · {inspectingCourse.status.toUpperCase()}
                </span>
                <h3 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  {inspectingCourse.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingCourse(null)}
                className="icon-circle-crimson cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {inspectingCourse.thumbnail && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Uploaded Cover Image
                  </div>
                  <img
                    src={inspectingCourse.thumbnail}
                    alt={inspectingCourse.title}
                    className="w-full h-44 object-cover rounded-xl border border-[var(--border)]"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Submitted Modules & Lecture Video URLs
                </div>
                {inspectingCourse.modules.map((mod) => (
                  <div
                    key={mod._id}
                    className="p-4 rounded-[16px] bg-[var(--surface-2)] border border-[var(--border)] space-y-2.5"
                  >
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {mod.title}
                    </div>
                    <div className="space-y-2">
                      {mod.lessons.map((les) => (
                        <div
                          key={les._id}
                          className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                            <span className="inline-flex items-center gap-1.5">
                              <Video className="w-3.5 h-3.5 text-[var(--red)]" />
                              {les.title}
                            </span>
                            <span className="font-mono-num text-[var(--text-muted)]">
                              {les.durationMinutes} min
                            </span>
                          </div>
                          <div className="font-mono-num text-[11px] text-[var(--text-muted)] break-all">
                            URL: {les.videoUrl || 'No URL provided'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInspectingCourse(null)}
                className="btn-secondary-outline rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
              {inspectingCourse.status !== 'published' && (
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateCourse(inspectingCourse._id, {
                      status: 'published',
                    });
                    setInspectingCourse(null);
                  }}
                  className="btn-crimson rounded-full px-6 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Approve & Publish Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
