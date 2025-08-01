import {onCall, onRequest, HttpsError, CallableRequest}
  from "firebase-functions/v2/https";
import {onDocumentCreated}
  from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {firestore, storage} from "firebase-admin";
import {get} from "https";
import {getCanvasImage, registerFont, UltimateTextToImage}
  from "ultimate-text-to-image";

exports.like = onCall({region: "europe-west1"},
        async (request: CallableRequest) => {

          const userId = request.auth?request.auth.uid:null;
          if (userId == null) {
            throw new HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = firestore();
          const activityId = request.data.activityId;
          const activityUserId = request.data.activityUserId;
          const matchId = request.data.activityId + "_" + userId;
          const like = {
            "message": request.data.message,
            "status": "ACTIVE",
            "timestamp": firestore.Timestamp.now(),
            "read": false};
          const match = {
            "timestamp": firestore.Timestamp.now(),
            "status": "LIKE",
            "activity": activityId,
            "user": userId};

          console.log("userid: " + userId);
          console.log("activityId: " + activityId);
          console.log("matchId" + matchId);
          console.log("like: " + like.message);

          const userinfo = (await db.collection("users")
              .doc(userId).get()).data();
          if (userinfo == null) {
            throw new HttpsError("not-found",
                "Couldn't find user.");
          }

          console.log("coins: " + userinfo.coins);

          if (userinfo.coins == null || userinfo.coins <= 0) {
            throw new HttpsError("resource-exhausted",
                "No likes remaining.");
          }

          try {
            await db.collection("matches")
                .doc(matchId)
                // set with all details in case it's coming from a link
                // (needed as audit trail for deleting later)
                .set(match, {merge: true});
          } catch {
            throw new HttpsError("unknown",
                "Couldn't update matches.");
          }

          try {
            await db.collection("users")
                .doc(userId)
                .update({"coins": userinfo.coins - 1})
                .then(() => console.log("Updated coins"));
          } catch (error) {
            console.log("couldn't update coins " + error);
            throw new HttpsError("unknown",
                "Couldn't update likes.");
          }

          let blocked = false;
          try {
            await db.collection("blocks")
                .doc(activityUserId)
                .collection("blocks")
                .doc(userId)
                .get()
                .then((value: firestore.DocumentSnapshot) => {
                  if (value.exists) {
                    blocked = true;
                    console.log(userId + "is blocked by" + activityUserId);
                  }
                });
          } catch (error) {
            // TODO check if this error happens when blocked does not exist
            console.log("couldn't get blocked " + error);
          }

          if (blocked) {
            return;
          }

          try {
            await db.collection("activities")
                .doc(activityId)
                .collection("likes")
                .doc(userId)
                .set(like)
                .then(() => console.log("set like"));
          } catch (error) {
            console.log("couldn't set like " + error);
            throw new HttpsError("unknown",
                "Couldn't set like.");
          }
          try {
            await db.collection("notifications")
                .doc(activityUserId)
                .set({"newLikes": true}, {merge: true})
                .then(() => console.log("Updated notifications"));
          } catch (error) {
            console.log("couldn't update notifications " + error);
            throw new HttpsError("unknown",
                "Couldn't update notifications.");
          }
        }
    );

exports.generateMatches = onCall({region: "europe-west1"},
        async (request: CallableRequest) => {

          const N = 30;
          const minN = 100;
          const waitSeconds = 10;
          const userId = request.auth?request.auth.uid:null;
          if (userId == null) {
            throw new HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = firestore();

          console.log("userid: " + userId);

          const userInfo = (await db.collection("users")
              .doc(userId).get()).data();
          if (userInfo == null) {
            throw new HttpsError("not-found",
                "Couldn't find user.");
          }
          const personInfo = (await db.collection("persons")
              .doc(userId).get()).data();
          if (personInfo == null) {
            throw new HttpsError("not-found",
                "Couldn't find person.");
          }
          const locality = personInfo.location.locality;
          let lastSearch = null;
          if (userInfo.lastSearch != null) {
            lastSearch = userInfo.lastSearch[locality];
          }

          if ((lastSearch != null) &&
              (firestore.Timestamp.now().toMillis() -
              lastSearch.toMillis()) < (1000 * waitSeconds)) {
            throw new HttpsError("resource-exhausted",
                "Already requested recently");
          }

          if (lastSearch == null) {
            lastSearch = firestore.Timestamp.fromMillis(0);
          }
          const activities = new Set();
          for (const category of personInfo.interests) {
            await db.collection("activities")
                .where("status", "==", "ACTIVE")
                .where("location.locality", "==", locality)
                .where("timestamp", ">", lastSearch)
                .where("categories", "array-contains", category)
                .orderBy("timestamp", "desc")
                .limit(N)
                .select("user")
                .get()
                .then((querySnapshot: firestore.QuerySnapshot) => {
                  querySnapshot.forEach((doc: firestore.DocumentData) => {
                    if (doc.data()["user"] != userId) {
                      activities.add(doc.id);
                    }
                  });
                })
                .catch(function(error) {
                  console.log("Error getting documents: ", error);
                  throw new HttpsError("unknown",
                      "Error generating matches.");
                });
          }
          // add some without interest filter
          // in case interests are too specific
          let n = minN - activities.size;
          if (n < N) {
            n = N;
          }
          await db.collection("activities")
              .where("status", "==", "ACTIVE")
              .where("location.locality", "==", locality)
              .where("timestamp", ">", lastSearch)
              .orderBy("timestamp", "desc")
              .limit(n)
              .select("user")
              .get()
              .then((querySnapshot: firestore.QuerySnapshot) => {
                querySnapshot.forEach((doc: firestore.QueryDocumentSnapshot) => {
                  if (doc.data()["user"] != userId) {
                    activities.add(doc.id);
                  }
                });
              })
              .catch(function(error) {
                console.log("Error getting documents: ", error);
                throw new HttpsError("unknown",
                    "Error generating default matches");
              });
          console.log(activities);

          const now = firestore.Timestamp.now();
          await db.collection("users").doc(userId)
              .update({[`lastSearch.${locality}`]: now});
          console.log("after user update");

          if (activities.size == 0) {
            // Get matches that were most recently passed if no activities
            await db.collection("matches")
                .where("status", "==", "PASS")
                .where("user", "==", userId)
                .where("location.locality", "==", locality)
                .orderBy("timestamp", "desc")
                .limit(N)
                .get()
                .then((querySnapshot) => {
                  querySnapshot.forEach((doc) => {
                    activities.add(doc.data()["activity"]);
                  });
                });
            if (activities.size == 0) {
              console.log("No new activities");
              throw new HttpsError("resource-exhausted",
                  "No new activities");
            }
          }

          console.log("before batch");
          const batch = db.batch();
          // TODO should this be activity location?
          activities.forEach((doc) => {
            const data = {activity: doc, user: userId, status: "NEW",
              timestamp: now, location: personInfo.location};
            batch.set(db.collection("matches").doc(doc+"_"+userId), data);
          });
          await batch.commit();
          console.log("after batch");
        }
    );

exports.resetCoins = onSchedule("0 10 * * *", () => {
      const db = firestore();
      const coinsFree = 10;
      const coinsSupporter = 50;
      return db.collection("users")
          .get()
          .then((snapshot) => {
            snapshot.forEach((doc) => {
              const coins = (doc.data().supporter == true)?
                  coinsSupporter:coinsFree;
              console.log("Resetting coins for " + doc.id + " to " + coins);
              db.collection("users")
                  .doc(doc.id)
                  .update({"coins": coins});
            });
          })
          .catch(function(error) {
            console.log("Error resetting coins: ", error);
            throw new HttpsError("unknown",
                "Error updating coins.");
          });
    });

exports.countOnConnection = onDocumentCreated(
    "/chats/{chatId}", () => {
      get("https://api.smiirl.com/18a59c001139/" +
     "add-number/3bfebe60c0388db60df57407d0331c95/1", (res) => {
        console.log("Status Code:", res.statusCode);
        if (res.statusCode != null && res.statusCode!= 200) {
          throw new HttpsError("unknown",
              "An error occured");
        }
      });
    });

exports.generateImage = onCall({region: "europe-west1"},
        async (request: CallableRequest) => {

          const userId = request.auth?request.auth.uid:null;
          if (userId == null) {
            throw new HttpsError("unauthenticated",
                "Not authenticated");
          }

          console.log("userid: " + userId);
          console.log("activityId: " + request.data.activityId);
          console.log("activityName: " + request.data.activityName);
          console.log("activityPersona: " + request.data.activityPersona);

          const fileName = request.data.activityId + ".png";
          const activityName = request.data.activityName;
          const imageBucket = "activityImages/";
          const persona = request.data.activityPersona;

          // TODO check if image already exists

          return generateActivityImage(imageBucket, fileName,
              activityName, persona);
        });

exports.promotionImage = onRequest({region: "europe-west1"},
      async (req, res) => {
      if (req.body.passphrase != "29rdGDPouc7icnspsdf31S") {
        res.status(401).send("Not authenticated");
        return;
      }

      if (req.body.activity == null || req.body.persona == null) {
        res.status(400).send("Insufficient parameters");
        return;
      }

      const bucket = "promotionImages/";
      const activityName = req.body.activity as string;
      const persona = req.body.persona as string;
      const color = req.body.color as string;
      const id = req.body.id as string;
      const filename = id + ".png";

      console.log("activityName: " + activityName);
      console.log("id: " + id);

      const url = await generateActivityImage(bucket, filename,
          activityName, persona, color);

      res.status(200).send({url: url});
    });


/**
 * Generates an image based on an activity name and stores it to firestore()
 * @param {string} imageBucket - bucket to store image in
 * @param {string} fileName - name of file
 * @param {string} activityName - name of activity
 * @param {string} persona - persona of activity
 * @param {string} color - color for underlines
 * @return {function} - URL of Image
 */
async function generateActivityImage(imageBucket: string, fileName: string,
    activityName: string, persona: string, color ="#FF9800") {
  const fontsize = 120;
  const lineHeightMultiplier = 1.2;
  const underlineSize = 20;
  const size = 1080;
  const margin = 100;
  const fontFamily = "Roboto";
  const joinFontSize = 40;
  const joinUnderlineSize = 15;

  console.log("ActivityName: " + activityName);

  // remove emojis
  // eslint-disable-next-line
  let cleanName = activityName.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD10-\uDDFF])/g, '');

  const bucket = storage().bucket();
  const destination = `${imageBucket}${fileName}`;
  let URL = "";
  const joinText = "Find " + persona + " on Letss";

  registerFont("./assets/fonts/Roboto-Regular.otf",
      {family: "Roboto", weight: 100});
  registerFont("./assets/fonts/Roboto-Bold.otf",
      {family: "Roboto", weight: 800});
  // registerFont("./assets/fonts/NotoColorEmoji-Regular.ttf",
  //     {family: "Roboto", weight: 400});

  console.log("CleanName: " + cleanName);

  try {
    const mainImageBuffer = new UltimateTextToImage(cleanName, {
      width: size,
      height: size,
      margin: margin,
      marginBottom: margin*2,
      fontSize: fontsize,
      minFontSize: fontsize,
      align: "left",
      valign: "top",
      fontWeight: "bold",
      fontColor: "#000000",
      backgroundColor: "#FFFFFF00",
      fontFamily: fontFamily,
      autoWrapLineHeightMultiplier: lineHeightMultiplier,
    }).render().toBuffer();
    const mainImage = await getCanvasImage({buffer: mainImageBuffer});

    const underlineImageBuffer = new UltimateTextToImage(cleanName, {
      width: size,
      height: size,
      margin: margin,
      marginBottom: margin*2,
      fontSize: fontsize,
      minFontSize: fontsize,
      align: "left",
      valign: "top",
      marginTop: margin + underlineSize/2,
      fontWeight: "bold",
      fontColor: "#FFFFFF00",
      backgroundColor: "#FFFFFF00",
      fontFamily: fontFamily,
      underlineColor: color,
      autoWrapLineHeightMultiplier: lineHeightMultiplier,
      underlineSize: underlineSize,
    }).render().toBuffer();
    const underlineImage = await getCanvasImage({buffer: underlineImageBuffer});

    const joinImageUnderlineBuffer = new UltimateTextToImage("Letss", {
      fontSize: joinFontSize,
      minFontSize: joinFontSize,
      marginBottom: joinUnderlineSize/2,
      fontWeight: "bold",
      fontColor: "#FFFFFF00",
      backgroundColor: "#FFFFFF00",
      fontFamily: fontFamily,
      underlineColor: color,
      autoWrapLineHeightMultiplier: lineHeightMultiplier,
      underlineSize: joinUnderlineSize,
    }).render().toBuffer();
    const joinImageUnderline = await getCanvasImage({buffer:
      joinImageUnderlineBuffer});

    const joinImageBuffer = new UltimateTextToImage(joinText, {
      fontSize: joinFontSize,
      minFontSize: joinFontSize,
      fontWeight: "bold",
      fontColor: "#000000",
      backgroundColor: "#FFFFFF00",
      fontFamily: fontFamily,
      autoWrapLineHeightMultiplier: lineHeightMultiplier,
    }).render().toBuffer();
    const joinImage = await getCanvasImage({buffer: joinImageBuffer});

    const imageBuffer = new UltimateTextToImage("", {
      width: size,
      height: size,
      fontSize: fontsize,
      minFontSize: fontsize,
      align: "left",
      valign: "top",
      fontColor: "#00000000",
      backgroundColor: "#FFFFFF",
      autoWrapLineHeightMultiplier: lineHeightMultiplier,
      images: [
        {canvasImage: underlineImage, layer: 1, repeat: "fit",
        },
        {canvasImage: mainImage, layer: 1, repeat: "fit",
        },
        {canvasImage: joinImageUnderline, layer: 1, repeat: "none",
          sy: -margin, sx: -(margin+joinImageUnderline.width)},
        {canvasImage: joinImage, layer: 1, repeat: "none",
          sy: -(margin+joinUnderlineSize/3), sx: -(margin + joinImage.width)},
      ],
    })
        .render()
        .toBuffer();
    try {
      const file = bucket.file(destination);
      await file.save(imageBuffer, {contentType: "image/png"});
      file.makePublic();
      URL = file.publicUrl();
      console.log(`${fileName} uploaded" +
        " to /${imageBucket}/${fileName}.`);
    } catch {
      throw new HttpsError("unknown",
          "File upload failed");
    }
  } catch {
    console.log("Error generating impage");

    throw new HttpsError("unknown",
        "Error geneerating image");
  }
  return {url: URL};
}
