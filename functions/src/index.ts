import admin = require("firebase-admin");
import activity = require("./activity");
import messaging = require("./messaging");
import user = require("./user");
import categories = require("./categories");

admin.initializeApp();

exports.user = user;
exports.activity = activity;
exports.messaging = messaging;
exports.categories = categories;
