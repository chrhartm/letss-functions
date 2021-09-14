import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.generateMatches = functions.https.onRequest(
    async (request, response) => {
    // Grab the text parameter.
      const userid = String(request.query.userid);
      // Push the new message into Firestore using the Firebase Admin SDK.

      // TODO select only relevant fields
      const userinfo = (await admin.firestore().collection("users")
          .doc(userid).get()).data();
      if ( userinfo == null ) {
        response.status(500).send("Couldn't find user i");
      }
      let list: []
      for (const category of userinfo!.interests) {
        console.log(category);
        // For each category, get the latest XX matches since last search if category timestamp < time of last search, otherwise get all last XX regarless of timestamp
        // TODO filter by location
        // TODO filter on status active
        console.log((await (admin.firestore().collection('activities').where("categories", "array-contains", category).orderBy("timestamp")).select("categories").get())))
      }
      // TODO add a few that don't match interests for good measure
      // TODO get all previous proposals younger than oldest timestamp
      // TODO substract previous proposals
      // TODO shuffle
      // TODO write new proposals
      // const writeResult = await admin.firestore().collection('messages')
      // .add({original: original});
      // Send back a message that we've successfully written the message
      response.json({result: `Received: ${userinfo}`});
    }
);
