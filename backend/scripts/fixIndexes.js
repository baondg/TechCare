const sequelize = require('../src/common/database');

async function fixIndexes() {
  try {
    const [rows] = await sequelize.query('SHOW INDEX FROM users');
    const names = [...new Set(rows.map(r => r.Key_name))];
    console.log('Current index count:', names.length);
    
    const toDrop = names.filter(n => n !== 'PRIMARY' && n !== 'username' && n !== 'email');
    console.log('Dropping', toDrop.length, 'duplicate indexes...');
    
    for (const idx of toDrop) {
      await sequelize.query(`DROP INDEX \`${idx}\` ON users`);
      console.log('  Dropped:', idx);
    }
    
    const [remaining] = await sequelize.query('SHOW INDEX FROM users');
    const remainingNames = [...new Set(remaining.map(r => r.Key_name))];
    console.log('Remaining indexes:', remainingNames.join(', '));
    
    await sequelize.close();
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

fixIndexes();
