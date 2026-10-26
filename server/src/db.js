const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/srlms";
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000, // fail fast with a clear error instead of hanging forever
  });
  // Never log the full URI — it contains the database password.
  const { host, name } = mongoose.connection;
  console.log(`[db] connected -> ${host}/${name}`);
}

module.exports = { connectDB };
