import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.resetCoins = functions.https.onCall(
    async (data, context) => {
      const db = admin.firestore();
      const coinsFree = 5;
      const coinsSupporter = 10;
      db.collection("users")
          .get()
          .then(snapshot => {
              snapshot.forEach(doc => {
                const coins = (doc.data().supporter == true)?
                    coinsSupporter:coinsFree;
                db.collection("users")
                    .doc(doc.id)
                    .update({"coins": coins})
              });
          });
    }
);
