import functions = require("firebase-functions");
import admin = require("firebase-admin");

exports.like = functions.region("europe-west1").https.onCall(
    async (data, context) => {
      const userId = (context.auth && context.auth.uid)!;
      const db = admin.firestore();
      const activityId = data.activityId;
      const activityUserId = data.activityUserId;
      const matchId = data.matchId;
      const like = {
        "message": data.message,
        "status": "ACTIVE",
        "timestamp": Date.now(),
        "read": false};

      console.log("userid: " + userId);
      console.log("activityId: " + activityId);
      console.log("matchId" + matchId);
      console.log("like: " + like.message);


      const userinfo = (await db.collection("users")
          .doc(userId).get()).data();
      if (userinfo == null) {
        return {code: 500, message: "Couldn't find user id"};
      }

      console.log("coins: " + userinfo.coins);

      if (userinfo.coins == null || userinfo.coins <= 0) {
        return {code: 403, message: "Insufficient coins"};
      }

      try {
        await db.collection("matches")
            .doc(matchId)
            .update({"status": "LIKE"});
      } catch (error) {
        return {code: 500, message: "Couldn't update matches"};
      }
      try {
        await db.collection("activities")
            .doc(activityId)
            .collection("likes")
            .doc(userId)
            .set(like)
            .then((value) => console.log("set like"));
      } catch (error) {
        console.log("couldn't set like " + error);
        return {code: 500, message: "Couldn't set like"};
      }
      try {
        await db.collection("users")
            .doc(userId)
            .update({"coins": userinfo.coins - 1})
            .then((value) => console.log("Updated coins"));
      } catch (error) {
        console.log("couldn't update coins " + error);
        return {code: 500, message: "Couldn't udpate coins"};
      }
      try {
        await db.collection("notifications")
            .doc(activityUserId)
            .set({"newLikes": true}, {merge: true})
            .then((value) => console.log("Updated notifications"));
      } catch (error) {
        console.log("couldn't update notifications " + error);
        return {code: 500, message: "Couldn't udpate notifications"};
      }
      return {code: 200, message: "Submitted like"};
    }
);

exports.generateMatches = functions.region("europe-west1").https.onCall(
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
      if ((lastSearch != null) && (admin.firestore.Timestamp.now().toMillis() -
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

exports.resetCoins = functions.region("europe-west1")
    .pubsub.schedule("0 10 * * *")
    .timeZone("Europe/Paris")
    .onRun((context) => {
      const db = admin.firestore();
      const coinsFree = 5;
      const coinsSupporter = 10;
      db.collection("users")
          .get()
          .then((snapshot) => {
            snapshot.forEach((doc) => {
              const coins = (doc.data().supporter == true)?
                  coinsSupporter:coinsFree;
              db.collection("users")
                  .doc(doc.id)
                  .update({"coins": coins});
            });
          });
      return null;
    });
