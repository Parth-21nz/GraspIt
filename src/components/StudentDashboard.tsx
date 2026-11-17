import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  CheckCircle2,
  Circle,
  Award,
  FileText,
  Plus,
  Trash2,
  Download,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  LoaderCircle,
} from 'lucide-react';
import type {
  CourseDocument,
  EnrollmentDocument,
  LessonItem,
  LessonNoteDocument,
  UserDocument,
} from '../types';

interface StudentDashboardProps {
  currentUser: UserDocument;
  courses: CourseDocument[];
  enrollments: EnrollmentDocument[];
  notes: LessonNoteDocument[];
  initialCourseId: string | null;
  onToggleLessonProgress: (enrollmentId: string, lessonId: string) => Promise<void>;
  onAddNote: (payload: {
    courseId: string;
    lessonId: string;
    lessonTitle: string;
    timestampFormatted: string;
    content: string;
  }) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onBrowseCatalog: () => void;
  onSelectCourseForCheckout: (course: CourseDocument) => void;
}

function parseVideoSource(rawUrl: string): {
  type: 'video' | 'embed' | 'invalid';
  src: string;
  reason?: string;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      type: 'invalid',
      src: '',
      reason: 'No lecture video URL was provided for this lesson.',
    };
  }

  if (trimmed.startsWith('data:video/')) {
    return { type: 'video', src: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      type: 'invalid',
      src: trimmed,
      reason: 'The provided lecture URL is malformed. Expected a valid http:// or https:// address.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      type: 'invalid',
      src: trimmed,
      reason: `Unsupported URL protocol "${parsed.protocol}". Please use http:// or https://.`,
    };
  }

  const host = parsed.hostname.toLowerCase();

  // YouTube watch / short / embed links
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    let videoId = '';
    if (host.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1).split('/')[0];
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
    } else {
      videoId = parsed.searchParams.get('v') || '';
    }
    if (!videoId) {
      return {
        type: 'invalid',
        src: trimmed,
        reason: 'Could not extract a valid YouTube video ID from the provided URL.',
      };
    }
    return {
      type: 'embed',
      src: `https://www.youtube.com/embed/${videoId}?rel=0`,
    };
  }

  // Vimeo links
  if (host.includes('vimeo.com')) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const vimeoId = segments[segments.length - 1];
    if (vimeoId && /^\d+$/.test(vimeoId)) {
      return {
        type: 'embed',
        src: `https://player.vimeo.com/video/${vimeoId}`,
      };
    }
  }

  return { type: 'video', src: trimmed };
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  currentUser,
  courses,
  enrollments,
  notes,
  initialCourseId,
  onToggleLessonProgress,
  onAddNote,
  onDeleteNote,
  onBrowseCatalog,
  onSelectCourseForCheckout,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const myEnrollments = enrollments.filter((e) => e.userId === currentUser._id);
  const enrolledCourses = myEnrollments
    .map((enr) => {
      const course = courses.find((c) => c._id === enr.courseId);
      return course ? { course, enrollment: enr } : null;
    })
    .filter(
      (item): item is { course: CourseDocument; enrollment: EnrollmentDocument } =>
        item !== null
    );

  const [activeCourseId, setActiveCourseId] = useState<string>(
    initialCourseId || enrolledCourses[0]?.course._id || ''
  );

  const activePair =
    enrolledCourses.find((item) => item.course._id === activeCourseId) ||
    enrolledCourses[0] ||
    null;

  const allLessons: LessonItem[] = activePair
    ? activePair.course.modules.flatMap((m) => m.lessons)
    : [];

  const [activeLessonId, setActiveLessonId] = useState<string>(
    allLessons[0]?._id || ''
  );

  const currentLesson =
    allLessons.find((l) => l._id === activeLessonId) || allLessons[0] || null;

  // Video playback error & retry state
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(
    null
  );
  const [videoRetryKey, setVideoRetryKey] = useState<number>(0);

  useEffect(() => {
    setVideoPlaybackError(null);
  }, [currentLesson?._id, currentLesson?.videoUrl, videoRetryKey]);

  // Note creation state
  const [noteContent, setNoteContent] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<string | null>(null);
  const [deletingNote, setDeletingNote] = useState<string | null>(null);
  const [learningError, setLearningError] = useState<string | null>(null);

  // Certificate preview state
  const [certificateCourse, setCertificateCourse] = useState<{
    course: CourseDocument;
    enrollment: EnrollmentDocument;
  } | null>(null);

  const courseNotes = activePair
    ? notes.filter(
        (n) => n.userId === currentUser._id && n.courseId === activePair.course._id
      )
    : [];

  const completedCoursesCount = enrolledCourses.filter(
    (item) => item.enrollment.progressPercent === 100
  ).length;

  const totalHoursStudied = enrolledCourses.reduce(
    (acc, item) =>
      acc +
      Math.round(
        (item.course.durationHours * item.enrollment.progressPercent) / 100
      ),
    0
  );

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePair || !currentLesson || !noteContent.trim() || savingNote) return;
    setSavingNote(true);
    setLearningError(null);
    const currentVideoTime = videoRef.current
      ? formatSeconds(videoRef.current.currentTime)
      : '00:00';
    try {
      await onAddNote({
        courseId: activePair.course._id,
        lessonId: currentLesson._id,
        lessonTitle: currentLesson.title,
        timestampFormatted: noteTimestamp.trim() || currentVideoTime,
        content: noteContent.trim(),
      });
      setNoteContent('');
      setNoteTimestamp('');
    } catch (err) {
      setLearningError(err instanceof Error ? err.message : 'Your note could not be saved. Please retry.');
    } finally {
      setSavingNote(false);
    }
  };

  const toggleProgress = async (enrollmentId: string, lessonId: string) => {
    if (pendingProgress) return;
    setPendingProgress(lessonId); setLearningError(null);
    try { await onToggleLessonProgress(enrollmentId, lessonId); }
    catch (err) { setLearningError(err instanceof Error ? err.message : 'Your progress could not be saved. Please retry.'); }
    finally { setPendingProgress(null); }
  };
  const deleteNote = async (noteId: string) => {
    if (deletingNote) return;
    setDeletingNote(noteId); setLearningError(null);
    try { await onDeleteNote(noteId); }
    catch (err) { setLearningError(err instanceof Error ? err.message : 'Your note could not be deleted. Please retry.'); }
    finally { setDeletingNote(null); }
  };

  const recommendedCourses = courses.filter(
    (c) =>
      c.status === 'published' &&
      !myEnrollments.some((e) => e.courseId === c._id)
  );

  const resolvedVideo = currentLesson
    ? parseVideoSource(currentLesson.videoUrl)
    : { type: 'invalid' as const, src: '', reason: 'No active lesson selected.' };

  return (
    <div className="space-y-10">
      {learningError && <p role="alert" className="rounded-xl border border-[var(--red)] bg-[var(--surface)] p-4 text-sm text-red-300">{learningError}</p>}
      {/* Top Student Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[var(--border)] pb-8">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold block mb-2">
            01 · My Learning
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Welcome back, {currentUser.name}
          </h1>
          <p className="text-sm text-[var(--text-body)] mt-1">
            {currentUser.title} · Active Technical Mastery Track
          </p>
        </div>

        {/* 4 Metric Blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Enrolled Tracks
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {enrolledCourses.length}
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Hours Completed
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {totalHoursStudied}h
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Saved Notes
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
              {notes.filter((n) => n.userId === currentUser._id).length}
            </div>
          </div>

          <div className="p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              Certificates
            </div>
            <div className="font-display text-2xl font-bold text-[var(--red)] tabular-nums mt-1">
              {completedCoursesCount}
            </div>
          </div>
        </div>
      </div>

      {/* Enrolled Course Selector Strip */}
      {enrolledCourses.length === 0 ? (
        <div className="p-12 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] text-center space-y-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            You have not enrolled in any tracks yet
          </h2>
          <p className="text-sm text-[var(--text-body)] max-w-md mx-auto">
            Explore practitioner-led programs in AI, Design, Tech, and Product Engineering
            to unlock the interactive course player.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="btn-crimson rounded-full px-6 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer"
          >
            Browse Course Catalog
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] font-semibold">
                Your Active Enrollments (Select Track to Launch Player)
              </h2>
              <button
                type="button"
                onClick={onBrowseCatalog}
                className="text-xs font-semibold text-[var(--red)] hover:underline uppercase tracking-wider cursor-pointer"
              >
                + Explore More Courses
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {enrolledCourses.map(({ course, enrollment }) => {
                const isSelected = activePair?.course._id === course._id;
                return (
                  <div
                    key={enrollment._id}
                    onClick={() => {
                      setActiveCourseId(course._id);
                      const firstLesson = course.modules[0]?.lessons[0];
                      if (firstLesson) setActiveLessonId(firstLesson._id);
                    }}
                    className={`p-5 rounded-[22px] border transition-colors cursor-pointer flex flex-col justify-between gap-4 ${
                      isSelected
                        ? 'bg-[var(--surface-2)] border-[var(--red)]'
                        : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--red)]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="uppercase tracking-wider text-[var(--red)] font-semibold">
                          {course.category}
                        </span>
                        <span className="font-mono-num text-[var(--text-primary)] font-semibold">
                          {enrollment.progressPercent}% Complete
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug">
                        {course.title}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden border border-[var(--border)]">
                        <div
                          className="h-full bg-[var(--red)] transition-all duration-300"
                          style={{ width: `${enrollment.progressPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)]">
                          Instructor: {course.instructorName}
                        </span>
                        {enrollment.progressPercent === 100 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCertificateCourse({ course, enrollment });
                            }}
                            className="text-[var(--red)] font-semibold uppercase tracking-wider inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Certificate</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Course Player + Syllabus Tracker + Notes */}
          {activePair && currentLesson && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
              {/* Left 8 Columns: Video Stage + Lesson Summary + Personal Notes */}
              <div className="lg:col-span-8 space-y-6">
                {/* Video Stage Card with Error Handling */}
                <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
                  <div className="aspect-video w-full bg-[#0A0707] relative border-b border-[var(--border)] flex items-center justify-center">
                    {resolvedVideo.type === 'invalid' || videoPlaybackError ? (
                      <div className="p-6 md:p-10 text-center max-w-lg mx-auto space-y-4">
                        <div className="mx-auto icon-circle-crimson">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--red)] font-semibold block">
                            Lecture Stream Unavailable
                          </span>
                          <h4 className="text-lg font-bold text-[var(--text-primary)]">
                            Unable to Play Lecture Video
                          </h4>
                          <p className="text-xs text-[var(--text-body)] leading-relaxed">
                            {videoPlaybackError ||
                              resolvedVideo.reason ||
                              'The lecture video URL could not be loaded or is in an unsupported format.'}
                          </p>
                        </div>

                        {currentLesson.videoUrl && (
                          <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono-num text-[var(--text-muted)] break-all">
                            Source URL: {currentLesson.videoUrl}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setVideoPlaybackError(null);
                              setVideoRetryKey((prev) => prev + 1);
                            }}
                            className="btn-crimson rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-[var(--red)]" />
                            <span>Retry Stream</span>
                          </button>

                          {currentLesson.videoUrl &&
                            (currentLesson.videoUrl.startsWith('http://') ||
                              currentLesson.videoUrl.startsWith('https://')) && (
                              <a
                                href={currentLesson.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary-outline rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
                              >
                                <span>Open Direct URL</span>
                                <ExternalLink className="w-3.5 h-3.5 text-[var(--red)]" />
                              </a>
                            )}
                        </div>
                      </div>
                    ) : resolvedVideo.type === 'embed' ? (
                      <iframe
                        key={`${currentLesson._id}_${videoRetryKey}`}
                        src={resolvedVideo.src}
                        title={currentLesson.title}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                        onError={() =>
                          setVideoPlaybackError(
                            'The embedded video player encountered an error loading this URL.'
                          )
                        }
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        key={`${currentLesson.videoUrl}_${videoRetryKey}`}
                        src={resolvedVideo.src}
                        controls
                        poster={activePair.course.thumbnail || undefined}
                        className="w-full h-full object-cover"
                        onError={() =>
                          setVideoPlaybackError(
                            'The video stream failed to load from the instructor-provided URL. Verify that the URL points to a reachable MP4/WebM stream or valid video host.'
                          )
                        }
                      />
                    )}
                  </div>

                  <div className="p-6 md:p-7 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-[var(--red)] font-semibold">
                          Active Lesson · {currentLesson.durationMinutes} min
                        </span>
                        <h3 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] mt-1">
                          {currentLesson.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void toggleProgress(
                            activePair.enrollment._id,
                            currentLesson._id
                          )
                        }
                        disabled={Boolean(pendingProgress)}
                        aria-busy={Boolean(pendingProgress)}
                        className={`rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                          activePair.enrollment.completedLessonIds.includes(
                            currentLesson._id
                          )
                            ? 'bg-[var(--red)] border-[var(--red)] text-[var(--text-primary)]'
                            : 'btn-crimson'
                        }`}
                      >
                        {pendingProgress ? <LoaderCircle aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>
                          {pendingProgress ? 'Saving progress…' : activePair.enrollment.completedLessonIds.includes(
                            currentLesson._id
                          )
                            ? 'Lesson Completed'
                            : 'Mark Lesson Complete'}
                        </span>
                      </button>
                    </div>

                    {currentLesson.summary && (
                      <p className="text-sm text-[var(--text-body)] leading-relaxed">
                        {currentLesson.summary}
                      </p>
                    )}

                    {currentLesson.keyTakeaways.length > 0 && (
                      <div className="pt-3 border-t border-[var(--border)]">
                        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                          Core Engineering Takeaways
                        </div>
                        <ul className="space-y-1.5">
                          {currentLesson.keyTakeaways.map((takeaway) => (
                            <li
                              key={takeaway}
                              className="text-xs text-[var(--text-body)] flex items-center gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" />
                              <span>{takeaway}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamped Personal Lesson Notes */}
                <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] p-6 md:p-7 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="icon-circle-crimson">
                        <FileText className="w-4 h-4" />
                      </span>
                      <div>
                        <h4 className="text-base font-bold text-[var(--text-primary)]">
                          Timestamped Engineering Notes
                        </h4>
                        <p className="text-xs text-[var(--text-muted)]">
                          Persisted to your personal learning ledger for{' '}
                          {activePair.course.title}
                        </p>
                      </div>
                    </div>
                  </div>

                  <form
                    onSubmit={handleSaveNote}
                    className="flex flex-wrap gap-3"
                  >
                    <input
                      type="text"
                      value={noteTimestamp}
                      onChange={(e) => setNoteTimestamp(e.target.value)}
                      placeholder="MM:SS"
                      aria-label="Video timestamp"
                      disabled={savingNote}
                      className="w-full sm:w-24 shrink-0 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-xs font-mono-num text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      disabled={savingNote}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Capture architectural insight, benchmark formula, or code takeaway..."
                      className="flex-1 min-w-[180px] w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--red)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={savingNote}
                      className="w-full sm:w-auto shrink-0 btn-crimson rounded-lg px-5 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {savingNote ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 text-[var(--red)] motion-safe:animate-spin" /> : <Plus className="w-3.5 h-3.5 text-[var(--red)]" />}
                      <span>{savingNote ? 'Saving...' : 'Save Note'}</span>
                    </button>
                  </form>

                  <div className="space-y-3 pt-2">
                    {courseNotes.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-3">
                        No notes saved for this course yet. Add your first timestamped note
                        above.
                      </p>
                    ) : (
                      courseNotes.map((note) => (
                        <div
                          key={note._id}
                          className="p-4 rounded-[16px] bg-[var(--surface-2)] border border-[var(--border)] flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono-num text-[var(--red)] font-semibold">
                                [{note.timestampFormatted}]
                              </span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="text-[var(--text-muted)] break-words">
                                {note.lessonTitle}
                              </span>
                            </div>
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed break-words">
                              {note.content}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteNote(note._id)}
                            disabled={Boolean(deletingNote)}
                            aria-busy={deletingNote === note._id}
                            aria-label="Delete note"
                            className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors shrink-0 cursor-pointer p-1"
                          >
                            {deletingNote === note._id ? <LoaderCircle aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right 4 Columns: Syllabus Progress Checklist & Certificate Unlock */}
              <div className="lg:col-span-4 space-y-6">
                <div className="rounded-[26px] bg-[var(--surface)] border border-[var(--border)] p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-[var(--red)] font-semibold">
                        Syllabus Tracker
                      </span>
                      <h4 className="text-lg font-bold text-[var(--text-primary)]">
                        Course Modules
                      </h4>
                    </div>
                    <span className="font-mono-num text-xl font-bold text-[var(--text-primary)]">
                      {activePair.enrollment.progressPercent}%
                    </span>
                  </div>

                  {/* Certificate Callout */}
                  {activePair.enrollment.progressPercent === 100 ? (
                    <div className="p-4 rounded-[18px] bg-[var(--surface-2)] border border-[var(--red)] space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                        <Award className="w-4 h-4 text-[var(--red)]" />
                        <span>100% Syllabus Verified — Certificate Issued</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCertificateCourse(activePair)}
                        className="w-full btn-crimson rounded-full py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                      >
                        View Official Certificate
                      </button>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[16px] bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text-body)]">
                      Complete all lessons in the checklist below to issue your signed
                      GraspIt credential.
                    </div>
                  )}

                  {/* Module & Lesson Checklist */}
                  <div className="space-y-4">
                    {activePair.course.modules.map((mod) => (
                      <div key={mod._id} className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {mod.title}
                        </div>
                        <div className="space-y-1.5">
                          {mod.lessons.map((lesson) => {
                            const done =
                              activePair.enrollment.completedLessonIds.includes(
                                lesson._id
                              );
                            const active = currentLesson._id === lesson._id;
                            return (
                              <div
                                key={lesson._id}
                                className={`p-3 rounded-[14px] border flex items-center justify-between gap-3 transition-colors ${
                                  active
                                    ? 'bg-[var(--surface-2)] border-[var(--red)]'
                                    : 'bg-[var(--bg)] border-[var(--border)]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setActiveLessonId(lesson._id)}
                                  className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5 text-[var(--red)] shrink-0" />
                                  <span className="text-xs font-medium text-[var(--text-primary)] line-clamp-1">
                                    {lesson.title}
                                  </span>
                                </button>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] font-mono-num text-[var(--text-muted)]">
                                    {lesson.durationMinutes}m
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void toggleProgress(
                                        activePair.enrollment._id,
                                        lesson._id
                                      )
                                    }
                                    disabled={Boolean(pendingProgress)}
                                    aria-busy={pendingProgress === lesson._id}
                                    aria-label={
                                      done ? 'Mark incomplete' : 'Mark complete'
                                    }
                                    className="text-[var(--red)] cursor-pointer"
                                  >
                                    {pendingProgress === lesson._id ? <LoaderCircle aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin" /> : done ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <Circle className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--red)]" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Recommended Courses Section for Quick Enrollment */}
      {recommendedCourses.length > 0 && (
        <div className="pt-8 border-t border-[var(--border)] space-y-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Recommended Tracks to Expand Your Stack
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommendedCourses.slice(0, 2).map((course) => (
              <div
                key={course._id}
                className="p-6 rounded-[24px] bg-[var(--surface)] border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-xs uppercase tracking-wider text-[var(--red)] font-semibold">
                    {course.category} · {course.level}
                  </span>
                  <h4 className="text-base font-bold text-[var(--text-primary)]">
                    {course.title}
                  </h4>
                  <p className="text-xs text-[var(--text-muted)]">
                    Instructor: {course.instructorName} · {course.durationHours}h
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCourseForCheckout(course)}
                  className="btn-crimson rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider shrink-0 cursor-pointer whitespace-nowrap"
                >
                  Enroll · ₹{course.price.toLocaleString('en-IN')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Completion Certificate Modal */}
      {certificateCourse && createPortal(
        <div
          className="certificate-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0707]/85 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Course completion certificate"
        >
          <div className="certificate-shell w-full max-w-3xl max-h-[90dvh] overflow-y-auto bg-[var(--surface)] border border-[var(--red)] rounded-[30px] p-8 md:p-12 relative">
            <div className="certificate-paper border border-[var(--border)] rounded-[22px] p-8 md:p-10 bg-[var(--bg)] space-y-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1 border border-[var(--red)] text-xs uppercase tracking-[0.2em] text-[var(--red)] font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>GraspIt Accredited Technical Credential</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                  This certifies that
                </p>
                <h2 className="font-display text-4xl md:text-5xl font-bold text-[var(--text-primary)] tracking-tight">
                  {currentUser.name}
                </h2>
                <p className="text-xs text-[var(--text-body)] max-w-md mx-auto pt-1">
                  has completed 100% of the engineering modules, architectural labs, and
                  syllabus requirements for
                </p>
              </div>

              <div className="py-4 border-y border-[var(--border)]">
                <h3 className="text-xl md:text-2xl font-bold text-[var(--red)]">
                  {certificateCourse.course.title}
                </h3>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
                  {certificateCourse.course.category} ·{' '}
                  {certificateCourse.course.durationHours} Hours Verified Study
                </p>
              </div>

              <div className="certificate-details grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-left">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Credential ID
                  </div>
                  <div className="break-words text-xs font-mono-num text-[var(--text-primary)] mt-1">
                    {certificateCourse.enrollment.paymentRef}-CERT
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Issued Date
                  </div>
                  <div className="text-xs font-mono-num text-[var(--text-primary)] mt-1">
                    {new Date(
                      certificateCourse.enrollment.certificateIssuedAt || Date.now()
                    ).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Lead Faculty Signature
                  </div>
                  <div className="font-signature text-2xl text-[var(--text-primary)] mt-0.5">
                    {certificateCourse.course.instructorSignature}
                  </div>
                </div>
              </div>
            </div>

            <div className="certificate-actions flex flex-wrap items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-secondary-outline rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setCertificateCourse(null)}
                className="btn-crimson rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Close Credential
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
