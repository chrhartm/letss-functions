import functions = require("firebase-functions");
import admin = require("firebase-admin");

exports.incrementCategoryPopularity = functions.firestore
    .document("/activities/{activityId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const activity = snap.data();
      db.collection("users").doc(activity.user)
          .get().then((userDoc) => {
            if (userDoc.exists == false) {
              console.log("Couldn't find user: " + activity.user);
              return;
            }
            const user = userDoc.data()!;
            if (user.location.isoCountryCode == null) {
              console.log("No country code for user: " + activity.user);
              return;
            }
            for (const category of activity.categories) {
              db.collection("categories")
                  .doc(user.location.isoCountryCode)
                  .collection("categories")
                  .doc(category)
                  .get().then((categoryDoc) => {
                    if (categoryDoc.exists == false) {
                      console.log("Couldn't find category: " + category);
                      return;
                    }
                    const popularity = categoryDoc.data()!.popularity;
                    db.collection("categories")
                        .doc(user.location.isoCountryCode)
                        .collection("categories")
                        .doc(category)
                        .update({popularity: popularity + 1})
                        .then((value) => console.log("Incremented pop for " +
                            category));
                  });
            }
          });
    });
