const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require("./config/db.config");
require('dotenv').config();

const UserRoutes = require('./routes/UserRoutes');
const AdminRoutes = require('./routes/AdminRoutes');
const { default: axios } = require('axios');

const app = express();
app.use(express.json());
const allowedOrigins = [
  'http://localhost:5173',
  'https://mlmhp.netlify.app', // Add your production URL here
];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }else{
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      console.error(msg);
      // You can also log the error to a file or monitoring system
      // logError(msg);
      // Block the request by passing an error to the callback
      return callback(new Error(msg));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers, etc.)
}));
app.use(cookieParser());

// Connect to the database
connectDB();

app.use('/api', UserRoutes);
app.use('/api', AdminRoutes);

const SELF_URL = process.env.SELF_URL || 'http://localhost:5000';
app.get('/ping', (req, res) => {
  res.send('PONGED!');
});

setInterval(() => {
  axios.get(`${SELF_URL}/ping`)
    .then(response => {
      console.log('Ping successful:', response.data);
    })
    .catch(error => {
      console.error('Ping failed:', error.message);
    });
}, 1000 * 60 * 10); // 10 minutes

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});