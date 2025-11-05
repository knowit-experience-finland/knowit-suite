// global-setup.js
import dotenv from 'dotenv';

dotenv.config();

const exitMissingBaseUrl = () => {
  console.error('\x1b[31m%s\x1b[0m', 'BASE_URL is not set in .env file');
  process.exit(1);
};

if (!process.env.BASE_URL) {
  exitMissingBaseUrl();
}

export default async function globalSetup() {
  // any other global setup logic can go here
}
