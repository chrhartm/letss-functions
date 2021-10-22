import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();


exports.like = functions.https.onCall(
    async (data, context) => {
      const userId = (context.auth && context.auth.uid)!;
      const db = admin.firestore();
      const activityId = data.activityId;
      const matchId = data.matchId;
      const like = {
        "message": data.message,
        "status": "ACTIVE",
        "timestamp": Date.now().toString()};

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
            .then(value => console.log("set like"));
      } catch (error) {
        return {code: 500, message: "Couldn't set like"};
      }
      try {
        await db.collection("users")
            .doc(userId)
            .update({"coins": userinfo.coins - 1})
            .then(value => console.log("Updated coins"));
      } catch (error) {
        console.log("Couldn't update coins");
      }
      return {code: 200, message: "Submitted like"};
    }
);
