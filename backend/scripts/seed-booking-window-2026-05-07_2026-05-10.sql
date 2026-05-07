SET @doctor_id := (
  SELECT d.doctor_id
  FROM DOCTOR d
  INNER JOIN ACCOUNT a ON a.user_id = d.user_id
  WHERE a.username = 'doctor1'
  LIMIT 1
);

SET @room_id := (
  SELECT d.room_id
  FROM DOCTOR d
  INNER JOIN ACCOUNT a ON a.user_id = d.user_id
  WHERE a.username = 'doctor1'
  LIMIT 1
);

SET @room_id := COALESCE(@room_id, (SELECT id FROM CLINIC_ROOM ORDER BY id ASC LIMIT 1));

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-07 08:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-07 08:00:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-07 09:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-07 09:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-07 13:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-07 13:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-07 15:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-07 15:00:00' AND patient_id IS NULL);

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-08 08:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-08 08:00:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-08 09:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-08 09:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-08 13:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-08 13:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-08 15:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-08 15:00:00' AND patient_id IS NULL);

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-09 08:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-09 08:00:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-09 09:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-09 09:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-09 13:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-09 13:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-09 15:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-09 15:00:00' AND patient_id IS NULL);

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-10 08:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-10 08:00:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-10 09:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-10 09:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-10 13:30:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-10 13:30:00' AND patient_id IS NULL);
INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT '2026-05-10 15:00:00', 'scheduled', 'Booking window slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL AND @room_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM APPOINTMENT WHERE doctor_id=@doctor_id AND room_id=@room_id AND `time`='2026-05-10 15:00:00' AND patient_id IS NULL);
