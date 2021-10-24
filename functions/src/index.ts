import firebaseAdmin = require("firebase-admin");
import activity = require("./activity");
import messaging = require("./messaging");
import user = require("./user");
import categories = require("./categories");
import admin = require("./admin");

firebaseAdmin.initializeApp();

exports.user = user;
exports.activity = activity;
exports.messaging = messaging;
exports.categories = categories;
exports.admin = admin;
