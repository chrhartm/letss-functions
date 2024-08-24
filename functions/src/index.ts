import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ region: 'europe-west1'});

import {initializeApp} from "firebase-admin";
import * as activity from "./activity";
import * as messaging from "./messaging";
import * as  user from "./user";
import * as categories from "./categories";
import * as admin from "./admin";

exports.initializeApp = () => initializeApp();

exports.user = user;
exports.activity = activity;
exports.messaging = messaging;
exports.categories = categories;
exports.admin = admin;
