import type {
  CategoryDocument,
  CourseDocument,
  EnrollmentDocument,
  InquiryDocument,
  LessonNoteDocument,
  MentorProfile,
  UserDocument,
} from '../src/types.ts';

/** Shape of the legacy JSON database file (and of the seed data). */
export interface GraspItDatabase {
  users: UserDocument[];
  categories: (CategoryDocument & { slug?: string })[];
  courses: (CourseDocument & { slug?: string; rating?: number; instructorAvatar?: string })[];
  enrollments: EnrollmentDocument[];
  notes: LessonNoteDocument[];
  inquiries: InquiryDocument[];
  mentors: (MentorProfile & { coursesCount?: number })[];
}
