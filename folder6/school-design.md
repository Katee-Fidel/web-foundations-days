# School Management System Database Design

## Table Explanations
- **`students`**: Stores individual student profile information, including their unique identifier, full name, unique email address, and enrollment date.
- **`courses`**: Stores academic course catalog details, including a unique ID, course title, unique course code, and credit weight.
- **`enrolments`**: Acts as a junction (join) table connecting students to courses. It tracks which student is registered in which course and records their corresponding grade.

## Relationships
- **Students and Courses (Many-to-Many):** A single student can enroll in multiple courses, and a single course can have many students enrolled in it. 
- **Why a Join Table (`enrolments`) is Needed:** Relational databases cannot natively represent many-to-many relationships in a single table without data duplication. The `enrolments` table breaks this many-to-many relationship down into two one-to-many relationships (`students` to `enrolments`, and `courses` to `enrolments`). It also securely holds attribute data specific to the relationship itself—namely, the `grade` earned by that specific student in that specific course—while enforcing a composite unique constraint to prevent duplicate registrations.

## Recommended Index
```sql
CREATE INDEX idx_enrolments_student ON enrolments(student_id);