const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const sanitizeUri = (uri) => {
  if (!uri) return '(not set)';
  // Mask password between : and @
  return uri.replace(/:([^:@]+)@/, ':****@');
};

const testConnection = async () => {
  console.log('==================================================');
  console.log('      MONGODB CONNECTION VERIFICATION TOOL       ');
  console.log('==================================================');

  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('[-] ERROR: MONGO_URI is missing from your .env file.');
    console.error('    Please open CampusComplaintSystemBackend/.env and add:');
    console.error('    MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/campus_complaints?retryWrites=true&w=majority');
    process.exit(1);
  }

  if (mongoUri.includes('<password>') || mongoUri.includes('<username>') || mongoUri.includes('<cluster-url>')) {
    console.error('[-] ERROR: MONGO_URI contains unresolved placeholder text (<username>, <password>, or <cluster-url>).');
    console.error('    Please replace the placeholders in your .env file with your actual Atlas database credentials.');
    process.exit(1);
  }

  console.log('[*] Target URI:', sanitizeUri(mongoUri));
  console.log('[*] Testing connection (timeout: 10s)...');

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });

    console.log('[+] SUCCESS: Connected to MongoDB successfully!');
    console.log('    - Host:', conn.connection.host);
    console.log('    - Database:', conn.connection.name);
    console.log('    - ReadyState:', conn.connection.readyState === 1 ? 'Connected (1)' : conn.connection.readyState);

    // Test ping
    if (conn.connection.db) {
      await conn.connection.db.admin().ping();
      console.log('    - Ping Response: OK (Database is responding to queries)');
    }

    console.log('==================================================');
    console.log('[?] Database is ready for Campus Complaint System!');
    console.log('==================================================');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[-] CONNECTION FAILED:', error.message);
    console.log('');
    console.log('--- TROUBLESHOOTING GUIDE ---');

    if (error.message.includes('bad auth') || error.message.includes('AuthenticationFailed')) {
      console.log('-> CAUSE: Incorrect MongoDB username or password.');
      console.log('-> FIX: Check MongoDB Atlas > Security > Database Access. Ensure the user exists and the password in .env is correct.');
      console.log('        Remember to URL-encode special characters in the password (e.g. @ -> %40).');
    } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Server selection timed out') || error.message.includes('ECONNREFUSED')) {
      console.log('-> CAUSE: Network connection timed out or cluster unreachable.');
      console.log('-> FIX: Check MongoDB Atlas > Security > Network Access.');
      console.log('        Ensure IP Address 0.0.0.0/0 (Allow access from anywhere) is added and active.');
    } else if (error.message.includes('querySrv ENOTFOUND')) {
      console.log('-> CAUSE: DNS lookup failed for cluster hostname.');
      console.log('-> FIX: Check your cluster domain in MONGO_URI. It should look like: cluster0.xxxxx.mongodb.net');
    } else {
      console.log('-> Check your connection string format and internet connection.');
    }
    console.log('==================================================');

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close().catch(() => {});
    }
    process.exit(1);
  }
};

testConnection();
