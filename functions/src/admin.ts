import functions = require("firebase-functions");
import admin = require("firebase-admin");

exports.bootstrapDb = functions.region("europe-west1").https
    .onRequest(async (req, res) => {
      const db = admin.firestore();

      if (req.query.passphrase != "supersecretpassphrase123") {
        res.status(401).send("Not authenticated");
        return;
      }

      const payload = {
        "name": "Deleted",
        "job": "Deleted user",
        "bio": "This user was deleted.",
        "gender": "",
        "interests": [],
        "dob": admin.firestore.Timestamp.now()};
      await db.collection("persons")
          .doc("DELETED")
          .set(payload)
          .catch(() => res.status(500).send("Failed adding person"));

      const countries = ["NL", "DE"];

      const categories = [
        // Sports
        "dancing",
        "soccer",
        "boxing",
        "tennis",
        "squash",
        "jogging",
        "bouldering",
        "climbing",
        "hiking",
        "biking",
        "basketball",
        "yoga",
        // Meta
        "friendship",
        "dating",
        // Concerts
        "museums",
        "concerts",
        "live music",
        "parties",
        "movies",
        "politics",
        "activism",
        "environment",
        // Hobbies
        "guitar",
        "piano",
        "dj",
        "singing",
        "drums",
        "bass",
        "cooking",
        "board games",
        "drinking",
        "coffee",
        "beer",
        "meditation",
        "mindfulness",
        "travel",
        // Work
        "study buddy",
        "job shadowing",
      ];

      for (const country in countries) {
        // needed for linting
        if (country != null) {
          // TODO not sure if hte batching is working here
          const batch = db.batch();
          for (const category in categories) {
            // needed for linting
            if (category != null) {
              const payload = {
                "name": categories[category],
                "popularity": 1,
                "status": "ACTIVE",
                "timestamp": admin.firestore.Timestamp.now(),
              };
              await db.collection("categories").doc(countries[country])
                  .collection("categories")
                  .doc(categories[category])
                  .set(payload, {merge: true});
            }
          }
          await batch.commit()
              .catch(() =>
                res.status(500).send("Error in category addition"));
        }
      }
      res.status(200).send("Finished bootstrapping");
    });
