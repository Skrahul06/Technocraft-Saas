// routes/challanRoutes.js
const express = require('express');
const router = express.Router();
const challanController = require('../controllers/challanController');

// All paths here are relative to what is defined in index.js
router.get('/', challanController.getAllChallans);
router.post('/', challanController.createChallan);

module.exports = router;