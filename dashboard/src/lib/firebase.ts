import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getApp() {
  if (getApps().length > 0) return getApps()[0];

  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not set");

  // Support both file path and inline JSON
  let credential;
  if (credsJson.startsWith("/") || credsJson.startsWith(".")) {
    credential = cert(credsJson);
  } else {
    credential = cert(JSON.parse(credsJson));
  }

  return initializeApp({
    credential,
    projectId: process.env.FIRESTORE_PROJECT_ID,
  });
}

export const db = getFirestore(getApp());
