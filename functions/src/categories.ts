import functions = require("firebase-functions");
import admin = require("firebase-admin");
import {FieldValue} from "firebase-admin/firestore";

exports.incrementCategoryPopularity = functions.region("europe-west1")
    .firestore
    .document("/activities/{activityId}")
    .onCreate((snap, ) => {
      const db = admin.firestore();
      const activity = snap.data();

      console.log("ActivityId: " + snap.id);

      if (activity.location.isoCountryCode == null) {
        console.log("No country code for activity: " + snap.id);
        throw new functions.https.HttpsError("not-found",
            "Couldn't find country code for activity.");
      }
      return Promise.all(activity.categories.map(
          async (category: string) => {
            await db.collection("categories")
                .doc(activity.location.isoCountryCode)
                .collection("categories")
                .doc(category)
                .update({popularity: FieldValue.increment(1)})
                .then(() =>
                  console.log("Incremented pop for " + category))
                .catch(function(err) {
                  console.log("Error incrementing cateogry " +
                                category + " " + err);
                  throw new functions.https.HttpsError("unknown",
                      "Error incrementing categories: " + err);
                });
          }));
    });

