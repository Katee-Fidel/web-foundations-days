-- Enable foreign key support in SQLite
PRAGMA foreign_keys = ON;

-- Drop tables if they already exist (helpful for re-running scripts)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. Students Table
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    enrolled_date TEXT NOT NULL
);

-- 2. Courses Table
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    credits INTEGER NOT NULL
);

-- 3. Enrolments Table (Join Table with composite unique constraint)
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- --- INSERT SAMPLE DATA ---

-- Insert Students (4 students: 3 with enrolments, 1 with no enrolments)
INSERT INTO students (name, email, enrolled_date) VALUES 
('Alice Mwangi', 'alice@example.com', '2026-01-10'),
('Brian Kiprop', 'brian@example.com', '2026-01-12'),
('Cynthia Atieno', 'cynthia@example.com', '2026-01-15'),
('David Ochieng', 'david@example.com', '2026-01-20');

-- Insert Courses (3 courses)
INSERT INTO courses (title, code, credits) VALUES 
('Python Programming', 'CS101', 4),
('Web Development Fundamentals', 'CS102', 3),
('Database Systems', 'CS201', 4);

-- Insert Enrolments (5 enrolments)
INSERT INTO enrolments (student_id, course_id, grade) VALUES 
(1, 1, 'B+'), -- Alice in Python
(1, 2, 'A'),  -- Alice in Web Dev
(2, 1, 'C+'), -- Brian in Python
(2, 3, 'B'),  -- Brian in Database
(3, 2, 'A-'); -- Cynthia in Web Dev

-- --- REQUIRED QUERIES ---

-- 1. All courses for one student (by name: 'Alice Mwangi')
SELECT s.name AS student_name, c.title AS course_title, c.code, e.grade 
FROM enrolments e
JOIN students s ON e.student_id = s.id
JOIN courses c ON e.course_id = c.id
WHERE s.name = 'Alice Mwangi';

-- 2. All students on one course (by title: 'Python Programming')
SELECT c.title AS course_title, s.name AS student_name, s.email, e.grade 
FROM enrolments e
JOIN students s ON e.student_id = s.id
JOIN courses c ON e.course_id = c.id
WHERE c.title = 'Python Programming';

-- 3. The number of students per course
SELECT c.title AS course_title, c.code, COUNT(e.student_id) AS total_students
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.title, c.code;

-- 4. Students who have no enrolments
SELECT s.name, s.email, s.enrolled_date
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL;

-- 5. Update one enrolment's grade (Update Alice's grade in Python from B+ to A)
UPDATE enrolments 
SET grade = 'A' 
WHERE student_id = 1 AND course_id = 1;