SET @seed_password_hash := '$2b$12$/BwvHZ4.QEqCd675tpfJ/uZX4Lnp3grbqu5qdzrpGU.p0z5GWExKO';
SET @tech_role := (
  SELECT IF(COLUMN_TYPE LIKE '%''TEC''%', 'TEC', 'PHY')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ACCOUNT'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);

INSERT INTO `USER` (idcard, sex, dob, tel, email, first_name, last_name)
SELECT '079090000101', 'M', '1990-06-14', '0911000001', 'admin.demo@techcare.local', 'Minh', 'Tran'
WHERE NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'admin')
  AND NOT EXISTS (SELECT 1 FROM `USER` WHERE idcard = '079090000101');
SET @admin_user_id := (SELECT user_id FROM ACCOUNT WHERE username = 'admin' LIMIT 1);
SET @admin_user_id := COALESCE(@admin_user_id, (SELECT id FROM `USER` WHERE idcard = '079090000101' LIMIT 1));
INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
SELECT @admin_user_id, 'admin', @seed_password_hash, 'ADM', NULL, NOW(), 1
WHERE @admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'admin');

INSERT INTO `USER` (idcard, sex, dob, tel, email, first_name, last_name)
SELECT '048088000104', 'M', '1988-11-30', '0911000004', 'doctor1.demo@techcare.local', 'Khanh', 'Le'
WHERE NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'doctor1')
  AND NOT EXISTS (SELECT 1 FROM `USER` WHERE idcard = '048088000104');
SET @doctor_user_id := (SELECT user_id FROM ACCOUNT WHERE username = 'doctor1' LIMIT 1);
SET @doctor_user_id := COALESCE(@doctor_user_id, (SELECT id FROM `USER` WHERE idcard = '048088000104' LIMIT 1));
INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
SELECT @doctor_user_id, 'doctor1', @seed_password_hash, 'DOC', @admin_user_id, NOW(), 1
WHERE @doctor_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'doctor1');

INSERT INTO `USER` (idcard, sex, dob, tel, email, first_name, last_name)
SELECT '079192000102', 'F', '1992-03-11', '0911000002', 'nurse1.demo@techcare.local', 'Lan', 'Nguyen'
WHERE NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'nurse1')
  AND NOT EXISTS (SELECT 1 FROM `USER` WHERE idcard = '079192000102');
SET @nurse_user_id := (SELECT user_id FROM ACCOUNT WHERE username = 'nurse1' LIMIT 1);
SET @nurse_user_id := COALESCE(@nurse_user_id, (SELECT id FROM `USER` WHERE idcard = '079192000102' LIMIT 1));
INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
SELECT @nurse_user_id, 'nurse1', @seed_password_hash, 'NUR', @admin_user_id, NOW(), 1
WHERE @nurse_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'nurse1');

INSERT INTO `USER` (idcard, sex, dob, tel, email, first_name, last_name)
SELECT '079191000103', 'M', '1991-09-21', '0911000003', 'tech1.demo@techcare.local', 'Huy', 'Pham'
WHERE NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'tech1')
  AND NOT EXISTS (SELECT 1 FROM `USER` WHERE idcard = '079191000103');
SET @tech_user_id := (SELECT user_id FROM ACCOUNT WHERE username = 'tech1' LIMIT 1);
SET @tech_user_id := COALESCE(@tech_user_id, (SELECT id FROM `USER` WHERE idcard = '079191000103' LIMIT 1));
INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
SELECT @tech_user_id, 'tech1', @seed_password_hash, @tech_role, @admin_user_id, NOW(), 1
WHERE @tech_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = 'tech1');

INSERT INTO `USER` (idcard, sex, dob, tel, email, first_name, last_name)
SELECT '038204030823', 'F', '2004-03-20', '0911000005', 'patient.demo@techcare.local', 'An', 'Bui'
WHERE NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = '038204030823')
  AND NOT EXISTS (SELECT 1 FROM `USER` WHERE idcard = '038204030823');
SET @patient_user_id := (SELECT user_id FROM ACCOUNT WHERE username = '038204030823' LIMIT 1);
SET @patient_user_id := COALESCE(@patient_user_id, (SELECT id FROM `USER` WHERE idcard = '038204030823' LIMIT 1));
INSERT INTO ACCOUNT (user_id, username, password, type, created_by, created_time, status)
SELECT @patient_user_id, '038204030823', @seed_password_hash, 'PAT', NULL, NOW(), 1
WHERE @patient_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ACCOUNT WHERE username = '038204030823');

INSERT INTO DEPARTMENT (name)
SELECT 'Role Demo Department'
WHERE NOT EXISTS (SELECT 1 FROM DEPARTMENT WHERE name = 'Role Demo Department');
SET @department_id := (SELECT id FROM DEPARTMENT WHERE name = 'Role Demo Department' LIMIT 1);

INSERT INTO BLOCK (`id`, `name`, `location`)
SELECT 'A', 'A1', 'Role Demo Campus'
WHERE NOT EXISTS (SELECT 1 FROM BLOCK WHERE id = 'A');

INSERT INTO CLINIC_ROOM (`name`, `department_id`, `block_id`, `capacity`)
SELECT 'Role Demo Room', @department_id, 'A', 20
WHERE NOT EXISTS (SELECT 1 FROM CLINIC_ROOM WHERE `name` = 'Role Demo Room');
SET @room_id := (SELECT id FROM CLINIC_ROOM WHERE `name` = 'Role Demo Room' LIMIT 1);

INSERT INTO ADMIN (user_id)
SELECT @admin_user_id
WHERE @admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ADMIN WHERE user_id = @admin_user_id);

INSERT INTO NURSE (user_id, qualifications)
SELECT @nurse_user_id, 'Registered Nurse'
WHERE @nurse_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM NURSE WHERE user_id = @nurse_user_id);

INSERT INTO TECHNICIAN (user_id, room_id, qualifications, specification, role)
SELECT @tech_user_id, @room_id, 'Lab Technician', 'General diagnostics', 'lab'
WHERE @tech_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM TECHNICIAN WHERE user_id = @tech_user_id);

INSERT INTO DOCTOR (user_id, qualifications, specifications, room_id)
SELECT @doctor_user_id, 'MD', 'General Medicine', @room_id
WHERE @doctor_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM DOCTOR WHERE user_id = @doctor_user_id);

SET @doctor_id := (SELECT doctor_id FROM DOCTOR WHERE user_id = @doctor_user_id LIMIT 1);
SET @nurse_id := (SELECT nurse_id FROM NURSE WHERE user_id = @nurse_user_id LIMIT 1);
SET @tech_id := (SELECT technician_id FROM TECHNICIAN WHERE user_id = @tech_user_id LIMIT 1);

INSERT INTO DOCTOR_DEPARTMENT (doctor_id, department_id)
SELECT @doctor_id, @department_id
WHERE @doctor_id IS NOT NULL
  AND @department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM DOCTOR_DEPARTMENT WHERE doctor_id = @doctor_id AND department_id = @department_id
  );

INSERT INTO PATIENT (user_id, allergic_info, medical_history)
SELECT @patient_user_id, JSON_OBJECT('drugAllergies', JSON_ARRAY(), 'foodAllergies', JSON_ARRAY(), 'otherAllergies', JSON_ARRAY()),
       JSON_OBJECT('vaccinations', JSON_ARRAY(), 'familyHistory', JSON_ARRAY(), 'pastIllnesses', JSON_ARRAY(), 'pastSurgeries', JSON_ARRAY(), 'substanceAbuse', JSON_ARRAY(), 'chronicConditions', JSON_ARRAY())
WHERE @patient_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM PATIENT WHERE user_id = @patient_user_id);
SET @patient_id := (SELECT patient_id FROM PATIENT WHERE user_id = @patient_user_id LIMIT 1);

INSERT INTO DISEASE (icd_code, description, category, symptoms)
SELECT 'DEMO-ROLE-0001', 'Role demo condition', 'General', 'Mild fever'
WHERE NOT EXISTS (SELECT 1 FROM DISEASE WHERE icd_code = 'DEMO-ROLE-0001');
SET @disease_id := (SELECT id FROM DISEASE WHERE icd_code = 'DEMO-ROLE-0001' LIMIT 1);

INSERT INTO REGIMEN (`start`, `end`, patient_id, disease_id)
SELECT NOW(), NULL, @patient_id, @disease_id
WHERE @patient_id IS NOT NULL
  AND @disease_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM REGIMEN WHERE patient_id = @patient_id AND disease_id = @disease_id AND `end` IS NULL
  );
SET @regimen_id := (
  SELECT id FROM REGIMEN WHERE patient_id = @patient_id AND disease_id = @disease_id ORDER BY id DESC LIMIT 1
);

SET @slot_time := DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 2 HOUR), '%Y-%m-%d %H:%i:%s');
SET @booked_time := DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 26 HOUR), '%Y-%m-%d %H:%i:%s');
SET @cancelled_time := DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 50 HOUR), '%Y-%m-%d %H:%i:%s');

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT @slot_time, 'scheduled', 'Role demo open slot', NULL, @doctor_id, @room_id, NULL, 1
WHERE @doctor_id IS NOT NULL
  AND @room_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM APPOINTMENT WHERE doctor_id = @doctor_id AND room_id = @room_id AND `time` = @slot_time
  );

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT @booked_time, 'scheduled', 'Role demo booked slot', @patient_id, @doctor_id, @room_id, @regimen_id, 1
WHERE @doctor_id IS NOT NULL
  AND @room_id IS NOT NULL
  AND @patient_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM APPOINTMENT WHERE doctor_id = @doctor_id AND room_id = @room_id AND `time` = @booked_time AND patient_id = @patient_id
  );

INSERT INTO APPOINTMENT (`time`, status, `condition`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
SELECT @cancelled_time, 'cancelled', 'Role demo cancelled slot', @patient_id, @doctor_id, @room_id, NULL, 0
WHERE @doctor_id IS NOT NULL
  AND @room_id IS NOT NULL
  AND @patient_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM APPOINTMENT WHERE doctor_id = @doctor_id AND room_id = @room_id AND `time` = @cancelled_time AND patient_id = @patient_id
  );

SET @shift_start := DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 07:30:00');
SET @shift_end := DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 11:30:00');
INSERT INTO WORK_SHIFT (start_time, end_time, room_id, doctor_id, nurse_id, technician_id)
SELECT @shift_start, @shift_end, @room_id, @doctor_id, @nurse_id, @tech_id
WHERE @room_id IS NOT NULL
  AND @doctor_id IS NOT NULL
  AND @nurse_id IS NOT NULL
  AND @tech_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM WORK_SHIFT
    WHERE room_id = @room_id
      AND doctor_id = @doctor_id
      AND nurse_id = @nurse_id
      AND technician_id = @tech_id
      AND start_time = @shift_start
  );
