import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.deleteUser = functions.https.onCall(
    async (data, context) => {
      const userid = (context.auth && context.auth.uid)!;

      console.log("Deleting userid: " + userid);
      console.warn("Delete function not yet implemented");

      return {code: 501, message: "Not implemented"};
    }
);
