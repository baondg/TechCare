/**
 * Migration: fix Appointment status ENUM and add patient column.
 * Run once before starting the server after the model change.
 */
const sequelize = require('../src/common/database');

(async () => {
  try {
    // 0. First add 'Pending','Confirmed','Rejected' to the existing ENUM keeping 'Upcoming'
    await sequelize.query(`
      ALTER TABLE Appointments
        MODIFY COLUMN status ENUM('Upcoming','Pending','Confirmed','Done','Cancelled','Rejected')
        NOT NULL DEFAULT 'Pending'
    `);
    console.log('✔ Expanded status ENUM');

    // 1. Migrate old statuses
    await sequelize.query(`UPDATE Appointments SET status = 'Confirmed' WHERE status = 'Upcoming'`);
    console.log('✔ Migrated Upcoming → Confirmed');

    // 2. Now remove 'Upcoming' from the ENUM
    await sequelize.query(`
      ALTER TABLE Appointments
        MODIFY COLUMN status ENUM('Pending','Confirmed','Done','Cancelled','Rejected')
        NOT NULL DEFAULT 'Pending'
    `);
    console.log('✔ Finalized status ENUM');

    // 3. Add patient column if missing
    const [cols] = await sequelize.query(`SHOW COLUMNS FROM Appointments LIKE 'patient'`);
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE Appointments ADD COLUMN patient VARCHAR(255) NULL AFTER doctor`);
      console.log('✔ Added patient column');
    } else {
      console.log('✔ patient column already exists');
    }

    // 4. Add department column to users if missing
    const [userCols] = await sequelize.query(`SHOW COLUMNS FROM users LIKE 'department'`);
    if (userCols.length === 0) {
      await sequelize.query(`ALTER TABLE users ADD COLUMN department VARCHAR(255) NULL`);
      console.log('✔ Added department column to users');
    } else {
      console.log('✔ department column already exists on users');
    }

    // 5. Set department for existing doctor accounts
    await sequelize.query(`
      UPDATE users SET department = 'General Medicine' WHERE role = 'doctor' AND (department IS NULL OR department = '')
    `);
    console.log('✔ Set default department for doctors');

    console.log('\nMigration complete!');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
})();
