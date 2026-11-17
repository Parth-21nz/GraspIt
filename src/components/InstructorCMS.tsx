import React, { useEffect, useMemo, useRef, useState } from 'react';
import { instructorAnalytics } from '../lib/instructorAnalytics';
import {
  Plus,
  BookOpen,
  IndianRupee,
  Users,
  Layers,
  Trash2,
  Edit3,
  CheckCircle2,
  FolderPlus,
  Video,
  Upload,
  Image as ImageIcon,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';
import type {
  CategoryDocument,
  CourseDocument,
  CourseModule,
  EnrollmentDocument,
  UserDocument,
  UploadAssetDocument,
} from '../types';

interface InstructorCMSProps {
  currentUser: UserDocument;
  courses: CourseDocument[];
  categories: CategoryDocument[];
  enrollments: EnrollmentDocument[];
  onUploadCover: (file: File, progress: (percent: number) => void, signal: AbortSignal) => Promise<UploadAssetDocument>;
  onCreateCourse: (payload: Partial<CourseDocument>) => Promise<void>;
  onUpdateCourse: (
    courseId: string,
    payload: Partial<CourseDocument>
  ) => Promise<void>;
  onDeleteCourse: (courseId: string) => Promise<void>;
}

const createEmptyModule = (index: number): CourseModule => ({
  _id: `mod_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
  title: '',
  lessons: [
    {
      _id: `les_${Date.now()}_${index}_1_${Math.random().toString(36).slice(2, 6)}`,
      title: '',
      durationMinutes: 0,
      videoUrl: '',
      summary: '',
      keyTakeaways: [],
    },
  ],
});

export const InstructorCMS: React.FC<InstructorCMSProps> = ({
  currentUser,
  courses,
  categories,
  enrollments,
  onCreateCourse,
  onUploadCover,
  onUpdateCourse,
  onDeleteCourse,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'builder' | 'analytics'>(
    'catalog'
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Course Builder Form State — Strictly un-prefilled for new courses
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<'Foundation' | 'Intermediate' | 'Principal'>(
    'Intermediate'
  );
  const [price, setPrice] = useState<string>('');
  const [durationHours, setDurationHours] = useState<string>('');
  const [thumbnail, setThumbnail] = useState<string>('');
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);
  const [thumbnailFileName, setThumbnailFileName] = useState<string>('');
  const [skillsInput, setSkillsInput] = useState('');
  const [outcomesInput, setOutcomesInput] = useState('');
  const [modules, setModules] = useState<CourseModule[]>(() => [
    createEmptyModule(1),
  ]);
  const [savingCourse, setSavingCourse] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);


  // Revenue & Analytics Calculations
  const publishedCoursesCount = courses.filter(
    (c) => c.status === 'published'
  ).length;
  const pendingCoursesCount = courses.filter(
    (c) => c.status === 'pending'
  ).length;
  const analytics = useMemo(() => instructorAnalytics(courses, enrollments), [courses, enrollments]);
  const { sampleBookingValue } = analytics;

  const resetForm = () => {
    uploadAbort.current?.abort();
    setUploading(false); setUploadError(null); setRetryFile(null); setUploadProgress(0);
    setThumbnailAssetId(null);
    setEditingCourseId(null);
    setTitle('');
    setSubtitle('');
    setCategory('');
    setLevel('Intermediate');
    setPrice('');
    setDurationHours('');
    setThumbnail('');
    setThumbnailFileName('');
    setSkillsInput('');
    setOutcomesInput('');
    setModules([createEmptyModule(1)]);
    setFormError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startEditingCourse = (course: CourseDocument) => {
    uploadAbort.current?.abort();
    setUploading(false); setUploadError(null); setRetryFile(null); setUploadProgress(0);
    setThumbnailAssetId(course.thumbnailAssetId || null);
    setEditingCourseId(course._id);
    setTitle(course.title);
    setSubtitle(course.subtitle);
    setCategory(course.category);
    setLevel(course.level);
    setPrice(String(course.price));
    setDurationHours(String(course.durationHours));
    setThumbnail(course.thumbnail);
    setThumbnailFileName(
      course.thumbnail.startsWith('data:image')
        ? 'Uploaded cover image'
        : course.thumbnail.split('/').pop() || 'Existing cover image'
    );
    setSkillsInput(course.skills.join(', '));
    setOutcomesInput(course.outcomes.join('\n'));
    setModules(
      course.modules.length > 0
        ? structuredClone(course.modules)
        : [createEmptyModule(1)]
    );
    setFormError(null);
    setSubmissionNotice(null);
    setActiveTab('builder');
  };

  const uploadImage = async (file: File) => {
    uploadAbort.current?.abort();
    setUploading(false);
    setRetryFile(file);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError('Choose a JPEG, PNG or WebP image no larger than 5 MB.');
      return;
    }
    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploading(true); setUploadProgress(0); setUploadError(null);
    try {
      const asset = await onUploadCover(file, setUploadProgress, controller.signal);
      if (controller.signal.aborted) return;
      setThumbnail(asset.url); setThumbnailAssetId(asset._id);
      setThumbnailFileName(file.name); setRetryFile(null);
    } catch (err) {
      if (!controller.signal.aborted) setUploadError(err instanceof Error ? err.message : 'Image upload failed. Please retry.');
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  };
  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadImage(file);
  };

  const handleAddModule = () => {
    setModules((prev) => [...prev, createEmptyModule(prev.length + 1)]);
  };

  const handleRemoveModule = (moduleIndex: number) => {
    if (modules.length <= 1) return;
    setModules((prev) => prev.filter((_, idx) => idx !== moduleIndex));
  };

  const handleAddLesson = (moduleIndex: number) => {
    setModules((prev) => {
      const copy = structuredClone(prev);
      copy[moduleIndex].lessons.push({
        _id: `les_${Date.now()}_${moduleIndex}_${copy[moduleIndex].lessons.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        title: '',
        durationMinutes: 0,
        videoUrl: '',
        summary: '',
        keyTakeaways: [],
      });
      return copy;
    });
  };

  const handleRemoveLesson = (moduleIndex: number, lessonIndex: number) => {
    setModules((prev) => {
      const copy = structuredClone(prev);
      if (copy[moduleIndex].lessons.length <= 1) return prev;
      copy[moduleIndex].lessons.splice(lessonIndex, 1);
      return copy;
    });
  };

  const handleSaveCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const finalCategory = category.trim();

    if (!title.trim()) {
      setFormError('Please enter a course title.');
      return;
    }
    if (!finalCategory) {
      setFormError('Please select an existing category or enter a new category name.');
      return;
    }
    if (!thumbnail) {
      setFormError('Please upload a course cover image before submitting.');
      return;
    }

    // Validate modules and lessons
    for (let m = 0; m < modules.length; m++) {
      const mod = modules[m];
      if (!mod.title.trim()) {
        setFormError(`Please enter a title for Module #${m + 1}.`);
        return;
      }
      for (let l = 0; l < mod.lessons.length; l++) {
        const les = mod.lessons[l];
        if (!les.title.trim()) {
          setFormError(
            `Please enter a lesson title for Module #${m + 1}, Lesson #${l + 1}.`
          );
          return;
        }
        if (!les.videoUrl.trim()) {
          setFormError(
            `Please provide a Lecture Video URL for "${les.title || `Lesson #${l + 1}`}" in Module #${m + 1}.`
          );
          return;
        }
      }
    }

    if (uploading || uploadError) { setFormError('Finish uploading the cover image before saving.'); return; }
    setSavingCourse(true);

    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const outcomes = outcomesInput
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);

    const sanitizedModules: CourseModule[] = modules.map((mod) => ({
      _id: mod._id,
      title: mod.title.trim(),
      lessons: mod.lessons.map((les) => ({
        _id: les._id,
        title: les.title.trim(),
        durationMinutes: Math.max(1, Number(les.durationMinutes) || 1),
        videoUrl: les.videoUrl.trim(),
        summary: les.summary.trim(),
        keyTakeaways: les.keyTakeaways.map((k) => k.trim()).filter(Boolean),
      })),
    }));

    try {
      if (editingCourseId) {
        await onUpdateCourse(editingCourseId, {
          title: title.trim(),
          subtitle: subtitle.trim(),
          category: finalCategory,
          level,
          price: Math.max(0, Number(price) || 0),
          durationHours: Math.max(1, Number(durationHours) || 1),
          thumbnail,
          thumbnailAssetId,
          skills,
          outcomes,
          modules: sanitizedModules,
        });
        setSubmissionNotice(`Updated "${title.trim()}" successfully.`);
      } else {
        await onCreateCourse({
          title: title.trim(),
          subtitle: subtitle.trim(),
          category: finalCategory,
          level,
          price: Math.max(0, Number(price) || 0),
          durationHours: Math.max(1, Number(durationHours) || 1),
          thumbnail,
          thumbnailAssetId,
          instructorId: currentUser._id,
          instructorName: currentUser.name,
          instructorRole: currentUser.title,
          instructorSignature: currentUser.name,
          status: 'pending',
          featured: false,
          skills,
          outcomes,
          modules: sanitizedModules,
        });
        setSubmissionNotice(
          `"${title.trim()}" has been submitted and is now PENDING ADMIN APPROVAL. Switch to the Admin Portal to approve and publish it to the catalog.`
        );
      }
      resetForm();
      setActiveTab('catalog');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The course could not be saved. Please retry.');
    } finally {
      setSavingCourse(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Top CMS Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[var(--border)] pb-8">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold block mb-2">
            02 · Instructor Content Management System
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Curriculum Studio & Demo Analytics
          </h1>
          <p className="text-sm text-[var(--text-body)] mt-1">
            Faculty Member: {currentUser.name} · {currentUser.title}
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                : 'btn-secondary-outline'
            }`}
          >
            Course Catalog ({courses.length})
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setSubmissionNotice(null);
              setActiveTab('builder');
            }}
            className={`rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider border transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'builder'
                ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                : 'btn-crimson'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingCourseId ? 'Edit Course' : 'Create New Course'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                : 'btn-secondary-outline'
            }`}
          >
            Demo Analytics
          </button>
        </div>
      </div>

      {/* Submission Notice Banner */}
      {submissionNotice && (
        <div className="p-5 rounded-[20px] bg-[var(--surface-2)] border border-[var(--red)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
            <CheckCircle2 className="w-5 h-5 text-[var(--red)] shrink-0" />
            <span>{submissionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmissionNotice(null)}
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-6 rounded-[22px] bg-[var(--surface)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Sample Booking Value
            </span>
            <span className="icon-circle-crimson">
              <IndianRupee className="w-4 h-4" />
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-[var(--text-primary)] tabular-nums">
            ₹{sampleBookingValue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-[var(--red)] mt-1 font-mono-num">
            Sample and mock enrollments; no real charges
          </div>
        </div>

        <div className="p-6 rounded-[22px] bg-[var(--surface)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Unique Learners
            </span>
            <span className="icon-circle-crimson">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-[var(--text-primary)] tabular-nums">
            {analytics.uniqueStudents.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {analytics.enrollmentCount.toLocaleString()} course enrollments · {publishedCoursesCount} published tracks
          </div>
        </div>

        <div className="p-6 rounded-[22px] bg-[var(--surface)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Pending Admin Review
            </span>
            <span className="icon-circle-crimson">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-[var(--red)] tabular-nums">
            {pendingCoursesCount}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Requires Admin approval to publish
          </div>
        </div>

        <div className="p-6 rounded-[22px] bg-[var(--surface)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Active Subject Categories
            </span>
            <span className="icon-circle-crimson">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-[var(--text-primary)] tabular-nums">
            {categories.length}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Extensible taxonomy enabled
          </div>
        </div>
      </div>

      {/* TAB 1: COURSE CATALOG MANAGEMENT */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Managed Course Curriculum
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  New courses are submitted as Pending Approval and require Admin
                  sign-off before appearing in the public catalog.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setSubmissionNotice(null);
                  setActiveTab('builder');
                }}
                className="btn-crimson rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>Author New Track</span>
              </button>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {courses.map((course) => {
                const lessonCount = course.modules.reduce(
                  (acc, m) => acc + m.lessons.length,
                  0
                );
                return (
                  <div
                    key={course._id}
                    className="p-6 hover:bg-[var(--surface-2)] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      {course.thumbnail ? (
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          referrerPolicy="no-referrer"
                          className="w-24 h-16 rounded-xl object-cover border border-[var(--border)] shrink-0 hidden sm:block bg-[var(--bg)]"
                        />
                      ) : (
                        <div className="w-24 h-16 rounded-xl border border-[var(--border)] bg-[var(--bg)] shrink-0 hidden sm:flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="uppercase tracking-wider text-[var(--red)] font-semibold">
                            {course.category}
                          </span>
                          <span className="text-[var(--text-muted)]">·</span>
                          <span className="text-[var(--text-body)]">{course.level}</span>
                          <span className="text-[var(--text-muted)]">·</span>
                          {course.status === 'pending' ? (
                            <span className="px-2.5 py-0.5 rounded-full border border-[var(--red)] text-[var(--red)] font-mono-num text-[11px] font-semibold uppercase tracking-wider">
                              Pending Admin Approval
                            </span>
                          ) : course.status === 'published' ? (
                            <span className="px-2.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-primary)] font-mono-num text-[11px] uppercase tracking-wider">
                              Published (Approved)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] font-mono-num text-[11px] uppercase tracking-wider">
                              Draft
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] break-words">
                          {course.title}
                        </h3>
                        <div className="text-xs text-[var(--text-muted)] break-words">
                          {course.modules.length} Modules · {lessonCount} Video Lessons ·{' '}
                          {course.durationHours}h · Instructor: {course.instructorName}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="text-left sm:text-right mr-3">
                        <div className="font-mono-num text-lg font-bold text-[var(--text-primary)]">
                          ₹{course.price.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] font-mono-num">
                          {analytics.byCourse.get(course._id)!.learners.toLocaleString()} learners
                        </div>
                      </div>

                      {course.status === 'published' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCourse(course._id, {
                              status: 'draft',
                            })
                          }
                          className="btn-secondary-outline rounded-lg px-3.5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          Move to Draft
                        </button>
                      )}

                      {course.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCourse(course._id, {
                              status: 'pending',
                            })
                          }
                          className="btn-secondary-outline rounded-lg px-3.5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          Submit for Approval
                        </button>
                      )}

                      {course.status === 'pending' && (
                        <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] px-3 py-2 border border-[var(--border)] rounded-lg">
                          Awaiting Admin
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => startEditingCourse(course)}
                        className="btn-crimson rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[var(--red)]" />
                        <span>Edit Syllabus</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCourse(course._id)}
                        aria-label="Delete course"
                        className="btn-secondary-outline rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-MODULE CURRICULUM BUILDER (NO PREFILLED FIELDS) */}
      {activeTab === 'builder' && (
        <form
          onSubmit={handleSaveCourseSubmit}
          noValidate
          className="rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-6 md:p-9 space-y-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
            <div>
              <span className="text-xs uppercase tracking-wider text-[var(--red)] font-semibold">
                {editingCourseId
                  ? 'Updating Existing Track'
                  : 'New Track Authoring (Requires Admin Approval)'}
              </span>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Course & Syllabus Builder
              </h2>
            </div>
            {editingCourseId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary-outline rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Switch to New Blank Course
              </button>
            )}
          </div>

          {formError && (
            <div className="p-4 rounded-[16px] bg-[var(--surface-2)] border border-[var(--red)] flex items-center gap-3 text-xs font-semibold text-[var(--text-primary)]">
              <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Core Course Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Course Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter course title..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Difficulty Tier
              </label>
              <select
                value={level}
                onChange={(e) =>
                  setLevel(
                    e.target.value as 'Foundation' | 'Intermediate' | 'Principal'
                  )
                }
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
              >
                <option value="Foundation">Foundation</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Principal">Principal</option>
              </select>
            </div>

            <div className="md:col-span-12">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Editorial Subtitle
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Enter a concise 1-2 sentence value proposition..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div className="md:col-span-6 lg:col-span-4">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Select Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
              >
                <option value="">Select a category...</option>
                {categories.map((c) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6 lg:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Price (INR ₹) *
              </label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 499"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div className="md:col-span-6 lg:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Duration (Hours) *
              </label>
              <input
                type="number"
                min={1}
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="e.g. 14"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            {/* Course Cover Image Upload Control (Replaces Preset Options) */}
            <div className="md:col-span-6">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Course Cover Image Upload *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading || savingCourse}
                onChange={handleCoverImageUpload}
                className="hidden"
                id="course-cover-upload-input"
              />

              {uploading && <div role="status" className="mb-3 text-sm text-[var(--text-body)]">
                <progress aria-label="Cover upload progress" max={100} value={uploadProgress} className="w-full" />
                {uploadProgress < 99 ? `Uploading image: ${uploadProgress}%` : 'Processing image…'}
              </div>}
              {uploadError && <div role="alert" className="mb-3 text-sm text-[var(--red)]">
                <p>{uploadError}</p>
                {retryFile && <button type="button" disabled={uploading} className="underline mt-1" onClick={() => void uploadImage(retryFile)}>Retry upload</button>}
                <button type="button" className="underline ml-3" onClick={() => { setUploadError(null); setRetryFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Dismiss</button>
              </div>}
              {!thumbnail ? (
                <label
                  htmlFor="course-cover-upload-input"
                  className="w-full min-h-[116px] bg-[var(--bg)] border border-dashed border-[var(--border)] hover:border-[var(--red)] rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center"
                >
                  <span className="icon-circle-crimson">
                    <Upload className="w-4 h-4" />
                  </span>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Click to Upload Course Cover Image
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    JPEG, PNG or WebP up to 5 MB (16:9 or 4:3 recommended)
                  </div>
                </label>
              ) : (
                <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={thumbnail}
                      alt="Uploaded course cover preview"
                      className="w-24 h-16 rounded-lg object-cover border border-[var(--border)] shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {thumbnailFileName || 'Cover image uploaded'}
                      </div>
                      <label
                        htmlFor="course-cover-upload-input"
                        className="text-[11px] text-[var(--red)] hover:underline uppercase tracking-wider font-semibold cursor-pointer inline-block mt-1"
                      >
                        Replace Image
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      uploadAbort.current?.abort(); setUploading(false); setUploadError(null); setRetryFile(null); setThumbnailAssetId(null);
                      setThumbnail('');
                      setThumbnailFileName('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    aria-label="Remove uploaded cover image"
                    className="icon-circle-crimson cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="md:col-span-6 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Skill Badges (Comma Separated)
                </label>
                <input
                  type="text"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder="e.g. TypeScript, Distributed Systems, WebSockets"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Measurable Learning Outcomes (One per line)
                </label>
                <textarea
                  rows={2}
                  value={outcomesInput}
                  onChange={(e) => setOutcomesInput(e.target.value)}
                  placeholder="Enter key outcomes students will achieve..."
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Multi-Module & Lesson Curriculum Editor (No Prefilled Data) */}
          <div className="space-y-5 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  Syllabus Modules & Lecture Video URLs
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Add modules and provide direct video URLs (MP4/WebM, YouTube, or Vimeo)
                  for each lecture.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddModule}
                className="btn-secondary-outline rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>Add Module</span>
              </button>
            </div>

            <div className="space-y-6">
              {modules.map((mod, mIdx) => (
                <div
                  key={mod._id}
                  className="p-5 rounded-[20px] bg-[var(--surface-2)] border border-[var(--border)] space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                        Module #{mIdx + 1} Title *
                      </label>
                      <input
                        type="text"
                        value={mod.title}
                        placeholder={`Enter title for Module #${mIdx + 1}...`}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModules((prev) => {
                            const copy = structuredClone(prev);
                            copy[mIdx].title = val;
                            return copy;
                          });
                        }}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-normal focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 self-end">
                      <button
                        type="button"
                        onClick={() => handleAddLesson(mIdx)}
                        className="btn-crimson rounded-lg px-3.5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Video className="w-3.5 h-3.5 text-[var(--red)]" />
                        <span>+ Add Lesson</span>
                      </button>

                      {modules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveModule(mIdx)}
                          aria-label={`Remove Module ${mIdx + 1}`}
                          className="btn-secondary-outline rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pl-2 border-l border-[var(--border)]">
                    {mod.lessons.map((les, lIdx) => (
                      <div
                        key={les._id}
                        className="p-4 rounded-[14px] bg-[var(--bg)] border border-[var(--border)] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono-num uppercase tracking-wider text-[var(--red)] font-semibold">
                            Module {mIdx + 1} · Lesson {lIdx + 1}
                          </span>
                          {mod.lessons.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLesson(mIdx, lIdx)}
                              className="text-xs text-[var(--text-muted)] hover:text-[var(--red)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Lesson</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-5">
                            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              Lesson Title *
                            </label>
                            <input
                              type="text"
                              value={les.title}
                              placeholder="Enter lesson title..."
                              onChange={(e) => {
                                const val = e.target.value;
                                setModules((prev) => {
                                  const copy = structuredClone(prev);
                                  copy[mIdx].lessons[lIdx].title = val;
                                  return copy;
                                });
                              }}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                            />
                          </div>

                          <div className="md:col-span-5">
                            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              Lecture Video URL (MP4 / WebM / YouTube / Vimeo) *
                            </label>
                            <input
                              type="url"
                              value={les.videoUrl}
                              placeholder="https://..."
                              onChange={(e) => {
                                const val = e.target.value;
                                setModules((prev) => {
                                  const copy = structuredClone(prev);
                                  copy[mIdx].lessons[lIdx].videoUrl = val;
                                  return copy;
                                });
                              }}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              Duration (Min)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={les.durationMinutes || ''}
                              placeholder="e.g. 25"
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setModules((prev) => {
                                  const copy = structuredClone(prev);
                                  copy[mIdx].lessons[lIdx].durationMinutes = val;
                                  return copy;
                                });
                              }}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                            />
                          </div>

                          <div className="md:col-span-6">
                            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              Lesson Summary
                            </label>
                            <input
                              type="text"
                              value={les.summary}
                              placeholder="Enter brief summary of this lecture..."
                              onChange={(e) => {
                                const val = e.target.value;
                                setModules((prev) => {
                                  const copy = structuredClone(prev);
                                  copy[mIdx].lessons[lIdx].summary = val;
                                  return copy;
                                });
                              }}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                            />
                          </div>

                          <div className="md:col-span-6">
                            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              Key Takeaways (Comma Separated)
                            </label>
                            <input
                              type="text"
                              value={les.keyTakeaways.join(', ')}
                              placeholder="e.g. Zero-copy parsing, Backpressure control"
                              onChange={(e) => {
                                const val = e.target.value;
                                setModules((prev) => {
                                  const copy = structuredClone(prev);
                                  copy[mIdx].lessons[lIdx].keyTakeaways = val
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  return copy;
                                });
                              }}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className="btn-secondary-outline rounded-full px-6 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCourse || uploading || Boolean(uploadError)}
              className="btn-crimson rounded-full px-8 py-3 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-[var(--red)]" />
              <span>
                {savingCourse
                  ? 'Submitting...'
                  : editingCourseId
                  ? 'Save Curriculum Changes'
                  : 'Submit Course for Admin Approval'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: REVENUE ANALYTICS & EXTENSIBLE CATEGORIES */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left 7 Columns: Course Revenue Breakdown Table */}
          <div className="lg:col-span-7 rounded-[26px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                Sample Enrollment Ledger
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Sample and mock bookings for demonstration. No actual revenue is collected.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-3.5 px-6">Course Track</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Tuition</th>
                    <th className="py-3.5 px-4 text-right">Learners</th>
                    <th className="py-3.5 px-6 text-right">Sample Bookings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-sm">
                  {courses.map((c) => {
                    const courseAnalytics = analytics.byCourse.get(c._id)!;
                    return (
                      <tr
                        key={c._id}
                        className="hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <td className="py-4 px-6 font-semibold text-[var(--text-primary)]">
                          {c.title}
                        </td>
                        <td className="py-4 px-4 text-xs text-[var(--red)] uppercase font-semibold font-mono-num">
                          {c.status}
                        </td>
                        <td className="py-4 px-4 text-right font-mono-num text-[var(--text-body)] whitespace-nowrap">
                          ₹{c.price.toLocaleString('en-IN')}
                        </td>
                        <td className="py-4 px-4 text-right font-mono-num text-[var(--text-primary)] whitespace-nowrap">
                          {courseAnalytics.learners.toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-right font-mono-num font-bold text-[var(--text-primary)] whitespace-nowrap">
                          ₹{courseAnalytics.sampleBookingValue.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right 5 Columns: Extensible Subject Categories Manager */}
          <div className="lg:col-span-5 rounded-[26px] bg-[var(--surface)] border border-[var(--border)] p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <span className="icon-circle-crimson">
                <FolderPlus className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  Available Categories
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Shared subjects managed by administrators.
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--text-body)]">Select an existing category when authoring a course. Administrators maintain the shared catalog categories.</p>

            <div className="space-y-2.5 pt-2">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Active Categories ({categories.length})
              </div>
              {categories.map((cat) => (
                <div
                  key={cat._id}
                  className="p-3.5 rounded-[14px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {cat.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] line-clamp-1">
                      {cat.description}
                    </div>
                  </div>
                  <span className="text-xs font-mono-num text-[var(--red)] shrink-0">
                    {
                      courses.filter(
                        (c) => c.category.toLowerCase() === cat.name.toLowerCase()
                      ).length
                    }{' '}
                    tracks
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
