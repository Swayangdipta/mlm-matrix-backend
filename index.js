const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require("./config/db.config");
require('dotenv').config();

const UserRoutes = require('./routes/UserRoutes');
const AdminRoutes = require('./routes/AdminRoutes');

const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());

// Connect to the database
connectDB();

app.use('/api', UserRoutes);
app.use('/api', AdminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});