/**
 * Seed script to create test accounts: patient, doctor, admin
 * 
 * Usage: node scripts/seedAccounts.js
 * 
 * All accounts use password: Test@1234
 */

const bcrypt = require('bcrypt');
const sequelize = require('../src/common/database');
const defineUser = require('../src/models/User');
const defineProfile = require('../src/models/Profile');

const User = defineUser(sequelize);
const Profile = defineProfile(sequelize);

const SALT_ROUNDS = 12;
const PASSWORD = 'Test@1234';

const accounts = [
  {
    username: 'patient1',
    email: 'patient1@techcare.com',
    firstName: 'Nguyen',
    lastName: 'Van A',
    role: 'patient',
    age: 30,
  },
  {
    username: 'doctor1',
    email: 'doctor1@techcare.com',
    firstName: 'Tran',
    lastName: 'Thi B',
    role: 'doctor',
    age: 40,
  },
  {
    username: 'admin1',
    email: 'admin1@techcare.com',
    firstName: 'Le',
    lastName: 'Van C',
    role: 'admin',
    age: 35,
  },
];

async function seed() {
  try {
    // Sync database (create/update tables to match models)
    await sequelize.sync({ alter: true });
    console.log('Database connected & synced.\n');

    const hashedPassword = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

    for (const account of accounts) {
      // Check if already exists
      const existing = await User.findOne({ where: { username: account.username } });
      if (existing) {
        console.log(`⚠️  User "${account.username}" already exists (id=${existing.id}, role=${existing.role}). Skipping.`);
        continue;
      }

      const user = await User.create({
        ...account,
        password: hashedPassword,
        loginAttempts: 0,
        lockUntil: null,
        isActive: true,
        emailVerified: true,
      });

      // Create profile
      await Profile.create({ userId: user.id, email: user.email });

      console.log(`✅ Created ${account.role}: username="${account.username}", email="${account.email}"`);
    }

    console.log('\n--- All accounts use password: Test@1234 ---\n');
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
