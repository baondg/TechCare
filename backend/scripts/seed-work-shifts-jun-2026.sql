-- Work shifts: doctor 2, nurse 1, technician 2
-- Dates: 2026-06-06 through 2026-06-08 (inclusive)
-- Morning: 07:00-12:00 | Afternoon: 13:00-17:00
-- Default room_id = 1 (same team as existing demo rows). Change if needed.

USE defaultdb;

INSERT INTO WORK_SHIFT (start_time, end_time, room_id, doctor_id, nurse_id, technician_id)
VALUES
  ('2026-06-06 07:00:00', '2026-06-06 12:00:00', 1, 2, 1, 2),
  ('2026-06-06 13:00:00', '2026-06-06 17:00:00', 1, 2, 1, 2),
  ('2026-06-07 07:00:00', '2026-06-07 12:00:00', 1, 2, 1, 2),
  ('2026-06-07 13:00:00', '2026-06-07 17:00:00', 1, 2, 1, 2),
  ('2026-06-08 07:00:00', '2026-06-08 12:00:00', 1, 2, 1, 2),
  ('2026-06-08 13:00:00', '2026-06-08 17:00:00', 1, 2, 1, 2);
