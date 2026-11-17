import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instructorAnalytics } from '../src/lib/instructorAnalytics.ts';

const courses = [{ _id: 'own_a', status: 'published' as const, studentsCount: 9000 }, { _id: 'own_b', status: 'draft' as const, studentsCount: 4500 }];
const enrollments = [
  { courseId: 'own_a', userId: 'learner_1', amountPaid: 100, paymentMode: 'mock' as const },
  { courseId: 'own_b', userId: 'learner_1', amountPaid: 50, paymentMode: 'legacy' as const },
  { courseId: 'own_a', userId: 'learner_2', amountPaid: 0, paymentMode: 'free' as const },
  // Instructors can be learners too; their purchases must not inflate their business metrics.
  { courseId: 'another_instructor', userId: 'instructor', amountPaid: 999, paymentMode: 'mock' as const },
];

test('counts actual enrollments instead of public sample counters', () => {
  const result = instructorAnalytics(courses, enrollments);
  assert.equal(result.enrollmentCount, 3);
  assert.equal(result.byCourse.get('own_a')?.learners, 2);
  assert.equal(result.byCourse.get('own_b')?.learners, 1);
});
test('counts a learner taking two courses once in the unique learner total', () => {
  assert.equal(instructorAnalytics(courses, enrollments).uniqueStudents, 2);
});
test('booking values use owned-course ledger amounts, including historical prices', () => {
  const result = instructorAnalytics(courses, enrollments);
  assert.equal(result.sampleBookingValue, 150);
  assert.equal(result.byCourse.get('own_b')?.sampleBookingValue, 50);
  assert(!result.byCourse.has('another_instructor'));
});
test('empty accounts and courses without enrollments show zero', () => {
  assert.equal(instructorAnalytics([], enrollments).uniqueStudents, 0);
  assert.deepEqual(instructorAnalytics(courses, []).byCourse.get('own_a'), { learners: 0, sampleBookingValue: 0 });
});
