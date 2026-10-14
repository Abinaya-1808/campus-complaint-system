const mongoose = require('mongoose');

// Connection event listeners for runtime monitoring
mongoose.connection.on('error', (err) => {
  console.error('MongoDB Runtime Error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection lost.');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully.');
});

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_complaints';
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000
    });
    console.log('MongoDB Connected: ' + conn.connection.host);
    return conn;
  } catch (error) {
    console.error('MongoDB Connection Error: ' + error.message);
    return null;
  }
};

module.exports = connectDB;
