import functions = require("firebase-functions");

exports.deleteUser = functions.region("europe-west1").https.onCall(
    async (data, context) => {
      const userid = (context.auth && context.auth.uid)!;

      console.log("Deleting userid: " + userid);
      console.warn("Delete function not yet implemented");

      return {code: 501, message: "Not implemented"};
    }
);
