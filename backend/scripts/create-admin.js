require('dotenv').config({ path: __dirname + '/../.env' });
const bcrypt = require('bcrypt');
const sequelize = require('../src/common/database');
const Users = require('../src/models/Users');
const Account = require('../src/models/Account');

const createAdmin = async () => {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'Admin123!';
  const email = 'admin@techcare.com';

  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    // Check if admin already exists
    const existing = await Account.findOne({ where: { username } });
    if (existing) {
      console.log(`Admin account '${username}' already exists.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const t = await sequelize.transaction();

    try {
      const newUser = await Users.create({
        first_name: 'System',
        last_name: 'Admin',
        email: email,
        sex: 'O',
        dob: '1980-01-01',
        tel: 'ADM', // Using the role enum here as seen in controller.js
        idcard: 'ADM-' + Math.floor(Math.random() * 1000000)
      }, { transaction: t });

      await Account.create({
        user_id: newUser.id,
        username: username,
        password: hashedPassword,
        type: 'ADM',
        status: 'Active',
        created_time: new Date()
      }, { transaction: t });

      await t.commit();
      console.log(`Admin account created successfully!`);
      console.log(`Username: ${username}`);
      console.log(`Password: ${password}`);
    } catch (error) {
      await t.rollback();
      console.error('Error creating admin account:', error);
    }

  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
  }
};

createAdmin();
