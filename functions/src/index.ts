import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.generateMatches = functions.https.onCall(
    async (data, context) => {
      const N = 30;
      const userid = (context.auth && context.auth.uid)!;
      const db = admin.firestore();

      console.log("userid: " + userid);

      // TODO select only relevant fields (not pic)
      const userinfo = (await db.collection("users")
          .doc(userid).get()).data();
      if (userinfo == null) {
        return {code: 500, message: "Couldn't find user id"};
      }
      const lastSearch = userinfo!.lastSearch;
      if ((admin.firestore.Timestamp.now().toMillis() -
          lastSearch.toMillis()) < (1000 * 60 * 60)) {
        return {code: 429, message: "Already requested within last hour"};
      }
      const activities = new Set();
      for (const category of userinfo!.interests) {
        // TODO filter by location
        await db.collection("activities")
            .where("status", "==", "ACTIVE")
            .where("timestamp", ">", lastSearch)
            .where("categories", "array-contains", category)
            .orderBy("timestamp", "desc")
            .limit(N)
            .select("user")
            .get()
            .then((querySnapshot) => {
              querySnapshot.forEach((doc) => {
                if (doc.data()["user"] != userid) {
                  activities.add(doc.id);
                }
              });
            })
            .catch(function(error) {
              console.log("Error getting documents: ", error);
              return {code: 500, message: "Unknown error"};
            });
      }
      // add some without interest filter
      // in case interests are too specific
      await db.collection("activities")
          .where("status", "==", "ACTIVE")
          .where("timestamp", ">", lastSearch)
          .orderBy("timestamp", "desc")
          .limit(N)
          .select("user")
          .get()
          .then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
              if (doc.data()["user"] != userid) {
                activities.add(doc.id);
              }
            });
          })
          .catch(function(error) {
            console.log("Error getting documents: ", error);
            return {code: 500, message: "Unknown error"};
          });
      console.log(activities);

      const now = admin.firestore.Timestamp.now();
      db.collection("users").doc(userid)
          .update({lastSearch: now});
      console.log("after user update");

      if (activities.size == 0) {
        return {code: 204, message: "No new activities available"};
      }

      console.log("before batch");
      const batch = db.batch();
      activities.forEach((doc) => {
        const data = {activity: doc, user: userid, status: "NEW",
          timestamp: now};
        batch.set(db.collection("matches").doc(doc+"_"+userid), data);
      });
      batch.commit();
      console.log("after batch");

      return {code: 200, message: "Generated new matches"};
    }
);

exports.deleteUser = functions.https.onCall(
    async (data, context) => {
      const userid = (context.auth && context.auth.uid)!;

      console.log("Deleting userid: " + userid);
      console.warn("Delete function not yet implemented");

      return {code: 501, message: "Not implemented"};
    }
);
