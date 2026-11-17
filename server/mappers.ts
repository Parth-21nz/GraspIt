// Converts Prisma rows into the JSON shapes the frontend already expects
// (src/types.ts): `_id` instead of `id`, ISO date strings, no password hashes.
import type {
  Category,
  Enrollment,
  Inquiry,
  Mentor,
  Note,
  User,
  Prisma,
} from '../generated/prisma/client.ts';
import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  LessonNoteDocument,
  MentorProfile,
  UserDocument,
} from '../src/types.ts';
import { SEED_USER_IDS } from './seed.ts';

export const courseInclude = {
  instructor: { select: { name: true, title: true } },
  modules: {
    orderBy: { position: 'asc' },
    include: { lessons: { orderBy: { position: 'asc' } } },
  },
} as const;

export type CourseWithModules = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

export function toUserDoc(u: User): UserDocument {
  return {
    _id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    bio: u.bio,
    avatar: u.avatar,
    avatarAssetId: u.avatarAssetId,
    status: u.status,
    joinedAt: u.joinedAt.toISOString(),
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    isDemoAccount: SEED_USER_IDS.includes(u.id),
    instructorApplicationStatus: u.instructorApplicationStatus,
  };
}

export function toCategoryDoc(c: Category): CategoryDocument {
  return {
    _id: c.id,
    name: c.name,
    description: c.description,
    createdByRole: c.createdByRole,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toMentorDoc(m: Mentor): MentorProfile {
  return {
    _id: m.id,
    name: m.name,
    role: m.role,
    organization: m.organization,
    signatureQuote: m.signatureQuote,
    bio: m.bio,
    avatar: m.avatar,
    specialties: m.specialties,
    studentsMentored: m.studentsMentored,
  };
}

/** `includeVideos: false` blanks every lesson videoUrl (not enrolled / not owner). */
export function toCourseDoc(c: CourseWithModules, includeVideos: boolean): CourseDocument {
  return {
    _id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    category: c.category,
    level: c.level,
    price: c.price,
    durationHours: c.durationHours,
    studentsCount: c.studentsCount,
    thumbnail: c.thumbnail,
    thumbnailAssetId: c.thumbnailAssetId,
    instructorId: c.instructorId,
    instructorName: c.instructor.name,
    instructorRole: c.instructor.title,
    instructorSignature: c.instructorSignature,
    status: c.status,
    featured: c.featured,
    skills: c.skills,
    outcomes: c.outcomes,
    modules: c.modules.map((m) => ({
      _id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => ({
        _id: l.id,
        title: l.title,
        durationMinutes: l.durationMinutes,
        videoUrl: includeVideos ? l.videoUrl : '',
        summary: l.summary,
        keyTakeaways: l.keyTakeaways,
      })),
    })),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toEnrollmentDoc(e: Enrollment): EnrollmentDocument {
  return {
    _id: e.id,
    userId: e.userId,
    courseId: e.courseId,
    enrolledAt: e.enrolledAt.toISOString(),
    amountPaid: e.amountPaid,
    paymentRef: e.paymentRef,
    paymentMode: e.paymentMode,
    completedLessonIds: e.completedLessonIds,
    progressPercent: e.progressPercent,
    ...(e.certificateIssuedAt
      ? { certificateIssuedAt: e.certificateIssuedAt.toISOString() }
      : {}),
  };
}

export function toNoteDoc(n: Note): LessonNoteDocument {
  return {
    _id: n.id,
    userId: n.userId,
    courseId: n.courseId,
    lessonId: n.lessonId,
    lessonTitle: n.lessonTitle,
    timestampFormatted: n.timestampFormatted,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toInquiryDoc(i: Inquiry): InquiryDocument {
  return {
    _id: i.id,
    name: i.name,
    email: i.email,
    topic: i.topic,
    message: i.message,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
  };
}
