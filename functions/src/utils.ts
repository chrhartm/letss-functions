import * as sendGridMail from "@sendgrid/mail";
import * as sendGridClient from "@sendgrid/client";
import {defineSecret} from "firebase-functions/params";

/**
 * Copied from https://firebase.google.com/docs/firestore/manage-data/delete-data
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {string} collectionPath - collectionPath
 * @param {number} batchSize - batchSize
 * @return {function} - Some function
 */
export async function deleteCollection(db: FirebaseFirestore.Firestore,
    collectionPath: string, batchSize: number) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  console.log("Deleting collection: " + collectionPath);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

/**
 * Adapted from above
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {FirebaseFirestore.Query<FirebaseFirestore.DocumentData>} query - q
 * @param {number} batchSize - batchSize
 * @return {function} - Some function
 */
export async function deleteQueryResults(
    db: FirebaseFirestore.Firestore,
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    batchSize: number) {
  const _query = query.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, _query, resolve).catch(reject);
  });
}

/**
 * Copied from https://firebase.google.com/docs/firestore/manage-data/delete-data
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {FirebaseFirestore.Query<FirebaseFirestore.DocumentData>} query - qu
 * @param {function} resolve - resolve
 * @return {function} - Some function
 */
async function deleteQueryBatch(
    db: FirebaseFirestore.Firestore,
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    resolve: (value: unknown) => void): Promise<void> {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve("Deleted all data");
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

// requires firebase functions:config:set sendgrid.key="KEY"
/**
   * Send an email
   * @param {string} templateId - sendGrid template ID
   * @param {string} fromName - sender name
   * @param {string} fromAddress - sender address
   * @param {string} toAddress - address to send to
   * @param {string} unsubscribeId - unsubscribe ID
   * @param {any} data - data to be sent as json
   * @return {function} - Some function
   */
export async function sendEmail(templateId: string,
    fromName: string,
    fromAddress: string,
    toAddress: string,
    unsubscribeId: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any) {
  console.log("Sending email with template " + templateId);

  const sendgridKey = defineSecret("SENDGRID_KEY").value();
  sendGridMail.setApiKey(sendgridKey);

  const mailData = {
    to: toAddress,
    asm: {
      groupId: unsubscribeId,
    },
    from: {
      email: fromAddress,
      name: fromName,
    },
    templateId: templateId,
    dynamic_template_data: data,
  };
  return sendGridMail.send(mailData);
}

/**
   * Send an email
   * @param {string} name - name of user
   * @param {string} address - user email
   * @param {string} locality - user locality
   * @param {string} count - user count in locality
   * @param {string} language - user language
   * @return {function} - Some function
   */
export async function addToEmailList(
    name: string,
    address: string,
    locality: string,
    count: number,
    language: string,
) {
  const sendgridKey = defineSecret("SENDGRID_KEY").value();
  sendGridClient.setApiKey(sendgridKey);
  console.log(language);
  // replace empty language by english
  if (language === "" || language === undefined) {
    language = "en";
  }
  const mailData = {
    "contacts": [
      {
        "email": address,
        "first_name": name,
        "custom_fields": {
          "locality": locality,
          "count": count,
          "language": language,
        },
      },
    ],
  };
  const request = {
    method: "PUT" as const,
    url: "/v3/marketing/contacts",
    body: mailData,
  };
  // TODO future this is rate limited to 3 per second
  return sendGridClient.request(request).then(([response, body]) => {
    console.log(response.statusCode);
    console.log(response.body);
    console.log(body.toString());
  })
      .catch((error) => {
        console.error(error);
      });
}

// Delete a contact from the email list
/**
   * Send an email
   * @param {string} address - user email
   * @return {function} - Some function
   */
export async function removeFromEmailList(address: string) {
  const sendgridKey = defineSecret("SENDGRID_KEY").value();
  sendGridClient.setApiKey(sendgridKey);
  // First get the contact ID
  console.log(address);
  const request = {
    method: "POST" as const,
    url: "/v3/marketing/contacts/search",
    body: {
      query: "email LIKE lower('" + address + "')",  
    },
  };
  return sendGridClient.request(request).then(([response]) => {
    console.log(response.statusCode);
    console.log(response.body as any); // eslint-disable-line
    console.log(response.body.toString());
    const responseJson = response.body as any; // eslint-disable-line
    if (responseJson.result.length === 0) {
      return;
    }
    const contactId = responseJson.result[0].id;
    console.log(contactId);
    const deleteRequest = {
      method: "DELETE" as const,
      url: "/v3/marketing/contacts",
      qs: {
        ids: contactId,
      },
    };
    return sendGridClient.request(deleteRequest).then(([response, body]) => {
      console.log(response.statusCode);
      console.log(response.body);
      console.log(body.toString());
    })
        .catch((error) => {
          console.error(error);
        });
  })
      .catch((error) => {
        console.error(error);
      });
}
