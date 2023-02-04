import functions = require("firebase-functions");
import admin = require("firebase-admin");

exports.incrementCategoryPopularity = functions.region("europe-west1")
    .firestore
    .document("/activities/{activityId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const activity = snap.data();
      return db.collection("users").doc(activity.user)
          .get().then((userDoc) => {
            if (userDoc.exists == false) {
              console.log("Couldn't find user: " + activity.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find user.");
            }
            const user = userDoc.data()!;
            if (user.location.isoCountryCode == null) {
              console.log("No country code for user: " + activity.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find country code for user.");
            }
            return Promise.all(activity.categories.map(
                async (category: string) => {
                  await db.collection("categories")
                      .doc(user.location.isoCountryCode)
                      .collection("categories")
                      .doc(category)
                      .get().then((categoryDoc) => {
                        if (categoryDoc.exists == false) {
                          console.log("Couldn't find category: " + category);
                          throw new functions.https.HttpsError("not-found",
                              "Couldn't find category.");
                        }
                        const popularity = categoryDoc.data()!.popularity;
                        return db.collection("categories")
                            .doc(user.location.isoCountryCode)
                            .collection("categories")
                            .doc(category)
                            .update({popularity: popularity + 1})
                            .then((value) =>
                              console.log("Incremented pop for " + category));
                      });
                }));
          });
    });
