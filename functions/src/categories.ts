import {HttpsError}
  from "firebase-functions/v2/https";
  import {onDocumentCreated}
  from "firebase-functions/v2/firestore";
import {firestore} from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

exports.incrementCategoryPopularity = onDocumentCreated(
    "/activities/{activityId}", (event) => {
      if (event.data == null) {
        throw new HttpsError("not-found",
            "No data.");
      }
      const db = firestore();
      const activity = event.data.data();
      const activityId = event.params.activityId;

      console.log("ActivityId: " + activityId);

      if (activity.location.isoCountryCode == null) {
        console.log("No country code for activity: " + activityId);
        throw new HttpsError("not-found",
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
                  throw new HttpsError("unknown",
                      "Error incrementing categories: " + err);
                });
          }));
    });

