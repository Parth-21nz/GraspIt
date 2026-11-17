import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  Send,
  Layers,
  Play,
  ChevronRight,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  MentorProfile,
  UserDocument,
} from '../types';

interface LandingPageProps {
  categories: CategoryDocument[];
  courses: CourseDocument[];
  mentors: MentorProfile[];
  enrollments: EnrollmentDocument[];
  currentUser: UserDocument | null;
  onSelectCourseForCheckout: (course: CourseDocument) => void;
  onOpenCourseInPlayer: (courseId: string) => void;
  onCreateCategory: (name: string, description: string) => Promise<void>;
  onSubmitInquiry: (payload: {
    name: string;
    email: string;
    topic: string;
    message: string;
  }) => Promise<void>;
  onStartLearningClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  categories,
  courses,
  mentors,
  enrollments,
  currentUser,
  onSelectCourseForCheckout,
  onOpenCourseInPlayer,
  onCreateCategory,
  onSubmitInquiry,
  onStartLearningClick,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMentorFilter, setSelectedMentorFilter] = useState<string | null>(
    null
  );
  const [syllabusModalCourse, setSyllabusModalCourse] =
    useState<CourseDocument | null>(null);

  // Add Category Modal state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  // Contact Inquiry Form state
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [inquiryTopic, setInquiryTopic] = useState('Enterprise Team Cohort');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquiryStatus, setInquiryStatus] = useState<
    'idle' | 'submitting' | 'sent' | 'error'
  >('idle');

  const publishedCourses = courses.filter((c) => c.status === 'published');

  const filteredCourses = publishedCourses.filter((course) => {
    const matchesCategory =
      selectedCategory === 'All' ||
      course.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesMentor =
      !selectedMentorFilter ||
      course.instructorName.toLowerCase() === selectedMentorFilter.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.skills.some((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesCategory && matchesMentor && matchesSearch;
  });

  const isEnrolled = (courseId: string) =>
    Boolean(
      currentUser &&
        enrollments.some(
          (e) => e.userId === currentUser._id && e.courseId === courseId
        )
    );

  const canManageCategories =
    currentUser?.role === 'admin';

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      await onCreateCategory(newCatName.trim(), newCatDesc.trim());
      setSelectedCategory(newCatName.trim());
      setNewCatName('');
      setNewCatDesc('');
      setShowAddCategory(false);
    } finally {
      setCreatingCat(false);
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryEmail.trim() || !inquiryMessage.trim())
      return;
    setInquiryStatus('submitting');
    try {
      await onSubmitInquiry({
        name: inquiryName,
        email: inquiryEmail,
        topic: inquiryTopic,
        message: inquiryMessage,
      });
      setInquiryStatus('sent');
      setInquiryName('');
      setInquiryEmail('');
      setInquiryMessage('');
    } catch {
      setInquiryStatus('error');
    }
  };

  return (
    <main className="bg-[var(--bg)] text-[var(--text-primary)]">
      {/* ═══════════════════════════════════════════════════════════════════
          1. HERO SECTION (Layered Depth, Right Floating Card)
         ═══════════════════════════════════════════════════════════════════ */}
      <section
        id="home"
        className="relative w-full overflow-hidden pt-28 pb-12 md:pt-28 lg:pt-28 lg:pb-16 border-b border-[var(--border)]"
      >
        {/* Layer 1: Full-Bleed High-Contrast Candid Study/Collaboration Photo */}
        <div className="absolute inset-0 z-0 bg-[var(--surface)]">
          <img
            src="/images/hero_collaborative_study_1794504814432.jpg"
            alt="Engineers and product designers collaborating at a dark architectural table"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-[#0A0707]/40" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, #0A0707 0%, rgba(10, 7, 7, 0.94) 42%, rgba(10, 7, 7, 0.62) 72%, rgba(10, 7, 7, 0.35) 100%)',
            }}
          />
          <div className="absolute inset-0 hero-radial-glow pointer-events-none" />
          <div className="absolute inset-0 hero-vignette pointer-events-none" />
        </div>

        {/* Layer 2: Hero Content Container */}
        <div className="relative z-10 w-full max-w-[1280px] mx-auto px-6 md:px-12">
          <div className="flex flex-col lg:block relative lg:min-h-[560px]">
            {/* LEFT TEXT COLUMN */}
            <div className="w-full lg:w-[49%] flex flex-col justify-center py-2 lg:py-4">
              {/* Three-Line Bold Headline */}
              <h1
                className="font-sans-ui font-extrabold tracking-tight leading-[1.05] mb-6"
                style={{ fontSize: 'clamp(2.75rem, 6vw, 5rem)' }}
              >
                <span className="block text-[var(--text-primary)]">
                  Master Modern
                </span>
                <span className="block text-[var(--red)]">
                  Engineering Craft.
                </span>
                <span className="block text-[var(--text-primary)]">
                  Lead The Stack.
                </span>
              </h1>

              {/* Supporting Paragraph */}
              <p className="text-[15px] md:text-[16px] leading-[1.8] text-[var(--text-body)] max-w-[48ch] line-clamp-3 mb-8">
                Practitioner-built cohorts in AI Inference, Distributed
                TypeScript, Design Systems, and Product Engineering—taught by
                principal architects shipping at global scale.
              </p>

              {/* Two Pill CTA Buttons in a Row */}
              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={onStartLearningClick}
                  className="btn-crimson rounded-full px-7 py-3.5 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span>
                    {currentUser ? 'My Learning' : 'Start Learning'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[var(--red)]" />
                </button>

                <a
                  href="#courses"
                  className="btn-secondary-outline rounded-full px-7 py-3.5 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Explore Courses</span>
                </a>
              </div>
            </div>

            {/* RIGHT FLOATING IMAGE CARD */}
            <div className="w-full lg:w-[44%] mt-8 lg:mt-0 lg:absolute lg:top-4 lg:-right-6 xl:-right-10 lg:bottom-2 rounded-[30px] overflow-hidden border border-[var(--border)] bg-[var(--surface)] relative min-h-[420px] sm:min-h-[480px]">
              <img
                src="/images/hero_floating_mentor_card_1794504815575.jpg"
                alt="Principal mentor reviewing distributed code architecture with a fellow engineer"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center absolute inset-0"
              />
              <div className="absolute inset-0 photo-duotone-overlay" />

              {/* Top Editorial Tag inside Floating Card */}
              <div className="relative z-10 p-5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-signature text-lg text-[var(--text-primary)]">
                  Practitioner Mentorship
                </span>
                <span className="px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--bg)]/80 text-[11px] uppercase tracking-wider text-[var(--text-body)] whitespace-nowrap">
                  Live + Self-Paced
                </span>
              </div>

              {/* Pinned Frosted-Glass Stats Panel at Bottom of Card */}
              <div className="absolute inset-x-[18px] bottom-[18px] z-10 glass-panel rounded-[20px] p-4 sm:p-5">
                <div className="grid grid-cols-2 items-center">
                  <div className="pr-3 sm:pr-4 min-w-0">
                    <div className="font-display text-2xl sm:text-4xl font-bold text-[var(--text-primary)] tabular-nums tracking-tight">
                      10K<span className="text-[var(--red)]">+</span>
                    </div>
                    <div className="text-[11px] sm:text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1 break-words">
                      Enrolled Learners
                    </div>
                  </div>

                  <div className="pl-3 sm:pl-5 border-l border-[var(--border)] min-w-0">
                    <div className="font-display text-2xl sm:text-4xl font-bold text-[var(--text-primary)] tabular-nums tracking-tight">
                      92<span className="text-[var(--red)]">%</span>
                    </div>
                    <div className="text-[11px] sm:text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1 break-words">
                      Course Completion Rate
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          2. COURSES CATALOG SECTION (#courses) + EXTENSIBLE CATEGORIES
         ═══════════════════════════════════════════════════════════════════ */}
      <section
        id="courses"
        className="relative py-24 md:py-32 border-b border-[var(--border)] overflow-hidden"
      >
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          {/* Allowed Large Red Area (a): One oversized typographic element fading from --red to --bg */}
          <div className="mb-4 select-none">
            <span
              aria-hidden="true"
              className="font-display font-bold uppercase tracking-tighter leading-none block hero-oversized-gradient-text"
              style={{ fontSize: 'clamp(4.2rem, 11vw, 9.5rem)' }}
            >
              CURRICULUM
            </span>
          </div>

          {/* Section Eyebrow + Heading Row */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 -mt-6 md:-mt-12 relative z-10 mb-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 border border-[var(--border)] bg-[var(--surface)] mb-4">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--red)] font-semibold">
                  01 · Technical Tracks
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
                Engineered for Production Mastery
              </h2>
            </div>

            {/* Search Input & Extensible Category Trigger */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <Search className="w-4 h-4 text-[var(--red)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses or skills..."
                  aria-label="Search courses or skills"
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-full pl-10 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none w-full sm:w-64"
                />
              </div>

              {canManageCategories && (
                <button
                  type="button"
                  onClick={() => setShowAddCategory((prev) => !prev)}
                  className="btn-secondary-outline rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--red)]" />
                  <span>Add Category</span>
                </button>
              )}
            </div>
          </div>

          {/* Dynamic Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2.5 mb-8">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setSelectedMentorFilter(null);
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === 'All'
                  ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                  : 'bg-transparent border-[var(--border)] text-[var(--text-body)] hover:border-[var(--red)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Tracks ({publishedCourses.length})
            </button>

            {categories.map((cat) => {
              const count = publishedCourses.filter(
                (c) => c.category.toLowerCase() === cat.name.toLowerCase()
              ).length;
              const active =
                selectedCategory.toLowerCase() === cat.name.toLowerCase();
              return (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                      : 'bg-transparent border-[var(--border)] text-[var(--text-body)] hover:border-[var(--red)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}

            {selectedMentorFilter && (
              <button
                type="button"
                onClick={() => setSelectedMentorFilter(null)}
                className="rounded-full px-3.5 py-1.5 text-xs border border-[var(--red)] text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Mentor: {selectedMentorFilter}</span>
                <X className="w-3.5 h-3.5 text-[var(--red)]" />
              </button>
            )}
          </div>

          {/* Inline Extensible Category Creator Panel */}
          {showAddCategory && (
            <form
              onSubmit={handleCreateCategorySubmit}
              className="mb-10 p-6 rounded-[24px] bg-[var(--surface)] border border-[var(--border)] flex flex-wrap items-end gap-4"
            >
              <div className="flex-1 min-w-[200px] w-full">
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  New Category Name (e.g. Cloud Security, Robotics, Data Systems)
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Enter category title..."
                  className="w-full min-w-0 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                />
              </div>
              <div className="flex-1 min-w-[200px] w-full">
                <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Focus Description
                </label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Short description of domain scope..."
                  className="w-full min-w-0 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddCategory(false)}
                  className="btn-secondary-outline rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCat}
                  className="btn-crimson rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  {creatingCat ? 'Saving...' : 'Create Category'}
                </button>
              </div>
            </form>
          )}

          {/* Course Grid */}
          {filteredCourses.length === 0 ? (
            <div className="p-12 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] text-center space-y-4">
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                No published courses match the current filter criteria.
              </p>
              <p className="text-sm text-[var(--text-body)] max-w-md mx-auto">
                Reset filters or sign in as an Instructor to submit a new course
                in{' '}
                <span className="text-[var(--red)] font-semibold">
                  {selectedCategory}
                </span>
                .
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                    setSelectedMentorFilter(null);
                  }}
                  className="btn-secondary-outline rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredCourses.map((course, idx) => {
                const enrolled = isEnrolled(course._id);
                const lessonCount = course.modules.reduce(
                  (acc, m) => acc + m.lessons.length,
                  0
                );

                return (
                  <article
                    key={course._id}
                    className="rounded-[28px] bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {/* Course Cover Photo with Dark Duotone Overlay */}
                      <div className="relative h-60 w-full overflow-hidden border-b border-[var(--border)] bg-[var(--bg)]">
                        {course.thumbnail ? (
                          <img
                            src={course.thumbnail}
                            alt={course.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover object-center opacity-80"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
                          </div>
                        )}
                        <div className="absolute inset-0 photo-duotone-overlay" />

                        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                          <span className="text-xs font-mono-num font-semibold text-[var(--red)] bg-[var(--bg)]/90 border border-[var(--border)] rounded-full px-3 py-1">
                            0{idx + 1} · {course.category.toUpperCase()}
                          </span>
                          <span className="text-xs font-mono-num text-[var(--text-primary)] bg-[var(--bg)]/90 border border-[var(--border)] rounded-full px-3 py-1">
                            {course.level}
                          </span>
                        </div>

                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-[var(--text-body)]">
                          <span>
                            {course.modules.length} Modules · {lessonCount}{' '}
                            Lessons · {course.durationHours}h
                          </span>
                          <span className="font-mono-num text-[var(--text-primary)] font-semibold">
                            {course.studentsCount.toLocaleString()} Enrolled
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-6 md:p-8">
                        <h3 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight mb-2.5">
                          {course.title}
                        </h3>
                        <p className="text-sm text-[var(--text-body)] leading-relaxed mb-5">
                          {course.subtitle}
                        </p>

                        {/* Skill Badges */}
                        <div className="flex flex-wrap gap-2 mb-6">
                          {course.skills.map((skill) => (
                            <span
                              key={skill}
                              className="px-2.5 py-1 rounded text-[11px] uppercase tracking-tight border border-[var(--border)] text-[var(--text-body)] bg-transparent"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Instructor + Price + Actions */}
                    <div className="px-6 md:px-8 py-5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                          Lead Instructor
                        </div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {course.instructorName}{' '}
                          {course.instructorRole && <span className="text-[var(--red)] font-normal">
                            · {course.instructorRole}
                          </span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSyllabusModalCourse(course)}
                          className="btn-secondary-outline rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                        >
                          Syllabus
                        </button>

                        {enrolled ? (
                          <button
                            type="button"
                            onClick={() => onOpenCourseInPlayer(course._id)}
                            className="btn-crimson rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5 text-[var(--red)]" />
                            <span>Open Player</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectCourseForCheckout(course)}
                            className="btn-crimson rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <span className="font-mono-num">
                              ₹{course.price.toLocaleString('en-IN')}
                            </span>
                            <span>· Enroll</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          3. PRACTITIONER MENTORS SECTION (#mentors)
         ═══════════════════════════════════════════════════════════════════ */}
      <section
        id="mentors"
        className="py-24 md:py-32 border-b border-[var(--border)]"
      >
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 border border-[var(--border)] bg-[var(--surface)] mb-4">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--red)] font-semibold">
                  02 · Principal Faculty
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
                Learn Directly From System Builders
              </h2>
            </div>
            <p className="text-sm text-[var(--text-body)] max-w-md leading-relaxed">
              Every GraspIt curriculum is authored and reviewed by staff-plus
              engineers and design directors with verifiable production track
              records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {mentors.map((mentor, idx) => (
              <div
                key={mentor._id}
                className="rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-7 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="relative w-20 h-20 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--bg)] shrink-0">
                      <img
                        src={mentor.avatar}
                        alt={mentor.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-[#0A0707]/25" />
                    </div>
                    <span className="icon-circle-crimson font-mono-num text-xs font-bold">
                      0{idx + 1}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-[var(--text-primary)]">
                    {mentor.name}
                  </h3>
                  <div className="text-xs font-semibold text-[var(--red)] uppercase tracking-wider mt-1 mb-4">
                    {mentor.role} · {mentor.organization}
                  </div>

                  <p className="text-sm text-[var(--text-body)] leading-relaxed mb-6">
                    {mentor.bio}
                  </p>

                  <blockquote className="p-4 rounded-[18px] bg-[var(--surface-2)] border border-[var(--border)] mb-6">
                    <p className="font-signature text-lg text-[var(--text-primary)] leading-snug">
                      “{mentor.signatureQuote}”
                    </p>
                  </blockquote>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {mentor.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="px-2.5 py-1 rounded text-[11px] uppercase tracking-tight border border-[var(--border)] text-[var(--text-body)]"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">
                    Mentored:{' '}
                    <strong className="text-[var(--text-primary)] font-mono-num">
                      {/* Fixed editorial/demo figure; deliberately independent of platform enrollments. */}
                      {mentor.studentsMentored}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMentorFilter(mentor.name);
                      document
                        .querySelector('#courses')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-[var(--red)] hover:underline font-semibold uppercase tracking-wider cursor-pointer"
                  >
                    Filter Courses →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          4. CONTACT & ADMISSIONS SECTION (#contact)
         ═══════════════════════════════════════════════════════════════════ */}
      <section
        id="contact"
        className="py-24 md:py-32 border-b border-[var(--border)]"
      >
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Column: Context & Direct Channels */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--red)] font-semibold">
                  03 · Admissions & Teams
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
                Custom Cohorts & Curriculum Advisory
              </h2>
              <p className="text-sm text-[var(--text-body)] leading-relaxed">
                Have questions about syllabus depth, team seat licensing, or
                becoming an accredited GraspIt instructor? Reach our curriculum
                board directly.
              </p>

              <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center gap-3.5">
                  <span className="icon-circle-crimson">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      Enterprise Licensing
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      cohorts@graspit.dev
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <span className="icon-circle-crimson">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      Faculty Accreditation
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      faculty@graspit.dev
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Validated Inquiry Form */}
            <div className="lg:col-span-7">
              <form
                onSubmit={handleInquirySubmit}
                className="rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-7 md:p-9 space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      placeholder="Ada Lovelace"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                      Work or Academic Email
                    </label>
                    <input
                      type="email"
                      required
                      value={inquiryEmail}
                      onChange={(e) => setInquiryEmail(e.target.value)}
                      placeholder="ada@organization.dev"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Inquiry Topic
                  </label>
                  <select
                    value={inquiryTopic}
                    onChange={(e) => setInquiryTopic(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                  >
                    <option value="Enterprise Team Cohort">
                      Enterprise Team Cohort
                    </option>
                    <option value="Individual Track Advisory">
                      Individual Track Advisory
                    </option>
                    <option value="Instructor Application">
                      Instructor Application
                    </option>
                    <option value="Custom Category Proposal">
                      Custom Category Proposal
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Message & Goals
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    placeholder="Tell us about your engineering goals or team size..."
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  {inquiryStatus === 'sent' ? (
                    <span className="text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--red)]" />
                      Inquiry logged in Admin Console. Our team will respond
                      within 24h.
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">
                      Routed directly to the GraspIt Admin Governance queue.
                    </span>
                  )}

                  <button
                    type="submit"
                    disabled={inquiryStatus === 'submitting'}
                    className="btn-crimson rounded-full px-7 py-3 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-[var(--red)]" />
                    <span>
                      {inquiryStatus === 'submitting'
                        ? 'Sending...'
                        : 'Submit Inquiry'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Editorial Footer */}
      <footer className="py-12 bg-[var(--bg)]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold text-[var(--text-primary)]">
              GRASP<span className="text-[var(--red)]">IT</span>
            </span>
            <span>·</span>
            <span>Practitioner Technical & Product Mastery</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#home" className="hover:text-[var(--red)] transition-colors">
              Home
            </a>
            <a
              href="#courses"
              className="hover:text-[var(--red)] transition-colors"
            >
              Courses
            </a>
            <a
              href="#mentors"
              className="hover:text-[var(--red)] transition-colors"
            >
              Mentors
            </a>
            <a
              href="#contact"
              className="hover:text-[var(--red)] transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>

      {/* Syllabus Inspection Modal */}
      {syllabusModalCourse && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0707]/85 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-[28px] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--red)] font-semibold">
                  {syllabusModalCourse.category} · {syllabusModalCourse.level}
                </span>
                <h3 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  {syllabusModalCourse.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSyllabusModalCourse(null)}
                className="icon-circle-crimson cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {syllabusModalCourse.outcomes.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Key Engineering Outcomes
                  </h4>
                  <ul className="space-y-2">
                    {syllabusModalCourse.outcomes.map((outcome) => (
                      <li
                        key={outcome}
                        className="text-sm text-[var(--text-body)] flex items-start gap-2.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
                        <span>{outcome}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Curriculum Modules ({syllabusModalCourse.modules.length})
                </h4>
                {syllabusModalCourse.modules.map((mod) => (
                  <div
                    key={mod._id}
                    className="rounded-[18px] bg-[var(--surface-2)] border border-[var(--border)] p-4 space-y-3"
                  >
                    <div className="font-semibold text-sm text-[var(--text-primary)]">
                      {mod.title}
                    </div>
                    <div className="space-y-2">
                      {mod.lessons.map((les) => (
                        <div
                          key={les._id}
                          className="flex items-center justify-between text-xs text-[var(--text-body)] py-1.5 border-t border-[var(--border)]"
                        >
                          <span className="inline-flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-[var(--red)]" />
                            {les.title}
                          </span>
                          <span className="font-mono-num text-[var(--text-muted)]">
                            {les.durationMinutes} min
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono-num text-xl font-bold text-[var(--text-primary)]">
                ₹{syllabusModalCourse.price.toLocaleString('en-IN')}
              </span>
              <button
                type="button"
                onClick={() => {
                  const target = syllabusModalCourse;
                  setSyllabusModalCourse(null);
                  onSelectCourseForCheckout(target);
                }}
                className="btn-crimson rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Enroll in Track →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
