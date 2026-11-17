export type UserRole = 'student' | 'instructor' | 'admin';
export type AppView = 'landing' | 'workspace' | 'learning' | 'auth' | 'profile';

export interface UploadAssetDocument {
  _id: string;
  url: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface UserDocument {
  _id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  title: string;
  bio: string;
  avatar: string;
  avatarAssetId?: string | null;
  status: 'active' | 'suspended';
  joinedAt: string;
}

export interface ProfileDocument {
  user: UserDocument;
  emailChangeAllowed: boolean;
}

export interface ProfileUpdate {
  name?: string;
  title?: string;
  bio?: string;
  email?: string;
  currentPassword?: string;
  avatarAssetId?: string | null;
}

export interface CategoryDocument {
  _id: string;
  name: string;
  description: string;
  createdByRole: UserRole;
  createdAt: string;
}

export interface LessonItem {
  _id: string;
  title: string;
  durationMinutes: number;
  videoUrl: string;
  summary: string;
  keyTakeaways: string[];
}

export interface CourseModule {
  _id: string;
  title: string;
  lessons: LessonItem[];
}

export interface CourseDocument {
  _id: string;
  title: string;
  subtitle: string;
  category: string;
  level: 'Foundation' | 'Intermediate' | 'Principal';
  price: number;
  durationHours: number;
  studentsCount: number;
  thumbnail: string;
  thumbnailAssetId?: string | null;
  instructorId: string;
  instructorName: string;
  instructorRole: string;
  instructorSignature: string;
  status: 'published' | 'pending' | 'draft';
  featured: boolean;
  skills: string[];
  outcomes: string[];
  modules: CourseModule[];
  updatedAt: string;
}

export interface EnrollmentDocument {
  _id: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  amountPaid: number;
  paymentRef: string;
  paymentMode?: 'legacy' | 'free' | 'mock';
  completedLessonIds: string[];
  progressPercent: number;
  certificateIssuedAt?: string;
}

export interface LessonNoteDocument {
  _id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  timestampFormatted: string;
  content: string;
  createdAt: string;
}

export interface InquiryDocument {
  _id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: 'new' | 'reviewed';
  createdAt: string;
}

export interface MentorProfile {
  _id: string;
  name: string;
  role: string;
  organization: string;
  signatureQuote: string;
  bio: string;
  avatar: string;
  specialties: string[];
  studentsMentored: string;
}
