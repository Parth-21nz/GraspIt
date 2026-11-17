import type { CourseDocument, EnrollmentDocument } from '../types';

/** Aggregate the enrollment rows already returned by bootstrap, once per change.
 * Never use the public/demo Course.studentsCount counter for private analytics.
 */
export function instructorAnalytics(
  courses: Pick<CourseDocument, '_id' | 'status'>[],
  enrollments: Pick<EnrollmentDocument, 'courseId' | 'userId' | 'amountPaid' | 'paymentMode'>[],
) {
  const byCourse = new Map(courses.map((course) => [course._id, { learners: 0, sampleBookingValue: 0 }]));
  const students = new Set<string>();
  let enrollmentCount = 0;
  let sampleBookingValue = 0;
  for (const enrollment of enrollments) {
    const course = byCourse.get(enrollment.courseId);
    // An instructor may also enroll in somebody else's course.
    if (!course) continue;
    course.learners++;
    enrollmentCount++;
    students.add(enrollment.userId);
    if (enrollment.paymentMode !== 'free') {
      course.sampleBookingValue += enrollment.amountPaid;
      sampleBookingValue += enrollment.amountPaid;
    }
  }
  return { byCourse, uniqueStudents: students.size, enrollmentCount, sampleBookingValue };
}
