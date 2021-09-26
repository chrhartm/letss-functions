import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.generateMatches = functions.https.onRequest(
    async (request, response) => {
      const N = 30;
      const userid = String(request.query.userid);
      const db = admin.firestore();

      // TODO select only relevant fields (not pic)
      const userinfo = (await db.collection("users")
          .doc(userid).get()).data();
      if (userinfo == null) {
        response.status(500).send("Couldn't find user id");
        return;
      }
      const lastSearch = userinfo!.lastSearch;
      if ((admin.firestore.Timestamp.now().toMillis() -
          lastSearch.toMillis()) < (1000 * 60 * 60)) {
        response.status(429).send("Already requested within last hour");
        return;
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
              response.status(500).send("Unknown error");
              return;
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
            response.status(500).send("Unknown error");
            return;
          });
      console.log(activities);

      const now = admin.firestore.Timestamp.now();
      db.collection("users").doc(userid)
          .update({lastSearch: now});
      console.log("after user update");

      if (activities.size == 0) {
        response.status(204).send("No new activities available");
        return;
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

      response.status(200).send("Generated new matches");
    }
);
