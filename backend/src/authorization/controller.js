const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sequelize = require('../common/database');
const defineUser = require('../common/models/User');
const User = defineUser(sequelize);

const encryptPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

const generateAccessToken = (username, userId) =>
  jwt.sign({ username, userId }, 'your-secret-key', { expiresIn: '24h' });

exports.register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, age } = req.body;
    const encryptedPassword = encryptPassword(password);
    const user = await User.create({
      username,
      email,
      password: encryptedPassword,
      firstName,
      lastName,
      age
    });
    const accessToken = generateAccessToken(username, user.id);
    res.status(201).json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      token: accessToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};