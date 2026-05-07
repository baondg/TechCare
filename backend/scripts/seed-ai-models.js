require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Sequelize } = require('sequelize');

async function main() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
  });

  await sequelize.query(
    "INSERT INTO AI_MODEL (provider, version, release_date, name, status) SELECT 'groq','llama-3.1-8b-instant','2024-08-01','Groq Llama 3.1 8B','active' WHERE NOT EXISTS (SELECT 1 FROM AI_MODEL WHERE provider='groq' AND name='Groq Llama 3.1 8B' AND version='llama-3.1-8b-instant')"
  );
  await sequelize.query(
    "INSERT INTO AI_MODEL (provider, version, release_date, name, status) SELECT 'local','meditron:latest','2024-01-01','Local Meditron','inactive' WHERE NOT EXISTS (SELECT 1 FROM AI_MODEL WHERE provider='local' AND name='Local Meditron' AND version='meditron:latest')"
  );

  const [rows] = await sequelize.query('SELECT id, provider, name, version, status FROM AI_MODEL ORDER BY id');
  console.log(JSON.stringify(rows));
  await sequelize.close();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
